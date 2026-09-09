(function (window, document) {
"use strict";

const ADMIN_LOGIN_PAGE="admin-login.html";
const ADMIN_MFA_PAGE="admin-mfa.html";
const PROJECT_INVITATION_PAGE="project-invitation.html";
const CORE_TEAM_SIZE=7;
const INVITATION_EXPIRATION_HOURS=168;

const RPC_GET_CORE_TEAM_MEMBERS="get_core_team_members";
const RPC_GET_ACTIVE_CORE_INVITATIONS="get_active_core_invitations";
const RPC_GET_PROJECT_REGISTRY="get_project_registry";
const RPC_CREATE_PROJECT_INVITATION="create_project_invitation";
const RPC_REVOKE_PROJECT_INVITATION="revoke_project_invitation";
const RPC_REVOKE_LEGACY_CORE_INVITATIONS="revoke_legacy_core_invitations";

const $=id=>document.getElementById(id);
let adminContext=null,currentCoreMembers=[],currentInvitationRecords=[],currentCoreProjects=[],initializationComplete=false;

function fail(message){throw new Error(String(message||"ALBUKHR Core Team security error."));}
function setStatus(message,isError){const e=$("pageStatus");if(!e)return;e.textContent=message||"";e.className=isError?"status error":"status";}
function setSecurityState(message){const e=$("securityState");if(e)e.textContent=message||"";}
function setBusy(id,busy,idleText,busyText){const b=$(id);if(!b)return;b.disabled=!!busy;b.textContent=busy?busyText:idleText;}

function assertMainnet(){
 const env=window.ALBukhrEnvironment;
 if(!env||typeof env.isKnown!=="function"||typeof env.isMainnet!=="function")fail("ALBUKHR environment security is unavailable.");
 if(!env.isKnown()||!env.isMainnet())fail("Core Team is available only on ALBUKHR MAINNET.");
}
function getClient(){assertMainnet();const c=window.ALBUKHR_SUPABASE&&window.ALBUKHR_SUPABASE.client;if(!c||typeof c.schema!=="function")fail("ALBUKHR Mainnet Supabase Core is unavailable.");return c;}
function getAdminAuth(){const a=window.AlbukhrSupabaseAdminAuth;if(!a)fail("ALBUKHR Supabase Admin Auth is unavailable.");return a;}
function roles(){return Array.isArray(adminContext&&adminContext.roles)?adminContext.roles.map(r=>String(r||"").trim().toLowerCase()).filter(Boolean):[];}
function isSuperAdmin(){return roles().includes("super_admin");}
function normalizeCoreSlot(v){const n=Number(v);return Number.isInteger(n)&&n>=1&&n<=CORE_TEAM_SIZE?n:null;}
function normalizeUuid(v){const s=String(v||"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null;}
function normalizeEmail(v){const s=String(v||"").trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))fail("Enter a valid email address.");return s;}
function escapeHtml(v){const n=document.createElement("div");n.textContent=String(v==null?"":v);return n.innerHTML;}
function formatDate(v){if(!v)return"";const d=new Date(v);if(Number.isNaN(d.getTime()))return"";try{return d.toLocaleString();}catch(_){return d.toISOString();}}
function projectId(r){return normalizeUuid(r&&(r.id||r.project_id||r.core_project_id));}
function projectSlot(r){return normalizeCoreSlot(r&&(r.core_slot||r.slot));}
function projectType(r){return String(r&&r.project_type||"").trim().toLowerCase();}
function projectNetwork(r){return String(r&&r.network||"").trim().toLowerCase();}
function isRegisteredMainnetCoreProject(r){return !!(projectId(r)&&projectType(r)==="core"&&projectNetwork(r)==="mainnet"&&projectSlot(r)!==null);}

async function requireFreshAal2(){
 const auth=getAdminAuth(),mfa=await auth.ensureMfa();
 if(!mfa||mfa.required!==true||mfa.verified!==true){window.location.replace(ADMIN_MFA_PAGE);fail("AAL2 MFA verification is required.");}
 const {data,error}=await getClient().auth.mfa.getAuthenticatorAssuranceLevel();if(error)throw error;
 if(!data||data.currentLevel!=="aal2"){window.location.replace(ADMIN_MFA_PAGE);fail("Current session does not have AAL2 assurance.");}
 adminContext=await auth.refreshAdminContext();
 if(!adminContext||adminContext.is_admin!==true||String(adminContext.status||"").toLowerCase()!=="active")fail("Admin authorization is no longer active.");
 if(!isSuperAdmin())fail("Only Super Admin can manage the Core Team.");
 return adminContext;
}

function showAuthorized(){
 $("deniedPanel")?.classList.add("hidden");$("corePanel")?.classList.remove("hidden");$("recordsPanel")?.classList.remove("hidden");
 if($("authorization"))$("authorization").textContent="AUTHORIZED";if($("securityLevel"))$("securityLevel").textContent="AAL2 VERIFIED";
}
function showDenied(){
 $("deniedPanel")?.classList.remove("hidden");$("corePanel")?.classList.add("hidden");$("recordsPanel")?.classList.add("hidden");$("tokenPanel")?.classList.add("hidden");
 if($("authorization"))$("authorization").textContent="DENIED";if($("securityLevel"))$("securityLevel").textContent="RESTRICTED";
}
function updateMemberCount(n){const e=$("memberCount");if(e)e.textContent=Math.max(0,Math.min(Number(n)||0,CORE_TEAM_SIZE))+" / "+CORE_TEAM_SIZE;}

function renderCoreTeam(rows){
 const list=$("invitationList"),empty=$("emptyState");currentCoreMembers=Array.isArray(rows)?rows:[];updateMemberCount(currentCoreMembers.length);if(!list)return;list.innerHTML="";
 if(!currentCoreMembers.length){empty?.classList.remove("hidden");return;} empty?.classList.add("hidden");
 currentCoreMembers.slice().sort((a,b)=>(normalizeCoreSlot(a.core_slot)||999)-(normalizeCoreSlot(b.core_slot)||999)).forEach(m=>{
  const r=document.createElement("article");r.className="record";const email=m.email_snapshot||m.email||"No email snapshot",slot=normalizeCoreSlot(m.core_slot)||"—",granted=formatDate(m.granted_at);
  r.innerHTML='<div class="record-main"><b>'+escapeHtml(email)+'</b><small>Core Slot '+escapeHtml(slot)+(granted?" • Granted "+escapeHtml(granted):"")+'</small></div><span class="record-status">ACTIVE</span>';list.appendChild(r);
 });
}

function reservedSlots(){
 const s=new Set();currentCoreMembers.forEach(r=>{const n=normalizeCoreSlot(r.core_slot);if(n!==null)s.add(n);});
 currentInvitationRecords.forEach(r=>{const n=normalizeCoreSlot(r.core_slot);if(n!==null)s.add(n);});return s;
}

function renderCoreProjects(rows){
 currentCoreProjects=Array.isArray(rows)?rows.filter(isRegisteredMainnetCoreProject):[];
 currentCoreProjects.sort((a,b)=>(projectSlot(a)||999)-(projectSlot(b)||999));
 const select=$("coreProject");if(!select)return;select.innerHTML="";
 const p=document.createElement("option");p.value="";p.textContent=currentCoreProjects.length?"Select registered Core Project":"No registered Core Projects available";p.selected=true;select.appendChild(p);
 const reserved=reservedSlots();
 currentCoreProjects.forEach(r=>{
  const o=document.createElement("option"),id=projectId(r),slot=projectSlot(r);
  o.value=id;o.dataset.coreSlot=String(slot);o.textContent=String(r.name||r.project_code||"Unnamed Core Project")+" — Core Slot "+slot;
  if(reserved.has(slot)){o.disabled=true;o.textContent+=" — Reserved";}select.appendChild(o);
 });
 if($("inviteButton"))$("inviteButton").disabled=currentCoreProjects.length===0;
}

function renderActiveInvitations(rows){
 const list=$("activeInvitationList"),empty=$("invitationEmptyState");currentInvitationRecords=Array.isArray(rows)?rows:[];if(!list)return;list.innerHTML="";
 if(!currentInvitationRecords.length){empty?.classList.remove("hidden");return;}empty?.classList.add("hidden");
 currentInvitationRecords.slice().sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).forEach(inv=>{
  const r=document.createElement("article");r.className="record";
  const id=normalizeUuid(inv.id||inv.invitation_id),email=inv.invited_email||inv.email_snapshot||inv.email||"No email",slot=normalizeCoreSlot(inv.core_slot),project=inv.project_name||inv.name||inv.project_code||"",created=formatDate(inv.created_at),expires=formatDate(inv.expires_at),meta=[];
  if(project)meta.push(project);if(slot!==null)meta.push("Core Slot "+slot);if(created)meta.push("Created "+created);if(expires)meta.push("Expires "+expires);if(!normalizeUuid(inv.project_id))meta.push("Legacy invitation");
  r.innerHTML='<div class="record-main"><b>'+escapeHtml(email)+'</b><small>'+escapeHtml(meta.join(" • "))+'</small></div>';
  const b=document.createElement("button");b.type="button";b.textContent="Revoke";b.className="danger";b.dataset.invitationId=id||"";b.disabled=!id;b.addEventListener("click",handleRevokeInvitation);r.appendChild(b);list.appendChild(r);
 });
}

async function rpc(name,params,options){
 const o=options||{};if(o.requireAal2!==false)await requireFreshAal2();else assertMainnet();
 const response=await getClient().schema("albukhr_security").rpc(name,params||{});if(response.error)throw response.error;return response.data;
}
async function loadCoreTeam(){const d=await rpc(RPC_GET_CORE_TEAM_MEMBERS);renderCoreTeam(Array.isArray(d)?d:[]);}
async function loadActiveCoreInvitations(){const d=await rpc(RPC_GET_ACTIVE_CORE_INVITATIONS);renderActiveInvitations(Array.isArray(d)?d:[]);}
function normalizeProjectRegistryResponse(data){
 if(Array.isArray(data))return data;
 if(!data||typeof data!=="object")return null;
 if(Array.isArray(data.projects))return data.projects;
 if(Array.isArray(data.project_registry))return data.project_registry;
 if(Array.isArray(data.registry))return data.registry;
 if(Array.isArray(data.rows))return data.rows;
 if(Array.isArray(data.data))return data.data;
 if(data.project&&typeof data.project==="object")return [data.project];
 if(data.success===false)fail(data.message||"Project Registry request was denied.");
 return null;
}

async function loadRegisteredCoreProjects(){
 const data=await rpc(RPC_GET_PROJECT_REGISTRY);
 const rows=normalizeProjectRegistryResponse(data);
 if(!rows)fail("Project Registry returned an unsupported response shape.");
 renderCoreProjects(rows);
}

async function refreshCoreTeam(){await Promise.all([loadCoreTeam(),loadActiveCoreInvitations(),loadRegisteredCoreProjects()]);renderCoreProjects(currentCoreProjects);setStatus("Core Team security state refreshed.");}

function clearInvitationToken(){const i=$("invitationToken");if(i)i.value="";$("tokenPanel")?.classList.add("hidden");}
function showInvitationToken(raw){
 if(typeof raw!=="string"||!raw)fail("The invitation service returned no usable invitation token.");
 const u=new URL(PROJECT_INVITATION_PAGE,window.location.href);u.hash="token="+encodeURIComponent(raw);
 const i=$("invitationToken");if(!i)fail("Invitation URL field is unavailable.");i.value=u.toString();$("tokenPanel")?.classList.remove("hidden");$("tokenPanel")?.scrollIntoView({behavior:"smooth",block:"center"});
}

function selectedCoreProject(){
 const id=normalizeUuid($("coreProject")?.value);if(!id)fail("Select a registered Mainnet Core Project.");
 const p=currentCoreProjects.find(r=>projectId(r)===id);if(!p)fail("The selected Core Project is not present in the current Mainnet Project Registry.");
 const slot=projectSlot(p);if(slot===null)fail("The selected Core Project has no valid Core Slot.");
 if(projectType(p)!=="core"||projectNetwork(p)!=="mainnet")fail("Only registered Mainnet Core Projects can receive Core Team invitations.");
 return {project:p,id,slot};
}

async function createCoreTeamInvitation(email,cp){
 const d=await rpc(RPC_CREATE_PROJECT_INVITATION,{p_project_type:"core",p_invited_email:email,p_expires_in_hours:INVITATION_EXPIRATION_HOURS,p_core_slot:cp.slot});
 if(!d||typeof d!=="object")fail("The invitation service returned an invalid response.");
 if(d.success===false||d.authorized===false)fail(d.message||"Core Team invitation was denied.");
 if(typeof d.invitation_token!=="string"||!d.invitation_token)fail("The invitation was created but no usable invitation token was returned.");
 return d;
}

async function handleInviteSubmit(e){
 e.preventDefault();
 try{
  const email=normalizeEmail($("inviteEmail")?.value),cp=selectedCoreProject();
  if(reservedSlots().has(cp.slot))fail("This Core Slot is already occupied or reserved by an active invitation.");
  setBusy("inviteButton",true,"Create Core Team Invitation","Creating...");clearInvitationToken();setStatus("Creating secure Core Team invitation...");
  const result=await createCoreTeamInvitation(email,cp);showInvitationToken(result.invitation_token);$("inviteForm")?.reset();
  try{await refreshCoreTeam();}catch(x){console.error("[ALBUKHR CORE TEAM POST-CREATE REFRESH]",x);}
  setStatus(result.message||"Core Team invitation created successfully. Copy and securely deliver the invitation link.");
 }catch(x){console.error("[ALBUKHR CORE TEAM INVITATION]",x);setStatus(x?.message||"Core Team invitation failed.",true);}
 finally{setBusy("inviteButton",false,"Create Core Team Invitation","Creating...");renderCoreProjects(currentCoreProjects);}
}

async function revokeProjectInvitation(id,reason){
 const uuid=normalizeUuid(id);if(!uuid)fail("Invalid invitation identifier.");
 const d=await rpc(RPC_REVOKE_PROJECT_INVITATION,{p_invitation_id:uuid,p_reason:String(reason||"Revoked by Super Admin").slice(0,500)});
 if(!d||typeof d!=="object")fail("The invitation revocation service returned an invalid response.");
 if(d.success===false||d.authorized===false)fail(d.message||"Invitation revocation was denied.");return d;
}

async function handleRevokeInvitation(e){
 const b=e.currentTarget,id=b?.dataset?.invitationId;if(!id){setStatus("Invitation identifier is unavailable.",true);return;}
 const inv=currentInvitationRecords.find(r=>normalizeUuid(r.id||r.invitation_id)===normalizeUuid(id)),email=inv?.invited_email||inv?.email_snapshot||"this member";
 if(!window.confirm("Revoke the active invitation for "+email+"?\n\nThis does not delete the invitation record. It marks the invitation revoked server-side."))return;
 try{b.disabled=true;b.textContent="Revoking...";setStatus("Revoking invitation securely...");const d=await revokeProjectInvitation(id,"Revoked by Super Admin from Core Team administration.");await refreshCoreTeam();setStatus(d.message||"Invitation revoked successfully.");}
 catch(x){console.error("[ALBUKHR CORE TEAM REVOKE]",x);setStatus(x?.message||"Invitation revocation failed.",true);b.disabled=false;b.textContent="Revoke";}
}

async function handleCleanupLegacyInvitations(){
 const n=currentInvitationRecords.filter(r=>!normalizeUuid(r.project_id)).length;
 if(!n){setStatus("No legacy Core Team invitations require cleanup.");return;}
 if(!window.confirm("Revoke "+n+" legacy Core Team invitation"+(n===1?"":"s")+" with no registered project binding?\n\nThis is a server-side revoke operation. Existing records are retained for audit."))return;
 try{setBusy("cleanupLegacyButton",true,"Revoke Legacy Invitations","Revoking...");setStatus("Revoking legacy invitations securely...");
  const d=await rpc(RPC_REVOKE_LEGACY_CORE_INVITATIONS);if(!d||typeof d!=="object")fail("The legacy invitation cleanup service returned an invalid response.");
  if(d.success===false||d.authorized===false)fail(d.message||"Legacy invitation cleanup was denied.");await refreshCoreTeam();setStatus(d.message||"Legacy Core Team invitations revoked successfully.");
 }catch(x){console.error("[ALBUKHR CORE TEAM LEGACY CLEANUP]",x);setStatus(x?.message||"Legacy invitation cleanup failed.",true);}
 finally{setBusy("cleanupLegacyButton",false,"Revoke Legacy Invitations","Revoking...");}
}

async function handleRefresh(){try{setBusy("refreshButton",true,"Refresh","Refreshing...");await refreshCoreTeam();}catch(x){console.error("[ALBUKHR CORE TEAM REFRESH]",x);setStatus(x?.message||"Core Team refresh failed.",true);}finally{setBusy("refreshButton",false,"Refresh","Refreshing...");}}
async function copyInvitationToken(){try{const i=$("invitationToken"),v=i?.value||"";if(!v)fail("No invitation URL is available.");if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(v);else{i.focus();i.select();if(!document.execCommand("copy"))fail("Clipboard copy failed.");}setStatus("Invitation URL copied successfully.");}catch(x){setStatus(x?.message||"Invitation URL copy failed.",true);}}
async function handleLogout(){try{await getAdminAuth().signOut();}catch(x){console.error("[ALBUKHR ADMIN LOGOUT]",x);}finally{window.location.replace(ADMIN_LOGIN_PAGE);}}

async function initialize(){
 if(initializationComplete)return;
 try{
  assertMainnet();clearInvitationToken();const auth=getAdminAuth();await auth.init();
  adminContext=await auth.requireAdmin({redirect:false});if(!adminContext){window.location.replace(ADMIN_LOGIN_PAGE);return;}
  const mfa=await auth.ensureMfa();if(adminContext.mfa_required&&!mfa?.verified){window.location.replace(ADMIN_MFA_PAGE);return;}
  await requireFreshAal2();setSecurityState("Authenticated • AAL2");
  if(!isSuperAdmin()){showDenied();setStatus("Core Team management requires Super Admin.",true);initializationComplete=true;return;}
  showAuthorized();await refreshCoreTeam();initializationComplete=true;
 }catch(x){console.error("[ALBUKHR CORE TEAM INIT]",x);showDenied();setSecurityState("Security verification failed");setStatus(x?.message||"Core Team authorization failed.",true);}
}

function bindEvents(){$("inviteForm")?.addEventListener("submit",handleInviteSubmit);$("copyTokenButton")?.addEventListener("click",copyInvitationToken);$("refreshButton")?.addEventListener("click",handleRefresh);$("cleanupLegacyButton")?.addEventListener("click",handleCleanupLegacyInvitations);$("logoutButton")?.addEventListener("click",handleLogout);}
function start(){bindEvents();initialize();}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})(window,document);
