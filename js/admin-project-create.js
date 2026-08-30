(function(window,document){
"use strict";
const A=()=>window.AlbukhrSupabaseAdminAuth,$=id=>document.getElementById(id);
let admin=null,logo=null,busy=false;
const CREATION_ROLES=["super_admin","registry_admin"];

function msg(text,error=false){const e=$("pageStatus");e.textContent=text||"";e.className="status"+(error?" error":"")}
function lmsg(text,error=false){const e=$("logoStatus");e.textContent=text||"";e.className="inline-status"+(error?" error":"")}
function slug(v){return String(v||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,160)}
function setBusy(v){busy=v;$("createButton").disabled=v;$("createButton").textContent=v?"Creating...":"Create Mainnet Project"}
function setCoreSlotVisibility(){const core=$("projectType").value==="core";$("coreSlotWrap").classList.toggle("hidden",!core);if(!core)$("coreSlot").value=""}

async function validateForm(){
 const v=window.AlbukhrProjectLogoValidator;
 if(!v?.validate)throw Error("Logo validation engine unavailable.");
 const code=$("projectCode").value.trim(),name=$("projectName").value.trim(),s=$("projectSlug").value.trim(),type=$("projectType").value,slot=$("coreSlot").value;
 if(!code)throw Error("Project code is required.");
 if(!name)throw Error("Project name is required.");
 if(!s)throw Error("Slug is required.");
 if(!/^[a-z0-9][a-z0-9-]*$/i.test(s))throw Error("Slug must contain only letters, numbers and hyphens.");
 if(!type)throw Error("Select a project type.");
 if(type==="core"&&!slot)throw Error("Core projects require a core slot.");
 if(type!=="core"&&slot)throw Error("Only Core projects may have a core slot.");
 if(!logo)throw Error("A project logo is required.");
 return {code,name,slug:s,type,slot:slot?Number(slot):null,description:$("description").value.trim()||null,logo:await v.validate(logo)};
}

async function uploadLogo(projectId,m){
 const c=window.ALBUKHR_SUPABASE?.client;
 if(!c)throw Error("ALBUKHR Supabase Core is unavailable.");
 const path="projects/"+projectId+"/logo";
 const r=await c.storage.from("project-logos").upload(path,m.file,{contentType:m.file.type,upsert:false,cacheControl:"3600"});
 if(r.error)throw r.error;
 const url=c.storage.from("project-logos").getPublicUrl(path)?.data?.publicUrl;
 if(!url)throw Error("Project logo URL could not be generated.");
 return {path,url};
}

async function createProject(){
 if(busy)return;
 setBusy(true);msg("Validating project and logo...");
 try{
  if(!window.ALBukhrEnvironment?.isMainnet())throw Error("Project creation is available only on ALBUKHR MAINNET.");
  const c=window.ALBUKHR_SUPABASE?.client;
  if(!c)throw Error("ALBUKHR Supabase Core is unavailable.");
  const p=await validateForm();
  msg("Creating server-authorized Mainnet project...");
  const r=await c.schema("albukhr_security").rpc("create_project",{
   p_project_code:p.code,p_slug:p.slug,p_name:p.name,p_project_type:p.type,p_description:p.description,p_core_slot:p.slot,
   p_logo_url:null,p_logo_path:null,p_logo_width:null,p_logo_height:null,p_logo_format:null,p_logo_size_bytes:null
  });
  if(r.error)throw r.error;
  if(!r.data?.success)throw Error(r.data?.message||"Project creation was denied.");
  if(!r.data?.project_id)throw Error("Project was created without a project ID.");
  msg("Project created. Uploading validated logo...");
  const u=await uploadLogo(r.data.project_id,p.logo);
  const a=await c.schema("albukhr_security").rpc("attach_project_logo",{
   p_project_id:r.data.project_id,p_logo_path:u.path,p_logo_url:u.url,p_logo_width:p.logo.width,p_logo_height:p.logo.height,
   p_logo_format:p.logo.format,p_logo_size_bytes:p.logo.size_bytes
  });
  if(a.error)throw a.error;
  if(!a.data?.success)throw Error(a.data?.message||"Logo attachment was denied.");
  msg("Project created successfully as Draft.");
  setTimeout(()=>location.replace("admin-project-registry.html"),900);
 }catch(e){console.error("[ALBUKHR PROJECT CREATE]",e);msg(String(e?.message||e),true)}
 finally{setBusy(false)}
}

function bind(){
 $("projectType").addEventListener("change",setCoreSlotVisibility);
 $("projectName").addEventListener("input",()=>{if(!$("projectSlug").dataset.edited)$("projectSlug").value=slug($("projectName").value)});
 $("projectSlug").addEventListener("input",()=>{$("projectSlug").dataset.edited="1";$("projectSlug").value=slug($("projectSlug").value)});
 $("logoFile").addEventListener("change",async e=>{
  logo=null;$("logoPreview").classList.add("hidden");lmsg("");
  const files=[...(e.target.files||[])];
  if(files.length!==1){e.target.value="";lmsg("Select exactly one image.",true);return}
  try{
   const v=window.AlbukhrProjectLogoValidator;if(!v?.validate)throw Error("Logo validation engine unavailable.");
   const m=await v.validate(files[0]);logo=files[0];
   $("previewImage").src=URL.createObjectURL(m.file);$("logoName").textContent=m.file.name;
   $("logoMeta").textContent=`${m.width} × ${m.height}px • ${(m.size_bytes/1024).toFixed(1)} KB • ${m.format.toUpperCase()}`;
   $("logoPreview").classList.remove("hidden");lmsg("Logo passed validation.");
  }catch(e){logo=null;e.target.value="";lmsg(String(e?.message||e),true)}
 });
 $("removeLogo").addEventListener("click",()=>{logo=null;$("logoFile").value="";$("previewImage").removeAttribute("src");$("logoPreview").classList.add("hidden");lmsg("")});
 $("projectForm").addEventListener("submit",e=>{e.preventDefault();createProject()});
 $("logoutButton").addEventListener("click",async()=>{try{await A()?.signOut()}finally{location.replace("admin-login.html")}});
}

async function init(){
 try{
  if(!A())throw Error("Admin authentication engine unavailable.");
  if(!window.ALBukhrEnvironment?.isMainnet())throw Error("Project creation is available only on ALBUKHR MAINNET.");
  await A().init();
  admin=await A().requireAdmin({redirect:false});
  if(!admin){location.replace("admin-login.html");return}
  const m=await A().ensureMfa();
  if(admin.mfa_required&&!m.verified){location.replace("admin-mfa.html");return}
  const roles=Array.isArray(admin.roles)?admin.roles:[];
  if(!CREATION_ROLES.some(r=>roles.includes(r)))throw Error("Project Registry creation authorization denied.");
  $("securityState").textContent="Authenticated • AAL2";msg("Project creation is ready.");
 }catch(e){console.error("[ALBUKHR PROJECT CREATE INIT]",e);msg(String(e?.message||e),true);$("createButton").disabled=true}
}
bind();init();
})(window,document);
