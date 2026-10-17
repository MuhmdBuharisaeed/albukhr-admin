(function(w,d){"use strict";
const A=()=>w.AlbukhrSupabaseAdminAuth,C=()=>w.ALBUKHR_SUPABASE?.client,$=id=>d.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const pi=v=>n(v).toFixed(3)+" Pi";
let canFinancePay=false;
function msg(t,e){$("pageStatus").textContent=t||"";$("pageStatus").className="status"+(e?" error":"")}
function reconMsg(t,e){$("reconciliationStatus").textContent=t||"";$("reconciliationStatus").className="status"+(e?" error":"")}
async function rpc(name,params){const c=C();if(!c)throw Error("ALBUKHR Supabase Core is unavailable.");const r=await c.schema("albukhr_security").rpc(name,params||{});if(r.error)throw r.error;return r.data}
async function load(){
 const b=$("refreshButton");b.disabled=true;
 try{const data=await rpc("get_withdrawal_review_queue",{});const rows=Array.isArray(data)?data:[];$("recordCount").textContent=rows.length;$("requests").innerHTML=rows.map(card).join("");rows.forEach(bind);msg(rows.length?"Withdrawal review queue ready.":"No pending or approved withdrawals.")}
 catch(e){msg(e.message||"Unable to load withdrawal queue.",true)}finally{b.disabled=false}
 if(canFinancePay)await loadReconciliation();
}
function blocked(r){
 // Fail closed if the server-side safety field is absent (for example, if the
 // UI is deployed before the coordinated SQL migration). Do not infer safety.
 return typeof r.manual_payment_blocked!=="boolean" || r.manual_payment_blocked===true;
}
function lockReason(r){
 if(typeof r.manual_payment_blocked!=="boolean")return "The database safety flags are unavailable. Keep all payout/review actions locked until the coordinated database update is verified.";
 if(r.a2u_uncertain_outcome)return "Pi payment creation or blockchain submission has an uncertain outcome. Automatic retries and manual payment are blocked pending reconciliation.";
 if(r.a2u_external_payment_present)return "A Pi payment ID or transaction ID is already recorded. Manual payment is blocked to prevent a duplicate payout.";
 if(String(r.a2u_attempt_status||"")==="processing")return "An A2U worker owns or may have recently owned this request. Do not start a manual payout.";
 if(String(r.a2u_attempt_status||"")==="completed")return "The A2U attempt is marked completed while the request is still in this queue. Reconciliation is required.";
 return "The database has blocked payout actions pending A2U reconciliation.";
}
function card(r){
 const status=String(r.status||"").toLowerCase(),total=n(r.requested_amount)+n(r.fee_amount),payoutBlocked=blocked(r);
 let actions="";
 if(payoutBlocked){
   actions=`<div class="payout-lock" role="alert"><b>PAYOUT ACTIONS LOCKED</b><span>${esc(lockReason(r))}</span><span>Attempt: ${esc(r.a2u_attempt_status||"unknown")} · Payment ID recorded: ${r.a2u_external_payment_present?"yes":"no"} · Uncertain outcome: ${r.a2u_uncertain_outcome?"yes":"no"}</span></div>`;
 }else if(status==="approved"){
   actions=`<label>Blockchain TXID<input data-txid inputmode="text" autocomplete="off" placeholder="Paste the completed Pi transaction ID"></label><label>Payment note (optional)<textarea data-note placeholder="Optional finance note"></textarea></label><div class="card-actions"><button data-paid ${canFinancePay?"":"disabled title=\"Finance Admin or Super Admin only\""}>Mark as Paid</button><button data-reject class="danger">Reject</button></div>`;
 }else{
   actions=`<label>Review reason<textarea data-reason placeholder="Reason for approval or rejection"></textarea></label><div class="card-actions"><button data-approve>Approve</button><button data-reject class="danger">Reject</button></div>`;
 }
 return `<article class="card" data-id="${esc(r.withdrawal_id)}"><div class="card-head"><div><h3>${esc(r.project_code)} • ${esc(String(r.withdrawal_type).toUpperCase())}</h3><div class="meta">Request ${esc(r.withdrawal_id)} • ${esc(r.pi_uid)} • ${esc(status.toUpperCase())}</div></div><span class="badge">${esc(status.toUpperCase())}</span></div><div class="grid"><div class="field"><span>Receive</span><b>${pi(r.requested_amount)}</b></div><div class="field"><span>Fee</span><b>${pi(r.fee_amount)}</b></div><div class="field"><span>Total deduction</span><b>${pi(total)}</b></div><div class="field"><span>Wallet receive</span><b>${pi(r.net_amount)}</b></div><div class="field"><span>Stake</span><b>${pi(r.stake_amount)}</b></div><div class="field"><span>Unlock</span><b>${esc(r.unlock_at||"")}</b></div></div><div class="wallet"><span>Wallet</span><b>${esc(r.wallet_address)}</b></div>${actions}</article>`;
}
function bind(r){
 const box=d.querySelector(`[data-id="${CSS.escape(String(r.withdrawal_id))}"]`);if(!box)return;
 const reason=()=>box.querySelector("[data-reason]")?.value.trim()||"";
 const approve=box.querySelector("[data-approve]"),reject=box.querySelector("[data-reject]"),paid=box.querySelector("[data-paid]");
 if(approve)approve.onclick=async()=>{if(!confirm("Approve this withdrawal request for manual payment? Approval does not send Pi."))return;await decide(r.withdrawal_id,"approve",reason())};
 if(reject)reject.onclick=async()=>{if(!reason()){msg("Rejection reason is required.",true);return}if(!confirm("Reject this withdrawal request?"))return;await decide(r.withdrawal_id,"reject",reason())};
 if(paid)paid.onclick=async()=>{
   if(!canFinancePay||blocked(r)){msg("Manual payout is locked by the current A2U safety state.",true);return}
   const txid=box.querySelector("[data-txid]")?.value.trim()||"",note=box.querySelector("[data-note]")?.value.trim()||"";
   if(!txid){msg("Blockchain TXID is required before marking paid.",true);return}
   if(!confirm(`Confirm that ${pi(r.net_amount)} was manually sent to the displayed wallet and record this TXID as PAID?`))return;
   await markPaid(r.withdrawal_id,txid,note)
 };
}
async function loadReconciliation(){
 const refresh=$("refreshReconciliationButton");if(!refresh)return;
 refresh.disabled=true;
 try{
   const data=await rpc("get_a2u_reconciliation_queue",{p_limit:50});
   const rows=Array.isArray(data)?data:[];
   $("reconciliationRequests").innerHTML=rows.map(reconciliationCard).join("");
   reconMsg(rows.length?`${rows.length} record(s) require reconciliation review. No action in this panel can release a payout.`:"No A2U reconciliation mismatches were returned.");
 }catch(e){
   $("reconciliationRequests").innerHTML="";
   reconMsg("Read-only reconciliation queue is unavailable. The SQL candidate must be reviewed and safely migrated before this panel can be used. Do not infer that a payout is safe.",true);
 }
 finally{refresh.disabled=false}
}
function reconciliationCard(r){
 const flags=[
   r.payment_creation_started_at?`Creation intent: ${esc(r.payment_creation_started_at)}`:"",
   r.submission_started_at?`Submission intent: ${esc(r.submission_started_at)}`:"",
   r.lease_until?`Lease: ${esc(r.lease_until)}`:""
 ].filter(Boolean).join(" · ");
 return `<article class="card recon-card"><div class="card-head"><div><h3>${esc(r.project_code)} • ${esc(String(r.withdrawal_type||"").toUpperCase())}</h3><div class="meta">Request ${esc(r.withdrawal_id)} • Request status ${esc(r.withdrawal_status)} • Attempt ${esc(r.attempt_id)}</div></div><span class="badge danger-badge">RECONCILE</span></div><div class="grid"><div class="field"><span>Reason</span><b>${esc(r.reconciliation_reason)}</b></div><div class="field"><span>Attempt status / count</span><b>${esc(r.attempt_status)} / ${esc(r.attempt_count)}</b></div><div class="field"><span>Amount to wallet</span><b>${pi(r.net_amount)}</b></div><div class="field"><span>Pi payment ID</span><b>${esc(r.payment_id||"Not recorded")}</b></div><div class="field"><span>Attempt TXID</span><b>${esc(r.attempt_txid||"Not recorded")}</b></div><div class="field"><span>Request TXID</span><b>${esc(r.withdrawal_txid||"Not recorded")}</b></div></div><div class="wallet"><span>Wallet</span><b>${esc(r.wallet_address)}</b></div><div class="meta">${flags||"No creation/submission marker recorded."}</div>${r.last_error?`<div class="error-detail"><b>Last worker error (sanitized field)</b><p>${esc(r.last_error)}</p></div>`:""}<div class="payout-lock" role="alert"><b>NO PAYOUT ACTIONS HERE</b><span>Reconcile this request against Pi's authoritative payment record from the trusted server side. An absent TXID or a failed worker status alone is not proof that no payment occurred.</span></div></article>`;
}
async function decide(id,decision,reason){
 msg(decision==="approve"?"Approving withdrawal...":"Rejecting withdrawal...");
 try{const r=await rpc("review_withdrawal_request",{p_withdrawal_id:id,p_decision:decision,p_reason:reason||null});if(!r?.success)throw Error("Server did not confirm the review.");msg(decision==="approve"?"Withdrawal approved. No payment was sent. Confirm safety status before manual payment.":"Withdrawal rejected.");await load()}
 catch(e){msg(e.message||"Withdrawal review failed.",true)}
}
async function markPaid(id,txid,note){
 msg("Recording manual Pi payment...");
 try{const r=await rpc("mark_withdrawal_paid",{p_withdrawal_id:id,p_txid:txid,p_note:note||null});if(!r?.success)throw Error("Database did not confirm the payment.");msg(r.already_paid?"Withdrawal was already recorded as paid.":"Withdrawal marked as PAID.");await load()}
 catch(e){msg(e.message||"Manual payout recording failed.",true)}
}
async function init(){
 try{
  const env = w.ALBukhrEnvironment;
if (
  !env ||
  typeof env.isKnown !== "function" ||
  typeof env.isMainnet !== "function" ||
  !env.isKnown() ||
  !env.isMainnet()
) {
  throw Error("ALBUKHR Admin is Mainnet only.");
}
  await A().init();const admin=await A().requireAdmin({redirect:false});if(!admin){location.replace("admin-login.html");return}
  const m=await A().ensureMfa();$("mfaStatus").textContent=m.verified?"AAL2 VERIFIED":"NOT VERIFIED";
  const roles=admin.roles||[];const ok=roles.includes("super_admin")||roles.includes("finance_admin")||roles.includes("approval_admin");
  canFinancePay=roles.includes("super_admin")||roles.includes("finance_admin");
  $("authorization").textContent=ok?"AUTHORIZED":"DENIED";$("securityState").textContent=m.verified?"Authenticated • AAL2":"MFA verification required";
  if(!ok){$("deniedPanel").classList.remove("hidden");return}
  $("workspace").classList.remove("hidden");
  if(canFinancePay)$("reconciliationPanel").classList.remove("hidden");
  $("refreshButton").onclick=load;if(canFinancePay)$("refreshReconciliationButton").onclick=loadReconciliation;
  await load();
  $("logoutButton").onclick=async()=>{try{await A().signOut()}finally{location.replace("admin-login.html")}};
 }catch(e){msg(e.message||"Security initialization failed.",true);$("securityState").textContent="Security check failed"}
}
d.readyState==="loading"?d.addEventListener("DOMContentLoaded",init):init()
})(window,document);
