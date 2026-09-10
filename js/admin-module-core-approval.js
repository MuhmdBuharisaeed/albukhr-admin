/* ALBUKHR Core Project Approval UI — Migration 1.7 */
(function(w,d){
"use strict";
const A=()=>w.AlbukhrSupabaseAdminAuth,C=()=>w.ALBUKHR_SUPABASE?.client,$=id=>d.getElementById(id);
const rpc=async(n,p={})=>{const c=C();if(!c)throw Error("Supabase client unavailable.");const {data,error}=await c.schema("albukhr_security").rpc(n,p);if(error)throw error;return data;};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function msg(t,e=false){const x=$("pageStatus");if(x){x.textContent=t;x.className="status"+(e?" error":"");}}
function render(rows){
 const h=$("workspaceText"); if(!h)return;
 if(!rows.length){h.innerHTML="<div class='notice'><b>No Core Projects awaiting approval.</b><span>The server-authoritative queue is empty.</span></div>";return;}
 h.innerHTML=rows.map(p=>`<article class="approval-item" data-id="${esc(p.project_id)}"><div><small>CORE SLOT ${esc(p.core_slot)} • MAINNET</small><h3>${esc(p.name)}</h3><p>${esc(p.project_code)} • ${esc(p.slug)}</p><strong>STATUS: ${esc(String(p.status).toUpperCase())}</strong></div><div class="approval-actions"><button data-a="history" type="button">History</button><button data-a="approve" type="button">Approve Project</button></div><div class="approval-history" hidden></div></article>`).join("");
 h.querySelectorAll("button").forEach(b=>b.onclick=async()=>{
   const card=b.closest(".approval-item"),id=card?.dataset.id;if(!id)return;
   try{
    if(b.dataset.a==="history"){
      const box=card.querySelector(".approval-history");box.hidden=false;box.textContent="Loading approval history...";
      const r=await rpc("get_core_project_approval_history",{p_project_id:id});
      box.innerHTML=(r.records||[]).length?(r.records||[]).map(x=>`<div><b>${esc(String(x.decision).toUpperCase())}</b> <span>${esc(x.previous_status)} → ${esc(x.new_status)}</span><small>${esc(x.created_at)}</small>${x.reason?`<p>${esc(x.reason)}</p>`:""}</div>`).join(""):"<span>No approval decisions recorded.</span>";
    }else{
      const reason=w.prompt("Approval reason (optional):","Core Project approved after administrative review.");
      if(reason===null)return;b.disabled=true;msg("Submitting approval to the server...");
      const r=await rpc("approve_core_project",{p_project_id:id,p_reason:reason});
      if(!r?.success)throw Error("Server did not confirm the approval.");
      msg("Core Project approved successfully. Project status is now APPROVED.");await load();
    }
   }catch(e){console.error(e);msg(e?.message||"Core Project approval failed.",true);b.disabled=false;}
 });
}
async function load(){const r=await rpc("get_core_project_approval_queue");if(!r?.authorized)throw Error("Core Project approval authorization denied.");render(Array.isArray(r.records)?r.records:[]);}
async function init(){
 try{
  if(!A()||!w.AlbukhrEnvironment?.isMainnet())throw Error("Admin module unavailable.");
  await A().init();const a=await A().requireAdmin({redirect:false});if(!a){location.replace("admin-login.html");return;}
  const m=await A().ensureMfa();if(a.mfa_required&&!m.verified){location.replace("admin-mfa.html");return;}
  const roles=Array.isArray(a.roles)?a.roles:[];if(!roles.some(r=>r==="super_admin"||r==="approval_admin")){if($("authorizationState"))$("authorizationState").textContent="DENIED";msg("You are authenticated but not authorized for Core Project approvals.",true);return;}
  if($("authorizationState"))$("authorizationState").textContent="AUTHORIZED";if($("securityState"))$("securityState").textContent="Authenticated • AAL2";
  await load();msg("Core Project approval workspace ready.");
 }catch(e){console.error(e);msg(e?.message||"Unable to load Core Project approval workspace.",true);}
}
init();
})(window,document);
