(function(window,document){
"use strict";
const A=()=>window.AlbukhrSupabaseAdminAuth,$=id=>document.getElementById(id);
let admin=null;
function status(t,e){const x=$("pageStatus");x.textContent=t||"";x.className="status"+(e?" error":"")}
function esc(v){const d=document.createElement("div");d.textContent=String(v??"");return d.innerHTML}
function client(){const c=window.ALBUKHR_SUPABASE?.client;if(!c)throw Error("ALBUKHR Supabase Core is unavailable.");return c}
function isSuper(){return Array.isArray(admin?.roles)&&admin.roles.includes("super_admin")}
function setBusy(v){const b=$("inviteButton");b.disabled=!!v;b.textContent=v?"Creating...":"Create Core Team Invitation"}
function showAuthorized(){ $("deniedPanel").classList.add("hidden");$("corePanel").classList.remove("hidden");$("recordsPanel").classList.remove("hidden");$("authorization").textContent="AUTHORIZED";$("securityLevel").textContent="AAL2 VERIFIED" }
function showDenied(){ $("authorization").textContent="DENIED";$("securityLevel").textContent="RESTRICTED";$("deniedPanel").classList.remove("hidden");$("corePanel").classList.add("hidden");$("recordsPanel").classList.add("hidden") }
function render(rows){
 const list=$("invitationList"),empty=$("emptyState");list.innerHTML="";
 const data=Array.isArray(rows)?rows:[];const accepted=data.filter(x=>String(x.status||"").toLowerCase()==="accepted").length;
 $("memberCount").textContent=accepted+" / 7";
 if(!data.length){empty.classList.remove("hidden");return}empty.classList.add("hidden");
 data.forEach(r=>{const x=document.createElement("article");x.className="record";
 x.innerHTML='<div class="record-main"><b>'+esc(r.email||r.email_snapshot||"—")+'</b><small>Core Slot '+esc(r.core_slot||"—")+(r.note?" • "+esc(r.note):"")+'</small></div><span class="record-status">'+esc(r.status||"pending")+'</span>';list.appendChild(x)})
}
async function load(){if(!isSuper())throw Error("Only Super Admin can manage Core Team.");status("Loading server-authoritative Core Team records...");const {data,error}=await client().schema("albukhr_security").rpc("get_core_team_invitations");if(error)throw error;render(data);status("Core Team records loaded.")}
async function init(){try{if(!A()||!window.ALBukhrEnvironment?.isMainnet())throw Error("Core Team is available only on ALBUKHR MAINNET.");await A().init();admin=await A().requireAdmin({redirect:false});if(!admin){location.replace("admin-login.html");return}const m=await A().ensureMfa();if(admin.mfa_required&&!m.verified){location.replace("admin-mfa.html");return}$("securityState").textContent=m.verified?"Authenticated • AAL2":"Authenticated";if(!isSuper()){showDenied();status("Core Team management requires Super Admin.");return}showAuthorized();await load()}catch(e){console.error("[ALBUKHR CORE TEAM]",e);status(e.message||"Core Team authorization failed.",true)}}
$("inviteForm").addEventListener("submit",async e=>{e.preventDefault();try{if(!isSuper())throw Error("Only Super Admin can create a Core Team invitation.");const email=$("inviteEmail").value.trim().toLowerCase(),slot=Number($("coreSlot").value),note=$("inviteNote").value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error("Enter a valid email.");if(!Number.isInteger(slot)||slot<1||slot>7)throw Error("Select Core Slot 1 to 7.");setBusy(true);status("Creating secure Core Team invitation...");const {data,error}=await client().schema("albukhr_security").rpc("create_core_team_invitation",{p_email:email,p_core_slot:slot,p_note:note||null});if(error)throw error;if(data?.success===false)throw Error(data.message||"Invitation was denied.");$("inviteForm").reset();await load();status("Core Team invitation created.")}catch(err){console.error(err);status(err.message||"Invitation failed.",true)}finally{setBusy(false)}})
$("refreshButton").addEventListener("click",()=>load().catch(e=>status(e.message||"Refresh failed.",true)));
$("logoutButton").addEventListener("click",async()=>{try{await A()?.signOut()}finally{location.replace("admin-login.html")}});
init();
})(window,document);
