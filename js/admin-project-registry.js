(function(window,document){
"use strict";
const A=()=>window.AlbukhrSupabaseAdminAuth,$=id=>document.getElementById(id);
const allowedRoles=["super_admin","registry_admin","core_admin"];
function label(v){return String(v??"").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}
function status(t,error){$("pageStatus").textContent=t||"";$("pageStatus").className="status"+(error?" error":"")}
function esc(v){const d=document.createElement("div");d.textContent=String(v??"");return d.innerHTML}
function authorized(a){return allowedRoles.some(r=>(a.roles||[]).includes(r))}
function pick(o,names,fallback="—"){for(const n of names)if(o&&o[n]!=null&&o[n]!=="")return o[n];return fallback}
function render(rows){
 const box=$("projects");box.innerHTML="";
 $("recordCount").textContent=rows.length;
 if(!rows.length){$("emptyState").classList.remove("hidden");$("projects").innerHTML="";return}
 $("emptyState").classList.add("hidden");
 rows.forEach((row,i)=>{
  const id=pick(row,["id","project_id","uuid"],String(i+1));
  const name=pick(row,["name","project_name","title"],"Unnamed project");
  const statusValue=pick(row,["status","state"],"—");
  const category=pick(row,["category","type","project_type"],"—");
  const card=document.createElement("article");card.className="project";
  card.innerHTML='<div class="project-head"><div><span class="index">#'+esc(id)+'</span><h3>'+esc(name)+'</h3></div><em>'+esc(label(statusValue))+'</em></div>'+
    '<dl><div><dt>Category</dt><dd>'+esc(category)+'</dd></div>'+
    '<div><dt>Project ID</dt><dd>'+esc(id)+'</dd></div></dl>';
  const extra=document.createElement("details");
  extra.innerHTML="<summary>View registry record</summary><pre>"+esc(JSON.stringify(row,null,2))+"</pre>";
  card.appendChild(extra);box.appendChild(card);
 });
}
async function load(){
 $("refreshButton").disabled=true;$("sourceState").textContent="LOADING";
 try{
  const c=window.ALBUKHR_SUPABASE?.client;
  if(!c)throw Error("ALBUKHR Supabase Core is unavailable.");
  const {data,error}=await c.rpc("get_project_registry");
  if(error)throw error;
  const payload=Array.isArray(data)?(data[0]||{}):data||{};
  const rows=Array.isArray(payload.records)?payload.records:[];
  $("sourceState").textContent=payload.source==="public.projects"?"public.projects":label(payload.source||"RPC");
  $("registryDescription").textContent=payload.message||"Registry records returned by the Mainnet security RPC.";
  $("emptyText").textContent=payload.message||"The registry RPC returned no project records.";
  render(rows);status("Project Registry synchronized with the Mainnet security layer.");
 }catch(e){
  console.error("[ALBUKHR PROJECT REGISTRY]",e);
  $("sourceState").textContent="ERROR";status("Project Registry could not be loaded: "+String(e?.message||e),true);
 }finally{$("refreshButton").disabled=false}
}
async function init(){
 try{
  if(!A()||!window.ALBukhrEnvironment?.isMainnet())throw Error("Project Registry is available only on ALBUKHR MAINNET.");
  await A().init();
  const admin=await A().requireAdmin({redirect:false});
  if(!admin){location.replace("admin-login.html");return}
  const mfa=await A().ensureMfa();
  if(admin.mfa_required&&!mfa.verified){location.replace("admin-mfa.html");return}
  $("securityState").textContent="Authenticated • AAL2";
  $("authorization").textContent=authorized(admin)?"AUTHORIZED":"DENIED";
  if(!authorized(admin)){
    $("deniedPanel").classList.remove("hidden");
    status("Authenticated, but Project Registry authorization was denied.",true);
    return;
  }
  $("registryPanel").classList.remove("hidden");
  await load();
 }catch(e){
  console.error("[ALBUKHR PROJECT REGISTRY INIT]",e);
  status("Admin authorization failed. Returning to secure login.",true);
  setTimeout(()=>location.replace("admin-login.html"),700);
 }
}
$("refreshButton").addEventListener("click",load);
$("logoutButton").addEventListener("click",async()=>{try{await A()?.signOut()}finally{location.replace("admin-login.html")}});
init();
})(window,document);
