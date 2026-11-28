(function (window, document) {
  "use strict";

  const ADMIN_LOGIN_PAGE = "admin-login.html";
  const ADMIN_MFA_PAGE = "admin-mfa.html";
  const RPC = {
    workspace: "get_financial_control_role_workspace",
    request: "request_financial_control_role_change",
    approve: "approve_financial_control_role_change",
    reject: "reject_financial_control_role_change"
  };

  const $ = (id) => document.getElementById(id);
  let adminContext = null;
  let workspaceData = null;
  let roleCatalog = [];
  let eligibleTargets = [];

  function fail(message) {
    throw new Error(String(message || "ALBUKHR Admin security error."));
  }

  function label(value) {
    return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function status(message, isError) {
    const el = $("pageStatus");
    if (el) {
      el.textContent = message || "";
      el.className = "status" + (isError ? " error" : "");
    }
  }

  function financialStatus(message, isError) {
    const el = $("financialControlStatus");
    if (el) {
      el.textContent = message || "";
      el.className = "inline-status" + (isError ? " error" : "");
    }
  }

  function uuid(value) {
    const candidate = String(value || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
      ? candidate
      : null;
  }

  function date(value) {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
  }

  function mainnetClient() {
    const env = window.ALBukhrEnvironment;
    if (!env || typeof env.isKnown !== "function" || !env.isKnown() || !env.isMainnet()) {
      fail("Financial Control Roles are available only on ALBUKHR MAINNET.");
    }

    const core = window.ALBUKHR_SUPABASE;
    if (!core || !core.client || String(core.environment).toLowerCase() !== "mainnet" || String(core.network).toLowerCase() !== "mainnet") {
      fail("Mainnet Supabase Core is unavailable or has the wrong network.");
    }
    return core.client;
  }

  function auth() {
    if (!window.AlbukhrSupabaseAdminAuth) fail("ALBUKHR Admin Auth is unavailable.");
    return window.AlbukhrSupabaseAdminAuth;
  }

  function legacyRoles() {
    return Array.isArray(adminContext && adminContext.roles)
      ? adminContext.roles.map((role) => String(role || "").toLowerCase())
      : [];
  }

  async function requireFreshAal2() {
    const authApi = auth();
    const preliminary = await authApi.requireAdmin({ redirect: false });
    if (!preliminary) {
      window.location.replace(ADMIN_LOGIN_PAGE);
      fail("An active Admin session is required.");
    }
    if (preliminary.mfa_required !== true) {
      fail("Financial-control operations require the Admin account's MFA requirement to be enabled.");
    }

    const mfa = await authApi.ensureMfa();
    if (!mfa || !mfa.required || !mfa.verified) {
      window.location.replace(ADMIN_MFA_PAGE);
      fail("AAL2 MFA verification is required.");
    }

    const assurance = await mainnetClient().auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    if (!assurance.data || assurance.data.currentLevel !== "aal2") {
      window.location.replace(ADMIN_MFA_PAGE);
      fail("The current Supabase session does not have AAL2 assurance.");
    }

    adminContext = await authApi.refreshAdminContext();
    if (!adminContext || !adminContext.is_admin || adminContext.status !== "active") {
      fail("The server no longer recognizes this account as an active Admin.");
    }
    if (!legacyRoles().includes("super_admin")) {
      fail("Financial-control role governance is restricted to active Super Admins.");
    }
    return adminContext;
  }

  async function rpc(name, params) {
    await requireFreshAal2();
    const result = await mainnetClient().schema("albukhr_security").rpc(name, params || {});
    if (result.error) throw result.error;
    return result.data;
  }

  function addText(parent, tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value == null ? "" : String(value);
    parent.appendChild(element);
    return element;
  }

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value == null ? "—" : String(value);
  }

  function displayAdminSummary(admin, mfa) {
    setText("adminEmail", admin.email || admin.email_snapshot || "Authenticated administrator");
    setText("adminId", admin.user_id || "Authenticated session");
    setText("adminStatus", label(admin.status));
    setText("mfaRequired", admin.mfa_required ? "Required" : "Not required");
    setText("mfaStatus", mfa.verified ? "AAL2 verified" : "Not verified");
    setText("authState", mfa.verified ? "AAL2 VERIFIED" : "AUTHENTICATED");
    setText("securityState", mfa.verified ? "Authenticated • AAL2" : "Authenticated");

    const roles = Array.isArray(admin.roles) ? admin.roles : [];
    setText("roleCount", roles.length);
    $("roles").replaceChildren();
    if (roles.length) {
      roles.forEach((role) => addText($("roles"), "span", "role", label(role)));
    } else {
      addText($("roles"), "span", "muted", "No legacy Admin roles returned.");
    }

    const coreProjects = Array.isArray(admin.core_projects) ? admin.core_projects : [];
    const scopedProjects = Array.isArray(admin.scoped_projects) ? admin.scoped_projects : [];
    setText("coreCount", coreProjects.length);
    setText("scopedCount", scopedProjects.length);
    setText("testnetAccess", admin.testnet_access ? "Granted" : "No");
    setText(
      "boundaryText",
      "Administrator " + (admin.status === "active" ? "is active" : "is not active") +
        "; " + (mfa.verified ? "AAL2 assurance is established." : "MFA assurance is not established.") +
        " Authorization remains controlled by the Mainnet security layer."
    );
  }

  async function loadEligibleTargets() {
    const rows = await rpc("get_core_team_members", {});
    if (!Array.isArray(rows)) fail("The protected Admin directory returned an invalid response.");

    eligibleTargets = rows.filter((row) =>
      row && String(row.status || "").toLowerCase() === "active" && uuid(row.user_id)
    );

    const select = $("targetUserId");
    select.replaceChildren();
    const first = document.createElement("option");
    first.value = "";
    first.textContent = eligibleTargets.length ? "Select an active Core Team Admin" : "No active Core Team Admins were returned";
    select.appendChild(first);

    eligibleTargets.forEach((row) => {
      const option = document.createElement("option");
      option.value = row.user_id;
      option.textContent = String(row.email_snapshot || "Core Team Admin") + " • Core Slot " + (row.core_slot || "—");
      option.title = row.user_id;
      select.appendChild(option);
    });
  }

  function setTargetOption(userId) {
    const select = $("targetUserId");
    const id = uuid(userId);
    if (!id) return;
    let option = Array.from(select.options).find((item) => item.value === id);
    if (!option) {
      option = document.createElement("option");
      option.value = id;
      option.textContent = "Existing assigned Admin • " + id;
      select.appendChild(option);
    }
    select.value = id;
  }

  function roleName(code) {
    const found = roleCatalog.find((item) => item.role_code === code);
    return found && found.display_name ? found.display_name : label(code);
  }

  function loadRoleOptions() {
    const select = $("roleCode");
    select.replaceChildren();
    const first = document.createElement("option");
    first.value = "";
    first.textContent = "Select a financial-control role";
    select.appendChild(first);
    roleCatalog.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.role_code;
      option.textContent = item.display_name || label(item.role_code);
      option.title = item.description || "";
      select.appendChild(option);
    });
  }

  function renderAuthorizationMode(data) {
    const count = Number(data.active_super_admin_count);
    const mode = data.authorization_mode;
    if (!Number.isInteger(count) || count < 1 || !["single_super_admin", "dual_super_admin"].includes(mode)) {
      fail("The Mainnet workspace did not return a valid Super Admin authorization mode.");
    }
    if ((count === 1 && mode !== "single_super_admin") || (count > 1 && mode !== "dual_super_admin")) {
      fail("The Mainnet Super Admin count and authorization mode do not match.");
    }

    if (mode === "single_super_admin") {
      setText("authorizationModeTitle", "Single-Super-Admin mode • active Super Admins: 1");
      setText(
        "authorizationModeText",
        "The existing Admin appointment policy does not permit a second Super Admin. While exactly one active Mainnet Super Admin exists, each role change is approved by that Super Admin and recorded atomically with its reason and audit events. The target must be a different active Admin with mandatory MFA."
      );
    } else {
      setText("authorizationModeTitle", "Dual-Super-Admin mode • active Super Admins: " + count);
      setText(
        "authorizationModeText",
        "More than one active Mainnet Super Admin exists. New role changes remain pending until a different active AAL2 Super Admin approves or rejects them. The requester and target cannot resolve the request."
      );
    }
  }

  function renderActiveAssignments(rows) {
    const host = $("activeAssignments");
    host.replaceChildren();
    const grants = Array.isArray(rows) ? rows : [];
    setText("assignmentCount", grants.length);

    const select = $("activeGrantSelect");
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select an active assignment";
    select.appendChild(placeholder);

    if (!grants.length) addText(host, "p", "empty-state", "No active financial-control assignments.");

    grants.forEach((grant) => {
      const id = uuid(grant.grant_id);
      const description = roleName(grant.role_code) + " • " +
        (grant.scope_type === "project" ? "Project " + (grant.project_id || "—") : "Global Mainnet") +
        " • " + (grant.target_user_id || "Unknown Admin");
      const card = document.createElement("article");
      card.className = "record-card";
      addText(card, "b", "record-title", roleName(grant.role_code));
      addText(card, "span", "record-meta", "Target Admin: " + (grant.target_user_id || "—"));
      addText(card, "span", "record-meta", "Scope: " + (grant.scope_type === "project" ? "Project • " + (grant.project_id || "—") : "Global Mainnet"));
      addText(card, "span", "record-meta", "Authorization: " + label(grant.authorization_mode || "legacy"));
      addText(card, "span", "record-meta", "Granted: " + date(grant.granted_at));
      addText(card, "span", "record-meta", "Grant ID: " + (id || "Invalid ID"));
      host.appendChild(card);

      if (id) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = description;
        select.appendChild(option);
      }
    });
  }

  function renderPendingRequests(rows, viewerId) {
    const host = $("pendingRequests");
    host.replaceChildren();
    const requests = Array.isArray(rows) ? rows : [];
    setText("pendingCount", requests.length);
    if (!requests.length) {
      addText(host, "p", "empty-state", "No pending independent-approval requests.");
      return;
    }

    requests.forEach((request) => {
      const requestId = uuid(request.request_id);
      const card = document.createElement("article");
      card.className = "record-card pending-card";
      addText(card, "b", "record-title", label(request.request_type) + " • " + roleName(request.role_code));
      addText(card, "span", "record-meta", "Target Admin: " + (request.target_user_id || "—"));
      addText(card, "span", "record-meta", "Scope: " + (request.scope_type === "project" ? "Project • " + (request.project_id || "—") : "Global Mainnet"));
      addText(card, "span", "record-meta", "Authorization: " + label(request.authorization_mode || "dual_super_admin"));
      addText(card, "span", "record-meta", "Requested by: " + (request.requested_by || "—") + " • " + date(request.requested_at));
      addText(card, "p", "record-reason", request.reason || "No reason supplied.");

      const actions = document.createElement("div");
      actions.className = "record-actions";
      const independent = !!viewerId && viewerId !== request.requested_by && viewerId !== request.target_user_id && !!requestId;
      const approve = document.createElement("button");
      approve.type = "button";
      approve.className = "primary compact";
      approve.textContent = "Approve";
      approve.disabled = !independent;
      approve.title = independent ? "Approve as a separate AAL2 Super Admin" : "The requester or target cannot approve this request.";
      approve.addEventListener("click", () => handleApprove(requestId, approve));
      actions.appendChild(approve);

      const reject = document.createElement("button");
      reject.type = "button";
      reject.className = "danger compact";
      reject.textContent = "Reject";
      reject.disabled = !independent;
      reject.title = independent ? "Reject as a separate AAL2 Super Admin" : "The requester or target cannot reject this request.";
      reject.addEventListener("click", () => handleReject(requestId, reject));
      actions.appendChild(reject);
      if (!independent) addText(actions, "span", "record-meta", "Independent approver required");
      card.appendChild(actions);
      host.appendChild(card);
    });
  }

  function renderEvents(rows) {
    const host = $("recentEvents");
    host.replaceChildren();
    const events = Array.isArray(rows) ? rows : [];
    setText("eventCount", events.length);
    if (!events.length) {
      addText(host, "p", "empty-state", "No financial-control governance events recorded yet.");
      return;
    }
    events.forEach((event) => {
      const card = document.createElement("article");
      card.className = "record-card event-card";
      addText(card, "b", "record-title", label(event.event_type));
      addText(card, "span", "record-meta", "Actor: " + (event.actor_user_id || "—") + " • " + date(event.created_at));
      if (event.request_id) addText(card, "span", "record-meta", "Request: " + event.request_id);
      addText(card, "p", "record-reason", event.reason || "—");
      host.appendChild(card);
    });
  }

  function validateWorkspace(data) {
    if (!data || typeof data !== "object" || data.success !== true || data.network !== "mainnet") {
      fail("Financial-control workspace returned an invalid or non-Mainnet response.");
    }
    if (!Array.isArray(data.catalog) || !Array.isArray(data.pending_requests) || !Array.isArray(data.active_assignments) || !Array.isArray(data.recent_events)) {
      fail("Financial-control workspace response is incomplete.");
    }
    if (adminContext && adminContext.user_id && data.viewer_user_id !== adminContext.user_id) {
      fail("Financial-control workspace viewer identity does not match the authenticated Admin.");
    }
    return data;
  }

  async function loadWorkspace() {
    financialStatus("Verifying AAL2 and loading the protected Mainnet workspace...");
    const data = validateWorkspace(await rpc(RPC.workspace, {}));
    renderAuthorizationMode(data);
    workspaceData = data;
    roleCatalog = data.catalog;
    loadRoleOptions();
    await loadEligibleTargets();
    renderPendingRequests(data.pending_requests, data.viewer_user_id);
    renderActiveAssignments(data.active_assignments);
    renderEvents(data.recent_events);
    $("financialControlWorkspace").hidden = false;
    applyRequestType();
    financialStatus("Financial-control workspace refreshed from the Mainnet security RPC.");
  }

  function applyRequestType() {
    const revoke = $("requestType").value === "revoke";
    $("activeGrantField").hidden = !revoke;
    $("activeGrantSelect").required = revoke;
    $("targetUserId").disabled = false;
    $("roleCode").disabled = revoke;
    $("scopeType").disabled = revoke;
    $("projectId").readOnly = revoke;
    if (!revoke) {
      $("activeGrantSelect").value = "";
      $("targetUserId").value = "";
      $("roleCode").value = "";
      $("scopeType").value = "global";
      $("projectId").value = "";
    }
    $("projectIdField").hidden = $("scopeType").value !== "project";
  }

  function applySelectedGrant() {
    const id = $("activeGrantSelect").value;
    const grant = (workspaceData && workspaceData.active_assignments || []).find((item) => item.grant_id === id);
    if (!grant) {
      $("targetUserId").value = "";
      $("roleCode").value = "";
      $("scopeType").value = "global";
      $("projectId").value = "";
      return;
    }
    setTargetOption(grant.target_user_id);
    $("roleCode").value = grant.role_code || "";
    $("scopeType").value = grant.scope_type || "global";
    $("projectId").value = grant.project_id || "";
    $("projectIdField").hidden = grant.scope_type !== "project";
  }

  async function submitRoleRequest(event) {
    event.preventDefault();
    const button = $("submitRoleRequest");
    try {
      const requestType = $("requestType").value;
      const targetUserId = uuid($("targetUserId").value);
      const roleCode = $("roleCode").value;
      const scopeType = $("scopeType").value;
      const validDirectoryTarget = eligibleTargets.some((row) => row.user_id === targetUserId);
      const selectedGrant = (workspaceData && workspaceData.active_assignments || []).find((item) => item.grant_id === $("activeGrantSelect").value);
      const validRevokeTarget = requestType === "revoke" && !!selectedGrant && selectedGrant.target_user_id === targetUserId;

      if (!targetUserId || (!validDirectoryTarget && !validRevokeTarget)) {
        fail("Select an active target returned by the protected Admin directory or an exact active assignment.");
      }
      if (!roleCatalog.some((item) => item.role_code === roleCode && item.enabled === true)) {
        fail("Select an enabled financial-control role from the server catalogue.");
      }
      if (!["global", "project"].includes(scopeType)) fail("Select a valid assignment scope.");
      const projectId = scopeType === "project" ? uuid($("projectId").value) : null;
      if (scopeType === "project" && !projectId) fail("Enter a valid approved Mainnet project UUID.");
      const reason = String($("requestReason").value || "").trim();
      if (reason.length < 10 || reason.length > 2000) fail("The reason must contain 10–2,000 characters.");
      const targetGrantId = requestType === "revoke" ? uuid($("activeGrantSelect").value) : null;
      if (requestType === "revoke" && !targetGrantId) fail("Select the exact active grant that is being revoked.");
      if (requestType === "grant" && targetUserId === (workspaceData && workspaceData.viewer_user_id)) {
        fail("A Super Admin cannot assign a financial-control role to themselves.");
      }

      button.disabled = true;
      button.textContent = "Submitting...";
      financialStatus("Submitting role-change request through the protected Mainnet RPC...");
      const result = await rpc(RPC.request, {
        p_request_type: requestType,
        p_target_user_id: targetUserId,
        p_role_code: roleCode,
        p_scope_type: scopeType,
        p_project_id: projectId,
        p_target_grant_id: targetGrantId,
        p_reason: reason
      });

      if (!result || result.success !== true || !["approved", "pending_second_approval"].includes(result.status)) {
        fail("The Mainnet security RPC did not confirm an approved or pending role change.");
      }
      if (!["single_super_admin", "dual_super_admin"].includes(result.authorization_mode)) {
        fail("The Mainnet security RPC did not identify the authorization mode.");
      }
      $("requestReason").value = "";
      let successMessage;
      if (result.authorization_mode === "single_super_admin" && result.status === "approved") {
        successMessage = "Role change approved and recorded by the sole active Mainnet Super Admin. The grant/revocation and audit events were committed atomically.";
      } else if (result.authorization_mode === "dual_super_admin" && result.status === "pending_second_approval") {
        successMessage = "Request recorded and awaiting a distinct active AAL2 Super Admin. It has not yet changed the role assignment.";
      } else {
        fail("The returned authorization mode and request status are inconsistent.");
      }
      try {
        await loadWorkspace();
        financialStatus(successMessage);
      } catch (refreshError) {
        console.error("[ALBUKHR FINANCIAL CONTROL REFRESH AFTER REQUEST]", refreshError);
        financialStatus(successMessage + " The change was confirmed by the RPC, but the refreshed register could not be loaded. Use Refresh to reload it.", true);
      }
    } catch (error) {
      console.error("[ALBUKHR FINANCIAL CONTROL REQUEST]", error);
      financialStatus(error && error.message || "Financial-control request failed.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Submit role-change request";
    }
  }

  async function handleApprove(requestId, button) {
    if (!requestId) return;
    if (!window.confirm("Approve this pending financial-control request? The database will verify that you are a different active AAL2 Super Admin from both requester and target.")) return;
    try {
      button.disabled = true;
      button.textContent = "Approving...";
      financialStatus("Submitting independent approval...");
      const result = await rpc(RPC.approve, { p_request_id: requestId });
      if (!result || result.success !== true || result.status !== "approved" || result.authorization_mode !== "dual_super_admin") {
        fail("The Mainnet RPC did not confirm a dual-Super-Admin approval.");
      }
      await loadWorkspace();
      financialStatus("The role-change request was approved by the independent Super Admin.");
    } catch (error) {
      console.error("[ALBUKHR FINANCIAL CONTROL APPROVAL]", error);
      financialStatus(error && error.message || "Independent approval failed.", true);
      button.disabled = false;
      button.textContent = "Approve";
    }
  }

  async function handleReject(requestId, button) {
    if (!requestId) return;
    const reason = window.prompt("Enter the rejection reason (10–2,000 characters):");
    if (reason === null) return;
    const normalized = String(reason).trim();
    if (normalized.length < 10 || normalized.length > 2000) {
      financialStatus("A rejection reason between 10 and 2,000 characters is required.", true);
      return;
    }
    try {
      button.disabled = true;
      button.textContent = "Rejecting...";
      financialStatus("Submitting independent rejection...");
      const result = await rpc(RPC.reject, { p_request_id: requestId, p_rejection_reason: normalized });
      if (!result || result.success !== true || result.status !== "rejected" || result.authorization_mode !== "dual_super_admin") {
        fail("The Mainnet RPC did not confirm a dual-Super-Admin rejection.");
      }
      await loadWorkspace();
      financialStatus("The request was rejected and the immutable audit event was recorded.");
    } catch (error) {
      console.error("[ALBUKHR FINANCIAL CONTROL REJECTION]", error);
      financialStatus(error && error.message || "Independent rejection failed.", true);
      button.disabled = false;
      button.textContent = "Reject";
    }
  }

  async function init() {
    try {
      const env = window.ALBukhrEnvironment;
      if (!env || typeof env.isKnown !== "function" || !env.isKnown() || !env.isMainnet()) {
        fail("Security & Access is available only on ALBUKHR MAINNET.");
      }
      const authApi = auth();
      await authApi.init();
      adminContext = await authApi.requireAdmin({ redirect: false });
      if (!adminContext) {
        window.location.replace(ADMIN_LOGIN_PAGE);
        return;
      }

      const mfa = await authApi.ensureMfa();
      let verifiedMfa = false;
      if (adminContext.mfa_required === true) {
        const assurance = await mainnetClient().auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance.error) throw assurance.error;
        verifiedMfa = !!mfa && mfa.verified === true && assurance.data && assurance.data.currentLevel === "aal2";
        if (!verifiedMfa) {
          window.location.replace(ADMIN_MFA_PAGE);
          return;
        }
      }

      displayAdminSummary(adminContext, { verified: verifiedMfa });
      status("Security authorization verified.");
      if (!legacyRoles().includes("super_admin")) {
        status("Security authorization verified. Financial Control Roles require an active Mainnet Super Admin.");
        return;
      }
      $("financialControlWorkspace").hidden = false;
      await loadWorkspace();
    } catch (error) {
      console.error("[ALBUKHR ADMIN SECURITY]", error);
      const message = error && error.message || "Admin security authorization failed.";
      status(message, true);
      financialStatus(message, true);
    }
  }

  $("logoutButton") && $("logoutButton").addEventListener("click", async () => {
    try {
      await auth().signOut();
    } finally {
      window.location.replace(ADMIN_LOGIN_PAGE);
    }
  });
  $("roleRequestForm") && $("roleRequestForm").addEventListener("submit", submitRoleRequest);
  $("requestType") && $("requestType").addEventListener("change", applyRequestType);
  $("scopeType") && $("scopeType").addEventListener("change", () => {
    $("projectIdField").hidden = $("scopeType").value !== "project";
  });
  $("activeGrantSelect") && $("activeGrantSelect").addEventListener("change", applySelectedGrant);
  $("financialRefreshButton") && $("financialRefreshButton").addEventListener("click", async () => {
    const button = $("financialRefreshButton");
    button.disabled = true;
    try {
      await loadWorkspace();
    } catch (error) {
      financialStatus(error && error.message || "Workspace refresh failed.", true);
    } finally {
      button.disabled = false;
    }
  });

  init();
})(window, document);
