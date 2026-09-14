(function(w,d){"use strict";
const A=()=>w.AlbukhrSupabaseAdminAuth,C=()=>w.ALBUKHR_SUPABASE?.client,$=id=>d.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const pi=v=>n(v).toFixed(3)+" Pi";
function msg(t,e){$("pageStatus").textContent=t||"";$("pageStatus").className="status"+(e?" error":"")}
async function rpc(name,params){const c=C();if(!c)throw Error("ALBUKHR Supabase Core is unavailable.");const r=await c.schema("albukhr_security").rpc(name,params||{});if(r.error)throw r.error;return r.data}
async function load(){
 const b=$("refreshButton");b.disabled=true;
 try{const data=await rpc("get_withdrawal_review_queue",{});const rows=Array.isArray(data)?data:[];$("recordCount").textContent=rows.length;$("requests").innerHTML=rows.map(card).join("");rows.forEach(bind);msg(rows.length?"Withdrawal review queue ready.":"No pending or approved withdrawals.")}
 catch(e){msg(e.message||"Unable to load withdrawal queue.",true)}finally{b.disabled=false}
}
function card(r){
 const status=String(r.status||"").toLowerCase(),total=n(r.requested_amount)+n(r.fee_amount);
 const actions=status==="approved"
  ? `<label>Blockchain TXID<input data-txid inputmode="text" autocomplete="off" placeholder="Paste the completed Pi transaction ID"></label><label>Payment note (optional)<textarea data-note placeholder="Optional finance note"></textarea></label><div class="card-actions"><button data-paid>Mark as Paid</button><button data-reject class="danger">Reject</button></div>`
  : `<label>Review reason<textarea data-reason placeholder="Reason for approval or rejection"></textarea></label><div class="card-actions"><button data-approve>Approve</button><button data-reject class="danger">Reject</button></div>`;
 return `<article class="card" data-id="${esc(r.withdrawal_id)}"><div class="card-head"><div><h3>${esc(r.project_code)} • ${esc(String(r.withdrawal_type).toUpperCase())}</h3><div class="meta">Request ${esc(r.withdrawal_id)} • ${esc(r.pi_uid)} • ${esc(status.toUpperCase())}</div></div><span class="badge">${esc(status.toUpperCase())}</span></div><div class="grid"><div class="field"><span>Receive</span><b>${pi(r.requested_amount)}</b></div><div class="field"><span>Fee (1%)</span><b>${pi(r.fee_amount)}</b></div><div class="field"><span>Total deduction</span><b>${pi(total)}</b></div><div class="field"><span>Wallet receive</span><b>${pi(r.net_amount)}</b></div><div class="field"><span>Stake</span><b>${pi(r.stake_amount)}</b></div><div class="field"><span>Unlock</span><b>${esc(r.unlock_at||"")}</b></div></div><div class="wallet"><span>Wallet</span><b>${esc(r.wallet_address)}</b></div>${actions}</article>`;
}
function bind(r){
 const box=d.querySelector(`[data-id="${CSS.escape(String(r.withdrawal_id))}"]`);if(!box)return;
 const reason=()=>box.querySelector("[data-reason]")?.value.trim()||"";
 const approve=box.querySelector("[data-approve]"),reject=box.querySelector("[data-reject]"),paid=box.querySelector("[data-paid]");
 if(approve)approve.onclick=async()=>{if(!confirm("Approve this withdrawal request for manual payment?"))return;await decide(r.withdrawal_id,"approve",reason())};
 if(reject)reject.onclick=async()=>{if(!reason()){msg("Rejection reason is required.",true);return}if(!confirm("Reject this withdrawal request?"))return;await decide(r.withdrawal_id,"reject",reason())};
 if(paid)paid.onclick=async()=>{
   const txid=box.querySelector("[data-txid]")?.value.trim()||"",note=box.querySelector("[data-note]")?.value.trim()||"";
   if(!txid){msg("Blockchain TXID is required before marking paid.",true);return}
   if(!confirm(`Confirm that ${pi(r.net_amount)} was manually sent to the displayed wallet and record this TXID as PAID?`))return;
   await markPaid(r.withdrawal_id,txid,note)
 };
}
async function decide(id,decision,reason){
 msg(decision==="approve"?"Approving withdrawal...":"Rejecting withdrawal...");
 try{const r=await rpc("review_withdrawal_request",{p_withdrawal_id:id,p_decision:decision,p_reason:reason||null});if(!r?.success)throw Error("Server did not confirm the review.");msg(decision==="approve"?"Withdrawal approved. Send the wallet-receive amount manually, then record the TXID.":"Withdrawal rejected.");await load()}
 catch(e){msg(e.message||"Withdrawal review failed.",true)}
}
async function markPaid(id,txid,note){
 msg("Recording manual Pi payment...");
 try{const r=await rpc("mark_withdrawal_paid",{p_withdrawal_id:id,p_txid:txid,p_note:note||null});if(!r?.success)throw Error("Database did not confirm the payment.");msg(r.already_paid?"Withdrawal was already recorded as paid.":"Withdrawal marked as PAID.");await load()}
 catch(e){msg(e.message||"Manual payout recording failed.",true)}
}
async function init(){
 try{
  if(!w.AlbukhrEnvironment?.isKnown?.()||!w.AlbukhrEnvironment.isMainnet())throw Error("ALBUKHR Admin is Mainnet only.");
  await A().init();const admin=await A().requireAdmin({redirect:false});if(!admin){location.replace("admin-login.html");return}
  const m=await A().ensureMfa();$("mfaStatus").textContent=m.verified?"AAL2 VERIFIED":"NOT VERIFIED";
  const roles=admin.roles||[],ok=roles.includes("super_admin")||roles.includes("finance_admin")||roles.includes("approval_admin");
  const payoutRole=roles.includes("super_admin")||roles.includes("finance_admin");
  $("authorization").textContent=ok?"AUTHORIZED":"DENIED";$("securityState").textContent=m.verified?"Authenticated • AAL2":"MFA verification required";
  if(!ok){$("deniedPanel").classList.remove("hidden");return}
  $("workspace").classList.remove("hidden");$("refreshButton").onclick=load;await load();
  $("logoutButton").onclick=async()=>{try{await A().signOut()}finally{location.replace("admin-login.html")}};
  if(!payoutRole){d.querySelectorAll("[data-paid]").forEach(b=>b.disabled=true)}
 }catch(e){msg(e.message||"Security initialization failed.",true);$("securityState").textContent="Security check failed"}
}
d.readyState==="loading"?d.addEventListener("DOMContentLoaded",init):init()
})(window,document);
