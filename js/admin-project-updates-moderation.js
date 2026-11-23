/* ALBUKHR Project Updates Moderation — Stage 6E
 * Mainnet-only Super Admin report queue.
 * Authentication: shared Supabase Admin Auth + AAL2, re-verified by API.
 * Authorization: Super Admin is enforced again by trusted SQL functions.
 * Writes: trusted ALBUKHR API only; this browser controller never writes to Supabase.
 */
(function (window, document) {
  "use strict";

  const API_BASE = "https://albukhr-api.onrender.com/api/project-updates";
  const MAINNET = "mainnet";
  const MAINNET_STORAGE_HOST = "ribpntyqdleytsyktdfb.supabase.co";
  const $ = (id) => document.getElementById(id);

  let auth = null;
  let activeAdmin = null;
  let currentStatus = "open";
  let reports = [];
  let selectedReport = null;
  let selectedUpdate = null;
  let queueLoading = false;
  let detailLoading = false;
  let decisionBusy = false;
  let requestSequence = 0;

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function fail(message) {
    throw new Error(String(message || "Project Updates moderation error."));
  }

  function setStatus(message, type) {
    const element = $("pageStatus");
    if (!element) return;
    element.textContent = String(message || "");
    element.className = "status-bar" + (type ? " " + type : "");
  }

  function setQueueStatus(message, type) {
    const element = $("queueStatus");
    if (!element) return;
    element.textContent = String(message || "");
    element.className = "queue-status" + (type ? " " + type : "");
  }

  function assertMainnet() {
    const environment = window.ALBukhrEnvironment;
    const core = window.ALBUKHR_SUPABASE;
    if (!environment || typeof environment.isKnown !== "function" || typeof environment.isMainnet !== "function" || !environment.isKnown() || !environment.isMainnet()) {
      fail("Project Updates Moderation is available only on the approved ALBUKHR Mainnet Admin host.");
    }
    if (!core || !core.client || String(core.network || "").toLowerCase() !== MAINNET || String(core.environment || "").toLowerCase() !== MAINNET) {
      fail("The shared Admin Supabase Core is not connected to Mainnet.");
    }
  }

  function normalizeResponse(payload) {
    if (!payload || typeof payload !== "object") fail("The Project Updates API returned an invalid response.");
    if (payload.success !== true) {
      const error = new Error(clean(payload.error) || "The Project Updates request was rejected.");
      error.code = clean(payload.code) || "PROJECT_UPDATES_REQUEST_FAILED";
      error.status = Number(payload.status || 0);
      throw error;
    }
    if (clean(payload.network).toLowerCase() !== MAINNET) fail("The API returned a non-Mainnet response.");
    return payload.data;
  }

  async function currentToken() {
    const session = await auth.getSession();
    const token = clean(session && session.access_token);
    if (!token) fail("Your Admin session has expired. Sign in again.");
    return token;
  }

  async function apiRequest(path, options) {
    const settings = options || {};
    const method = clean(settings.method || "GET").toUpperCase();
    const token = await currentToken();
    const headers = {
      Accept: "application/json",
      Authorization: "Bearer " + token,
      "x-albukhr-auth-provider": "supabase-auth"
    };
    const request = { method, headers, cache: "no-store", credentials: "omit" };
    if (settings.body !== undefined) {
      headers["Content-Type"] = "application/json";
      request.body = JSON.stringify(settings.body);
    }

    const response = await fetch(API_BASE + path, request);
    let payload;
    try { payload = await response.json(); }
    catch (_) { fail("The Project Updates API returned an unreadable response."); }
    if (!response.ok) {
      const error = new Error(clean(payload && payload.error) || "The Project Updates request failed.");
      error.code = clean(payload && payload.code) || "PROJECT_UPDATES_REQUEST_FAILED";
      error.status = response.status;
      throw error;
    }
    return normalizeResponse(payload);
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
  }

  function reasonLabel(value) {
    const labels = {
      spam: "Spam",
      abuse: "Abuse or harassment",
      misleading: "Potentially misleading",
      personal_data: "Personal data",
      other: "Other"
    };
    const key = clean(value).toLowerCase();
    return labels[key] || (key ? key.replace(/_/g, " ") : "Unspecified");
  }

  function safeImageUrl(value) {
    try {
      const url = new URL(clean(value));
      if (url.protocol !== "https:" || url.hostname !== MAINNET_STORAGE_HOST) return "";
      if (!url.pathname.startsWith("/storage/v1/object/public/project-updates/")) return "";
      return url.href;
    } catch (_) {
      return "";
    }
  }

  function make(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = clean(value);
    return element;
  }

  function renderQueue() {
    const host = $("reportQueue");
    const count = $("queueCount");
    if (!host) return;
    host.replaceChildren();
    if (count) count.textContent = reports.length + (reports.length === 1 ? " report" : " reports") + " · " + (currentStatus === "open" ? "Open" : "Under review");

    if (!reports.length) {
      host.appendChild(make("div", "queue-empty", currentStatus === "open" ? "There are no open reports." : "There are no reports currently under review."));
      return;
    }

    reports.forEach((report) => {
      const card = make("button", "report-card", undefined);
      card.type = "button";
      card.dataset.reportId = clean(report.id);
      card.setAttribute("aria-pressed", selectedReport && selectedReport.id === report.id ? "true" : "false");
      if (selectedReport && selectedReport.id === report.id) card.classList.add("selected");

      const top = make("span", "report-card-top");
      top.appendChild(make("strong", "report-project", report.project_name || "ALBUKHR Project"));
      top.appendChild(make("span", "report-reason", reasonLabel(report.reason)));
      card.appendChild(top);
      card.appendChild(make("span", "report-title", report.update_title || "Project update"));
      const meta = make("span", "report-meta", (report.project_code ? report.project_code + " · " : "") + formatDate(report.created_at));
      card.appendChild(meta);
      card.appendChild(make("span", "report-details-preview", report.details || "No additional report details supplied."));
      host.appendChild(card);
    });
  }

  function renderComments(comments) {
    const section = $("commentsContext");
    const host = $("commentsList");
    if (!section || !host) return;
    host.replaceChildren();
    const rows = Array.isArray(comments) ? comments : [];
    if (!rows.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    rows.forEach((comment) => {
      const item = make("article", "context-comment");
      const parent = rows.find((candidate) => clean(candidate.id) === clean(comment.parent_comment_id));
      const header = make("div", "context-comment-head");
      header.appendChild(make("strong", "", comment.commenter_name || "ALBUKHR user"));
      header.appendChild(make("time", "", formatDate(comment.created_at)));
      item.appendChild(header);
      if (parent) item.appendChild(make("span", "reply-context", "Reply to " + (parent.commenter_name || "another user")));
      item.appendChild(make("p", "", comment.comment_text || ""));
      host.appendChild(item);
    });
  }

  function renderUpdateContext(item) {
    const host = $("updateContextBody");
    const section = $("updateContext");
    if (!host || !section) return;
    host.replaceChildren();
    if (!item) {
      host.appendChild(make("p", "context-unavailable", "The published update is not currently available through the public detail endpoint. It may already be hidden or removed, or the record may no longer be published. You can still record a report decision."));
      renderComments([]);
      return;
    }

    const title = make("h4", "context-title", item.title || "Project update");
    host.appendChild(title);
    const meta = make("p", "context-meta", (item.project_name || "ALBUKHR Project") + (item.project_code ? " · " + item.project_code : "") + " · " + formatDate(item.published_at));
    host.appendChild(meta);
    const imageUrl = safeImageUrl(item.image_url);
    if (imageUrl) {
      const image = document.createElement("img");
      image.className = "context-image";
      image.src = imageUrl;
      image.alt = clean(item.title || "Project update") + " evidence image";
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      host.appendChild(image);
    }
    host.appendChild(make("p", "context-body-text", item.body || "No update body was supplied."));
    host.appendChild(make("p", "context-source", "Content source: " + clean(item.source_label || "project_provided").replace(/_/g, " ")));
    renderComments(item.comments);
  }

  function renderSelectedReport() {
    const report = selectedReport;
    const empty = $("reviewEmpty");
    const content = $("reviewContent");
    if (!report) {
      if (empty) empty.hidden = false;
      if (content) content.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    if (content) content.hidden = false;
    $("reviewTitle").textContent = report.update_title || "Reported project update";
    $("reviewStatus").textContent = clean(report.status || currentStatus).toUpperCase();
    $("reviewProject").textContent = (report.project_name || "ALBUKHR Project") + (report.project_code ? " · " + report.project_code : "");
    $("reviewReason").textContent = reasonLabel(report.reason);
    $("reviewDate").textContent = formatDate(report.created_at);
    $("reviewReportId").textContent = clean(report.id);
    $("reviewDetails").textContent = clean(report.details) || "No additional details supplied by the reporter.";
    $("decisionReason").value = "";
    $("decisionHint").textContent = "Select a decision after reviewing the report.";
    $("decisionHint").className = "decision-hint";
    const buttons = Array.from($("decisionForm").querySelectorAll("button[type=submit]"));
    buttons.forEach((button) => { button.disabled = decisionBusy; });
    renderUpdateContext(selectedUpdate);
  }

  async function loadUpdateContext(report, sequence) {
    detailLoading = true;
    const host = $("updateContextBody");
    if (host) host.replaceChildren(make("p", "context-loading", "Loading published update and visible comments…"));
    try {
      const item = await apiRequest("/updates/" + encodeURIComponent(report.update_id));
      if (sequence !== requestSequence || !selectedReport || selectedReport.id !== report.id) return;
      selectedUpdate = item && typeof item === "object" ? item : null;
      renderUpdateContext(selectedUpdate);
    } catch (error) {
      if (sequence !== requestSequence) return;
      selectedUpdate = null;
      renderUpdateContext(null);
      console.warn("[ALBUKHR MODERATION] Update context unavailable:", error);
    } finally {
      if (sequence === requestSequence) detailLoading = false;
    }
  }

  async function selectReport(report) {
    if (!report || !clean(report.id) || !clean(report.update_id)) return;
    selectedReport = report;
    selectedUpdate = null;
    const sequence = ++requestSequence;
    renderQueue();
    renderSelectedReport();
    await loadUpdateContext(report, sequence);
  }

  async function loadReports() {
    if (queueLoading) return;
    queueLoading = true;
    const refresh = $("refreshReportsButton");
    if (refresh) refresh.disabled = true;
    setQueueStatus("Loading " + currentStatus + " reports…");
    try {
      const data = await apiRequest("/moderation/reports?status=" + encodeURIComponent(currentStatus) + "&limit=100");
      const rows = data && Array.isArray(data.items) ? data.items : null;
      if (!rows) fail("The moderation queue returned an invalid report list.");
      reports = rows.filter((row) => row && clean(row.id) && clean(row.update_id));
      if (selectedReport) {
        const replacement = reports.find((row) => row.id === selectedReport.id);
        if (replacement) selectedReport = replacement;
        else { selectedReport = null; selectedUpdate = null; }
      }
      renderQueue();
      renderSelectedReport();
      setQueueStatus(reports.length ? "Select a report to inspect its update and make a decision." : "No reports in this queue.", reports.length ? "" : "empty");
      setStatus("Super Admin verified · Mainnet moderation queue refreshed.", "success");
    } catch (error) {
      reports = [];
      renderQueue();
      setQueueStatus(error.message || "Unable to load the moderation queue.", "error");
      setStatus(error.message || "Moderation queue unavailable.", "error");
    } finally {
      queueLoading = false;
      if (refresh) refresh.disabled = false;
    }
  }

  async function decideReport(decision) {
    if (decisionBusy || !selectedReport) return;
    const reason = clean($("decisionReason").value);
    if (!reason) {
      $("decisionHint").textContent = "Enter a reason before recording this moderation decision.";
      $("decisionHint").className = "decision-hint error";
      $("decisionReason").focus();
      return;
    }
    if (reason.length > 2000) {
      $("decisionHint").textContent = "The decision reason must not exceed 2,000 characters.";
      $("decisionHint").className = "decision-hint error";
      return;
    }

    const label = decision === "reviewing" ? "mark this report under review" : decision === "resolved" ? "resolve this report" : "dismiss this report";
    if (!window.confirm("Are you sure you want to " + label + "? This decision will be recorded in the moderation audit trail.")) return;

    decisionBusy = true;
    const buttons = Array.from($("decisionForm").querySelectorAll("button[type=submit]"));
    buttons.forEach((button) => { button.disabled = true; });
    $("decisionHint").textContent = "Submitting the decision to the trusted Mainnet moderation service…";
    $("decisionHint").className = "decision-hint";
    try {
      await apiRequest("/moderation/reports/" + encodeURIComponent(selectedReport.id) + "/decision", {
        method: "POST",
        body: { decision, reason }
      });
      $("decisionHint").textContent = "Decision recorded successfully.";
      $("decisionHint").className = "decision-hint success";
      selectedReport = null;
      selectedUpdate = null;
      await loadReports();
      renderSelectedReport();
    } catch (error) {
      $("decisionHint").textContent = error.message || "The moderation decision could not be recorded.";
      $("decisionHint").className = "decision-hint error";
    } finally {
      decisionBusy = false;
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  function bindEvents() {
    $("logoutButton")?.addEventListener("click", async () => {
      const button = $("logoutButton");
      if (button) button.disabled = true;
      try { await auth.signOut(); }
      finally { window.location.replace("admin-login.html"); }
    });

    $("refreshReportsButton")?.addEventListener("click", loadReports);
    document.querySelectorAll("[data-status]").forEach((button) => {
      button.addEventListener("click", () => {
        const status = clean(button.dataset.status).toLowerCase();
        if (status !== "open" && status !== "reviewing" || status === currentStatus) return;
        currentStatus = status;
        selectedReport = null;
        selectedUpdate = null;
        document.querySelectorAll("[data-status]").forEach((tab) => {
          const active = tab === button;
          tab.classList.toggle("active", active);
          tab.setAttribute("aria-selected", active ? "true" : "false");
        });
        renderSelectedReport();
        loadReports();
      });
    });

    $("reportQueue")?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-report-id]");
      if (!card) return;
      const report = reports.find((row) => clean(row.id) === clean(card.dataset.reportId));
      if (report) selectReport(report);
    });

    $("decisionForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const decision = clean(submitter && submitter.value).toLowerCase();
      if (["reviewing", "resolved", "dismissed"].includes(decision)) decideReport(decision);
    });
  }

  async function initialize() {
    bindEvents();
    try {
      assertMainnet();
      auth = window.AlbukhrSupabaseAdminAuth;
      if (!auth) fail("ALBUKHR Admin Auth Core is unavailable.");
      await auth.init();

      activeAdmin = await auth.requireSuperAdmin({ redirect: false, preserveSessionOnContextError: true });
      if (!activeAdmin) {
        const session = await auth.getSession();
        if (!session || !session.user) {
          window.location.replace("admin-login.html");
          return;
        }
        $("deniedPanel").hidden = false;
        $("securityBadge").textContent = "SUPER ADMIN REQUIRED";
        setStatus("This account does not hold the active super_admin role.", "error");
        return;
      }
      if (activeAdmin.is_admin !== true || clean(activeAdmin.status).toLowerCase() !== "active") {
        fail("An active ALBUKHR Super Admin account is required.");
      }

      const mfa = await auth.ensureMfa();
      if (activeAdmin.mfa_required !== false && !mfa?.verified) {
        window.location.replace("admin-mfa.html");
        return;
      }

      const client = window.ALBUKHR_SUPABASE.client;
      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error) throw assurance.error;
      if (clean(assurance.data && assurance.data.currentLevel).toLowerCase() !== "aal2") {
        window.location.replace("admin-mfa.html");
        return;
      }

      // The first protected request is independently verified by the API and
      // its trusted SQL RPC; it is the authoritative Super Admin access check.
      $("securityBadge").textContent = "SUPER ADMIN · AAL2 VERIFIED";
      $("moderationWorkspace").hidden = false;
      setStatus("Super Admin authorization verified. Loading the Mainnet moderation queue…", "success");
      await loadReports();
    } catch (error) {
      console.error("[ALBUKHR PROJECT UPDATES MODERATION INIT]", error);
      setStatus(error.message || "Project Updates Moderation could not be initialized.", "error");
      if (/aal2|mfa|factor|authenticator/i.test(String(error.message || error))) {
        window.location.replace("admin-mfa.html");
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})(window, document);
