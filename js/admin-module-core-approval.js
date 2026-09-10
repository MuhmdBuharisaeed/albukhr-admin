/* ALBUKHR Core Project Approval Workspace
 * Migration 1.7 UI integration.
 * Mainnet Admin only. Server-authoritative approval.
 */
(function (w, d) {
  "use strict";

  const AUTH = () => w.AlbukhrSupabaseAdminAuth;
  const CLIENT = () => w.ALBUKHR_SUPABASE && w.ALBUKHR_SUPABASE.client;
  const $ = id => d.getElementById(id);

  const RPC_QUEUE = "get_core_project_approval_queue";
  const RPC_HISTORY = "get_core_project_approval_history";
  const RPC_APPROVE = "approve_core_project";

  function setStatus(text, error) {
    const el = $("pageStatus");
    if (!el) return;
    el.textContent = text || "";
    el.className = "status" + (error ? " error" : "");
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  async function rpc(name, params) {
    const client = CLIENT();
    if (!client) throw new Error("Supabase client unavailable.");

    const result = await client
      .schema("albukhr_security")
      .rpc(name, params || {});

    if (result.error) throw result.error;
    return result.data;
  }

  function renderQueue(records) {
    const host = $("workspaceText");
    if (!host) return;

    if (!records.length) {
      host.innerHTML =
        '<div class="notice">' +
        "<b>No Core Projects awaiting approval.</b>" +
        "<span>The server-authoritative approval queue is empty.</span>" +
        "</div>";
      return;
    }

    host.innerHTML = records.map(project => {
      const id = esc(project.project_id);
      const status = esc(String(project.status || "").toUpperCase());

      return (
        '<article class="approval-item" data-project-id="' + id + '">' +
          '<div class="approval-main">' +
            "<small>CORE SLOT " + esc(project.core_slot) + " • MAINNET</small>" +
            "<h3>" + esc(project.name) + "</h3>" +
            "<p>" + esc(project.project_code) + " • " +
              esc(project.slug) + "</p>" +
            "<p>Project ID: <code>" + id + "</code></p>" +
            "<p>Status: <strong>" + status + "</strong></p>" +
          "</div>" +
          '<div class="approval-actions">' +
            '<button type="button" data-action="history">Approval History</button>' +
            '<button type="button" data-action="approve">Approve Project</button>' +
          "</div>" +
          '<div class="approval-history" hidden></div>' +
        "</article>"
      );
    }).join("");

    host.querySelectorAll("[data-action]").forEach(button => {
      button.addEventListener("click", async function () {
        const card = button.closest(".approval-item");
        const projectId = card && card.dataset.projectId;
        if (!projectId) return;

        if (button.dataset.action === "history") {
          await loadHistory(card, projectId);
        } else {
          await approveProject(projectId, button);
        }
      });
    });
  }

  async function loadHistory(card, projectId) {
    const box = card.querySelector(".approval-history");
    if (!box) return;

    box.hidden = false;
    box.textContent = "Loading approval history...";

    try {
      const result = await rpc(RPC_HISTORY, {
        p_project_id: projectId
      });

      const records = Array.isArray(result && result.records)
        ? result.records
        : [];

      if (!records.length) {
        box.textContent = "No Core approval decisions recorded.";
        return;
      }

      box.innerHTML = records.map(record =>
        "<div>" +
          "<b>" + esc(String(record.decision || "").toUpperCase()) + "</b>" +
          " <span>" + esc(record.previous_status) +
          " → " + esc(record.new_status) + "</span>" +
          "<small>" + esc(record.created_at) + "</small>" +
          (record.reason
            ? "<p>" + esc(record.reason) + "</p>"
            : "") +
        "</div>"
      ).join("");
    } catch (error) {
      console.error(error);
      box.textContent =
        error && error.message
          ? error.message
          : "Unable to load approval history.";
    }
  }

  async function approveProject(projectId, button) {
    const reason = w.prompt(
      "Approval reason (optional):",
      "Core Project approved after administrative review."
    );

    if (reason === null) return;

    button.disabled = true;
    setStatus("Submitting approval to the server...");

    try {
      const result = await rpc(RPC_APPROVE, {
        p_project_id: projectId,
        p_reason: reason
      });

      if (!result || result.success !== true) {
        throw new Error("Server did not confirm the approval.");
      }

      setStatus(
        "Core Project approved successfully. Project status is now APPROVED."
      );

      await loadQueue();
    } catch (error) {
      console.error(error);
      setStatus(
        error && error.message
          ? error.message
          : "Core Project approval failed.",
        true
      );
      button.disabled = false;
    }
  }

  async function loadQueue() {
    const result = await rpc(RPC_QUEUE);

    if (!result || result.authorized !== true) {
      throw new Error("Core Project approval authorization denied.");
    }

    const records = Array.isArray(result.records)
      ? result.records
      : [];

    renderQueue(records);
  }

  async function init() {
    try {
      if (!AUTH() || !w.AlbukhrEnvironment ||
          !w.AlbukhrEnvironment.isMainnet()) {
        throw new Error("Admin module unavailable.");
      }

      await AUTH().init();

      const admin = await AUTH().requireAdmin({ redirect: false });

      if (!admin) {
        w.location.replace("admin-login.html");
        return;
      }

      const mfa = await AUTH().ensureMfa();

      if (admin.mfa_required && !mfa.verified) {
        w.location.replace("admin-mfa.html");
        return;
      }

      const roles = Array.isArray(admin.roles) ? admin.roles : [];
      const authorized = roles.some(role =>
        role === "super_admin" || role === "approval_admin"
      );

      if (!authorized) {
        if ($("authorizationState")) {
          $("authorizationState").textContent = "DENIED";
        }

        setStatus(
          "You are authenticated but not authorized for Core Project approvals.",
          true
        );
        return;
      }

      if ($("authorizationState")) {
        $("authorizationState").textContent = "AUTHORIZED";
      }

      if ($("securityState")) {
        $("securityState").textContent = "Authenticated • AAL2";
      }

      if ($("authorizationTitle")) {
        $("authorizationTitle").textContent =
          "Server-authoritative Core approval access granted";
      }

      if ($("authorizationText")) {
        $("authorizationText").textContent =
          "Accepted roles: super_admin / approval_admin";
      }

      if ($("workspaceText")) {
        $("workspaceText").textContent =
          "Loading Core Project approval queue...";
      }

      await loadQueue();
      setStatus("Core Project approval workspace ready.");
    } catch (error) {
      console.error(error);
      setStatus(
        error && error.message
          ? error.message
          : "Unable to load Core Project approval workspace.",
        true
      );
    }
  }

  w.AlbukhrCoreProjectApproval = {
    init,
    loadQueue
  };

  init();
})(window, document);
