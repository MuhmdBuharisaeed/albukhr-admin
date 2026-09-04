(function(window,document){
"use strict";
const A=()=>window.AlbukhrSupabaseAdminAuth,$=id=>document.getElementById(id);
function label(v){return String(v||"").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}
function status(t,e){$("pageStatus").textContent=t||"";$("pageStatus").className="status"+(e?" error":"")}
function render(a,m){
 $("adminEmail").textContent=a.email||a.email_snapshot||"Authenticated administrator";$("adminId").textContent=a.user_id||"Authenticated session";$("adminStatus").textContent=label(a.status);$("mfaStatus").textContent=m.verified?"AAL2 verified":"Not verified";
 const roles=Array.isArray(a.roles)?a.roles:[];
 $("roleCount").textContent=roles.length;$("roles").innerHTML=roles.map(r=>'<span class="role">'+label(r)+'</span>').join("")||'<span>No roles returned.</span>';
 $("coreCount").textContent=Array.isArray(a.core_projects)?a.core_projects.length:0;$("scopedCount").textContent=Array.isArray(a.scoped_projects)?a.scoped_projects.length:0;$("testnetAccess").textContent=a.testnet_access?"Granted":"No";$("securityState").textContent=m.verified?"Authenticated • AAL2":"Authenticated";
 const defs=[
  ["Security & Access","Administrator roles and security controls.",["super_admin"],"admin-security.html"],
  ["Core Team","Invite and manage the seven official ALBUKHR Core Team members.",["super_admin"],"admin-core-team.html"],
  ["Project Registry","Core project registry administration.",["super_admin","registry_admin","core_admin"],"admin-project-registry.html"],
  ["Project Approvals","Project approval workflow.",["super_admin","approval_admin"],"admin-module.html?module=approvals"],
  ["Finance","Administrative finance oversight.",["super_admin","finance_admin"],"admin-module.html?module=finance"],
  ["Internal Projects","Internal project scope administration.",["super_admin","internal_admin"],"admin-module.html?module=internal"],
  ["External Projects","External project scope administration.",["super_admin","external_admin"],"admin-module.html?module=external"]
 ];
 $("modules").innerHTML=defs.map(x=>{const ok=x[2].some(r=>roles.includes(r));return '<a class="module '+(ok?"":"off")+'" href="'+x[3]+'"><h3>'+x[0]+'</h3><p>'+x[1]+'</p><small>'+(ok?"AUTHORIZED":"ROLE REQUIRED")+"</small></a>";}).join("");
}
async function init(){try{if(!A()||!window.ALBukhrEnvironment?.isMainnet())throw Error("Admin Control Center is unavailable.");await A().init();const a=await A().requireAdmin({redirect:false});if(!a){location.replace("admin-login.html");return}const m=await A().ensureMfa();if(a.mfa_required&&!m.verified){location.replace("admin-mfa.html");return}render(a,m);status("Admin authorization verified.");}catch(e){console.error("[ALBUKHR ADMIN DASHBOARD]",e);status("Admin authorization failed. Returning to secure login.",true);setTimeout(()=>location.replace("admin-login.html"),700);}}
$("logoutButton").addEventListener("click",async()=>{try{await A()?.signOut()}finally{location.replace("admin-login.html")}});
init();
})(window,document);
