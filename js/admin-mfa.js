(function(window,document){"use strict";

const A=()=>window.AlbukhrSupabaseAdminAuth;
const qr=document.getElementById("qr");
const secret=document.getElementById("secret");
const code=document.getElementById("mfaCode");
const verify=document.getElementById("verifyButton");
const status=document.getElementById("mfaStatus");
const enrollPanel=document.getElementById("enrollPanel");
const successPanel=document.getElementById("successPanel");
const continueButton=document.getElementById("continueButton");

let factorId=null;
let initialized=false;

function msg(text,type){
  if(!status)return;
  status.textContent=String(text||"");
  status.className="status"+(type?" "+type:"");
}

function busy(value,text){
  if(!verify)return;
  verify.disabled=!!value;
  verify.textContent=text||(value?"Verifying...":"Verify & Secure Admin");
}

function depsReady(){
  return !!(window.ALBukhrEnvironment&&window.ALBUKHR_SUPABASE&&A());
}

function errText(e){
  if(!e)return"Unknown error.";
  const p=[];
  if(e.name)p.push("name="+String(e.name));
  if(e.code)p.push("code="+String(e.code));
  if(e.status)p.push("status="+String(e.status));
  if(e.message)p.push("message="+String(e.message));
  return p.join(" | ")||String(e);
}

function destination(){
  const r=new URLSearchParams(location.search).get("redirect");
  if(!r)return"admin-dashboard.html";
  try{
    const u=new URL(r,location.origin);
    return u.origin===location.origin&&u.protocol===location.protocol
      ?u.pathname+u.search+u.hash:"admin-dashboard.html";
  }catch(_){return"admin-dashboard.html";}
}

/*
 * Supabase JS returns TOTP enrollment data as:
 * data.id
 * data.totp.qr_code
 * data.totp.secret
 * data.totp.uri
 *
 * qr_code is already an SVG. No QR library is required.
 */
function renderQr(qrCode){
  if(!qr)throw new Error("QR container is missing from admin-mfa.html.");
  qr.innerHTML="";
  if(!qrCode)throw new Error("Supabase did not return a TOTP QR code.");

  const img=document.createElement("img");
  img.alt="ALBUKHR Admin authenticator QR code";
  img.width=220;
  img.height=220;
  img.style.maxWidth="100%";
  img.style.height="auto";
  img.style.display="block";
  img.style.margin="0 auto";
  img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(String(qrCode));
  qr.appendChild(img);
}

function renderSecret(value){
  if(!secret)return;
  secret.textContent=value?String(value):"No manual setup key was returned by Supabase.";
}

async function removeStaleUnverified(client,factors){
  const stale=(Array.isArray(factors)?factors:[]).filter(
    f=>f&&f.factor_type==="totp"&&f.status==="unverified"
  );
  for(const f of stale){
    const r=await client.auth.mfa.unenroll({factorId:f.id});
    if(r.error)throw r.error;
  }
}

async function enroll(){
  const client=window.ALBUKHR_SUPABASE.client;
  const existing=await client.auth.mfa.listFactors();
  if(existing.error)throw existing.error;

  const factors=Array.isArray(existing.data?.totp)?existing.data.totp:[];
  const verified=factors.find(f=>f.status==="verified");

  if(verified){
    factorId=verified.id;
    renderSecret("Already enrolled — use your authenticator app.");
    if(qr)qr.innerHTML="";
    msg("An authenticator is already enrolled. Enter its current 6-digit code.","success");
    initialized=true;
    return;
  }

  await removeStaleUnverified(client,factors);

  const result=await client.auth.mfa.enroll({
    factorType:"totp",
    friendlyName:"ALBUKHR Admin Authenticator"
  });

  if(result.error)throw result.error;
  if(!result.data?.id)throw new Error("Supabase did not return a valid MFA factor.");

  factorId=result.data.id;

  const totp=result.data.totp||{};
  const qrCode=totp.qr_code||"";
  const totpSecret=totp.secret||"";
  const uri=totp.uri||"";

  renderQr(qrCode);
  renderSecret(totpSecret);

  if(!qrCode&&!uri)throw new Error("Supabase returned no QR code or TOTP URI.");

  msg("Authenticator setup is ready. Scan the QR code, then enter the 6-digit code shown in your authenticator app.");
  initialized=true;
}

async function verifyMfa(){
  const value=String(code?.value||"").replace(/\D/g,"");

  if(!factorId)throw new Error("MFA factor is not available. Reload the page and try again.");
  if(!/^\d{6}$/.test(value))throw new Error("Enter the 6-digit authenticator code.");

  const client=window.ALBUKHR_SUPABASE.client;

  const challenge=await client.auth.mfa.challenge({factorId});
  if(challenge.error)throw challenge.error;

  const result=await client.auth.mfa.verify({
    factorId,
    challengeId:challenge.data.id,
    code:value
  });
  if(result.error)throw result.error;

  const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if(assurance.error)throw assurance.error;
  if(assurance.data.currentLevel!=="aal2"){
    throw new Error("MFA verification did not establish AAL2 assurance.");
  }

  const admin=await A().refreshAdminContext();
  if(!admin||!admin.is_admin||admin.status!=="active"){
    throw new Error("MFA succeeded, but ALBUKHR admin authorization could not be re-verified.");
  }

  if(enrollPanel)enrollPanel.hidden=true;
  if(successPanel)successPanel.hidden=false;
  if(code)code.value="";

  msg("MFA verification successful. Your ALBUKHR admin session is now secured with AAL2.","success");
}

async function init(){
  try{
    if(!depsReady())throw new Error("Admin authentication system is unavailable.");
    if(!window.ALBukhrEnvironment.isMainnet())throw new Error("Admin MFA is available only on ALBUKHR MAINNET.");

    await A().init();

    const admin=await A().requireAdmin({redirect:false});
    if(!admin){
      location.replace("admin-login.html");
      return;
    }

    const mfa=await A().ensureMfa();

    if(mfa.required&&mfa.verified){
      if(successPanel)successPanel.hidden=false;
      if(enrollPanel)enrollPanel.hidden=true;
      msg("MFA is already verified for this session.","success");
      return;
    }

    await enroll();
  }catch(e){
    console.error("[ALBUKHR ADMIN MFA]",e);
    msg("MFA setup failed: "+errText(e),"error");
    if(verify)verify.disabled=true;
  }
}

verify?.addEventListener("click",async function(){
  if(!initialized||!factorId)return;
  try{
    busy(true,"Verifying...");
    msg("Verifying MFA assurance...");
    await verifyMfa();
    busy(false,"Verified ✓");
  }catch(e){
    console.error("[ALBUKHR ADMIN MFA VERIFY]",e);
    msg("MFA verification failed: "+errText(e),"error");
    busy(false,"Verify & Secure Admin");
  }
});

code?.addEventListener("input",function(){
  code.value=code.value.replace(/\D/g,"").slice(0,6);
});

code?.addEventListener("keydown",function(e){
  if(e.key==="Enter"){
    e.preventDefault();
    verify?.click();
  }
});

continueButton?.addEventListener("click",function(){
  location.replace(destination());
});

init();

})(window,document);
