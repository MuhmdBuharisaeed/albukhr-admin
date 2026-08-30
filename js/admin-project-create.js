(function(window,document){"use strict";
const A=()=>window.AlbukhrSupabaseAdminAuth,$=id=>document.getElementById(id);let admin=null,logo=null,busy=false;
function msg(t,e){$("pageStatus").textContent=t||"";$("pageStatus").className="status"+(e?" error":"")}
function lmsg(t,e){$("logoStatus").textContent=t||"";$("logoStatus").className="inline-status"+(e?" error":"")}
function slug(v){return String(v||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,160)}
function setBusy(v){busy=v;$("createButton").disabled=v;$("createButton").textContent=v?"Creating...":"Create Mainnet Project"}
async function validateForm(){
 const v=window.AlbukhrProjectLogoValidator;if(!v)throw Error("Logo validation engine unavailable.");
 const code=$("projectCode").value.trim(),name=$("projectName").value.trim(),s=$("projectSlug").value.trim(),type=$("projectType").value,slot=$("coreSlot").value;
 if(!code)throw Error("Project code is required.");if(!name)throw Error("Project name is required.");
 if(!/^[a-z0-9][a-z0-9-]*$/i.test(s))throw Error("Slug must contain only letters, numbers and hyphens.");
 if(!type)throw Error("Select a project type.");
 if(type==="core"&&!slot)throw Error("Core projects require a core slot.");if(type!=="core"&&slot)throw Error("Only Core projects may have a core slot.");
 if(!logo)throw Error("A project logo is required.");
 return {code,name,slug:s,type,slot:slot?Number(slot):null,description:$("description").value.trim(),logo:await v.validate(logo)};
}
async function upload(projectId,m){
 const c=window.ALBUKHR_SUPABASE.client,path="projects/"+projectId+"/logo";
 const r=await c.storage.from("project-logos").upload(path,m.file,{contentType:m.file.type,upsert:false,cacheControl:"3600"});
 if(r.error)throw r.error;return {path,url:c.storage.from("project-logos").getPublicUrl(path).data.publicUrl};
}
async function create(){
 if(busy)return;setBusy(true);msg("Validating project and logo...");
 try{
  const p=await validateForm(),c=window.ALBUKHR_SUPABASE.client;
  msg("Creating server-authorized Mainnet project...");
  const r=await c.schema("albukhr_security").rpc("create_project",{p_project_code:p.code,p_slug:p.slug,p_name:p.name,p_project_type:p.type,p_description:p.description||null,p_core_slot:p.slot,p_logo_url:null,p_logo_path:null,p_logo_width:null,p_logo_height:null,p_logo_format:null,p_logo_size_bytes:null});
  if(r.error)throw r.error;if(!r.data?.success)throw Error(r.data?.message||"Project creation was denied.");
  msg("Project created. Uploading validated logo...");
  const u=await upload(r.data.project_id,p.logo);
  const a=await c.schema("albukhr_security").rpc("attach_project_logo",{p_project_id:r.data.project_id,p_logo_path:u.path,p_logo_url:u.url,p_logo_width:p.logo.width,p_logo_height:p.logo.height,p_logo_format:p.logo.format,p_logo_size_bytes:p.logo.size_bytes});
  if(a.error)throw a.error;if(!a.data?.success)throw Error(a.data?.message||"Logo attachment was denied.");
  msg("Project created successfully as Draft.","success");setTimeout(()=>location.replace("admin-project-registry.html"),900);
 }catch(e){console.error(e);msg(String(e?.message||e),true)}finally{setBusy(false)}
}
$("projectType").addEventListener("change",()=>$("coreSlotWrap").classList.toggle("hidden",$("projectType").value!=="core"));
$("projectName").addEventListener("input",()=>{if(!$("projectSlug").dataset.edited)$("projectSlug").value=slug($("projectName").value)});
$("projectSlug").addEventListener("input",()=>{$("projectSlug").dataset.edited="1";$("projectSlug").value=slug($("projectSlug").value)});
$("logoFile").addEventListener("change",async e=>{logo=null;$("logoPreview").classList.add("hidden");lmsg("");const f=[...(e.target.files||[])];if(f.length!==1){lmsg("Select exactly one image.",true);return}try{logo=f[0];const m=await window.AlbukhrProjectLogoValidator.validate(logo);$("previewImage").src=URL.createObjectURL(m.file);$("logoName").textContent=m.file.name;$("logoMeta").textContent=`${m.width} × ${m.height}px • ${(m.size_bytes/1024).toFixed(1)} KB • ${m.format.toUpperCase()}`;$("logoPreview").classList.remove("hidden");lmsg("Logo passed validation.")}catch(e){logo=null;e.target.value="";lmsg(e.message,true)}});
$("removeLogo").addEventListener("click",()=>{logo=null;$("logoFile").value="";$("logoPreview").classList.add("hidden");lmsg("")});
$("projectForm").addEventListener("submit",e=>{e.preventDefault();create()});
$("logoutButton").addEventListener("click",async()=>{try{await A()?.signOut()}finally{location.replace("admin-login.html")}});
(async()=>{try{if(!A()||!window.ALBukhrEnvironment?.isMainnet())throw Error("Project creation is available only on ALBUKHR MAINNET.");await A().init();admin=await A().requireAdmin({redirect:false});if(!admin){location.replace("admin-login.html");return}const m=await A().ensureMfa();if(admin.mfa_required&&!m.verified){location.replace("admin-mfa.html");return}if(!admin.roles.includes("super_admin")&&!admin.roles.includes("registry_admin"))throw Error("Project Registry creation authorization denied.");$("securityState").textContent="Authenticated • AAL2";msg("Project creation is ready.")}catch(e){console.error(e);msg(e.message,true);$("createButton").disabled=true}})();
})(window,document);
