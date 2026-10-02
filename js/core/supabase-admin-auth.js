/* ALBUKHR ADMIN AUTH STABILITY PATCH
   Scope:
   - Preserve the existing security authority.
   - Prevent background auth-event refreshes from erasing a valid
     admin context during dashboard navigation.
   - Retry server context once before fail-closed logout.
   - Do not weaken role, status, MFA, AAL2, or Mainnet checks.
*/
(function(window){
"use strict";

const CORE_NAME="ALBUKHR Supabase Admin Auth";
const LOGIN_URL="admin-login.html";

let initialized=false;
let currentAdmin=null;
let authSubscription=null;
let initializationPromise=null;
let contextPromise=null;
let authRefreshGeneration=0;

function fail(message){throw new Error(String(message||"Admin authentication error."));}

function getEnvironment(){
  const environment=window.ALBukhrEnvironment;
  if(!environment||typeof environment.isKnown!=="function")fail("ALBUKHR Environment Core is unavailable.");
  if(!environment.isKnown())fail("ALBUKHR environment is unknown.");
  if(!environment.isMainnet())fail("Admin authentication is available only on ALBUKHR MAINNET.");
  return environment;
}

function getSupabaseCore(){
  const core=window.ALBUKHR_SUPABASE;
  if(!core||!core.client)fail("ALBUKHR Supabase Core is unavailable.");
  if(String(core.environment||"").toLowerCase()!=="mainnet")fail("Admin Auth cannot use a non-Mainnet Supabase client.");
  if(String(core.network||"").toLowerCase()!=="mainnet")fail("Admin Auth network validation failed.");
  return core;
}

function getClient(){getEnvironment();return getSupabaseCore().client;}

async function getSession(){
  const {data,error}=await getClient().auth.getSession();
  if(error)throw error;
  return data?.session||null;
}

function clearAdminContext(){
  currentAdmin=null;
  contextPromise=null;
}

function normalizeAdminContext(raw,session){
  const source=Array.isArray(raw)?(raw[0]||null):raw;
  if(!source){
    return Object.freeze({
      is_admin:false,
      user_id:session?.user?.id||null,
      email:session?.user?.email||null,
      email_snapshot:null,
      status:"inactive",
      mfa_required:true,
      mfa_verified:false,
      roles:Object.freeze([]),
      core_projects:Object.freeze([]),
      scoped_projects:Object.freeze([]),
      testnet_access:false
    });
  }

  return Object.freeze({
    is_admin:Boolean(source.is_admin),
    user_id:source.user_id||session?.user?.id||null,
    email:session?.user?.email||null,
    email_snapshot:source.email_snapshot||null,
    status:String(source.status||"inactive"),
    mfa_required:source.mfa_required!==false,
    mfa_verified:Boolean(source.mfa_verified),
    roles:Object.freeze(Array.isArray(source.roles)?source.roles.map(String):[]),
    core_projects:Object.freeze(Array.isArray(source.core_projects)?source.core_projects:[]),
    scoped_projects:Object.freeze(Array.isArray(source.scoped_projects)?source.scoped_projects:[]),
    testnet_access:Boolean(source.testnet_access)
  });
}

async function fetchAdminContext(){
  if(contextPromise)return contextPromise;

  contextPromise=(async()=>{
    try{
      const client=getClient();
      const session=await getSession();

      if(!session?.user){
        clearAdminContext();
        return null;
      }

      if(typeof client.schema!=="function"){
        fail("Supabase client does not support custom schemas.");
      }

      const {data,error}=await client
        .schema("albukhr_security")
        .rpc("get_my_admin_context");

      if(error)throw error;

      const context=normalizeAdminContext(data,session);
      currentAdmin=context;
      return context;
    }finally{
      contextPromise=null;
    }
  })();

  return contextPromise;
}

async function refreshAdminContextWithRetry(){
  let lastError=null;

  for(let attempt=0;attempt<2;attempt++){
    try{
      const context=await fetchAdminContext();
      if(context)return context;
    }catch(error){
      lastError=error;
      if(attempt===0)await new Promise(r=>setTimeout(r,250));
    }
  }

  throw lastError||new Error("Admin context could not be verified.");
}

async function init(){
  if(initialized)return true;
  if(initializationPromise)return initializationPromise;

  initializationPromise=(async()=>{
    getEnvironment();
    const client=getClient();
    const session=await getSession();

    if(session?.user){
      try{
        await refreshAdminContextWithRetry();
      }catch(error){
        console.error(CORE_NAME+" context initialization failed:",error);
        clearAdminContext();
      }
    }

    if(!authSubscription){
      const {data}=client.auth.onAuthStateChange((event,session)=>{
        console.info("[ALBUKHR ADMIN AUTH]",event);

        const generation=++authRefreshGeneration;

        setTimeout(async()=>{
          if(generation!==authRefreshGeneration)return;

          if(!session?.user){
            clearAdminContext();
            return;
          }

          try{
            await refreshAdminContextWithRetry();
          }catch(error){
            /*
             * Do NOT erase an already verified admin context merely
             * because a background auth-event refresh failed.
             * The next foreground authorization check remains authoritative.
             */
            console.error("Admin background context refresh failed:",error);
          }
        },0);
      });

      authSubscription=data?.subscription||null;
    }

    initialized=true;
    return true;
  })();

  try{return await initializationPromise;}
  finally{initializationPromise=null;}
}

async function signIn(email,password){
  getEnvironment();

  if(!email||!password)fail("Email and password are required.");

  const client=getClient();
  const {data,error}=await client.auth.signInWithPassword({
    email:String(email).trim().toLowerCase(),
    password:String(password)
  });

  if(error)throw error;
  if(!data?.session||!data?.user)fail("Supabase authentication returned no valid session.");

  clearAdminContext();

  let context;
  try{
    context=await refreshAdminContextWithRetry();
  }catch(error){
    console.error("Admin authorization RPC failed:",error);
    await safeSignOut();
    throw new Error("Admin authorization could not be verified: "+String(error?.message||"security RPC failed."));
  }

  if(!context?.is_admin){
    await safeSignOut();
    fail("This account is not authorized for ALBUKHR administration.");
  }

  if(context.status!=="active"){
    await safeSignOut();
    fail("This admin account is not active.");
  }

  return context;
}

async function requireAdmin(options={}){
  await init();

  const redirect=options.redirect!==false;
  const loginUrl=options.loginUrl||LOGIN_URL;
  const session=await getSession();

  if(!session?.user){
    clearAdminContext();
    if(redirect)location.replace(loginUrl);
    return null;
  }

  let context;
  try{
    context=await refreshAdminContextWithRetry();
  }catch(error){
    console.error("Admin authorization check failed:",error);
    await safeSignOut();
    if(redirect)location.replace(loginUrl);
    return null;
  }

  if(!context?.is_admin||context.status!=="active"){
    await safeSignOut();
    if(redirect)location.replace(loginUrl);
    return null;
  }

  return context;
}

async function requireRole(roles,options={}){
  const admin=await requireAdmin(options);
  if(!admin)return null;
  const allowed=Array.isArray(roles)?roles.map(String):[String(roles)];

  if(!allowed.some(role=>admin.roles.includes(role))){
    if(typeof options.onDenied==="function")options.onDenied(admin);
    else console.error("❌ Admin role denied:",{required:allowed,actual:admin.roles});
    return null;
  }

  return admin;
}

const roleFn=role=>options=>requireRole(role,options);
const requireSuperAdmin=roleFn("super_admin");
const requireRegistryAdmin=roleFn("registry_admin");
const requireApprovalAdmin=roleFn("approval_admin");
const requireFinanceAdmin=roleFn("finance_admin");
const requireCoreAdmin=roleFn("core_admin");
const requireInternalAdmin=roleFn("internal_admin");
const requireExternalAdmin=roleFn("external_admin");

function canManageCoreProject(projectId){
  return !!currentAdmin&&(currentAdmin.roles.includes("super_admin")||
    currentAdmin.core_projects.some(project=>project&&project.active===true&&String(project.id||project.core_project_id)===String(projectId)));
}

function canManageInternalProject(projectId){
  return !!currentAdmin&&(currentAdmin.roles.includes("super_admin")||
    currentAdmin.scoped_projects.some(project=>project&&project.active===true&&project.role==="internal_admin"&&String(project.project_id)===String(projectId)));
}

function canManageExternalProject(projectId){
  return !!currentAdmin&&(currentAdmin.roles.includes("super_admin")||
    currentAdmin.scoped_projects.some(project=>project&&project.active===true&&project.role==="external_admin"&&String(project.project_id)===String(projectId)));
}

async function ensureMfa(){
  const admin=currentAdmin;

  if(admin&&admin.mfa_required===false){
    return Object.freeze({required:false,verified:true,enrolled:false,factorId:null});
  }

  const {data,error}=await getClient().auth.mfa.listFactors();
  if(error)throw error;

  const factors=Array.isArray(data?.totp)?data.totp:[];
  const verifiedFactor=factors.find(f=>f&&f.status==="verified");

  if(!verifiedFactor){
    return Object.freeze({required:true,verified:false,enrolled:false,factorId:null});
  }

  const {data:assurance,error:assuranceError}=await getClient().auth.mfa.getAuthenticatorAssuranceLevel();
  if(assuranceError)throw assuranceError;

  return Object.freeze({
    required:true,
    verified:assurance?.currentLevel==="aal2",
    enrolled:true,
    factorId:verifiedFactor.id
  });
}

async function verifyMfa(factorId,code){
  if(!factorId||!code)fail("MFA factor and verification code are required.");

  const client=getClient();
  const {data:challenge,error:challengeError}=await client.auth.mfa.challenge({factorId});
  if(challengeError)throw challengeError;

  const {data,error}=await client.auth.mfa.verify({
    factorId,
    challengeId:challenge.id,
    code:String(code).trim()
  });

  if(error)throw error;

  const {error:refreshError}=await client.auth.refreshSession();
  if(refreshError)throw refreshError;

  clearAdminContext();
  await refreshAdminContextWithRetry();

  return data;
}

async function resetPassword(email,redirectTo){
  getEnvironment();
  if(!email)fail("Email is required.");
  const options={};
  if(redirectTo)options.redirectTo=String(redirectTo);

  const {error}=await getClient().auth.resetPasswordForEmail(
    String(email).trim().toLowerCase(),
    options
  );

  if(error)throw error;
  return true;
}

async function updatePassword(password){
  if(!password||String(password).length<12)fail("Admin password must be at least 12 characters.");
  const {data,error}=await getClient().auth.updateUser({password:String(password)});
  if(error)throw error;
  return data;
}

async function safeSignOut(){
  try{
    await getClient().auth.signOut();
  }catch(error){
    console.error("Admin sign-out error:",error);
  }finally{
    authRefreshGeneration++;
    clearAdminContext();
  }
}

function getCurrentAdmin(){return currentAdmin;}
function isAuthenticated(){return Boolean(currentAdmin?.is_admin&&currentAdmin.status==="active");}
function hasRole(role){return Boolean(currentAdmin?.roles.includes(String(role)));}
function getRoles(){return currentAdmin?[...currentAdmin.roles]:[];}
function getRole(){return currentAdmin?.roles?.[0]||null;}
function hasTestnetAccess(){return Boolean(currentAdmin?.is_admin&&currentAdmin.status==="active"&&currentAdmin.testnet_access);}

function destroy(){
  if(authSubscription&&typeof authSubscription.unsubscribe==="function")authSubscription.unsubscribe();
  authSubscription=null;
  initialized=false;
  initializationPromise=null;
  authRefreshGeneration++;
  clearAdminContext();
}

window.AlbukhrSupabaseAdminAuth=Object.freeze({
  init,
  signIn,
  signOut:safeSignOut,
  getSession,
  refreshSession:async()=>{
    const {data,error}=await getClient().auth.refreshSession();
    if(error)throw error;
    return data?.session||null;
  },
  requireAdmin,
  refreshAdminContext:fetchAdminContext,
  getCurrentAdmin,
  isAuthenticated,
  requireRole,
  requireSuperAdmin,
  requireRegistryAdmin,
  requireApprovalAdmin,
  requireFinanceAdmin,
  requireCoreAdmin,
  requireInternalAdmin,
  requireExternalAdmin,
  hasRole,
  getRoles,
  getRole,
  canManageCoreProject,
  canManageInternalProject,
  canManageExternalProject,
  ensureMfa,
  verifyMfa,
  resetPassword,
  updatePassword,
  hasTestnetAccess,
  destroy
});

console.info("✅ "+CORE_NAME+" loaded.");
})(window);
