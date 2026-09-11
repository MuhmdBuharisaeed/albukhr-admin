/* ALBUKHR Core Project Approvals 1.10
 * Canonical page controller.
 * Mainnet only.
 * Reuses the existing server-authoritative Core Approval RPCs.
 */
(function (w, d) {
"use strict";

var AUTH = function(){ return w.AlbukhrSupabaseAdminAuth; };
var CLIENT = function(){ return w.ALBUKHR_SUPABASE && w.ALBUKHR_SUPABASE.client; };

function $(id){ return d.getElementById(id); }

function setStatus(text, error){
  var el = $("pageStatus");
  if (!el) return;
  el.textContent = text || "";
  el.className = "status" + (error ? " error" : "");
}

function esc(value){
  return String(value == null ? "" : value).replace(/[&<>\"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];
  });
}

async function rpc(name, params){
  var client = CLIENT();
  if (!client) throw new Error("ALBUKHR Supabase Core is unavailable.");
  var result = await client.schema("albukhr_security").rpc(name, params || {});
  if (result.error) throw result.error;
  return result.data;
}

function renderQueue(records){
  var host = $("workspaceText");
  if (!host) return;

  if (!records.length) {
    host.innerHTML =
      '<div class="notice"><b>No Core Projects awaiting approval.</b>' +
      '<span>The server-authoritative Core approval queue is empty.</span></div>';
    return;
  }

  host.innerHTML = records.map(function(project){
    var id = esc(project.project_id);
    return '<article class="approval-item" data-project-id="' + id + '">' +
      '<div class="approval-main">' +
      '<small>CORE SLOT ' + esc(project.core_slot) + ' • MAINNET</small>' +
      '<h3>' + esc(project.name) + '</h3>' +
      '<p>' + esc(project.project_code) + ' • ' + esc(project.slug) + '</p>' +
      '<p>Project ID: <code>' + id + '</code></p>' +
      '<p>Status: <strong>' + esc(String(project.status || "").toUpperCase()) + '</strong></p>' +
      '</div>' +
      '<div class="approval-actions">' +
      '<button type="button" data-action="history">Approval History</button>' +
      '<button type="button" data-action="approve">Approve Project</button>' +
      '</div>' +
      '<div class="approval-history" hidden></div>' +
      '</article>';
  }).join("");

  host.querySelectorAll("[data-action]").forEach(function(button){
    button.addEventListener("click", async function(){
      var card = button.closest(".approval-item");
      var projectId = card && card.dataset.projectId;
      if (!projectId) return;
      if (button.dataset.action === "history") {
        await loadHistory(card, projectId);
      } else {
        await approveProject(projectId, button);
      }
    });
  });
}

async function loadHistory(card, projectId){
  var box = card.querySelector(".approval-history");
  if (!box) return;
  box.hidden = false;
  box.textContent = "Loading approval history...";

  try {
    var result = await rpc("get_core_project_approval_history", {
      p_project_id: projectId
    });
    var records = Array.isArray(result && result.records) ? result.records : [];

    if (!records.length) {
      box.textContent = "No Core approval decisions recorded.";
      return;
    }

    box.innerHTML = records.map(function(record){
      return "<div>" +
        "<b>" + esc(String(record.decision || "").toUpperCase()) + "</b> " +
        "<span>" + esc(record.previous_status) + " → " +
        esc(record.new_status) + "</span>" +
        "<small>" + esc(record.created_at) + "</small>" +
        (record.reason ? "<p>" + esc(record.reason) + "</p>" : "") +
        "</div>";
    }).join("");
  } catch (e) {
    console.error(e);
    box.textContent = e && e.message ? e.message : "Unable to load approval history.";
  }
}

async function approveProject(projectId, button){
  var reason = w.prompt(
    "Approval reason (optional):",
    "Core Project approved after administrative review."
  );
  if (reason === null) return;

  button.disabled = true;
  setStatus("Submitting approval to the server...");

  try {
    var result = await rpc("approve_core_project", {
      p_project_id: projectId,
      p_reason: reason
    });

    if (!result || result.success !== true) {
      throw new Error("Server did not confirm the approval.");
    }

    setStatus("Core Project approved successfully. Project status is now APPROVED.");
    await loadQueue();
  } catch (e) {
    console.error(e);
    setStatus(e && e.message ? e.message : "Core Project approval failed.", true);
    button.disabled = false;
  }
}

async function loadQueue(){
  var result = await rpc("get_core_project_approval_queue");
  if (!result || result.authorized !== true) {
    throw new Error("Core Project approval authorization denied.");
  }
  renderQueue(Array.isArray(result.records) ? result.records : []);
}

async function init(){
  try {
    if (!w.AlbukhrEnvironment ||
        typeof w.AlbukhrEnvironment.isKnown !== "function" ||
        !w.AlbukhrEnvironment.isKnown() ||
        !w.AlbukhrEnvironment.isMainnet()) {
      throw new Error("ALBUKHR Admin is Mainnet only.");
    }

    await AUTH().init();
    var admin = await AUTH().requireAdmin({redirect:false});

    if (!admin) {
      w.location.replace("admin-login.html");
      return;
    }

    var mfa = await AUTH().ensureMfa();
    if (admin.mfa_required && !mfa.verified) {
      w.location.replace("admin-mfa.html");
      return;
    }

    var roles = Array.isArray(admin.roles) ? admin.roles : [];
    var authorized =
      roles.indexOf("super_admin") !== -1 ||
      roles.indexOf("approval_admin") !== -1;

    $("adminEmail").textContent =
      admin.email || admin.email_snapshot || "Authenticated administrator";
    $("adminId").textContent = admin.user_id || "Authenticated session";
    $("adminStatus").textContent = admin.status || "active";
    $("mfaStatus").textContent = mfa.verified ? "AAL2 verified" : "Not verified";

    if (!authorized) {
      $("authorizationState").textContent = "DENIED";
      $("securityState").textContent = "Authenticated • AAL2";
      $("authorizationTitle").textContent = "Approval authorization denied";
      $("authorizationText").textContent =
        "Required role: super_admin or approval_admin.";
      setStatus(
        "You are authenticated but not authorized for Core Project approvals.",
        true
      );
      return;
    }

    $("authorizationState").textContent = "AUTHORIZED";
    $("securityState").textContent = "Authenticated • AAL2";
    $("authorizationTitle").textContent =
      "Server-authoritative Core approval access granted";
    $("authorizationText").textContent =
      "Accepted roles: super_admin / approval_admin";
    $("workspaceText").textContent =
      "Loading Core Project approval queue...";

    await loadQueue();
    setStatus("Core Project approval workspace ready.");

    $("logoutButton").addEventListener("click", async function(){
      try { await AUTH().signOut(); }
      finally { w.location.replace("admin-login.html"); }
    });

  } catch (e) {
    console.error("[ALBUKHR CORE PROJECT APPROVALS]", e);
    setStatus(
      e && e.message ? e.message : "Unable to initialize Core Project Approvals.",
      true
    );
    $("securityState").textContent = "Security check failed";
  }
}

if (d.readyState === "loading") {
  d.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

})(window, document);
