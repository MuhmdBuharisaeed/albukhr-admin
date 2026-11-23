/* ALBUKHR Project Updates Moderation — Stage 6F content actions.
 * Add-on for the existing Stage 6E moderation workspace.
 *
 * Security:
 * - Mainnet-only; obtains the active Admin bearer token from shared Admin Auth.
 * - Every operation is sent to the trusted API gateway.
 * - No browser-side Supabase writes or caller-supplied principal IDs.
 * - API and trusted SQL functions independently enforce Super Admin/AAL2.
 * - Every content action requires a recorded reason.
 */
(function (window, document) {
  "use strict";

  if (window.__ALBUKHR_PROJECT_UPDATES_MODERATION_ACTIONS__) return;
  window.__ALBUKHR_PROJECT_UPDATES_MODERATION_ACTIONS__ = true;

  const API_BASE = "https://albukhr-api.onrender.com/api/project-updates";
  const MAINNET = "mainnet";
  const $ = (id) => document.getElementById(id);

  let activeReportId = null;
  let activeUpdateId = null;
  let activeUpdateState = "unknown";
  let activeComments = [];
  let actionBusy = false;
  let requestSerial = 0;
  let observer = null;
  let scheduleHandle = null;

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function make(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined && value !== null) element.textContent = String(value);
    return element;
  }

  function setActionStatus(message, type) {
    const status = $("contentModerationStatus");
    if (!status) return;
    status.textContent = clean(message);
    status.className = "content-moderation-status" + (type ? " " + type : "");
  }

  function selectedReportId() {
    const selected = document.querySelector("#reportQueue .report-card.selected");
    return selected ? clean(selected.dataset.reportId) : "";
  }

  function selectedQueueStatus() {
    const selected = document.querySelector("[data-status].active");
    const status = clean(selected && selected.dataset.status).toLowerCase();
    return status === "reviewing" ? "reviewing" : "open";
  }

  function clearInjectedControls() {
    document.querySelectorAll("[data-stage6f-control]").forEach((element) => element.remove());
  }

  function currentAuth() {
    const auth = window.AlbukhrSupabaseAdminAuth;
    if (!auth || typeof auth.getSession !== "function") {
      throw new Error("Shared ALBUKHR Admin Auth is unavailable.");
    }
    return auth;
  }

  async function apiRequest(path, options) {
    const settings = options || {};
    const environment = window.ALBukhrEnvironment;
    const core = window.ALBUKHR_SUPABASE;

    if (!environment || typeof environment.isKnown !== "function" ||
        typeof environment.isMainnet !== "function" ||
        !environment.isKnown() || !environment.isMainnet()) {
      throw new Error("Content moderation is available on ALBUKHR Mainnet only.");
    }
    if (!core || !core.client || clean(core.network).toLowerCase() !== MAINNET ||
        clean(core.environment).toLowerCase() !== MAINNET) {
      throw new Error("The shared Admin Supabase Core is not connected to Mainnet.");
    }

    const session = await currentAuth().getSession();
    const token = clean(session && session.access_token);
    if (!token) throw new Error("Your Admin session has expired. Sign in again.");

    const method = clean(settings.method || "GET").toUpperCase();
    const headers = {
      Accept: "application/json",
      Authorization: "Bearer " + token,
      "x-albukhr-auth-provider": "supabase-auth"
    };
    const request = {
      method,
      headers,
      cache: "no-store",
      credentials: "omit"
    };

    if (settings.body !== undefined) {
      headers["Content-Type"] = "application/json";
      request.body = JSON.stringify(settings.body);
    }

    const response = await fetch(API_BASE + path, request);
    let payload;
    try {
      payload = await response.json();
    } catch (_) {
      throw new Error("Project Updates API returned an unreadable response.");
    }

    if (!response.ok || payload?.success !== true) {
      const error = new Error(clean(payload && payload.error) || "The moderation request was rejected.");
      error.status = response.status;
      error.code = clean(payload && payload.code) || "PROJECT_UPDATES_REQUEST_FAILED";
      throw error;
    }
    if (clean(payload.network).toLowerCase() !== MAINNET) {
      throw new Error("The API returned a non-Mainnet response. The action was stopped.");
    }
    return payload.data;
  }

  async function getSelectedReport(reportId) {
    const status = selectedQueueStatus();
    const data = await apiRequest("/moderation/reports?status=" + encodeURIComponent(status) + "&limit=100");
    const rows = Array.isArray(data && data.items) ? data.items : [];
    return rows.find((row) => clean(row && row.id) === reportId) || null;
  }

  function appendReasonControl(host, updateId, initialState) {
    const panel = make("section", "content-moderation-panel");
    panel.dataset.stage6fControl = "update-actions";

    const heading = make("div", "content-moderation-heading");
    heading.appendChild(make("strong", "", "Content moderation"));
    heading.appendChild(make("span", "content-moderation-state", initialState === "published"
      ? "PUBLISHED"
      : initialState === "hidden"
        ? "HIDDEN"
        : initialState === "removed"
          ? "REMOVED"
          : "STATUS UNAVAILABLE"));
    panel.appendChild(heading);

    panel.appendChild(make("p", "content-moderation-explainer",
      "Content actions are separate from report decisions. Choose an action only when the reported material breaches the applicable policy. Good-faith criticism alone is not grounds for removal."));

    const label = make("label", "content-moderation-label", "Content action reason · required");
    const reason = document.createElement("textarea");
    reason.className = "content-moderation-reason";
    reason.rows = 2;
    reason.maxLength = 2000;
    reason.required = true;
    reason.placeholder = "Explain the policy basis and evidence for this action (1–2,000 characters).";
    reason.setAttribute("aria-label", "Content action reason");
    panel.append(label, reason);

    const actions = make("div", "content-moderation-actions");
    if (initialState === "published") {
      actions.appendChild(actionButton("Hide update", "hide", "update", updateId, "secondary"));
      actions.appendChild(actionButton("Remove update", "remove", "update", updateId, "danger"));
    } else if (initialState === "hidden" || initialState === "unknown") {
      actions.appendChild(actionButton("Restore update", "restore", "update", updateId, "restore"));
      if (initialState === "unknown") {
        panel.appendChild(make("p", "content-moderation-note",
          "The public detail service did not expose this update. Restore will succeed only if the server confirms that the update is hidden; removed or missing records will be rejected."));
      }
    } else {
      panel.appendChild(make("p", "content-moderation-note",
        "This update is recorded as removed in this review session. It cannot be restored by the available content policy."));
    }
    panel.appendChild(actions);
    const status = make("p", "content-moderation-status", "No content action has been taken.");
    status.id = "contentModerationStatus";
    panel.appendChild(status);
    host.appendChild(panel);
  }

  function actionButton(label, action, targetType, targetId, variant) {
    const button = make("button", "content-action-button " + (variant || ""), label);
    button.type = "button";
    button.dataset.moderationAction = action;
    button.dataset.targetType = targetType;
    button.dataset.targetId = targetId;
    return button;
  }

  function addCommentControls(commentElements, comments) {
    const list = Array.isArray(comments) ? comments : [];
    const cards = Array.from(commentElements || []);
    cards.forEach((card, index) => {
      const comment = list[index];
      if (!comment || !clean(comment.id) || card.querySelector("[data-stage6f-control='comment-actions']")) return;

      const panel = make("div", "comment-moderation-actions");
      panel.dataset.stage6fControl = "comment-actions";
      panel.appendChild(make("span", "comment-moderation-label", "Super Admin actions"));

      const actions = make("div", "content-moderation-actions");
      actions.appendChild(actionButton("Hide comment", "hide", "comment", clean(comment.id), "secondary"));
      actions.appendChild(actionButton("Remove comment", "remove", "comment", clean(comment.id), "danger"));
      panel.appendChild(actions);
      card.appendChild(panel);
    });
  }

  function enhanceVisibleCommentCards() {
    const host = $("commentsList");
    if (!host || !activeComments.length) return;
    addCommentControls(host.querySelectorAll(".context-comment"), activeComments);
  }

  async function loadContextForSelectedReport(reportId, serial) {
    clearInjectedControls();
    setActionStatus("Loading the selected report reference…");

    const report = await getSelectedReport(reportId);
    if (serial !== requestSerial || selectedReportId() !== reportId) return;
    if (!report || !clean(report.update_id)) {
      setActionStatus("The selected report is no longer in this queue. Refresh the queue.", "error");
      return;
    }

    const updateId = clean(report.update_id);
    activeUpdateId = updateId;

    const host = $("updateContextBody");
    if (!host) return;

    let item = null;
    try {
      item = await apiRequest("/updates/" + encodeURIComponent(updateId));
    } catch (error) {
      if (serial !== requestSerial || selectedReportId() !== reportId) return;
      if (Number(error.status) !== 404) {
        setActionStatus(error.message || "Update context could not be loaded.", "error");
        return;
      }
      activeUpdateState = "unknown";
      appendReasonControl(host, updateId, "unknown");
      setActionStatus("The update is not available through the public detail route. Restore is offered only as a server-verified attempt.", "warning");
      return;
    }

    if (serial !== requestSerial || selectedReportId() !== reportId) return;
    if (!item || clean(item.id) !== updateId) {
      activeUpdateState = "unknown";
      appendReasonControl(host, updateId, "unknown");
      setActionStatus("The update detail response did not match the selected report.", "error");
      return;
    }

    activeUpdateState = "published";
    appendReasonControl(host, updateId, "published");

    const comments = Array.isArray(item.comments) ? item.comments : [];
    activeComments = comments;
    enhanceVisibleCommentCards();
    setActionStatus("Update and visible comments loaded. No moderation action has been taken.");
  }

  function scheduleSelectedReportRefresh() {
    if (scheduleHandle) window.clearTimeout(scheduleHandle);
    scheduleHandle = window.setTimeout(() => {
      scheduleHandle = null;
      const reportId = selectedReportId();
      if (!reportId) {
        requestSerial++;
        activeReportId = null;
        activeUpdateId = null;
        activeUpdateState = "unknown";
        clearInjectedControls();
        return;
      }
      if (reportId === activeReportId) return;
      activeReportId = reportId;
      const serial = ++requestSerial;
      activeUpdateId = null;
      activeUpdateState = "unknown";
      activeComments = [];
      loadContextForSelectedReport(reportId, serial).catch((error) => {
        if (serial === requestSerial) setActionStatus(error.message || "Content moderation controls could not be prepared.", "error");
      });
    }, 100);
  }

  async function executeContentAction(button) {
    if (actionBusy || !button) return;
    const action = clean(button.dataset.moderationAction).toLowerCase();
    const targetType = clean(button.dataset.targetType).toLowerCase();
    const targetId = clean(button.dataset.targetId);

    if (!["hide", "restore", "remove"].includes(action) ||
        !["update", "comment"].includes(targetType) || !targetId) return;

    const panel = button.closest(".content-moderation-panel") ||
      button.closest(".comment-moderation-actions");
    const reasonInput = panel?.querySelector(".content-moderation-reason") ||
      document.querySelector(".content-moderation-panel .content-moderation-reason");
    const reason = clean(reasonInput && reasonInput.value);

    if (!reason || reason.length > 2000) {
      setActionStatus("Enter a moderation reason between 1 and 2,000 characters.", "error");
      if (reasonInput) reasonInput.focus();
      return;
    }

    const actionLabel = action === "hide" ? "hide" : action === "restore" ? "restore" : "remove";
    const targetLabel = targetType === "update" ? "this project update" : "this comment";
    if (!window.confirm("Are you sure you want to " + actionLabel + " " + targetLabel + "? The action and reason will be written to the moderation audit trail.")) return;

    actionBusy = true;
    const allButtons = Array.from(document.querySelectorAll("[data-moderation-action]"));
    allButtons.forEach((entry) => { entry.disabled = true; });
    setActionStatus("Submitting the content action to the trusted Mainnet moderation service…");

    try {
      const route = targetType === "update"
        ? "/moderation/updates/" + encodeURIComponent(targetId) + "/action"
        : "/moderation/comments/" + encodeURIComponent(targetId) + "/action";

      await apiRequest(route, {
        method: "POST",
        body: { action, reason }
      });

      if (targetType === "update") {
        activeUpdateState = action === "hide" ? "hidden" : action === "remove" ? "removed" : "published";
        const contentHost = $("updateContextBody");
        if (contentHost) {
          clearInjectedControls();
          appendReasonControl(contentHost, targetId, activeUpdateState);
          enhanceVisibleCommentCards();
        }
      } else {
        const card = button.closest(".context-comment");
        const commentActions = card && card.querySelector(".comment-moderation-actions .content-moderation-actions");
        if (card) {
          card.querySelectorAll(".comment-moderation-result").forEach((entry) => entry.remove());
          const message = make("p", "comment-moderation-result",
            action === "hide" ? "Comment hidden. You may restore it during this review session." :
            action === "remove" ? "Comment removed by Super Admin moderation." :
            "Comment restored by Super Admin moderation.");
          card.appendChild(message);
          if (commentActions && action === "hide") {
            commentActions.replaceChildren(actionButton("Restore comment", "restore", "comment", targetId, "restore"));
          } else if (commentActions && action === "restore") {
            commentActions.replaceChildren(
              actionButton("Hide comment", "hide", "comment", targetId, "secondary"),
              actionButton("Remove comment", "remove", "comment", targetId, "danger")
            );
          } else if (commentActions) {
            commentActions.replaceChildren();
          }
        }
      }

      setActionStatus("Content action recorded successfully. The report decision remains a separate step.", "success");
    } catch (error) {
      setActionStatus(error.message || "The content action was rejected by the trusted moderation service.", "error");
    } finally {
      actionBusy = false;
      allButtons.forEach((entry) => { entry.disabled = false; });
    }
  }

  function bindActionEvents() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-moderation-action]");
      if (!button) return;
      executeContentAction(button);
    });

    const queue = $("reportQueue");
    const context = $("updateContextBody");
    const comments = $("commentsList");

    if (typeof MutationObserver === "function") {
      observer = new MutationObserver((mutations) => {
        let queueChanged = false;
        let commentsChanged = false;
        mutations.forEach((mutation) => {
          const target = mutation.target;
          if (queue && (target === queue || queue.contains(target))) queueChanged = true;
          if (comments && (target === comments || comments.contains(target))) commentsChanged = true;
        });
        if (commentsChanged) enhanceVisibleCommentCards();
        if (queueChanged) scheduleSelectedReportRefresh();
      });
      if (queue) observer.observe(queue, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
      if (context) observer.observe(context, { childList: true, subtree: true });
      if (comments) observer.observe(comments, { childList: true, subtree: true });
    }

    document.querySelectorAll("[data-status]").forEach((tab) => {
      tab.addEventListener("click", () => {
        activeReportId = null;
        requestSerial++;
        clearInjectedControls();
      });
    });
  }

  function initialize() {
    bindActionEvents();
    if (observer && $("commentsList")) {
      // Comment cards are rendered by the existing Stage 6E controller asynchronously.
      observer.observe($("commentsList"), { childList: true, subtree: true });
    }
    scheduleSelectedReportRefresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }

  window.AlbukhrProjectUpdatesModerationActions = Object.freeze({
    refresh: scheduleSelectedReportRefresh
  });
})(window, document);
