(function(window,document){
"use strict";
const A=()=>window.AlbukhrSupabaseAdminAuth,$=id=>document.getElementById(id);
function label(v){return String(v||"").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}
function status(text,error){$("pageStatus").textContent=text||"";$("pageStatus").className="status"+(error?" error":"")}
function esc(v){const d=document.createElement("div");d.textContent=String(v??"");return d.innerHTML}
async function init(){
 try{
  if(!A()||!window.ALBukhrEnvironment?.isMainnet())throw Error("Security & Access is available only on ALBUKHR MAINNET.");
  await A().init();
  const admin=await A().requireAdmin({redirect:false});
  if(!admin){location.replace("admin-login.html");return}
  const mfa=await A().ensureMfa();
  if(admin.mfa_required&&!mfa.verified){location.replace("admin-mfa.html");return}

  $("adminEmail").textContent=admin.email||admin.email_snapshot||"Authenticated administrator";
  $("adminId").textContent=admin.user_id||"Authenticated session";
  $("adminStatus").textContent=label(admin.status);
  $("mfaRequired").textContent=admin.mfa_required?"Required":"Not required";
  $("mfaStatus").textContent=mfa.verified?"AAL2 verified":"Not verified";
  $("authState").textContent=mfa.verified?"AAL2 VERIFIED":"AUTHENTICATED";
  $("securityState").textContent=mfa.verified?"Authenticated • AAL2":"Authenticated";

  const roles=Array.isArray(admin.roles)?admin.roles:[];
  $("roleCount").textContent=roles.length;
  $("roles").innerHTML=roles.map(r=>'<span class="role">'+esc(label(r))+"</span>").join("")||"<span>No roles returned.</span>";

  const core=Array.isArray(admin.core_projects)?admin.core_projects:[];
  const scoped=Array.isArray(admin.scoped_projects)?admin.scoped_projects:[];
  $("coreCount").textContent=core.length;
  $("scopedCount").textContent=scoped.length;
  $("testnetAccess").textContent=admin.testnet_access?"Granted":"No";

  $("boundaryText").textContent=
    "Administrator "+(admin.status==="active"?"is active":"is not active")+
    "; "+(mfa.verified?"AAL2 assurance is established.":"MFA assurance is not established.")+
    " Authorization remains controlled by the server security layer.";

  status("Security authorization verified.");
 }catch(e){
  console.error("[ALBUKHR ADMIN SECURITY]",e);
  status("Admin security authorization failed. Returning to secure login.",true);
  setTimeout(()=>location.replace("admin-login.html"),700);
 }
}
$("logoutButton").addEventListener("click",async()=>{try{await A()?.signOut()}finally{location.replace("admin-login.html")}});
init();
})(window,document);
