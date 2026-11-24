(function (window, document) {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const auth = () => window.AlbukhrSupabaseAdminAuth;
  const client = () => window.ALBUKHR_SUPABASE?.client;
  let filter = "pending";
  let records = [];
  let selectedId = "";
  let busy = false;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function status(message, type) {
    const el = $("pageStatus");
    el.textContent = message || "";
    el.className = "status" + (type ? " " + type : "");
  }
  function rpc(name, args) {
    const db = client();
    if (!db) throw new Error("Mainnet Admin Supabase client is unavailable.");
    return db.schema("albukhr_security").rpc(name, args || {}).then((result) => {
      if (result.error) throw result.error;
      return result.data;
    });
  }
  async function secureAdmin() {
    const environment = window.ALBukhrEnvironment;
    if (!environment || !environment.isKnown() || !environment.isMainnet()) {
      throw new Error("External Project amendment administration is Mainnet only.");
    }
    await auth().init();
    const admin = await auth().requireAdmin({ redirect: false, preserveSessionOnContextError: true });
    if (!admin) { window.location.replace("admin-login.html"); return false; }
    const roles = Array.isArray(admin.roles) ? admin.roles : [];
    if (!roles.includes("super_admin") && !roles.includes("external_admin")) {
      throw new Error("External Project amendment access is restricted to Super Admin and External Admin roles.");
    }
    const mfa = await auth().ensureMfa();
    if (!mfa?.verified) { window.location.replace("admin-mfa.html"); return false; }

    // ensureMfa() may intentionally return verified=true when an admin's
    // account policy says MFA is optional. Amendment review is stricter:
    // the database requires this session itself to be at AAL2.
    const db = client();
    if (!db?.auth?.mfa?.getAuthenticatorAssuranceLevel) {
      throw new Error("Supabase MFA assurance verification is unavailable.");
    }
    const { data: assurance, error: assuranceError } =
      await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) throw assuranceError;
    if (assurance?.currentLevel !== "aal2") {
      if (mfa.required || mfa.enrolled) {
        window.location.replace("admin-mfa.html");
        return false;
      }
      throw new Error("AAL2 is mandatory for owner amendment review. Enable and verify an MFA factor for this Admin account.");
    }

    $("securityState").textContent = "AAL2 verified · Mainnet";
    return true;
  }
  function renderQueue() {
    const host = $("queue");
    host.replaceChildren();
    const filtered = filter ? records.filter((r) => String(r.status).toLowerCase() === filter) : records;
    $("queueSummary").textContent = `${filtered.length} ${filter || "total"} request(s)`;
    if (!filtered.length) {
      const empty = document.createElement("p");
      empty.textContent = "No owner amendment requests match this filter.";
      host.appendChild(empty);
      return;
    }
    filtered.forEach((record) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "amend-record" + (String(record.id) === selectedId ? " selected" : "");
      const title = document.createElement("strong");
      title.textContent = record.project_name || record.business_name || "External Project";
      const code = document.createElement("small");
      code.textContent = `${record.project_code || record.application_code || "—"} · ${record.request_type === "owner_contact" ? "Owner contact" : "Project team"}`;
      const state = document.createElement("span");
      state.className = "amend-status";
      state.textContent = String(record.status || "pending").toUpperCase();
      const owner = document.createElement("small");
      owner.textContent = `Owner: ${record.owner_username || "ALBUKHR user"}`;
      button.append(title, code, state, owner);
      button.addEventListener("click", () => { selectedId = String(record.id); renderQueue(); renderDetail(record); });
      host.appendChild(button);
    });
  }
  function field(label, value) {
    const box = document.createElement("div");
    const name = document.createElement("span");
    name.textContent = label;
    const data = document.createElement("strong");
    data.textContent = value == null || value === "" ? "—" : String(value);
    box.append(name, data);
    return box;
  }
  function renderDetail(record) {
    const host = $("detail");
    host.replaceChildren();
    if (!record) { host.textContent = "Select a request."; return; }
    $("detailSummary").textContent = `${record.project_code || record.application_code || "—"} · ${String(record.status || "").toUpperCase()}`;
    const summary = document.createElement("div");
    summary.className = "amend-fields";
    summary.append(
      field("Project", record.project_name),
      field("Business", record.business_name),
      field("Request type", record.request_type === "owner_contact" ? "Owner contact details" : "Project team"),
      field("Owner account", record.owner_username),
      field("Application status", record.application_status),
      field("Requested at", record.requested_at ? new Date(record.requested_at).toLocaleString() : "—")
    );
    const reason = document.createElement("p");
    reason.textContent = "Owner reason: " + (record.reason || "—");
    const compare = document.createElement("div");
    compare.className = "amend-fields";
    const oldBox = document.createElement("div");
    const newBox = document.createElement("div");
    const oldTitle = document.createElement("strong"); oldTitle.textContent = "Current values";
    const newTitle = document.createElement("strong"); newTitle.textContent = "Requested values";
    const oldPre = document.createElement("pre"); oldPre.className = "amend-json"; oldPre.textContent = JSON.stringify(record.current_values || {}, null, 2);
    const newPre = document.createElement("pre"); newPre.className = "amend-json"; newPre.textContent = JSON.stringify(record.requested_values || {}, null, 2);
    oldBox.append(oldTitle, oldPre); newBox.append(newTitle, newPre); compare.append(oldBox, newBox);
    host.append(summary, reason, compare);
    if (record.status === "pending") {
      const noteLabel = document.createElement("label");
      noteLabel.textContent = "Admin decision note (required when rejecting)";
      const note = document.createElement("textarea");
      note.id = "amendDecisionReason"; note.className = "amend-note"; note.maxLength = 1500;
      noteLabel.appendChild(note);
      const actions = document.createElement("div"); actions.className = "amend-actions";
      const approve = document.createElement("button"); approve.type = "button"; approve.className = "amend-action approve"; approve.textContent = "Approve request";
      const reject = document.createElement("button"); reject.type = "button"; reject.className = "amend-action"; reject.textContent = "Reject request";
      approve.addEventListener("click", () => decide(record.id, "approved"));
      reject.addEventListener("click", () => decide(record.id, "rejected"));
      actions.append(approve, reject);
      host.append(noteLabel, actions);
    } else if (record.decision_reason) {
      const decision = document.createElement("p"); decision.textContent = "Admin decision note: " + record.decision_reason; host.appendChild(decision);
    }
  }
  async function decide(id, decision) {
    if (busy) return;
    const reason = String($("amendDecisionReason")?.value || "").trim();
    if (decision === "rejected" && reason.length < 5) { status("A rejection reason of at least 5 characters is required.", "error"); return; }
    const confirmation = window.confirm(`${decision === "approved" ? "Approve" : "Reject"} this owner amendment request? ${decision === "approved" ? "The requested contact/team data will be applied immediately." : "No project data will be changed."}`);
    if (!confirmation) return;
    busy = true;
    try {
      const result = await rpc("review_external_project_amendment", {
        p_amendment_id: id,
        p_decision: decision,
        p_reason: reason || null
      });
      if (!result || result.success !== true) throw new Error(result?.message || "The review decision was not confirmed.");
      status(`Amendment ${decision} successfully.`, "success");
      busy = false;
      await loadQueue();
    } catch (error) {
      status(error?.message || "Unable to review amendment request.", "error");
    } finally { busy = false; }
  }
  async function loadQueue() {
    if (busy) return;
    status("Loading secure Mainnet owner amendment queue…");
    try {
      const result = await rpc("get_external_project_amendment_queue", { p_status: filter || null });
      if (!result || result.success !== true || result.authorized !== true || !Array.isArray(result.records)) {
        throw new Error("Admin amendment queue authorization or response validation failed.");
      }
      records = result.records;
      if (!records.some((r) => String(r.id) === selectedId)) selectedId = "";
      renderQueue();
      renderDetail(records.find((r) => String(r.id) === selectedId) || null);
      status(`Mainnet owner amendment queue loaded: ${records.length} record(s).`, "success");
    } catch (error) {
      records = []; selectedId = ""; renderQueue(); renderDetail(null);
      status(error?.message || "Unable to load owner amendment queue.", "error");
    }
  }
  function bind() {
    document.querySelectorAll("[data-status]").forEach((button) => button.addEventListener("click", () => {
      filter = String(button.dataset.status || "").trim().toLowerCase();
      document.querySelectorAll("[data-status]").forEach((x) => x.classList.toggle("active", x === button));
      selectedId = ""; loadQueue();
    }));
    $("refreshButton").addEventListener("click", loadQueue);
    $("logoutButton").addEventListener("click", async () => { try { await auth().signOut(); } finally { window.location.replace("admin-login.html"); } });
  }
  async function init() {
    try {
      const ok = await secureAdmin();
      if (!ok) return;
      bind();
      await loadQueue();
    } catch (error) {
      $("securityState").textContent = "Security verification failed";
      status(error?.message || "Admin authorization failed.", "error");
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window, document);
