(function (window, document) {
  "use strict";

  /*
   * PHASE 4A DRAFT.
   * Keep disabled until:
   * 1) server routes and role/MFA enforcement are implemented;
   * 2) database migration is reviewed and applied in an approved environment;
   * 3) the quote contract is approved by the owner;
   * 4) end-to-end tests pass.
   */
  const FEATURE_ENABLED = false;
  const API_BASE = "https://albukhr-api.onrender.com/api/dapp-service/v2";
  const $ = (id) => document.getElementById(id);
  let selectedRequest = null;
  let loading = false;

  function setStatus(message, isError) {
    const el = $("pageStatus");
    if (!el) return;
    el.textContent = message || "";
    el.className = "status" + (isError ? " error" : "");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function client() {
    return window.ALBUKHR_SUPABASE && window.ALBUKHR_SUPABASE.client;
  }

  async function assertAdmin() {
    const env = window.ALBukhrEnvironment;
    const auth = window.AlbukhrSupabaseAdminAuth;
    if (!env || typeof env.isKnown !== "function" || !env.isKnown() || !env.isMainnet()) {
      throw new Error("This Admin module is available only on the approved Mainnet Admin host.");
    }
    if (!auth) throw new Error("ALBUKHR Admin Auth Core is unavailable.");
    await auth.init();
    const admin = await auth.requireAdmin({
      redirect: false,
      preserveSessionOnContextError: true
    });
    if (!admin) {
      window.location.replace("admin-login.html");
      throw new Error("Admin authentication is required.");
    }
    if (admin.mfa_required) {
      const mfa = await auth.ensureMfa();
      if (!mfa.verified) {
        window.location.replace("admin-mfa.html");
        throw new Error("Complete Admin MFA/AAL2 verification first.");
      }
    }
    const roles = Array.isArray(admin.roles) ? admin.roles : [];
    if (!roles.includes("super_admin") && !roles.includes("external_admin")) {
      throw new Error("This module requires super_admin or external_admin.");
    }
    return admin;
  }

  async function api(path, options) {
    if (!FEATURE_ENABLED) throw new Error("Integration is disabled in this draft. No API request was sent.");
    const response = await fetch(API_BASE + path, {
      ...(options || {}),
      cache: "no-store",
      credentials: "omit",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        ...(options && options.headers ? options.headers : {})
      }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.success !== true) {
      throw new Error(body && body.error ? body.error : "dApp service API request failed.");
    }
    return body;
  }

  function renderQueue(items) {
    const host = $("queue");
    const rows = Array.isArray(items) ? items : [];
    $("queueSummary").textContent = rows.length + " request(s)";
    if (!rows.length) {
      host.innerHTML = '<p class="empty">No requests match this filter.</p>';
      return;
    }
    host.innerHTML = rows.map((item) => {
      const id = escapeHtml(item.id);
      return '<article class="queue-item ' + (String(item.id) === String(selectedRequest?.id) ? "selected" : "") + '" data-id="' + id + '">' +
        '<div class="queue-top"><span class="pill">' + escapeHtml(item.request_status) + '</span><small>' + escapeHtml(item.created_at || "") + '</small></div>' +
        '<h3>' + escapeHtml(item.project_name || "Unnamed dApp") + '</h3>' +
        '<p>' + escapeHtml(item.service_type || "") + ' · ' + escapeHtml(item.pi_username || "Pi username unavailable") + '</p>' +
        '<button type="button" class="secondary" data-open="' + id + '">Review request</button>' +
        '</article>';
    }).join("");
  }

  function renderDetail(item) {
    const host = $("detail");
    if (!item) {
      host.innerHTML = '<p class="empty">No request selected.</p>';
      $("quoteForm").hidden = true;
      return;
    }
    host.innerHTML = '<div class="detail-grid">' +
      '<div class="field"><span>Project</span><strong>' + escapeHtml(item.project_name) + '</strong></div>' +
      '<div class="field"><span>Service type</span><strong>' + escapeHtml(item.service_type) + '</strong></div>' +
      '<div class="field"><span>Request status</span><strong>' + escapeHtml(item.request_status) + '</strong></div>' +
      '<div class="field"><span>Payment status</span><strong>' + escapeHtml(item.payment_status) + '</strong></div>' +
      '<div class="field"><span>Submitted</span><strong>' + escapeHtml(item.created_at) + '</strong></div>' +
      '<div class="field"><span>Request ID</span><strong>' + escapeHtml(item.id) + '</strong></div>' +
      '</div><h3>Description</h3><p>' + escapeHtml(item.description || "") + '</p>' +
      '<div class="notice"><b>Quote-first rule</b><p>Issuing a quote records scope and price only. It does not mark payment as confirmed or authorize work to start.</p></div>';
    $("detailSummary").textContent = item.project_name || item.id;
    $("quoteForm").hidden = !(item.request_status === "under_review" || item.request_status === "needs_information");
  }

  async function loadQueue() {
    if (loading) return;
    loading = true;
    $("refreshButton").disabled = true;
    try {
      await assertAdmin();
      const status = $("statusFilter").value;
      const query = status ? "?status=" + encodeURIComponent(status) : "";
      const result = await api("/admin/requests" + query);
      renderQueue(result.requests);
      setStatus("Queue loaded.");
    } catch (error) {
      setStatus(error.message || "Unable to load queue.", true);
      if (!FEATURE_ENABLED) {
        $("queue").innerHTML = '<p class="empty">Integration disabled. This draft has made no network request.</p>';
      }
    } finally {
      loading = false;
      $("refreshButton").disabled = false;
    }
  }

  async function loadDetail(id) {
    try {
      await assertAdmin();
      const result = await api("/admin/requests/" + encodeURIComponent(id));
      selectedRequest = result.request;
      renderDetail(selectedRequest);
      document.querySelectorAll(".queue-item").forEach((el) =>
        el.classList.toggle("selected", el.dataset.id === String(id))
      );
    } catch (error) {
      setStatus(error.message || "Unable to load request detail.", true);
    }
  }

  async function issueQuote(event) {
    event.preventDefault();
    if (!selectedRequest) {
      setStatus("Select a request first.", true);
      return;
    }
    setStatus("Preparing quote…");
    const payload = {
      currency_or_asset: $("quoteCurrency").value,
      scope_summary: $("scopeSummary").value.trim(),
      out_of_scope: $("outOfScope").value.split("\n").map(x => x.trim()).filter(Boolean),
      total_amount: $("quoteAmount").value.trim(),
      valid_until: $("validUntil").value ? new Date($("validUntil").value).toISOString() : "",
      revisions_included: $("revisionCount").value === "" ? null : Number($("revisionCount").value),
      estimated_turnaround_days: $("turnaroundDays").value === "" ? null : Number($("turnaroundDays").value),
      terms_version: $("termsVersion").value.trim()
    };
    if (!payload.currency_or_asset || !payload.scope_summary || !payload.total_amount || !payload.valid_until || !payload.terms_version) {
      setStatus("Complete all required quote fields.", true);
      return;
    }
    try {
      await assertAdmin();
      await api("/admin/requests/" + encodeURIComponent(selectedRequest.id) + "/quotes", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setStatus("Quote issued. Payment remains a separate workflow.");
      $("quoteForm").reset();
      await loadDetail(selectedRequest.id);
      await loadQueue();
    } catch (error) {
      setStatus(error.message || "Quote could not be issued.", true);
    }
  }

  function wire() {
    $("refreshButton").addEventListener("click", loadQueue);
    $("statusFilter").addEventListener("change", loadQueue);
    $("queue").addEventListener("click", (event) => {
      const button = event.target.closest("[data-open]");
      if (button) void loadDetail(button.dataset.open);
    });
    $("quoteForm").addEventListener("submit", issueQuote);
    $("logoutButton").addEventListener("click", async () => {
      try { await window.AlbukhrSupabaseAdminAuth?.signOut(); }
      finally { window.location.replace("admin-login.html"); }
    });
  }

  async function init() {
    wire();
    try {
      await assertAdmin();
      $("securityState").textContent = "Admin identity verified";
      if (!FEATURE_ENABLED) {
        setStatus("Draft loaded; API integration disabled. No live request data is queried.");
        return;
      }
      await loadQueue();
    } catch (error) {
      $("securityState").textContent = "Security check failed";
      setStatus(error.message || "Admin security verification failed.", true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    void init();
  }
})(window, document);
