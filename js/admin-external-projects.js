(function(window, document){
"use strict";

const A = () => window.AlbukhrSupabaseAdminAuth;
const C = () => window.ALBUKHR_SUPABASE && window.ALBUKHR_SUPABASE.client;
const $ = id => document.getElementById(id);

let activeStatus = "";
let records = [];
let selectedId = null;
let loadingQueue = false;
let loadingDetail = false;

function esc(value){
  return String(value == null ? "" : value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function safeLogoUrl(value){
  try{
    const url = new URL(String(value || ""), window.location.href);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  }catch(_){
    return "";
  }
}
function safeDocumentUrl(value){
  try{
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  }catch(_){
    return "";
  }
}
function privateDocumentPath(doc, application){
  const appId=String(application?.id||"").trim().toLowerCase();
  const network=String(application?.network||"").trim().toLowerCase();
  const bucket=String(doc?.storage_bucket||"").trim();
  const path=String(doc?.storage_path||"").trim();
  const validUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if(!validUuid.test(appId)||network!=="mainnet"||bucket!=="external-project-documents")return "";
  const expected=new RegExp("^mainnet/"+appId+"/[0-9a-f]{32}/[^/]+\\.(?:pdf|png|jpe?g|webp)$","i");
  return expected.test(path)?path:"";
}
function safeSignedDocumentUrl(value){
  try{
    const url=new URL(String(value||""));
    return url.protocol==="https:"?url.href:"";
  }catch(_){
    return "";
  }
}
function label(value){
  return String(value || "").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
}
function status(t,e){
  const el=$("pageStatus");
  if(!el)return;
  el.textContent=t||"";
  el.className="status"+(e?" error":"");
}
function fmtDate(value){
  if(!value)return "—";
  const d=new Date(value);
  return Number.isNaN(d.getTime())?String(value):d.toLocaleString();
}
function fmtNumber(value,asset){
  if(value===null||value===undefined||value==="")return "—";
  const n=Number(value);
  if(!Number.isFinite(n))return String(value);
  return `${n.toLocaleString(undefined,{maximumFractionDigits:7})} ${String(asset||"PI").toUpperCase()}`;
}
function rpc(name, params={}){
  const client=C();
  if(!client) throw new Error("Supabase client unavailable.");
  return client.schema("albukhr_security").rpc(name,params).then(r=>{
    if(r.error)throw r.error;
    return r.data;
  });
}
function normalizeRecordResponse(data){
  if(!data||typeof data!=="object") return {success:false,authorized:false,records:[]};
  return data;
}
function renderQueue(){
  const host=$("queue");
  if(!host)return;
  const filtered=activeStatus?records.filter(r=>String(r.status||"").toLowerCase()===activeStatus):records;
  $("queueSummary").textContent=filtered.length===records.length
    ? `${records.length} application${records.length===1?"":"s"}`
    : `${filtered.length} matching application${filtered.length===1?"":"s"}`;
  if(!filtered.length){
    host.innerHTML='<div class="detail-empty">No External Project applications match this filter.</div>';
    return;
  }
  host.innerHTML=filtered.map(r=>{
    const id=String(r.id||"");
    const cls=(String(r.status||"").toLowerCase().replace(/[^a-z_]/g,""))||"unknown";
    return `<article class="queue-item ${selectedId===id?"selected":""}" data-id="${esc(id)}">
      <div class="queue-meta"><span class="pill ${cls}">${esc(label(r.status))}</span><small>${esc(fmtDate(r.created_at))}</small></div>
      <h3>${esc(r.project_name||"Unnamed External Project")}</h3>
      <p>${esc(r.business_name||"Business information unavailable")}</p>
      <p>${esc(r.application_code||r.project_code||"—")} • ${esc(fmtNumber(r.funding_required,r.funding_asset))}</p>
      <div class="queue-actions"><button class="queue-action" type="button" data-open="${esc(id)}">Review</button></div>
    </article>`;
  }).join("");

  /* Logo rendering is display-only and uses logo_url returned by the
     AAL2-protected, Mainnet-filtered Admin queue RPC. */
  host.querySelectorAll(".queue-item").forEach(item=>{
    const record=filtered.find(r=>String(r.id||"")===item.dataset.id);
    const url=safeLogoUrl(record?.logo_url);
    if(!url)return;

    const image=document.createElement("img");
    image.className="queue-logo";
    image.src=url;
    image.alt=String(record.project_name||"External Project")+" logo";
    image.loading="lazy";
    image.decoding="async";
    image.referrerPolicy="no-referrer";
    image.addEventListener("error",()=>image.remove(),{once:true});

    const meta=item.querySelector(".queue-meta");
    if(meta)meta.before(image);
  });
}
function renderField(labelText,value){
  return `<div class="field"><span>${esc(labelText)}</span><strong>${esc(value??"—")}</strong></div>`;
}
function renderList(items, emptyText, mapper){
  if(!Array.isArray(items)||!items.length)return `<div class="detail-empty">${esc(emptyText)}</div>`;
  return `<div class="detail-list">${items.map(mapper).join("")}</div>`;
}
async function prepareSecureDocumentLink(button, doc, application){
  const access=button.closest(".document-access");
  const result=access?.querySelector(".document-access-result");
  const path=privateDocumentPath(doc,application);

  if(!path||String(application?.network||"").toLowerCase()!=="mainnet"){
    if(result)result.textContent="Secure document access is unavailable for this application.";
    return;
  }

  const client=C();
  if(!client||!client.storage||typeof client.storage.from!=="function"){
    if(result)result.textContent="Secure storage client is unavailable. Refresh the Admin page and retry.";
    return;
  }

  const previousText=button.textContent;
  button.disabled=true;
  button.textContent="Preparing secure link…";
  if(result)result.textContent="Checking reviewer permission and preparing a short-lived link…";

  try{
    const response=await client.storage
      .from("external-project-documents")
      .createSignedUrl(path,120);

    if(response?.error)throw response.error;

    const href=safeSignedDocumentUrl(response?.data?.signedUrl);
    if(!href)throw new Error("Secure storage returned an invalid link.");

    if(result){
      result.textContent="";
      const link=document.createElement("a");
      link.href=href;
      link.target="_blank";
      link.rel="noopener noreferrer";
      link.referrerPolicy="no-referrer";
      link.className="document-access-link";
      link.textContent="Open document (link expires in 2 minutes)";

      const note=document.createElement("small");
      note.textContent="This link is temporary. Generate a new one if it expires.";
      result.append(link,note);
    }

    button.textContent="Generate new secure link";
  }catch(error){
    console.error("[ALBUKHR ADMIN EXTERNAL PROJECTS] Secure document link failed:",error);
    if(result)result.textContent="Unable to prepare the secure link. Confirm reviewer access and AAL2 verification, then retry.";
    button.textContent=previousText;
  }finally{
    button.disabled=false;
  }
}
function renderDetail(data){
  const host=$("detail");
  if(!host)return;
  if(!data||data.success!==true){
    host.innerHTML='<div class="detail-empty">Application detail is unavailable.</div>';
    $("detailSummary").textContent="Unable to load application.";
    return;
  }
  const a=data.application||{};
  const team=data.team||[];
  const docs=data.documents||[];
  const reviews=data.reviews||[];
  const decision=data.decision||null;
  const statusValue=String(a.status||"").toLowerCase();
  $("detailSummary").textContent=`${label(statusValue)} • ${a.network||"MAINNET"}`;
  const teamHtml=renderList(team,"No team members registered.",member=>`<div class="detail-row"><strong>${esc(member.full_name)}</strong><span>${esc(member.role)}${member.title?" • "+esc(member.title):""}</span>${member.email?`<p>${esc(member.email)}</p>`:""}${member.is_primary_contact?`<p>Primary contact</p>`:""}</div>`);
  const docsHtml=renderList(docs,"No supporting documents registered.",doc=>{
    const path=privateDocumentPath(doc,a);
    const externalUrl=safeDocumentUrl(doc.document_url);
    let accessMarkup="";

    if(path){
      accessMarkup=`<div class="document-access"><button class="document-access-button" type="button" data-open-document="${esc(doc.id)}">Prepare secure link</button><div class="document-access-result" aria-live="polite"></div></div>`;
    }else if(externalUrl){
      accessMarkup=`<p><a href="${esc(externalUrl)}" target="_blank" rel="noopener noreferrer">Open document</a></p>`;
    }else{
      accessMarkup="<p>Private storage object — secure access metadata unavailable.</p>";
    }

    return `<div class="detail-row"><strong>${esc(doc.document_name||doc.document_type||"Document")}</strong><span>${esc(label(doc.document_type))}</span><p>Verification: ${esc(label(doc.verification_status))}</p>${accessMarkup}</div>`;
  });
  const reviewsHtml=renderList(reviews,"No review records yet.",review=>`<div class="review"><b>${esc(label(review.decision||review.review_type||"Review"))}</b><small>${esc(fmtDate(review.created_at))}</small>${review.comments?`<p>${esc(review.comments)}</p>`:""}</div>`);

  host.innerHTML=`
    <section class="detail-section">
      <h3>Application</h3>
      <div class="detail-grid">
        ${renderField("Project Name",a.project_name)}
        ${renderField("Application Code",a.application_code)}
        ${renderField("Project Code",a.project_code)}
        ${renderField("Project Slug",a.project_slug)}
        ${renderField("Status",label(a.status))}
        ${renderField("Network",String(a.network||"").toUpperCase())}
        ${renderField("Business",a.business_name)}
        ${renderField("Industry",a.industry)}
        ${renderField("Category",a.category)}
        ${renderField("Funding",fmtNumber(a.funding_required,a.funding_asset))}
        ${renderField("Investment Model",a.investment_model)}
        ${renderField("Duration",a.project_duration_days?`${a.project_duration_days} days`:null)}
        ${renderField("Country",a.country)}
        ${renderField("State",a.state)}
        ${renderField("City",a.city)}
        ${renderField("Contact Email",a.contact_email)}
        ${renderField("Contact Phone",a.contact_phone)}
        ${renderField("Website",a.website)}
        ${renderField("Created",fmtDate(a.created_at))}
        ${renderField("Submitted",fmtDate(a.submitted_at))}
        ${renderField("Approved",fmtDate(a.approved_at))}
        ${renderField("Converted",fmtDate(a.converted_at))}
        ${renderField("Converted Project ID",a.converted_project_id)}
      </div>
      ${a.project_description?`<div class="notice"><b>Description</b><br>${esc(a.project_description)}</div>`:""}
    </section>

    <section class="detail-section"><h3>Team</h3>${teamHtml}</section>
    <section class="detail-section"><h3>Documents</h3>${docsHtml}</section>
    <section class="detail-section"><h3>Review History</h3>${reviewsHtml}</section>
    <section class="detail-section">
      <h3>Decision</h3>
      ${decision?`<div class="notice"><b>${esc(label(decision.decision||"Decision"))}</b><br>${esc(decision.reason||"No decision reason recorded.")}</div>`:'<div class="notice">No final approval decision has been recorded.</div>'}
    </section>

    <section class="detail-section">
      <h3>Server Actions</h3>
      <div class="actions-panel">
        ${statusValue==="submitted"?'<button class="action start" data-action="start">Start Review</button>':''}
        ${statusValue==="under_review"?'<button class="action approve" data-action="approve">Approve Application</button><button class="action revise" data-action="revise">Request Revision</button><button class="action reject" data-action="reject">Reject Application</button>':''}
        ${statusValue==="approved"?'<button class="action convert" data-action="convert">Convert to Project</button>':''}
        ${statusValue==="converted"?'<div class="notice"><b>Converted.</b><br>The application is now linked to an External Project draft. Activation remains a separate server-side gate.</div>':''}
        ${(statusValue!=="submitted"&&statusValue!=="under_review"&&statusValue!=="approved"&&statusValue!=="converted")?'<div class="notice">No administrative lifecycle action is available in the current state.</div>':''}
      </div>
    </section>`;

  /* Detail RPC returns the application row, including logo metadata. */
  const imageUrl=safeLogoUrl(a.logo_url);
  const applicationSection=host.querySelector(".detail-section");
  if(applicationSection){
    const panel=document.createElement("div");
    panel.className="external-project-logo-preview";

    if(imageUrl){
      const img=document.createElement("img");
      img.src=imageUrl;
      img.alt=String(a.project_name||"External Project")+" logo";
      img.loading="lazy";
      img.decoding="async";
      img.referrerPolicy="no-referrer";
      img.addEventListener("error",()=>panel.remove(),{once:true});

      const copy=document.createElement("div");
      copy.className="external-project-logo-copy";
      const title=document.createElement("strong");
      title.textContent="Project Logo";
      const note=document.createElement("p");
      note.textContent="Registered identity logo for this External Project.";
      copy.append(title,note);
      panel.append(img,copy);
    }else{
      panel.classList.add("missing");
      panel.textContent="No project logo is registered for this application.";
    }

    const grid=applicationSection.querySelector(".detail-grid");
    if(grid)grid.before(panel);
    else applicationSection.appendChild(panel);
  }

  host.querySelectorAll("[data-open-document]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const doc=docs.find(item=>String(item.id||"")===String(btn.dataset.openDocument||""));
      if(doc)void prepareSecureDocumentLink(btn,doc,a);
    });
  });

  host.querySelectorAll("[data-action]").forEach(btn=>{
    btn.addEventListener("click",()=>performAction(btn.dataset.action, a.id, btn));
  });
}
async function loadDetail(id){
  selectedId=String(id||"");
  renderQueue();
  if(!selectedId)return;
  loadingDetail=true;
  $("detail").innerHTML='<div class="detail-empty">Loading secured application detail...</div>';
  $("detailSummary").textContent="Loading...";
  try{
    const data=await rpc("get_external_project_application_detail",{p_application_id:selectedId});
    renderDetail(data);
  }catch(e){
    console.error(e);
    $("detail").innerHTML=`<div class="detail-empty">${esc(e?.message||"Unable to load application detail.")}</div>`;
    $("detailSummary").textContent="Detail load failed.";
  }finally{
    loadingDetail=false;
  }
}
async function loadQueue(){
  if(loadingQueue)return;
  loadingQueue=true;
  const btn=$("refreshButton");
  if(btn)btn.disabled=true;
  status("Loading the External Project application queue...");
  try{
    const data=normalizeRecordResponse(await rpc("get_external_project_applications",{p_status:activeStatus||null}));
    if(data.success!==true||data.authorized!==true)throw new Error(data.message||"External Project authorization denied.");
    records=Array.isArray(data.records)?data.records:[];
    const activeStillExists=records.some(r=>String(r.id||"")===selectedId);
    if(selectedId&&!activeStillExists){selectedId=null;$("detail").innerHTML='<div class="detail-empty">Select an application from the queue.</div>';$("detailSummary").textContent="Select an application from the queue.";}
    renderQueue();
    status(`External Project queue loaded: ${records.length} record${records.length===1?"":"s"}.`);
  }catch(e){
    console.error(e);
    status(e?.message||"Unable to load External Project applications.",true);
    records=[];renderQueue();
  }finally{
    loadingQueue=false;
    if(btn)btn.disabled=false;
  }
}
async function performAction(action,id,button){
  if(!id||loadingDetail)return;
  let comments="";
  if(action==="start"){
    comments=window.prompt("Optional review note:","") ?? null;
    if(comments===null)return;
  }else if(action==="revise"){
    comments=window.prompt("Revision instructions (required):","");
    if(comments===null)return;
    if(!comments.trim()){status("Revision instructions are required.",true);return;}
  }else if(action==="reject"){
    comments=window.prompt("Rejection reason (required):","");
    if(comments===null)return;
    if(!comments.trim()){status("Rejection reason is required.",true);return;}
  }else if(action==="approve"){
    comments=window.prompt("Approval reason (optional):","External Project application approved after administrative review.");
    if(comments===null)return;
  }
  button.disabled=true;
  try{
    let result;
    if(action==="start") result=await rpc("start_external_project_review",{p_application_id:id,p_comments:comments});
    if(action==="revise") result=await rpc("request_external_project_revision",{p_application_id:id,p_comments:comments});
    if(action==="reject") result=await rpc("reject_external_project_application",{p_application_id:id,p_reason:comments});
    if(action==="approve") result=await rpc("approve_external_project_application",{p_application_id:id,p_reason:comments});
    if(action==="convert"){
      const confirmed=window.confirm("Convert this approved External application into a draft External Project registry record?");
      if(!confirmed){button.disabled=false;return;}
      result=await rpc("convert_external_application_to_project",{p_application_id:id});
    }
    if(!result||result.success!==true)throw new Error(result?.message||"The server did not confirm the requested action.");
    status(`Action completed: ${label(action)}.`);
    await loadQueue();
    await loadDetail(id);
  }catch(e){
    console.error(e);
    status(e?.message||"Administrative action failed.",true);
    button.disabled=false;
  }
}
function setup(){
  document.querySelectorAll("[data-status]").forEach(btn=>btn.addEventListener("click",()=>{
    activeStatus=String(btn.dataset.status||"").trim().toLowerCase();
    document.querySelectorAll("[data-status]").forEach(x=>x.classList.toggle("active",x===btn));
    selectedId=null;
    $("detail").innerHTML='<div class="detail-empty">Select an application from the queue.</div>';
    $("detailSummary").textContent="Select an application from the queue.";
    loadQueue();
  }));
  $("queue")?.addEventListener("click",e=>{
    const btn=e.target.closest("[data-open]");
    if(btn)loadDetail(btn.dataset.open);
  });
  $("refreshButton")?.addEventListener("click",loadQueue);
  $("logoutButton")?.addEventListener("click",async()=>{
    try{if(A())await A().signOut();}finally{location.replace("admin-login.html");}
  });
}

/*
 * External Projects intentionally uses the same Admin security
 * boundary as the working Admin Control Center.
 *
 * IMPORTANT:
 * - This page does NOT perform a second client-side environment gate.
 * - MAINNET validation remains inside the shared Admin Supabase Core
 *   and Admin Auth layers, and again inside the protected RPCs.
 * - This wait only prevents a race between deferred script loading
 *   and page initialization; it does not grant authorization.
 */
async function waitForSecurityDependencies(timeoutMs=5000){
  const started=Date.now();

  while(Date.now()-started<timeoutMs){
    const auth=window.AlbukhrSupabaseAdminAuth;
    const core=window.ALBUKHR_SUPABASE;
    const environment=window.ALBukhrEnvironment;

    if(
      auth&&
      typeof auth.init==="function"&&
      typeof auth.requireAdmin==="function"&&
      typeof auth.ensureMfa==="function"&&
      core&&
      core.client&&
      environment
    ){
      return;
    }

    await new Promise(resolve=>setTimeout(resolve,50));
  }

  throw new Error(
    "ALBUKHR Admin security dependencies did not finish loading."
  );
}

async function init(){
  try{
    await waitForSecurityDependencies();

    await A().init();

    const admin=await A().requireAdmin({
      redirect:false,
      preserveSessionOnContextError:true
    });

    if(!admin){
      location.replace("admin-login.html");
      return;
    }

    const mfa=await A().ensureMfa();

    if(admin.mfa_required&&!mfa.verified){
      location.replace("admin-mfa.html");
      return;
    }

    $("securityState").textContent="AAL2 verified";
    status("Administrator security verification completed.");

    setup();
    await loadQueue();

  }catch(e){
    console.error(
      "[ALBUKHR ADMIN EXTERNAL PROJECTS]",
      e
    );

    $("securityState").textContent="Security check failed";

    const message=String(e?.message||e||"");

    status(
      message||
      "External Project administrator authorization failed.",
      true
    );
  }
}

init();
})(window,document);
