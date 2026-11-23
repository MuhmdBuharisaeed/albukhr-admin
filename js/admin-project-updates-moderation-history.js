/* ALBUKHR Project Updates — Stage 6G Moderation History
 * Read-only event history plus a controlled restore path for content
 * whose current database status is hidden. Uses trusted API routes only.
 */
(function (window, document) {
  "use strict";

  const API_BASE = "https://albukhr-api.onrender.com/api/project-updates";
  const HISTORY_URL = "https://albukhr-api.onrender.com/api/project-updates/moderation/history";
  const MAINNET = "mainnet";
  const $ = (id) => document.getElementById(id);

  let loaded = false;
  let loading = false;
  let loadingMore = false;
  let cursor = null;
  let hasMore = false;
  let scope = "all";
  let items = [];
  let busyTarget = "";

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function make(tag, className, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined && content !== null) element.textContent = String(content);
    return element;
  }

  function setStatus(message, kind) {
    const element = $("moderationHistoryStatus");
    if (!element) return;
    element.textContent = clean(message);
    element.className = "history-status" + (kind ? " " + kind : "");
  }

  function assertMainnet() {
    const environment = window.ALBukhrEnvironment;
    const core = window.ALBUKHR_SUPABASE;
    if (!environment || typeof environment.isKnown !== "function" ||
        typeof environment.isMainnet !== "function" ||
        !environment.isKnown() || !environment.isMainnet()) {
      throw new Error("Moderation history is available on ALBUKHR Mainnet only.");
    }
    if (!core || !core.client || clean(core.network).toLowerCase() !== MAINNET ||
        clean(core.environment).toLowerCase() !== MAINNET) {
      throw new Error("The shared Admin Supabase Core is not connected to Mainnet.");
    }
  }

  async function currentToken() {
    const auth = window.AlbukhrSupabaseAdminAuth;
    if (!auth || typeof auth.getSession !== "function") {
      throw new Error("Shared ALBUKHR Admin Auth is unavailable.");
    }
    const session = await auth.getSession();
    const token = clean(session && session.access_token);
    if (!token) throw new Error("Your Admin session has expired. Sign in again.");
    return token;
  }

  async function apiRequest(url, options) {
    assertMainnet();
    const settings = options || {};
    const token = await currentToken();
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

    const response = await fetch(url, request);
    let payload;
    try {
      payload = await response.json();
    } catch (_) {
      throw new Error("Moderation service returned an unreadable response.");
    }
    if (!response.ok || payload?.success !== true) {
      const error = new Error(clean(payload && payload.error) || "Moderation request failed.");
      error.status = response.status;
      error.code = clean(payload && payload.code) || "MODERATION_REQUEST_FAILED";
      throw error;
    }
    if (clean(payload.network).toLowerCase() !== MAINNET) {
      throw new Error("The moderation service returned a non-Mainnet response.");
    }
    return payload.data;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Date unavailable";
    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function eventLabel(action) {
    const labels = {
      report_reviewed: "Report marked under review",
      report_dismissed: "Report dismissed",
      content_hidden: "Project update hidden",
      content_restored: "Project update restored",
      content_removed: "Project update removed",
      comment_hidden: "Comment hidden",
      comment_restored: "Comment restored",
      comment_removed: "Comment removed",
      verification_label_changed: "Verification label changed"
    };
    return labels[clean(action)] || clean(action).replace(/_/g, " ");
  }

  function stateLabel(value) {
    const labels = {
      published: "Published",
      hidden: "Hidden",
      removed: "Removed",
      visible: "Visible",
      resolved: "Resolved",
      dismissed: "Dismissed",
      open: "Open",
      reviewing: "Under review"
    };
    return labels[clean(value).toLowerCase()] || clean(value) || "—";
  }

  function stateTransition(item) {
    const before = item.before_state || {};
    const after = item.after_state || {};
    const beforeValue = before.publication_status || before.visibility_status || before.moderation_status;
    const afterValue = after.publication_status || after.visibility_status || after.moderation_status;
    if (!beforeValue && !afterValue) return "";
    return stateLabel(beforeValue) + " → " + stateLabel(afterValue);
  }

  function currentState(item) {
    if (item.comment_id) return clean(item.current_comment_visibility_status).toLowerCase();
    if (item.update_id) return clean(item.current_publication_status).toLowerCase();
    return clean(item.report_status).toLowerCase();
  }

  function canRestore(item) {
    return Boolean(
      (item.comment_id && currentState(item) === "hidden") ||
      (item.update_id && !item.comment_id && currentState(item) === "hidden")
    );
  }

  function restoreTarget(item) {
    if (item.comment_id && currentState(item) === "hidden") {
      return { type: "comment", id: clean(item.comment_id), label: "Restore comment" };
    }
    if (item.update_id && !item.comment_id && currentState(item) === "hidden") {
      return { type: "update", id: clean(item.update_id), label: "Restore update" };
    }
    return null;
  }

  function makeRestoreForm(item) {
    const target = restoreTarget(item);
    if (!target) return null;

    const panel = make("form", "history-restore-form");
    panel.dataset.historyTarget = target.type + ":" + target.id;

    const label = make("label", "history-restore-label", target.label + " · reason required");
    const reason = document.createElement("textarea");
    reason.className = "history-restore-reason";
    reason.rows = 2;
    reason.maxLength = 2000;
    reason.required = true;
    reason.placeholder = "Explain why this hidden content should be restored (1–2,000 characters).";

    const actions = make("div", "history-restore-actions");
    const button = make("button", "history-restore-button", target.label);
    button.type = "submit";
    const status = make("span", "history-restore-status", "");
    status.setAttribute("role", "status");
    actions.append(button, status);
    panel.append(label, reason, actions);

    panel.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busyTarget) return;

      const explanation = clean(reason.value);
      if (!explanation || explanation.length > 2000) {
        status.textContent = "Enter a reason between 1 and 2,000 characters.";
        status.className = "history-restore-status error";
        reason.focus();
        return;
      }

      const actionUrl = target.type === "comment"
        ? API_BASE + "/moderation/comments/" + encodeURIComponent(target.id) + "/action"
        : API_BASE + "/moderation/updates/" + encodeURIComponent(target.id) + "/action";

      if (!window.confirm("Restore this hidden " + target.type + "? The reason and decision will be recorded in the moderation audit trail.")) return;

      busyTarget = target.type + ":" + target.id;
      button.disabled = true;
      status.textContent = "Submitting restore request…";
      status.className = "history-restore-status";

      try {
        await apiRequest(actionUrl, {
          method: "POST",
          body: { action: "restore", reason: explanation }
        });
        status.textContent = "Restore recorded. Refreshing moderation history…";
        status.className = "history-restore-status success";
        await loadHistory(true);
      } catch (error) {
        status.textContent = error.message || "The restore request was rejected.";
        status.className = "history-restore-status error";
      } finally {
        busyTarget = "";
        button.disabled = false;
      }
    });

    return panel;
  }

  function renderHistory(append) {
    const host = $("moderationHistoryList");
    if (!host) return;
    if (!append) host.replaceChildren();

    if (!items.length) {
      host.appendChild(make("div", "history-empty", "No Mainnet moderation events have been recorded yet."));
      return;
    }

    const offset = append ? host.querySelectorAll(".history-event").length : 0;
    items.slice(offset).forEach((item) => {
      const card = make("article", "history-event");
      const head = make("div", "history-event-head");
      const title = make("strong", "history-event-title", eventLabel(item.action));
      const time = make("time", "history-event-time", formatDate(item.created_at));
      head.append(title, time);
      card.appendChild(head);

      const project = [clean(item.project_name), clean(item.project_code)].filter(Boolean).join(" · ");
      if (project) card.appendChild(make("p", "history-event-project", project));
      if (item.update_title) card.appendChild(make("p", "history-event-update", item.update_title));

      const targetStatus = item.comment_id
        ? stateLabel(item.current_comment_visibility_status)
        : item.update_id
          ? stateLabel(item.current_publication_status)
          : stateLabel(item.report_status);
      const meta = make("div", "history-event-meta");
      meta.append(
        make("span", "history-event-chip", item.comment_id ? "COMMENT" : item.report_id ? "REPORT" : "UPDATE"),
        make("span", "history-event-chip state", "CURRENT: " + targetStatus)
      );
      if (item.report_reason) meta.appendChild(make("span", "history-event-chip", "REPORT: " + clean(item.report_reason).replace(/_/g, " ")));
      card.appendChild(meta);

      const transition = stateTransition(item);
      if (transition) card.appendChild(make("p", "history-event-transition", "Recorded state: " + transition));
      card.appendChild(make("p", "history-event-reason", clean(item.reason) || "No reason was stored with this event."));
      card.appendChild(make("p", "history-event-moderator", "Moderator ID: " + clean(item.moderator_principal_id)));

      const restore = makeRestoreForm(item);
      if (restore) card.appendChild(restore);

      host.appendChild(card);
    });
  }

  async function loadHistory(reset) {
    if (loading || loadingMore) return;
    if (reset) {
      loading = true;
      cursor = null;
      hasMore = false;
      items = [];
      setStatus("Loading Mainnet moderation audit history…");
      renderHistory(false);
    } else {
      if (!hasMore || !cursor) return;
      loadingMore = true;
    }

    const button = $("refreshModerationHistoryButton");
    const more = $("loadMoreModerationHistoryButton");
    if (button) button.disabled = true;
    if (more) more.disabled = true;

    try {
      const query = new URLSearchParams({ scope, limit: "30" });
      if (!reset && cursor) {
        query.set("before_created_at", cursor.created_at);
        query.set("before_id", cursor.id);
      }

      const data = await apiRequest(HISTORY_URL + "?" + query.toString());
      if (!data || !Array.isArray(data.items)) {
        throw new Error("Moderation-history response is invalid.");
      }

      const nextItems = data.items.filter((item) => item && clean(item.id));
      const known = new Set(items.map((item) => clean(item.id)));
      nextItems.forEach((item) => {
        if (!known.has(clean(item.id))) items.push(item);
      });

      cursor = data.next_cursor && data.next_cursor.created_at && data.next_cursor.id
        ? data.next_cursor
        : null;
      hasMore = data.has_more === true && Boolean(cursor);
      loaded = true;
      renderHistory(false);
      setStatus(items.length
        ? "Loaded " + items.length + " Mainnet moderation event(s)."
        : "No Mainnet moderation events have been recorded yet.", items.length ? "success" : "");
    } catch (error) {
      setStatus(error.message || "Moderation history could not be loaded.", "error");
      if (reset) renderHistory(false);
    } finally {
      loading = false;
      loadingMore = false;
      if (button) button.disabled = false;
      if (more) {
        more.disabled = false;
        more.hidden = !hasMore;
        more.textContent = "Load older history";
      }
    }
  }

  function bind() {
    $("refreshModerationHistoryButton")?.addEventListener("click", () => loadHistory(true));
    $("loadMoreModerationHistoryButton")?.addEventListener("click", () => loadHistory(false));
    $("moderationHistoryScope")?.addEventListener("change", (event) => {
      scope = clean(event.target.value).toLowerCase();
      if (!["all", "reports", "updates", "comments"].includes(scope)) scope = "all";
      loadHistory(true);
    });

    const workspace = $("moderationWorkspace");
    if (!workspace || typeof MutationObserver !== "function") return;

    const observer = new MutationObserver(() => {
      if (!workspace.hidden && !loaded && !loading && !loadingMore) {
        loadHistory(true);
        observer.disconnect();
      }
    });
    observer.observe(workspace, { attributes: true, attributeFilter: ["hidden"] });

    if (!workspace.hidden && !loaded) {
      loadHistory(true);
      observer.disconnect();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind, { once: true });
  } else {
    bind();
  }

  window.AlbukhrProjectUpdatesModerationHistory = Object.freeze({
    refresh: () => loadHistory(true)
  });
})(window, document);
