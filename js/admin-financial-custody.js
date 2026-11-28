(function (window, document) {
  "use strict";

  const LOGIN_PAGE = "admin-login.html";
  const MFA_PAGE = "admin-mfa.html";
  const RPC = {
    directory: "get_financial_custody_project_directory",
    workspace: "get_financial_custody_project_workspace",
    account: "submit_financial_custody_account",
    evidence: "submit_financial_custody_evidence",
    snapshot: "record_financial_custody_balance_snapshot",
    evidenceReview: "review_financial_custody_evidence",
    snapshotReview: "review_financial_custody_balance_snapshot",
    verifyAccount: "verify_financial_custody_account",
    externalLink: "link_external_project_custody_account_by_finance"
  };

  const ROLE_LABELS = {
    finance_treasury: "Finance & Treasury",
    risk_compliance: "Risk & Compliance",
    governance: "Governance",
    custody_signer: "Custody Signer"
  };
  const PURPOSE_FUND_CLASS = {
    principal_custody: "principal",
    project_operating: "operating",
    investor_escrow: "escrow",
    reward_reserve: "reward_reserve",
    withdrawal_liquidity_reserve: "withdrawal_liquidity_reserve",
    general_treasury: "general_treasury",
    payout_clearing: "payout_clearing"
  };

  const $ = (id) => document.getElementById(id);
  let adminContext = null;
  let projectDirectory = [];
  let currentWorkspace = null;
  let selectedProjectId = null;
  let loading = false;

  function fail(message) {
    throw new Error(String(message || "ALBUKHR Global Custody authorization error."));
  }

  function text(value) {
    return value === null || value === undefined || value === "" ? "—" : String(value);
  }

  function label(value) {
    return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function status(message, isError) {
    const element = $("pageStatus");
    if (!element) return;
    element.textContent = message || "";
    element.className = "status" + (isError ? " error" : "");
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
    const environment = window.ALBukhrEnvironment;
    if (!environment || typeof environment.isKnown !== "function" || !environment.isKnown() || !environment.isMainnet()) {
      fail("Global Custody is available only on the configured ALBUKHR MAINNET environment.");
    }
    const core = window.ALBUKHR_SUPABASE;
    if (!core || !core.client || String(core.environment).toLowerCase() !== "mainnet" || String(core.network).toLowerCase() !== "mainnet") {
      fail("The authoritative Mainnet Supabase Core is unavailable or has the wrong network.");
    }
    return core.client;
  }

  function auth() {
    if (!window.AlbukhrSupabaseAdminAuth) fail("ALBUKHR Admin Auth is unavailable.");
    return window.AlbukhrSupabaseAdminAuth;
  }

  async function requireFreshAal2() {
    const authApi = auth();
    const preliminary = await authApi.requireAdmin({ redirect: false });
    if (!preliminary) {
      window.location.replace(LOGIN_PAGE);
      fail("An active Mainnet Admin session is required.");
    }
    if (preliminary.mfa_required !== true) {
      fail("Global Custody operations require mandatory MFA on the Admin account.");
    }

    const mfa = await authApi.ensureMfa();
    if (!mfa || mfa.required !== true || mfa.verified !== true) {
      window.location.replace(MFA_PAGE);
      fail("Complete MFA verification to AAL2 before using Global Custody.");
    }

    const assurance = await mainnetClient().auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    if (!assurance.data || assurance.data.currentLevel !== "aal2") {
      window.location.replace(MFA_PAGE);
      fail("The current session does not have AAL2 assurance.");
    }

    adminContext = await authApi.refreshAdminContext();
    if (!adminContext || adminContext.is_admin !== true || adminContext.status !== "active") {
      fail("The Mainnet security layer no longer recognizes this account as an active Admin.");
    }
    return adminContext;
  }

  async function rpc(name, parameters) {
    await requireFreshAal2();
    const result = await mainnetClient().schema("albukhr_security").rpc(name, parameters || {});
    if (result.error) throw result.error;
    return result.data;
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = String(content);
    return node;
  }

  function fieldLabel(caption, control, className) {
    const wrapper = element("label", className || "");
    wrapper.appendChild(element("span", "", caption));
    wrapper.appendChild(control);
    return wrapper;
  }

  function inputField(form, caption, name, options) {
    const config = options || {};
    const control = document.createElement("input");
    control.type = config.type || "text";
    control.name = name;
    control.required = config.required !== false;
    if (config.min !== undefined) control.min = String(config.min);
    if (config.max !== undefined) control.max = String(config.max);
    if (config.step !== undefined) control.step = String(config.step);
    if (config.minLength !== undefined) control.minLength = config.minLength;
    if (config.maxLength !== undefined) control.maxLength = config.maxLength;
    if (config.placeholder) control.placeholder = config.placeholder;
    if (config.pattern) control.pattern = config.pattern;
    if (config.value !== undefined) control.value = String(config.value);
    form.appendChild(fieldLabel(caption, control, config.className));
    return control;
  }

  function selectField(form, caption, name, options, config) {
    const settings = config || {};
    const control = document.createElement("select");
    control.name = name;
    control.required = settings.required !== false;
    (options || []).forEach((optionData) => {
      const option = document.createElement("option");
      option.value = String(optionData.value);
      option.textContent = String(optionData.label);
      if (optionData.disabled) option.disabled = true;
      if (optionData.selected) option.selected = true;
      control.appendChild(option);
    });
    form.appendChild(fieldLabel(caption, control, settings.className));
    return control;
  }

  function textareaField(form, caption, name, config) {
    const settings = config || {};
    const control = document.createElement("textarea");
    control.name = name;
    control.required = settings.required !== false;
    control.rows = settings.rows || 3;
    control.minLength = settings.minLength || 0;
    control.maxLength = settings.maxLength || 2000;
    control.placeholder = settings.placeholder || "";
    form.appendChild(fieldLabel(caption, control, settings.className));
    return control;
  }

  function optionList(items, valueKey, labelFn, emptyLabel) {
    const options = [{ value: "", label: emptyLabel || "Select an option" }];
    (items || []).forEach((item) => {
      options.push({ value: item[valueKey], label: labelFn(item) });
    });
    return options;
  }

  function datetimeValue(value) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) fail("A valid date and time is required.");
    return parsed.toISOString();
  }

  function formButton(form, caption, className) {
    const row = element("div", "inline-actions span-all");
    const button = element("button", className || "primary", caption);
    button.type = "submit";
    row.appendChild(button);
    form.appendChild(row);
    return button;
  }

  function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.textContent = busyText || "Submitting...";
    } else {
      button.disabled = false;
      button.textContent = button.dataset.originalText || button.textContent;
      delete button.dataset.originalText;
    }
  }

  async function runAction(button, action, successMessage) {
    setBusy(button, true, "Submitting...");
    try {
      await action();
      await loadWorkspace(selectedProjectId);
      status(successMessage || "The Mainnet custody operation was confirmed by the trusted RPC.");
    } catch (error) {
      console.error("[ALBUKHR GLOBAL CUSTODY]", error);
      status(error && error.message || "The Mainnet custody operation failed.", true);
    } finally {
      setBusy(button, false);
    }
  }

  function addFact(host, caption, value) {
    const fact = element("div", "fact");
    fact.appendChild(element("span", "", caption));
    fact.appendChild(element("b", "", text(value)));
    host.appendChild(fact);
  }

  function roleBadges(data) {
    const host = $("roleBadges");
    host.replaceChildren();
    const roles = data.roles || {};
    Object.keys(ROLE_LABELS).forEach((code) => {
      const badge = element("span", "role-badge" + (roles[code] === true ? " active" : ""), ROLE_LABELS[code] + (roles[code] === true ? " • ACTIVE" : " • NOT ASSIGNED"));
      host.appendChild(badge);
    });
  }

  function renderDirectory(data) {
    projectDirectory = data.projects || [];
    const select = $("projectSelect");
    select.replaceChildren();
    select.appendChild(element("option", "", projectDirectory.length ? "Select an authorized Mainnet project" : "No projects are available for this Admin"));
    projectDirectory.forEach((project) => {
      const option = document.createElement("option");
      option.value = project.project_id;
      option.textContent = String(project.project_name || "Unnamed project") + " • " + String(project.project_type || "project") + " • " + String(project.project_code || project.project_id);
      select.appendChild(option);
    });
    select.disabled = projectDirectory.length === 0;
    if (projectDirectory.length) {
      const preferred = projectDirectory.find((p) => p.project_id === selectedProjectId) || projectDirectory[0];
      select.value = preferred.project_id;
      selectedProjectId = preferred.project_id;
      return preferred.project_id;
    }
    selectedProjectId = null;
    return null;
  }

  function renderWorkspaceHeader(data) {
    const project = data.project || {};
    $("projectName").textContent = text(project.name);
    $("projectCode").textContent = text(project.project_code);
    $("projectType").textContent = label(project.project_type);
    $("projectStatus").textContent = label(project.status) + " • MAINNET";
    $("accountCount").textContent = Array.isArray(data.accounts) ? data.accounts.length : 0;
    const activeRoles = Object.keys(ROLE_LABELS).filter((code) => data.roles && data.roles[code] === true);
    $("authorizationMode").textContent = data.is_super_admin ? "SUPER ADMIN" : (activeRoles.length ? "FINANCIAL ROLE" : "NO ROLE");
    $("roleCount").textContent = activeRoles.length ? activeRoles.map((code) => ROLE_LABELS[code]).join(" • ") : "No project financial-control role assigned";

    const hasOperationalRole = activeRoles.length > 0;
    $("readOnlyNotice").hidden = !(data.is_super_admin === true && !hasOperationalRole);
    const caps = data.capabilities || {};
    $("accountRegistrationPanel").hidden = caps.can_submit_accounts !== true;
    roleBadges(data);
  }

  function appendEvidenceSubmission(article, account) {
    const details = document.createElement("details");
    details.className = "section-divider";
    details.appendChild(element("summary", "", "Submit custody evidence (Finance & Treasury)"));
    const form = element("form", "inline-form");
    const categoryOptions = [
      "account_ownership", "account_control", "fund_segregation", "liquidity_access",
      "balance_statement", "transaction_proof", "signer_authority", "independent_audit", "reconciliation_support"
    ].map((value) => ({ value, label: label(value) }));
    const sourceOptions = [
      "pi_horizon", "pi_platform_payment", "custodian_api", "custodian_signed_statement",
      "independent_auditor", "bank_statement", "owner_declaration", "screenshot", "uploaded_document", "other"
    ].map((value) => ({ value, label: label(value) }));
    selectField(form, "Evidence category", "evidence_category", categoryOptions);
    selectField(form, "Source kind", "source_kind", sourceOptions);
    inputField(form, "Source authority", "source_authority", { required: false, maxLength: 300, placeholder: "Required for PI Horizon / custodian / auditor evidence" });
    inputField(form, "Evidence reference", "evidence_reference", { required: true, maxLength: 1000, placeholder: "Document or system reference" });
    inputField(form, "Source record reference", "source_record_reference", { required: false, maxLength: 500 });
    inputField(form, "Content SHA-256", "content_sha256", { required: true, minLength: 64, maxLength: 64, pattern: "[0-9a-fA-F]{64}", placeholder: "64 hexadecimal characters", className: "span-all" });
    inputField(form, "Source observed at", "source_observed_at", { type: "datetime-local", required: true });
    inputField(form, "Issued at (optional)", "issued_at", { type: "datetime-local", required: false });
    inputField(form, "Expires at (optional)", "expires_at", { type: "datetime-local", required: false });
    inputField(form, "Private storage bucket (uploaded document only)", "storage_bucket", { required: false, maxLength: 200 });
    inputField(form, "Private storage path (uploaded document only)", "storage_path", { required: false, maxLength: 1000 });
    textareaField(form, "Submission reason", "reason", { minLength: 10, maxLength: 2000, placeholder: "Explain the source and relevance of this evidence." , className: "span-all" });
    const button = formButton(form, "Submit evidence", "primary");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = new FormData(form);
      runAction(button, async () => {
        const result = await rpc(RPC.evidence, {
          p_account_id: account.account_id,
          p_evidence_category: values.get("evidence_category"),
          p_source_kind: values.get("source_kind"),
          p_source_authority: String(values.get("source_authority") || "").trim() || null,
          p_evidence_reference: String(values.get("evidence_reference") || "").trim(),
          p_storage_bucket: String(values.get("storage_bucket") || "").trim() || null,
          p_storage_path: String(values.get("storage_path") || "").trim() || null,
          p_content_sha256: String(values.get("content_sha256") || "").trim().toLowerCase(),
          p_source_record_reference: String(values.get("source_record_reference") || "").trim() || null,
          p_issued_at: datetimeValue(values.get("issued_at")),
          p_source_observed_at: datetimeValue(values.get("source_observed_at")),
          p_expires_at: datetimeValue(values.get("expires_at")),
          p_metadata: {},
          p_reason: String(values.get("reason") || "").trim()
        });
        requireSuccess(result);
      }, "Custody evidence submitted for independent Risk & Compliance review.");
    });
    details.appendChild(form);
    article.appendChild(details);
  }

  function appendSnapshotSubmission(article, account) {
    const balanceEvidence = (account.evidence || []).filter((item) => item.evidence_category === "balance_statement");
    const details = document.createElement("details");
    details.className = "section-divider";
    details.appendChild(element("summary", "", "Record a balance snapshot (Finance & Treasury)"));
    const form = element("form", "inline-form");
    selectField(form, "Current balance-statement evidence", "evidence_id", optionList(balanceEvidence, "evidence_id", (item) => label(item.source_kind) + " • " + item.evidence_id, "Select current balance evidence"));
    inputField(form, "Total balance (PI)", "total_balance", { type: "number", min: 0, step: "any" });
    inputField(form, "Available balance (PI)", "available_balance", { type: "number", min: 0, step: "any" });
    inputField(form, "Frozen balance (PI)", "frozen_balance", { type: "number", min: 0, step: "any", value: "0" });
    inputField(form, "Pledged balance (PI)", "pledged_balance", { type: "number", min: 0, step: "any", value: "0" });
    inputField(form, "Encumbered balance (PI)", "encumbered_balance", { type: "number", min: 0, step: "any", value: "0" });
    inputField(form, "Unclassified balance (PI)", "unclassified_balance", { type: "number", min: 0, step: "any", value: "0" });
    inputField(form, "Source observed at", "source_observed_at", { type: "datetime-local", required: true });
    inputField(form, "Source snapshot reference", "source_snapshot_reference", { required: true, maxLength: 500 });
    textareaField(form, "Reason", "reason", { minLength: 10, maxLength: 2000, placeholder: "Explain how the amounts were sourced and reconciled.", className: "span-all" });
    const button = formButton(form, "Record balance snapshot", "primary");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = new FormData(form);
      runAction(button, async () => {
        if (!values.get("evidence_id")) fail("Select the current verified-source balance-statement evidence.");
        const result = await rpc(RPC.snapshot, {
          p_account_id: account.account_id,
          p_evidence_id: values.get("evidence_id"),
          p_total_balance: String(values.get("total_balance")),
          p_available_balance: String(values.get("available_balance")),
          p_frozen_balance: String(values.get("frozen_balance")),
          p_pledged_balance: String(values.get("pledged_balance")),
          p_encumbered_balance: String(values.get("encumbered_balance")),
          p_unclassified_balance: String(values.get("unclassified_balance")),
          p_source_observed_at: datetimeValue(values.get("source_observed_at")),
          p_source_snapshot_reference: String(values.get("source_snapshot_reference") || "").trim(),
          p_metadata: {},
          p_reason: String(values.get("reason") || "").trim()
        });
        requireSuccess(result);
      }, "The immutable balance snapshot was recorded and its digest was calculated by Mainnet.");
    });
    details.appendChild(form);
    article.appendChild(details);
  }

  function appendEvidenceReview(article, account, evidence) {
    const review = evidence.latest_review || null;
    const latestReview = review ? label(review.event_type) + " • " + date(review.created_at) : "Awaiting Risk & Compliance review";
    const item = element("div", "evidence-item");
    item.appendChild(element("strong", "", label(evidence.evidence_category) + " • " + label(evidence.source_kind)));
    item.appendChild(element("small", "", "Reference: " + text(evidence.evidence_reference)));
    item.appendChild(element("small", "", "SHA-256: " + text(evidence.content_sha256)));
    item.appendChild(element("small", "", "Observed: " + date(evidence.source_observed_at) + " • Expires: " + date(evidence.expires_at)));
    item.appendChild(element("small", "", "Latest Risk decision: " + latestReview));
    if (review && review.reason) item.appendChild(element("p", "", "Review note: " + review.reason));

    if (currentWorkspace && currentWorkspace.capabilities && currentWorkspace.capabilities.can_review === true) {
      const details = document.createElement("details");
      details.appendChild(element("summary", "", "Record independent Risk & Compliance decision"));
      const form = element("form", "inline-form");
      selectField(form, "Decision", "decision", [{ value: "verified", label: "Verify evidence" }, { value: "rejected", label: "Reject evidence" }]);
      inputField(form, "Independent authority reference", "authority_reference", { required: true, minLength: 3, maxLength: 500 });
      textareaField(form, "Review reason", "reason", { minLength: 10, maxLength: 2000, placeholder: "Explain the independent review and decision.", className: "span-all" });
      const button = formButton(form, "Submit evidence decision", "primary");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const values = new FormData(form);
        runAction(button, async () => {
          const result = await rpc(RPC.evidenceReview, {
            p_evidence_id: evidence.evidence_id,
            p_decision: values.get("decision"),
            p_reason: String(values.get("reason") || "").trim(),
            p_authority_reference: String(values.get("authority_reference") || "").trim()
          });
          requireSuccess(result);
        }, "Risk & Compliance evidence review recorded.");
      });
      details.appendChild(form);
      item.appendChild(details);
    }
    return item;
  }

  function appendSnapshotReview(article, account) {
    const snapshot = account.latest_snapshot;
    if (!snapshot) return;
    const review = snapshot.latest_review || null;
    const section = element("div", "evidence-item");
    section.appendChild(element("strong", "", "Latest balance snapshot • " + (snapshot.digest_valid ? "Digest valid" : "Digest invalid")));
    section.appendChild(element("small", "", "Total: " + text(snapshot.total_balance) + " PI • Available: " + text(snapshot.available_balance) + " PI"));
    section.appendChild(element("small", "", "Frozen: " + text(snapshot.frozen_balance) + " • Pledged: " + text(snapshot.pledged_balance) + " • Encumbered: " + text(snapshot.encumbered_balance) + " • Unclassified: " + text(snapshot.unclassified_balance) + " PI"));
    section.appendChild(element("small", "", "Reference: " + text(snapshot.source_snapshot_reference) + " • Observed: " + date(snapshot.source_observed_at)));
    section.appendChild(element("small", "", "Latest Risk decision: " + (review ? label(review.event_type) + " • " + date(review.created_at) : "Awaiting independent review")));
    if (currentWorkspace && currentWorkspace.capabilities && currentWorkspace.capabilities.can_review === true) {
      const details = document.createElement("details");
      details.appendChild(element("summary", "", "Record independent snapshot review"));
      const form = element("form", "inline-form");
      selectField(form, "Decision", "decision", [{ value: "verified", label: "Verify snapshot" }, { value: "rejected", label: "Reject snapshot" }]);
      inputField(form, "Independent authority reference", "authority_reference", { required: true, minLength: 3, maxLength: 500 });
      textareaField(form, "Review reason", "reason", { minLength: 10, maxLength: 2000, placeholder: "Explain the independent balance reconciliation and decision.", className: "span-all" });
      const button = formButton(form, "Submit snapshot decision", "primary");
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const values = new FormData(form);
        runAction(button, async () => {
          const result = await rpc(RPC.snapshotReview, {
            p_snapshot_id: snapshot.snapshot_id,
            p_decision: values.get("decision"),
            p_reason: String(values.get("reason") || "").trim(),
            p_authority_reference: String(values.get("authority_reference") || "").trim()
          });
          requireSuccess(result);
        }, "Risk & Compliance balance snapshot review recorded.");
      });
      details.appendChild(form);
      section.appendChild(details);
    }
    article.appendChild(section);
  }

  function appendGovernanceVerification(article, account) {
    const caps = currentWorkspace && currentWorkspace.capabilities || {};
    if (caps.can_verify_accounts !== true) return;
    const details = document.createElement("details");
    details.className = "section-divider";
    details.appendChild(element("summary", "", "Final Governance verification"));
    const form = element("form", "inline-form");
    inputField(form, "Governance authority reference", "authority_reference", { required: true, minLength: 3, maxLength: 500 });
    textareaField(form, "Final verification reason", "reason", { minLength: 10, maxLength: 2000, placeholder: "Confirm the independent ownership, control, segregation, evidence and balance checks.", className: "span-all" });
    const button = formButton(form, "Verify custody account", "primary");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = new FormData(form);
      runAction(button, async () => {
        const result = await rpc(RPC.verifyAccount, {
          p_account_id: account.account_id,
          p_reason: String(values.get("reason") || "").trim(),
          p_authority_reference: String(values.get("authority_reference") || "").trim()
        });
        requireSuccess(result);
      }, "Governance verification recorded. The database confirmed all required independent controls.");
    });
    details.appendChild(form);
    article.appendChild(details);
  }

  function renderAccounts(data) {
    const host = $("accounts");
    host.replaceChildren();
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    const verifiedCount = accounts.filter((account) => account.verified === true).length;
    $("verifiedCount").textContent = verifiedCount + " verified";
    const supersedes = $("supersedesAccount");
    if (supersedes) {
      supersedes.replaceChildren();
      supersedes.appendChild(element("option", "", "New account / no predecessor"));
      accounts.forEach((account) => {
        const option = document.createElement("option");
        option.value = account.account_id;
        option.textContent = label(account.fund_class) + " • " + account.account_reference + " • v" + account.version_number;
        supersedes.appendChild(option);
      });
    }

    if (!accounts.length) {
      host.appendChild(element("div", "empty", "No Global Custody accounts are registered for this Mainnet project."));
      return;
    }

    accounts.forEach((account) => {
      const card = element("article", "account-card");
      const head = element("div", "account-head");
      const titleWrap = element("div", "");
      titleWrap.appendChild(element("h3", "", label(account.fund_class) + " • " + text(account.custody_provider)));
      titleWrap.appendChild(element("p", "", "Reference: " + text(account.account_reference) + " • Version " + text(account.version_number) + " • " + label(account.custody_model)));
      head.appendChild(titleWrap);
      head.appendChild(element("span", "pill " + (account.verified ? "ready" : "pending"), account.verified ? "VERIFIED" : "NOT VERIFIED"));
      card.appendChild(head);

      const facts = element("div", "facts");
      addFact(facts, "Account type", label(account.account_type));
      addFact(facts, "Public address", account.public_account_address || "Not supplied");
      addFact(facts, "Submitted", date(account.submitted_at));
      addFact(facts, "Submitter reference", account.submitted_by_ref || "—");
      addFact(facts, "Asset / network", "PI • MAINNET");
      addFact(facts, "Supersedes", account.supersedes_account_id || "No predecessor");
      card.appendChild(facts);

      const evidenceSection = element("div", "section-divider evidence-list");
      evidenceSection.appendChild(element("h3", "", "Evidence register"));
      const evidence = Array.isArray(account.evidence) ? account.evidence : [];
      if (!evidence.length) evidenceSection.appendChild(element("div", "empty", "No evidence submitted for this account."));
      evidence.forEach((item) => evidenceSection.appendChild(appendEvidenceReview(card, account, item)));
      card.appendChild(evidenceSection);

      if (account.latest_snapshot) appendSnapshotReview(card, account);
      else card.appendChild(element("div", "record-meta", "No balance snapshot recorded."));

      const caps = data.capabilities || {};
      if (caps.can_submit_evidence === true) appendEvidenceSubmission(card, account);
      if (caps.can_record_snapshots === true) appendSnapshotSubmission(card, account);
      appendGovernanceVerification(card, account);
      host.appendChild(card);
    });
  }

  function renderExternalCustody(data) {
    const panel = $("externalCustodyPanel");
    const external = data.external_custody;
    const isExternal = String(data.project && data.project.project_type || "").toLowerCase() === "external";
    panel.hidden = !isExternal || !external;
    if (panel.hidden) return;

    const profile = external.profile;
    const summary = $("externalProfileSummary");
    summary.replaceChildren();
    summary.appendChild(element("b", "", "External application: " + text(external.application_code)));
    if (profile) {
      summary.appendChild(element("p", "", "Custody profile " + text(profile.profile_id) + " • v" + text(profile.version_number) + " • " + label(profile.status) + " • Requirement: " + label(profile.custody_requirement) + " • Model: " + label(profile.custody_model)));
    } else {
      summary.appendChild(element("p", "", "No converted-project custody profile is available yet. The workspace will not create one automatically."));
    }

    const linksHost = $("externalLinks");
    linksHost.replaceChildren();
    const links = Array.isArray(external.linked_accounts) ? external.linked_accounts : [];
    if (!links.length) linksHost.appendChild(element("div", "empty", "No verified Global Custody accounts are linked to this External profile."));
    links.forEach((link) => {
      const row = element("article", "record-card");
      row.appendChild(element("strong", "", label(link.purpose_code) + " • " + text(link.fund_class)));
      row.appendChild(element("span", "record-meta", "Account: " + text(link.account_reference) + " • " + (link.is_required ? "Required" : "Optional")));
      row.appendChild(element("span", "record-meta", "Linked: " + date(link.linked_at) + " • " + (link.verified ? "Verified" : "Not currently verified")));
      linksHost.appendChild(row);
    });

    const readiness = external.readiness || {};
    const readinessHost = $("externalReadiness");
    readinessHost.replaceChildren();
    readinessHost.appendChild(element("b", "", "Global custody readiness: " + (readiness.ready === true ? "READY" : label(readiness.status || "BLOCKED"))));
    const blockers = Array.isArray(readiness.blockers) ? readiness.blockers : [];
    if (blockers.length) {
      const list = document.createElement("ul");
      blockers.forEach((blocker) => list.appendChild(element("li", "", label(blocker))));
      readinessHost.appendChild(list);
    }

    const caps = data.capabilities || {};
    const form = $("externalLinkForm");
    form.hidden = !(profile && caps.can_link_external_custody === true);
    const accountSelect = $("externalAccountSelect");
    accountSelect.replaceChildren();
    const purpose = $("externalPurpose");
    const selectedPurpose = purpose.value || "principal_custody";
    const fundClass = PURPOSE_FUND_CLASS[selectedPurpose];
    const eligible = (data.accounts || []).filter((account) => account.verified === true && account.fund_class === fundClass);
    accountSelect.appendChild(element("option", "", eligible.length ? "Select verified PI account" : "No verified account matches this purpose"));
    eligible.forEach((account) => {
      const option = document.createElement("option");
      option.value = account.account_id;
      option.textContent = account.account_reference + " • " + label(account.fund_class) + " • v" + account.version_number;
      accountSelect.appendChild(option);
    });
    accountSelect.disabled = eligible.length === 0;
  }

  function renderEvents(data) {
    const host = $("reviewEvents");
    host.replaceChildren();
    const rows = Array.isArray(data.review_events) ? data.review_events : [];
    if (!rows.length) {
      host.appendChild(element("div", "empty", "No Global Custody events have been recorded for this project."));
      return;
    }
    rows.forEach((row) => {
      const card = element("article", "record-card");
      card.appendChild(element("strong", "", label(row.event_type) + " • " + label(row.reviewer_role_code)));
      card.appendChild(element("span", "record-meta", date(row.created_at) + " • Actor: " + text(row.reviewer_admin_user_id)));
      if (row.reason) card.appendChild(element("p", "record-reason", row.reason));
      if (row.authority_reference) card.appendChild(element("span", "record-meta", "Authority: " + row.authority_reference));
      host.appendChild(card);
    });
  }

  function requireSuccess(result) {
    if (!result || result.success !== true) {
      fail(result && result.message || "Mainnet RPC did not confirm the requested operation.");
    }
    return result;
  }

  async function loadWorkspace(projectId) {
    if (loading) return;
    const validProjectId = uuid(projectId);
    if (!validProjectId) fail("Select a valid project from the authorized Mainnet project directory.");
    loading = true;
    status("Refreshing the selected Mainnet project's Global Custody records...");
    try {
      const data = requireSuccess(await rpc(RPC.workspace, { p_project_id: validProjectId }));
      if (data.network !== "mainnet" || !data.project || data.project.id !== validProjectId) {
        fail("The custody workspace response is not bound to the selected Mainnet project.");
      }
      currentWorkspace = data;
      selectedProjectId = validProjectId;
      $("workspace").hidden = false;
      renderWorkspaceHeader(data);
      renderAccounts(data);
      renderExternalCustody(data);
      renderEvents(data);
      status("Mainnet Global Custody workspace refreshed. No payment or wallet movement was performed.");
    } finally {
      loading = false;
    }
  }

  async function loadDirectory() {
    status("Verifying authorization and loading Mainnet project scope...");
    const data = requireSuccess(await rpc(RPC.directory, {}));
    if (data.network !== "mainnet" || data.authorized !== true) fail("The project directory did not confirm Mainnet authorization.");
    const initialProject = renderDirectory(data);
    if (!initialProject) {
      $("workspace").hidden = true;
      status("No approved or active Mainnet project is assigned to this Admin's financial-control scope.", true);
      return;
    }
    await loadWorkspace(initialProject);
  }

  function bindAccountForm() {
    const form = $("accountForm");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = new FormData(form);
      const button = form.querySelector("button[type='submit']");
      runAction(button, async () => {
        const result = await rpc(RPC.account, {
          p_project_id: selectedProjectId,
          p_fund_class: values.get("fund_class"),
          p_account_type: values.get("account_type"),
          p_custody_model: values.get("custody_model"),
          p_custody_provider: String(values.get("custody_provider") || "").trim(),
          p_account_reference: String(values.get("account_reference") || "").trim(),
          p_public_account_address: String(values.get("public_account_address") || "").trim() || null,
          p_legal_account_holder: String(values.get("legal_account_holder") || "").trim() || null,
          p_supersedes_account_id: String(values.get("supersedes_account_id") || "").trim() || null,
          p_reason: String(values.get("reason") || "").trim(),
          p_metadata: {}
        });
        requireSuccess(result);
        form.reset();
      }, "Custody account version submitted. Independent evidence and review are still required.");
    });
  }

  function bindExternalLinkForm() {
    const form = $("externalLinkForm");
    const purpose = $("externalPurpose");
    purpose.addEventListener("change", () => renderExternalCustody(currentWorkspace || {}));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const external = currentWorkspace && currentWorkspace.external_custody;
      const profile = external && external.profile;
      if (!profile || !uuid(profile.profile_id)) {
        status("A converted Mainnet External custody profile is required before account linking.", true);
        return;
      }
      const values = new FormData(form);
      const button = form.querySelector("button[type='submit']");
      runAction(button, async () => {
        const result = await rpc(RPC.externalLink, {
          p_profile_id: profile.profile_id,
          p_account_id: values.get("account_id"),
          p_purpose_code: values.get("purpose_code"),
          p_is_required: values.get("is_required") === "on",
          p_reason: String(values.get("reason") || "").trim(),
          p_metadata: {}
        });
        requireSuccess(result);
        form.reset();
      }, "Verified account link recorded for this exact converted External Mainnet project.");
    });
  }

  async function init() {
    try {
      const environment = window.ALBukhrEnvironment;
      if (!environment || !environment.isKnown() || !environment.isMainnet()) {
        fail("Global Custody is Mainnet-only. Testnet and unknown environments are rejected.");
      }
      await auth().init();
      adminContext = await auth().requireAdmin({ redirect: false });
      if (!adminContext) {
        window.location.replace(LOGIN_PAGE);
        return;
      }
      if (adminContext.mfa_required !== true) fail("Admin account MFA is not configured as mandatory.");
      const mfa = await auth().ensureMfa();
      const assurance = await mainnetClient().auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error) throw assurance.error;
      if (!mfa || mfa.verified !== true || !assurance.data || assurance.data.currentLevel !== "aal2") {
        window.location.replace(MFA_PAGE);
        return;
      }
      adminContext = await auth().refreshAdminContext();
      if (!adminContext || adminContext.is_admin !== true || adminContext.status !== "active") {
        fail("An active Mainnet Admin account is required.");
      }
      $("securityState").textContent = "MAINNET • AAL2 VERIFIED";
      bindAccountForm();
      bindExternalLinkForm();
      await loadDirectory();
    } catch (error) {
      console.error("[ALBUKHR GLOBAL CUSTODY INIT]", error);
      status(error && error.message || "Global Custody authorization failed.", true);
      $("securityState").textContent = "ACCESS BLOCKED";
    }
  }

  $("logoutButton").addEventListener("click", async () => {
    try {
      await auth().signOut();
    } finally {
      window.location.replace(LOGIN_PAGE);
    }
  });

  $("projectSelect").addEventListener("change", async () => {
    const projectId = uuid($("projectSelect").value);
    if (!projectId) return;
    selectedProjectId = projectId;
    try {
      await loadWorkspace(projectId);
    } catch (error) {
      status(error && error.message || "Project workspace could not be loaded.", true);
    }
  });

  $("refreshButton").addEventListener("click", async () => {
    const button = $("refreshButton");
    setBusy(button, true, "Refreshing...");
    try {
      await loadDirectory();
    } catch (error) {
      status(error && error.message || "Mainnet workspace refresh failed.", true);
    } finally {
      setBusy(button, false);
    }
  });

  init();
})(window, document);
