(function(window,document){
"use strict";
const ADMIN_LOGIN_PAGE="admin-login.html",ADMIN_MFA_PAGE="admin-mfa.html";
const RPC={workspace:"get_financial_control_role_workspace",request:"request_financial_control_role_change",approve:"approve_financial_control_role_change",reject:"reject_financial_control_role_change"};
const $=id=>document.getElementById(id);
let adminContext=null,workspaceData=null,roleCatalog=[],eligibleTargets=[];
function fail(message){throw new Error(String(message||"ALBUKHR Admin security error."));}
function label(value){return String(value||"").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());}
function status(message,isError){const el=$("pageStatus");if(el){el.textContent=message||"";el.className="status"+(isError?" error":"");}}
function financialStatus(message,isError){const el=$("financialControlStatus");if(el){el.textContent=message||"";el.className="inline-status"+(isError?" error":"");}}
function uuid(value){const s=String(value||"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)?s:null;}
function date(value){if(!value)return"—";const d=new Date(value);return Number.isNaN(d.getTime())?"—":d.toLocaleString();}
function mainnetClient(){
 const env=window.ALBukhrEnvironment;
 if(!env?.isKnown?.()||!env.isMainnet?.())fail("Financial Control Roles are available only on ALBUKHR MAINNET.");
 const core=window.ALBUKHR_SUPABASE;
 if(!core?.client||String(core.environment).toLowerCase()!=="mainnet"||String(core.network).toLowerCase()!=="mainnet")fail("Mainnet Supabase Core is unavailable or has the wrong network.");
 return core.client;
}
function auth(){if(!window.AlbukhrSupabaseAdminAuth)fail("ALBUKHR Admin Auth is unavailable.");return window.AlbukhrSupabaseAdminAuth;}
function legacyRoles(){return Array.isArray(adminContext?.roles)?adminContext.roles.map(v=>String(v||"").toLowerCase()):[];}
async function requireFreshAal2(){
 const a=auth();
 const preliminary=await a.requireAdmin({redirect:false});
 if(!preliminary){window.location.replace(ADMIN_LOGIN_PAGE);fail("An active Admin session is required.");}
 if(preliminary.mfa_required!==true)fail("Financial-control operations require the Admin account's MFA requirement to be enabled.");
 const mfa=await a.ensureMfa();
 if(!mfa?.required||!mfa?.verified){window.location.replace(ADMIN_MFA_PAGE);fail("AAL2 MFA verification is required.");}
 const assurance=await mainnetClient().auth.mfa.getAuthenticatorAssuranceLevel();
 if(assurance.error)throw assurance.error;
 if(assurance.data?.currentLevel!=="aal2"){window.location.replace(ADMIN_MFA_PAGE);fail("The current Supabase session does not have AAL2 assurance.");}
 adminContext=await a.refreshAdminContext();
 if(!adminContext?.is_admin||adminContext.status!=="active")fail("The server no longer recognizes this account as an active Admin.");
 if(!legacyRoles().includes("super_admin"))fail("Financial-control role governance is restricted to active Super Admins.");
 return adminContext;
}
async function rpc(name,params){
 await requireFreshAal2();
 const result=await mainnetClient().schema("albukhr_security").rpc(name,params||{});
 if(result.error)throw result.error;
 return result.data;
}
function addText(parent,tag,className,text){const el=document.createElement(tag);if(className)el.className=className;el.textContent=text==null?"":String(text);parent.appendChild(el);return el;}
function setText(id,value){const el=$(id);if(el)el.textContent=value==null?"—":String(value);}
function displayAdminSummary(admin,mfa){
 setText("adminEmail",admin.email||admin.email_snapshot||"Authenticated administrator");
 setText("adminId",admin.user_id||"Authenticated session");setText("adminStatus",label(admin.status));
 setText("mfaRequired",admin.mfa_required?"Required":"Not required");setText("mfaStatus",mfa.verified?"AAL2 verified":"Not verified");
 setText("authState",mfa.verified?"AAL2 VERIFIED":"AUTHENTICATED");setText("securityState",mfa.verified?"Authenticated • AAL2":"Authenticated");
 const roles=Array.isArray(admin.roles)?admin.roles:[];setText("roleCount",roles.length);
 $("roles").replaceChildren();if(roles.length){roles.forEach(role=>addText($("roles"),"span","role",label(role)));}else addText($("roles"),"span","muted","No legacy Admin roles returned.");
 const core=Array.isArray(admin.core_projects)?admin.core_projects:[],scoped=Array.isArray(admin.scoped_projects)?admin.scoped_projects:[];
 setText("coreCount",core.length);setText("scopedCount",scoped.length);setText("testnetAccess",admin.testnet_access?"Granted":"No");
 setText("boundaryText","Administrator "+(admin.status==="active"?"is active":"is not active")+"; "+(mfa.verified?"AAL2 assurance is established.":"MFA assurance is not established.")+" Authorization remains controlled by the Mainnet security layer.");
}
async function loadEligibleTargets(){
 const rows=await rpc("get_core_team_members",{});
 if(!Array.isArray(rows))fail("The protected Admin directory returned an invalid response.");
 eligibleTargets=rows.filter(row=>String(row.status||"").toLowerCase()==="active"&&uuid(row.user_id));
 const select=$("targetUserId");select.replaceChildren();
 const first=document.createElement("option");first.value="";first.textContent=eligibleTargets.length?"Select an active Core Team Admin":"No active Core Team Admins were returned";select.appendChild(first);
 eligibleTargets.forEach(row=>{const option=document.createElement("option");option.value=row.user_id;const email=String(row.email_snapshot||"Core Team Admin");option.textContent=email+" • Core Slot "+(row.core_slot||"—");option.title=row.user_id;select.appendChild(option);});
}
function setTargetOption(userId){
 const select=$("targetUserId"),id=uuid(userId);if(!id)return;
 let option=Array.from(select.options).find(item=>item.value===id);
 if(!option){option=document.createElement("option");option.value=id;option.textContent="Existing assigned Admin • "+id;select.appendChild(option);}
 select.value=id;
}
function roleName(code){const found=roleCatalog.find(item=>item.role_code===code);return found?.display_name||label(code);}
function loadRoleOptions(){
 const select=$("roleCode");select.replaceChildren();
 const first=document.createElement("option");first.value="";first.textContent="Select a financial-control role";select.appendChild(first);
 roleCatalog.forEach(item=>{const option=document.createElement("option");option.value=item.role_code;option.textContent=item.display_name;option.title=item.description||"";select.appendChild(option);});
}
function renderActiveAssignments(rows){
 const host=$("activeAssignments");host.replaceChildren();const grants=Array.isArray(rows)?rows:[];setText("assignmentCount",grants.length);
 const select=$("activeGrantSelect");select.replaceChildren();const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="Select an active assignment";select.appendChild(placeholder);
 if(!grants.length)addText(host,"p","empty-state","No active financial-control assignments.");
 grants.forEach(grant=>{
  const id=uuid(grant.grant_id);const text=roleName(grant.role_code)+" • "+(grant.scope_type==="project"?"Project "+(grant.project_id||"—"):"Global Mainnet")+" • "+(grant.target_user_id||"Unknown Admin");
  const card=document.createElement("article");card.className="record-card";
  addText(card,"b","record-title",roleName(grant.role_code));
  addText(card,"span","record-meta","Target Admin: "+(grant.target_user_id||"—"));
  addText(card,"span","record-meta","Scope: "+(grant.scope_type==="project"?"Project • "+(grant.project_id||"—"):"Global Mainnet"));
  addText(card,"span","record-meta","Granted: "+date(grant.granted_at));
  addText(card,"span","record-meta","Grant ID: "+(id||"Invalid ID"));host.appendChild(card);
  if(id){const option=document.createElement("option");option.value=id;option.textContent=text;select.appendChild(option);}
 });
}
function renderPendingRequests(rows,viewerId){
 const host=$("pendingRequests");host.replaceChildren();const requests=Array.isArray(rows)?rows:[];setText("pendingCount",requests.length);
 if(!requests.length){addText(host,"p","empty-state","No pending second-approval requests.");return;}
 requests.forEach(request=>{
  const requestId=uuid(request.request_id);const card=document.createElement("article");card.className="record-card pending-card";
  addText(card,"b","record-title",label(request.request_type)+" • "+roleName(request.role_code));
  addText(card,"span","record-meta","Target Admin: "+(request.target_user_id||"—"));
  addText(card,"span","record-meta","Scope: "+(request.scope_type==="project"?"Project • "+(request.project_id||"—"):"Global Mainnet"));
  addText(card,"span","record-meta","Requested by: "+(request.requested_by||"—")+" • "+date(request.requested_at));
  addText(card,"p","record-reason",request.reason||"No reason supplied.");
  const actions=document.createElement("div");actions.className="record-actions";
  const independent=!!viewerId&&viewerId!==request.requested_by&&viewerId!==request.target_user_id&&!!requestId;
  const approve=document.createElement("button");approve.type="button";approve.className="primary compact";approve.textContent="Approve";approve.disabled=!independent;
  approve.title=independent?"Approve as a separate AAL2 Super Admin":"The requester or target cannot approve this request.";
  approve.addEventListener("click",()=>handleApprove(requestId,approve));actions.appendChild(approve);
  const reject=document.createElement("button");reject.type="button";reject.className="danger compact";reject.textContent="Reject";reject.disabled=!independent;
  reject.title=independent?"Reject as a separate AAL2 Super Admin":"The requester or target cannot reject this request.";
  reject.addEventListener("click",()=>handleReject(requestId,reject));actions.appendChild(reject);
  if(!independent)addText(actions,"span","record-meta","Independent approver required");
  card.appendChild(actions);host.appendChild(card);
 });
}
function renderEvents(rows){
 const host=$("recentEvents");host.replaceChildren();const events=Array.isArray(rows)?rows:[];setText("eventCount",events.length);
 if(!events.length){addText(host,"p","empty-state","No financial-control governance events recorded yet.");return;}
 events.forEach(event=>{const card=document.createElement("article");card.className="record-card event-card";addText(card,"b","record-title",label(event.event_type));addText(card,"span","record-meta","Actor: "+(event.actor_user_id||"—")+" • "+date(event.created_at));if(event.request_id)addText(card,"span","record-meta","Request: "+event.request_id);addText(card,"p","record-reason",event.reason||"—");host.appendChild(card);});
}
function validateWorkspace(data){
 if(!data||typeof data!=="object"||data.success!==true||data.network!=="mainnet")fail("Financial-control workspace returned an invalid or non-Mainnet response.");
 if(!Array.isArray(data.catalog)||!Array.isArray(data.pending_requests)||!Array.isArray(data.active_assignments)||!Array.isArray(data.recent_events))fail("Financial-control workspace response is incomplete.");
 if(adminContext?.user_id&&data.viewer_user_id!==adminContext.user_id)fail("Financial-control workspace viewer identity does not match the authenticated Admin.");
 return data;
}
async function loadWorkspace(){
 financialStatus("Verifying AAL2 and loading the protected Mainnet workspace...");
 const data=validateWorkspace(await rpc(RPC.workspace,{}));workspaceData=data;roleCatalog=data.catalog;loadRoleOptions();await loadEligibleTargets();
 renderPendingRequests(data.pending_requests,data.viewer_user_id);renderActiveAssignments(data.active_assignments);renderEvents(data.recent_events);
 $("financialControlWorkspace").hidden=false;applyRequestType();financialStatus("Financial-control workspace refreshed from the Mainnet security RPC.");
}
function applyRequestType(){
 const revoke=$("requestType").value==="revoke";$("activeGrantField").hidden=!revoke;$("activeGrantSelect").required=revoke;
 $("targetUserId").disabled=false;$("roleCode").disabled=revoke;$("scopeType").disabled=revoke;$("projectId").readOnly=revoke;
 if(!revoke){$("activeGrantSelect").value="";$("targetUserId").value="";$("roleCode").value="";$("scopeType").value="global";$("projectId").value="";}
 $("projectIdField").hidden=$("scopeType").value!=="project";
}
function applySelectedGrant(){
 const id=$("activeGrantSelect").value;const grant=(workspaceData?.active_assignments||[]).find(item=>item.grant_id===id);
 if(!grant){$("targetUserId").value="";$("roleCode").value="";$("scopeType").value="global";$("projectId").value="";return;}
 setTargetOption(grant.target_user_id);$("roleCode").value=grant.role_code||"";$("scopeType").value=grant.scope_type||"global";$("projectId").value=grant.project_id||"";
 $("projectIdField").hidden=grant.scope_type!=="project";
}
async function submitRoleRequest(event){
 event.preventDefault();const button=$("submitRoleRequest");
 try{
  const requestType=$("requestType").value,targetUserId=uuid($("targetUserId").value),roleCode=$("roleCode").value,scopeType=$("scopeType").value;
  const validDirectoryTarget=eligibleTargets.some(row=>row.user_id===targetUserId);
  const selectedActiveGrant=(workspaceData?.active_assignments||[]).find(item=>item.grant_id===$("activeGrantSelect").value);
  const validRevokeTarget=requestType==="revoke"&&!!selectedActiveGrant&&selectedActiveGrant.target_user_id===targetUserId;
  if(!targetUserId||(!validDirectoryTarget&&!validRevokeTarget))fail("Select an active target returned by the protected Admin directory or an exact active assignment.");
  if(!roleCatalog.some(item=>item.role_code===roleCode&&item.enabled===true))fail("Select an enabled financial-control role from the server catalogue.");
  if(!["global","project"].includes(scopeType))fail("Select a valid assignment scope.");
  const projectId=scopeType==="project"?uuid($("projectId").value):null;
  if(scopeType==="project"&&!projectId)fail("Enter a valid approved Mainnet project UUID.");
  const reason=String($("requestReason").value||"").trim();if(reason.length<10||reason.length>2000)fail("The reason must contain 10–2,000 characters.");
  const targetGrantId=requestType==="revoke"?uuid($("activeGrantSelect").value):null;
  if(requestType==="revoke"&&!targetGrantId)fail("Select the exact active grant that is being revoked.");
  if(requestType==="grant"&&targetUserId===workspaceData?.viewer_user_id)fail("A Super Admin cannot assign a financial-control role to themselves.");
  button.disabled=true;button.textContent="Submitting...";financialStatus("Submitting role-change request through the protected Mainnet RPC...");
  const result=await rpc(RPC.request,{p_request_type:requestType,p_target_user_id:targetUserId,p_role_code:roleCode,p_scope_type:scopeType,p_project_id:projectId,p_target_grant_id:targetGrantId,p_reason:reason});
  if(!result?.success||result.status!=="pending_second_approval")fail("The Mainnet security RPC did not confirm a pending request.");
  $("requestReason").value="";await loadWorkspace();financialStatus("Request recorded. It remains pending until a different eligible AAL2 Super Admin resolves it.");
 }catch(error){console.error("[ALBUKHR FINANCIAL CONTROL REQUEST]",error);financialStatus(error?.message||"Financial-control request failed.",true);}
 finally{button.disabled=false;button.textContent="Submit role-change request";}
}
async function handleApprove(requestId,button){
 if(!requestId)return;
 if(!window.confirm("Approve this financial-control role-change request?\n\nThe database will independently verify that you are not the requester or target and that your session is AAL2 Super Admin."))return;
 try{button.disabled=true;button.textContent="Approving...";financialStatus("Submitting independent approval...");const result=await rpc(RPC.approve,{p_request_id:requestId});if(!result?.success||result.status!=="approved")fail("The Mainnet RPC did not confirm approval.");await loadWorkspace();financialStatus("The role-change request was approved by the independent Super Admin.");}
 catch(error){console.error("[ALBUKHR FINANCIAL CONTROL APPROVAL]",error);financialStatus(error?.message||"Independent approval failed.",true);button.disabled=false;button.textContent="Approve";}
}
async function handleReject(requestId,button){
 if(!requestId)return;const reason=window.prompt("Enter the rejection reason (10–2,000 characters):");if(reason===null)return;
 const normalized=String(reason).trim();if(normalized.length<10||normalized.length>2000){financialStatus("A rejection reason between 10 and 2,000 characters is required.",true);return;}
 try{button.disabled=true;button.textContent="Rejecting...";financialStatus("Submitting independent rejection...");const result=await rpc(RPC.reject,{p_request_id:requestId,p_rejection_reason:normalized});if(!result?.success||result.status!=="rejected")fail("The Mainnet RPC did not confirm rejection.");await loadWorkspace();financialStatus("The request was rejected and the audit event was recorded.");}
 catch(error){console.error("[ALBUKHR FINANCIAL CONTROL REJECTION]",error);financialStatus(error?.message||"Independent rejection failed.",true);button.disabled=false;button.textContent="Reject";}
}
async function init(){
 try{
  const env=window.ALBukhrEnvironment;if(!env?.isKnown?.()||!env.isMainnet?.())fail("Security & Access is available only on ALBUKHR MAINNET.");
  const a=auth();await a.init();adminContext=await a.requireAdmin({redirect:false});
  if(!adminContext){window.location.replace(ADMIN_LOGIN_PAGE);return;}
  const mfa=await a.ensureMfa();let verifiedMfa=false;
  if(adminContext.mfa_required===true){
   const assurance=await mainnetClient().auth.mfa.getAuthenticatorAssuranceLevel();if(assurance.error)throw assurance.error;
   verifiedMfa=mfa?.verified===true&&assurance.data?.currentLevel==="aal2";
   if(!verifiedMfa){window.location.replace(ADMIN_MFA_PAGE);return;}
  }
  displayAdminSummary(adminContext,{verified:verifiedMfa});status("Security authorization verified.");
  if(!legacyRoles().includes("super_admin")){
   status("Security authorization verified. Financial Control Roles require an active Mainnet Super Admin.");return;
  }
  $("financialControlWorkspace").hidden=false;
  await loadWorkspace();
 }catch(error){
  console.error("[ALBUKHR ADMIN SECURITY]",error);const message=error?.message||"Admin security authorization failed.";
  status(message,true);financialStatus(message,true);
 }
}
$("logoutButton")?.addEventListener("click",async()=>{try{await auth().signOut();}finally{window.location.replace(ADMIN_LOGIN_PAGE);}});
$("roleRequestForm")?.addEventListener("submit",submitRoleRequest);
$("requestType")?.addEventListener("change",applyRequestType);
$("scopeType")?.addEventListener("change",()=>{$("projectIdField").hidden=$("scopeType").value!=="project";});
$("activeGrantSelect")?.addEventListener("change",applySelectedGrant);
$("financialRefreshButton")?.addEventListener("click",async()=>{const b=$("financialRefreshButton");b.disabled=true;try{await loadWorkspace();}catch(error){financialStatus(error?.message||"Workspace refresh failed.",true);}finally{b.disabled=false;}});
init();
})(window,document);
