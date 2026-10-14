(function (w, d) {
  "use strict";

  const API = "https://albukhr-api.onrender.com/api/dapp-service/v2";
  const $ = id => d.getElementById(id);
  let token = null;
  let selected = null;
  let queueRequests = [];

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function status(message, isError) {
    $("status").textContent = String(message || "");
    $("status").className = "status" + (isError ? " error" : "");
  }

  function isProjectPath(request) {
    return !!request && request.service_type === "albukhr_project";
  }

  function serviceLabel(request) {
    if (isProjectPath(request)) return "Build an App for My ALBUKHR Project";
    return ({ pi_studio: "Pi Studio Assistance", developer: "Developer-built dApp" })[String(request && request.service_type || "")] || String(request && request.service_type || "Unknown service");
  }

  function projectSummary(request) {
    if (!isProjectPath(request)) {
      return '<div class="small">No ALBUKHR project linked</div>';
    }

    // The gateway returns a verified linkage snapshot directly on the request.
    // Do not require a PostgREST embedded relationship that the API does not select.
    const name = request.project_name || "Project name unavailable";
    const id = request.project_id || "Missing project ID";
    const type = request.project_type || "Type unavailable";
    const relationship = request.project_relationship || (request.project_owner_albukhr_user_id ? "owner (verified at submission)" : "Relationship unavailable");
    const integrityWarning = !request.project_id || !["internal", "external"].includes(String(request.project_type || "")) || !request.project_relationship_verified_at || !request.project_owner_albukhr_user_id
      ? '<div class="small" role="note">Project association metadata is incomplete. Verify the linkage before approval.</div>'
      : "";

    return '<div class="small"><strong>Linked ALBUKHR project:</strong> ' + esc(name) +
      '</div><div class="small">Project type: ' + esc(type) + ' · Relationship: ' + esc(relationship) +
      '</div><div class="small">Project ID: ' + esc(id) + '</div>' + integrityWarning;
  }

  async function auth() {
    const env = w.ALBukhrEnvironment;
    const adminAuth = w.AlbukhrSupabaseAdminAuth;
    if (!env || !env.isKnown() || !env.isMainnet()) {
      throw Error("Admin queue is Mainnet-only.");
    }
    if (!adminAuth) throw Error("Admin authentication module is unavailable.");

    await adminAuth.init();
    const admin = await adminAuth.requireAdmin({ redirect: false, preserveSessionOnContextError: true });
    if (!admin) {
      location.replace("admin-login.html");
      throw Error("Admin login required.");
    }
    if (admin.mfa_required && !(await adminAuth.ensureMfa()).verified) {
      location.replace("admin-mfa.html");
      throw Error("Complete MFA/AAL2.");
    }
    if (!admin.roles.includes("super_admin") && !admin.roles.includes("external_admin")) {
      throw Error("super_admin or external_admin role required.");
    }

    const session = await w.ALBUKHR_SUPABASE.client.auth.getSession();
    token = session.data && session.data.session && session.data.session.access_token;
    if (!token) throw Error("Admin token unavailable.");
  }

  async function api(path, body, method) {
    if (!token) await auth();
    const response = await fetch(API + path, {
      method: method || "GET",
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.success !== true) {
      throw Error(data && data.error || "Admin API request failed.");
    }
    if (data.network !== "mainnet") throw Error("Network mismatch.");
    return data;
  }

  function renderQueue() {
    const wanted = $("serviceFilter") ? $("serviceFilter").value : "";
    const rows = queueRequests.filter(item => !wanted || (wanted === "albukhr_project" ? isProjectPath(item) : item.service_type === wanted && !isProjectPath(item)));
    $("queue").innerHTML = rows.map(item =>
      '<div class="row" data-id="' + esc(item.id) + '" role="button" tabindex="0" aria-label="Open request ' + esc(item.id) + '">' +
        '<span class="pill">' + esc(item.request_status) + '</span>' +
        '<h3>' + esc(item.project_name) + '</h3>' +
        '<div class="small"><strong>Service:</strong> ' + esc(serviceLabel(item)) + '</div>' +
        projectSummary(item) +
        '<div class="small">Applicant: ' + esc(item.pi_username || item.applicant_pi_uid) + '</div>' +
        '<div class="small">Payment: ' + esc(item.payment_status) + ' · Request ID: ' + esc(item.id) + '</div>' +
      '</div>'
    ).join("") || (queueRequests.length ? "No requests match this service filter." : "No requests.");
  }

  async function refresh() {
    try {
      await auth();
      const wantedStatus = $("filter").value;
      const result = await api("/admin/requests" + (wantedStatus ? "?status=" + encodeURIComponent(wantedStatus) : ""));
      queueRequests = Array.isArray(result.requests) ? result.requests : [];
      renderQueue();
      status("Loaded " + queueRequests.length + " requests.");
    } catch (error) {
      status(error.message || "Queue unavailable.", true);
    }
  }

  async function detail(id) {
    selected = id;
    try {
      const data = await api("/admin/requests/" + encodeURIComponent(id));
      const request = data.request;
      const projectPanel = isProjectPath(request)
        ? '<section class="event"><strong>ALBUKHR project association</strong>' + projectSummary(request) + '</section>'
        : '<section class="event"><strong>Project association</strong><p>No ALBUKHR project linked. This is a general service request.</p></section>';

      $("detail").innerHTML =
        '<h3>' + esc(request.project_name) + '</h3>' +
        '<p><strong>Service route:</strong> ' + esc(serviceLabel(request)) + '</p>' +
        projectPanel +
        '<p>' + esc(request.description) + '</p>' +
        '<p>Applicant: ' + esc(request.pi_username || request.applicant_pi_uid) + '</p>' +
        '<p>Request status: ' + esc(request.request_status) + ' · Payment: ' + esc(request.payment_status) + '</p>' +
        '<h3>Quotes</h3>' + (data.quotes || []).map(quote =>
          '<div class="event">v' + esc(quote.version_number) + ' · ' + esc(quote.quote_status) + ' · ' +
          esc(quote.total_amount) + ' ' + esc(quote.currency_or_asset) + '<p>' + esc(quote.scope_summary) +
          '</p><small>' + esc(quote.valid_until) + '</small></div>'
        ).join("") +
        '<h3>Payments</h3>' + (data.payments || []).map(payment =>
          '<div class="event">' + esc(payment.payment_status) + ' · ' + esc(payment.amount) + ' ' +
          esc(payment.currency_or_asset) + '<p class="small">' + esc(payment.txid || "No verified txid") + '</p></div>'
        ).join("") +
        '<h3>Audit</h3>' + (data.auditEvents || []).map(event =>
          '<div class="event">' + esc(event.event_type) + ' · ' + esc(event.created_at) +
          '<p>' + esc(event.reason || "") + '</p></div>'
        ).join("");

      $("transition").hidden = false;
      $("quote").hidden = request.request_status !== "under_review";
    } catch (error) {
      status(error.message || "Request detail unavailable.", true);
    }
  }

  function openRow(event) {
    const element = event.target.closest("[data-id]");
    if (!element) return;
    if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
    if (event.type === "keydown") event.preventDefault();
    detail(element.dataset.id);
  }

  d.addEventListener("click", openRow);
  d.addEventListener("keydown", openRow);
  $("refresh").addEventListener("click", refresh);
  $("filter").addEventListener("change", refresh);
  $("serviceFilter") && $("serviceFilter").addEventListener("change", renderQueue);

  $("transition").addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await api("/admin/requests/" + encodeURIComponent(selected) + "/status", {
        target_status: $("target").value,
        reason: $("reason").value
      }, "POST");
      status("Status updated.");
      await refresh();
      await detail(selected);
    } catch (error) {
      status(error.message || "Status update failed.", true);
    }
  });

  $("quote").addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const expiry = new Date($("expiry").value);
      if (!Number.isFinite(expiry.getTime()) || expiry <= new Date()) throw Error("Choose a future expiry.");
      const lines = id => $(id).value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      await api("/admin/requests/" + encodeURIComponent(selected) + "/quotes", {
        currency_or_asset: "PI",
        scope_summary: $("scope").value.trim(),
        out_of_scope: lines("exclusions"),
        deliverables: lines("deliverables"),
        total_amount: Number($("amount").value),
        valid_until: expiry.toISOString(),
        terms_version: $("terms").value.trim()
      }, "POST");
      status("Quote issued; payment is a separate state.");
      await refresh();
      await detail(selected);
    } catch (error) {
      status(error.message || "Quote could not be issued.", true);
    }
  });

  $("logout").addEventListener("click", async () => {
    try {
      await w.AlbukhrSupabaseAdminAuth.signOut();
    } finally {
      location.replace("admin-login.html");
    }
  });

  d.addEventListener("DOMContentLoaded", refresh, { once: true });
})(window, document);
