(function (window, document) {
  "use strict";

  const REQUIRED_DISCLOSURE_SECTIONS = Object.freeze([
    "project_overview",
    "ownership_and_control",
    "business_and_operations",
    "funding_and_use_of_funds",
    "investment_terms",
    "risk_disclosure",
    "due_diligence_summary",
    "custody_and_fund_controls",
    "legal_and_regulatory",
    "related_parties_and_conflicts",
    "fees_and_costs",
    "reporting_and_reconciliation",
    "assumptions_and_limitations",
    "investor_rights_and_obligations",
    "documents_and_references",
    "material_events"
  ]);

  const state = {
    admin: null,
    applications: [],
    applicationId: null,
    termsWorkspace: null,
    disclosureWorkspace: null,
    busy: false
  };

  const $ = (id) => document.getElementById(id);
  const auth = () => window.AlbukhrSupabaseAdminAuth;
  const client = () => window.ALBUKHR_SUPABASE && window.ALBUKHR_SUPABASE.client;

  function setStatus(message, isError) {
    const el = $("pageStatus");
    if (!el) return;
    el.textContent = String(message || "");
    el.className = "status" + (isError ? " error" : "");
  }

  function normalizeStatus(value) {
    return String(value || "not_started").trim().toLowerCase();
  }

  function displayStatus(value) {
    return normalizeStatus(value).replaceAll("_", " ").toUpperCase();
  }

  function setPill(element, value) {
    const normalized = normalizeStatus(value);
    element.textContent = displayStatus(normalized);
    element.className = "state-pill";
    if (["approved", "published", "ready"].includes(normalized)) element.classList.add(normalized);
    if (["rejected", "blocked"].includes(normalized)) element.classList.add(normalized);
    if (["under_review", "revision_requested"].includes(normalized)) element.classList.add(normalized);
  }

  function asObject(value, fieldName) {
    let parsed;
    try {
      parsed = JSON.parse(String(value || "{}").trim() || "{}");
    } catch (error) {
      throw new Error(fieldName + " must contain valid JSON: " + error.message);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(fieldName + " must be a JSON object.");
    }
    return parsed;
  }

  function optionalNumber(id, label) {
    const raw = $(id).value.trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(label + " must be a positive number.");
    }
    return value;
  }

  function optionalInteger(id, label) {
    const raw = $(id).value.trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(label + " must be a positive whole number.");
    }
    return value;
  }

  function optionalDateTime(id, label) {
    const raw = $(id).value.trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) throw new Error(label + " is not a valid date/time.");
    return parsed.toISOString();
  }

  function toDateTimeLocal(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (number) => String(number).padStart(2, "0");
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
      "T" + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function toDateInput(value) {
    if (!value) return "";
    const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (number) => String(number).padStart(2, "0");
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function jsonText(value) {
    if (value === null || value === undefined || value === "") return "{}";
    try { return JSON.stringify(value, null, 2); }
    catch (_) { return "{}"; }
  }

  async function assertAal2() {
    const supabase = client();
    if (!supabase || !supabase.auth || !supabase.auth.mfa) {
      throw new Error("Mainnet Supabase Auth MFA client is unavailable.");
    }
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    if (data && data.currentLevel === "aal2") return true;
    window.location.replace("admin-mfa.html");
    throw new Error("AAL2 verification is required. Complete administrator MFA and return to this page.");
  }

  async function rpc(name, parameters) {
    const supabase = client();
    if (!supabase || typeof supabase.schema !== "function") {
      throw new Error("ALBUKHR Mainnet Supabase Core is unavailable.");
    }
    const { data, error } = await supabase.schema("albukhr_security").rpc(name, parameters || {});
    if (error) throw error;
    if (data && data.success === false) {
      throw new Error(data.message || (name + " was rejected by the trusted Mainnet RPC."));
    }
    return data;
  }

  function ensureGlobalReviewer(admin) {
    const roles = Array.isArray(admin && admin.roles) ? admin.roles : [];
    if (!roles.includes("super_admin") && !roles.includes("approval_admin")) {
      throw new Error("Global External review authority is required. Project-scoped External Admin access does not grant Terms or Disclosure publication authority.");
    }
  }

  async function verifyAdminSession() {
    const environment = window.ALBukhrEnvironment;
    if (!environment || typeof environment.isMainnet !== "function" || !environment.isMainnet()) {
      throw new Error("Terms and Disclosure governance is available only on the approved ALBUKHR Mainnet Admin host.");
    }
    if (!auth() || typeof auth().init !== "function" || typeof auth().requireAdmin !== "function") {
      throw new Error("ALBUKHR Admin Auth Core is unavailable.");
    }
    await auth().init();
    const admin = await auth().requireAdmin({ redirect: false, preserveSessionOnContextError: true });
    if (!admin) {
      window.location.replace("admin-login.html");
      throw new Error("An active Mainnet administrator session is required.");
    }
    ensureGlobalReviewer(admin);
    state.admin = admin;
    const mfa = await auth().ensureMfa();
    if (admin.mfa_required && (!mfa || !mfa.verified)) {
      window.location.replace("admin-mfa.html");
      throw new Error("Administrator MFA verification is required.");
    }
    await assertAal2();
    $("securityState").textContent = "AAL2 · GLOBAL REVIEWER";
  }

  function currentApplication() {
    return state.applications.find((item) => String(item.id) === String(state.applicationId)) || null;
  }

  function renderApplicationOptions() {
    const filter = $("statusFilter").value;
    const select = $("applicationSelect");
    const rows = state.applications.filter((row) => !filter || normalizeStatus(row.status) === filter);
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = rows.length ? "Choose an External application…" : "No applications in this filter";
    select.appendChild(placeholder);
    for (const row of rows) {
      const option = document.createElement("option");
      option.value = String(row.id);
      const title = row.project_name || row.business_name || row.application_code || "External Project";
      const code = row.application_code || row.project_code || "No code";
      option.textContent = title + " · " + code + " · " + displayStatus(row.status);
      select.appendChild(option);
    }
    select.disabled = rows.length === 0 || state.busy;
    const selected = rows.find((row) => String(row.id) === String(state.applicationId));
    if (selected) select.value = String(selected.id);
    else if (rows.length) select.value = String(rows[0].id);
    state.applicationId = select.value || null;
  }

  async function loadQueue() {
    setStatus("Loading Mainnet External application queue…");
    await assertAal2();
    const data = await rpc("get_external_project_applications", { p_status: null });
    if (!data || data.authorized !== true || data.network !== "mainnet") {
      throw new Error(data && data.message ? data.message : "Global External application queue authorization failed.");
    }
    state.applications = Array.isArray(data.records) ? data.records : [];
    renderApplicationOptions();
    if (!state.applicationId) {
      state.termsWorkspace = null;
      state.disclosureWorkspace = null;
      $("workspace").hidden = true;
      $("emptyWorkspace").hidden = false;
      setStatus(state.applications.length ? "Select an application to open its governance workspace." : "No External applications are currently available.");
      return;
    }
    await loadWorkspace(state.applicationId);
  }

  function setSummary(id, value) {
    $(id).textContent = value === null || value === undefined || value === "" ? "—" : String(value);
  }

  function renderSummary() {
    const terms = state.termsWorkspace || {};
    const app = terms.application || (state.disclosureWorkspace && state.disclosureWorkspace.application) || currentApplication() || {};
    const funding = terms.funding || {};
    const custody = terms.custody || {};
    setSummary("applicationName", app.project_name || app.business_name || "External Project");
    setSummary("applicationCode", app.application_code || app.project_code || "—");
    setSummary("applicationStatus", displayStatus(app.status));
    setSummary("networkValue", app.network ? String(app.network).toUpperCase() : "MAINNET");
    setSummary("fundingStatus", funding.status ? displayStatus(funding.status) : "NOT ASSESSED");
    setSummary("fundingAmount", funding.approved_capital_requirement === null || funding.approved_capital_requirement === undefined
      ? "No approved capital figure"
      : Number(funding.approved_capital_requirement).toLocaleString() + " " + String(app.funding_asset || "PI").toUpperCase());
    setSummary("custodyStatus", custody.readiness_status ? displayStatus(custody.readiness_status) : "NOT ASSESSED");
    setSummary("custodyModel", custody.custody_model || "No custody model recorded");
  }

  function populateTerms() {
    const workspace = state.termsWorkspace || {};
    const term = workspace.terms && workspace.terms.id ? workspace.terms : null;
    const status = term ? normalizeStatus(term.term_status) : "not_started";
    setPill($("termsStatus"), status);
    $("termsDigest").textContent = "Terms SHA-256: " + (term && term.term_content_sha256 ? term.term_content_sha256 : "not published");
    const values = {
      investmentModel: term && term.investment_model,
      assetCode: term && term.asset_code,
      targetCapital: term && term.target_capital_requirement,
      minimumInvestment: term && term.minimum_investment,
      maximumInvestment: term && term.maximum_investment,
      termDurationDays: term && term.term_duration_days,
      fundingWindowStart: term && toDateTimeLocal(term.funding_window_start),
      fundingWindowEnd: term && toDateTimeLocal(term.funding_window_end),
      returnModel: term && jsonText(term.return_model),
      principalPolicy: term && jsonText(term.principal_policy),
      exitPolicy: term && jsonText(term.exit_policy),
      feePolicy: term && jsonText(term.fee_policy),
      distributionPolicy: term && jsonText(term.distribution_policy),
      defaultPolicy: term && jsonText(term.default_policy),
      conditions: term && jsonText(term.conditions),
      custodyReference: term && jsonText(term.custody_reference),
      disclosureReference: term && jsonText(term.disclosure_reference),
      consentReference: term && jsonText(term.consent_reference),
      termsNotes: term && term.notes
    };
    for (const [id, value] of Object.entries(values)) $(id).value = value === null || value === undefined ? (id === "returnModel" || id === "principalPolicy" || id === "exitPolicy" || id === "feePolicy" || id === "distributionPolicy" || id === "defaultPolicy" || id === "conditions" || id === "custodyReference" || id === "disclosureReference" || id === "consentReference" ? "{}" : "") : String(value);

    const editable = !!term && ["draft", "revision_requested"].includes(status);
    const hasTerm = !!term;
    for (const id of ["investmentModel","assetCode","targetCapital","minimumInvestment","maximumInvestment","termDurationDays","fundingWindowStart","fundingWindowEnd","returnModel","principalPolicy","exitPolicy","feePolicy","distributionPolicy","defaultPolicy","conditions","custodyReference","disclosureReference","consentReference","termsNotes"]) {
      $(id).disabled = !editable;
    }
    $("startTermsButton").disabled = state.busy || (hasTerm && !["published", "superseded", "rejected"].includes(status));
    $("saveTermsButton").disabled = state.busy || !editable;
    $("submitTermsButton").disabled = state.busy || !editable;
    $("approveTermsButton").disabled = state.busy || status !== "under_review";
    $("revisionTermsButton").disabled = state.busy || status !== "under_review";
    $("rejectTermsButton").disabled = state.busy || status !== "under_review";
    $("publishTermsButton").disabled = state.busy || status !== "approved";
    if (!hasTerm) $("termsReviewReason").value = "";
  }

  function populateDisclosure() {
    const workspace = state.disclosureWorkspace || {};
    const disclosure = workspace.disclosure && workspace.disclosure.id ? workspace.disclosure : null;
    const status = disclosure ? normalizeStatus(disclosure.disclosure_status) : "not_started";
    setPill($("disclosureStatus"), status);
    $("disclosureDigest").textContent = "Disclosure SHA-256: " + (disclosure && disclosure.disclosure_content_sha256 ? disclosure.disclosure_content_sha256 : "not published");
    $("disclosureTitle").value = disclosure ? (disclosure.disclosure_title || "") : "";
    $("disclosureDate").value = disclosure ? toDateInput(disclosure.disclosure_date) : "";
    $("disclosureSummary").value = disclosure ? (disclosure.summary || "") : "";
    $("disclosureContent").value = disclosure ? jsonText(disclosure.content) : "";
    $("disclosureMetadata").value = disclosure ? jsonText(disclosure.metadata) : "{}";

    const editable = !!disclosure && ["draft", "revision_requested"].includes(status);
    const hasDisclosure = !!disclosure;
    const terms = state.termsWorkspace && state.termsWorkspace.terms;
    const termsPublished = !!(terms && terms.term_status === "published" && terms.term_content_sha256);
    $("startDisclosureButton").disabled = state.busy || !termsPublished || (hasDisclosure && !["published", "superseded", "rejected"].includes(status));
    for (const id of ["disclosureTitle","disclosureDate","disclosureSummary","disclosureContent","disclosureMetadata"]) $(id).disabled = !editable;
    $("saveDisclosureButton").disabled = state.busy || !editable;
    $("submitDisclosureButton").disabled = state.busy || !editable;
    $("approveDisclosureButton").disabled = state.busy || status !== "under_review";
    $("revisionDisclosureButton").disabled = state.busy || status !== "under_review";
    $("rejectDisclosureButton").disabled = state.busy || status !== "under_review";
    $("publishDisclosureButton").disabled = state.busy || status !== "approved";
    if (!hasDisclosure) $("disclosureReviewReason").value = "";
  }

  function renderRequiredSections() {
    const list = $("requiredSectionsList");
    list.replaceChildren();
    for (const key of REQUIRED_DISCLOSURE_SECTIONS) {
      const item = document.createElement("li");
      item.textContent = key;
      list.appendChild(item);
    }
  }

  async function loadWorkspace(applicationId) {
    if (!applicationId) return;
    state.applicationId = String(applicationId);
    const select = $("applicationSelect");
    select.value = state.applicationId;
    const url = new URL(window.location.href);
    url.searchParams.set("application_id", state.applicationId);
    window.history.replaceState({}, "", url.toString());
    $("emptyWorkspace").hidden = true;
    $("workspace").hidden = false;
    setStatus("Loading Terms, Disclosure and upstream readiness for the selected Mainnet application…");
    await assertAal2();
    const [termsWorkspace, disclosureWorkspace] = await Promise.all([
      rpc("get_external_project_terms_admin_workspace", { p_application_id: state.applicationId }),
      rpc("get_external_project_disclosure_admin_workspace", { p_application_id: state.applicationId })
    ]);
    if (!termsWorkspace || termsWorkspace.application?.network !== "mainnet") {
      throw new Error("Terms workspace did not return a Mainnet application.");
    }
    if (!disclosureWorkspace || disclosureWorkspace.success !== true || disclosureWorkspace.network !== "mainnet") {
      throw new Error(disclosureWorkspace && disclosureWorkspace.message ? disclosureWorkspace.message : "Disclosure workspace did not return a Mainnet application.");
    }
    state.termsWorkspace = termsWorkspace;
    state.disclosureWorkspace = disclosureWorkspace;
    renderSummary();
    populateTerms();
    populateDisclosure();
    setStatus("Mainnet Terms and Disclosure workspace loaded. No project activation or payment action is available on this page.");
  }

  function termId() {
    const id = state.termsWorkspace && state.termsWorkspace.terms && state.termsWorkspace.terms.id;
    if (!id) throw new Error("Start a Terms version before using this action.");
    return id;
  }

  function disclosureId() {
    const id = state.disclosureWorkspace && state.disclosureWorkspace.disclosure && state.disclosureWorkspace.disclosure.id;
    if (!id) throw new Error("Start a Disclosure version before using this action.");
    return id;
  }

  function termsPayload() {
    const investmentModel = $("investmentModel").value.trim();
    const assetCode = $("assetCode").value.trim().toUpperCase();
    if (!investmentModel) throw new Error("Investment model is required.");
    if (!assetCode) throw new Error("Asset code is required.");
    const targetCapital = optionalNumber("targetCapital", "Target capital requirement");
    if (targetCapital === null) throw new Error("Target capital requirement is required.");
    const minimum = optionalNumber("minimumInvestment", "Minimum investment");
    const maximum = optionalNumber("maximumInvestment", "Maximum investment");
    if (minimum !== null && maximum !== null && maximum < minimum) throw new Error("Maximum investment cannot be below minimum investment.");
    const windowStart = optionalDateTime("fundingWindowStart", "Funding window start");
    const windowEnd = optionalDateTime("fundingWindowEnd", "Funding window end");
    if (windowStart && windowEnd && new Date(windowEnd) <= new Date(windowStart)) throw new Error("Funding window end must be after start.");
    return {
      p_term_id: termId(),
      p_investment_model: investmentModel,
      p_asset_code: assetCode,
      p_target_capital_requirement: targetCapital,
      p_minimum_investment: minimum,
      p_maximum_investment: maximum,
      p_term_duration_days: optionalInteger("termDurationDays", "Term duration"),
      p_funding_window_start: windowStart,
      p_funding_window_end: windowEnd,
      p_return_model: asObject($("returnModel").value, "Return model"),
      p_principal_policy: asObject($("principalPolicy").value, "Principal policy"),
      p_exit_policy: asObject($("exitPolicy").value, "Exit policy"),
      p_fee_policy: asObject($("feePolicy").value, "Fee policy"),
      p_distribution_policy: asObject($("distributionPolicy").value, "Distribution policy"),
      p_default_policy: asObject($("defaultPolicy").value, "Default policy"),
      p_conditions: asObject($("conditions").value, "Conditions"),
      p_custody_reference: asObject($("custodyReference").value, "Custody reference"),
      p_disclosure_reference: asObject($("disclosureReference").value, "Disclosure reference"),
      p_consent_reference: asObject($("consentReference").value, "Consent reference"),
      p_notes: $("termsNotes").value.trim() || null
    };
  }

  function disclosureContent(requireComplete) {
    const content = asObject($("disclosureContent").value, "Disclosure content");
    if (requireComplete) {
      const missing = REQUIRED_DISCLOSURE_SECTIONS.filter((key) => {
        if (!Object.prototype.hasOwnProperty.call(content, key)) return true;
        const value = content[key];
        return value === null || value === undefined || (typeof value === "string" && !value.trim()) ||
          (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
      });
      if (missing.length) throw new Error("Complete the required Disclosure sections before submission: " + missing.join(", "));
    }
    return content;
  }

  function disclosurePayload(requireComplete) {
    const title = $("disclosureTitle").value.trim();
    const summary = $("disclosureSummary").value.trim();
    const date = $("disclosureDate").value;
    if (!title) throw new Error("Disclosure title is required.");
    if (!summary) throw new Error("Investor summary is required.");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("A valid disclosure date is required.");
    return {
      p_disclosure_id: disclosureId(),
      p_disclosure_title: title,
      p_disclosure_date: date,
      p_summary: summary,
      p_content: disclosureContent(!!requireComplete),
      p_metadata: asObject($("disclosureMetadata").value, "Disclosure metadata")
    };
  }

  async function runAction(label, action, refreshWorkspace) {
    if (state.busy) return;
    state.busy = true;
    setActionButtonsDisabled(true);
    setStatus(label + "…");
    try {
      await assertAal2();
      const result = await action();
      if (result && result.success === false) throw new Error(result.message || (label + " failed."));
      if (refreshWorkspace !== false && state.applicationId) await loadWorkspace(state.applicationId);
      else setStatus(label + " completed.");
      return result;
    } catch (error) {
      console.error("[ALBUKHR EXTERNAL TERMS/DISCLOSURE]", error);
      setStatus(error.message || String(error), true);
      throw error;
    } finally {
      state.busy = false;
      setActionButtonsDisabled(false);
      if (state.applicationId && state.termsWorkspace && state.disclosureWorkspace) {
        populateTerms();
        populateDisclosure();
      }
    }
  }

  function setActionButtonsDisabled(disabled) {
    for (const id of [
      "refreshButton","applicationSelect","statusFilter","startTermsButton","saveTermsButton","submitTermsButton",
      "approveTermsButton","revisionTermsButton","rejectTermsButton","publishTermsButton","startDisclosureButton",
      "saveDisclosureButton","submitDisclosureButton","approveDisclosureButton","revisionDisclosureButton",
      "rejectDisclosureButton","publishDisclosureButton"
    ]) {
      const element = $(id);
      if (element) element.disabled = !!disabled;
    }
  }

  function confirmAction(message) {
    return window.confirm(message);
  }

  function bind() {
    $("refreshButton").addEventListener("click", () => runAction("Refreshing application queue", loadQueue, false).catch(() => {}));
    $("statusFilter").addEventListener("change", () => {
      renderApplicationOptions();
      if (state.applicationId) loadWorkspace(state.applicationId).catch((error) => setStatus(error.message, true));
      else {
        $("workspace").hidden = true;
        $("emptyWorkspace").hidden = false;
      }
    });
    $("applicationSelect").addEventListener("change", (event) => {
      if (event.target.value) loadWorkspace(event.target.value).catch((error) => setStatus(error.message, true));
    });
    $("startTermsButton").addEventListener("click", () => {
      if (!confirmAction("Start a new External Terms draft for this Mainnet application? This does not approve, publish or activate the project.")) return;
      runAction("Starting Terms version", () => rpc("start_external_project_terms", { p_application_id: state.applicationId })).catch(() => {});
    });
    $("saveTermsButton").addEventListener("click", () => runAction("Saving Terms draft", () => rpc("save_external_project_terms_draft", termsPayload())).catch(() => {}));
    $("submitTermsButton").addEventListener("click", () => {
      if (!confirmAction("Submit this Terms version for administrative review? Submission does not publish the Terms.")) return;
      runAction("Submitting Terms for review", () => rpc("submit_external_project_terms", { p_term_id: termId() })).catch(() => {});
    });
    $("approveTermsButton").addEventListener("click", () => {
      if (!confirmAction("Approve this Terms version? Approval is not publication.")) return;
      runAction("Approving Terms", () => rpc("review_external_project_terms", {
        p_term_id: termId(), p_decision: "approve", p_reason: $("termsReviewReason").value.trim() || null
      })).catch(() => {});
    });
    $("revisionTermsButton").addEventListener("click", () => {
      const reason = $("termsReviewReason").value.trim();
      if (!reason) { setStatus("A reason is required when requesting a Terms revision.", true); return; }
      if (!confirmAction("Request a revision to this Terms version?")) return;
      runAction("Requesting Terms revision", () => rpc("review_external_project_terms", {
        p_term_id: termId(), p_decision: "revision_requested", p_reason: reason
      })).catch(() => {});
    });
    $("rejectTermsButton").addEventListener("click", () => {
      const reason = $("termsReviewReason").value.trim();
      if (!reason) { setStatus("A reason is required when rejecting Terms.", true); return; }
      if (!confirmAction("Reject this Terms version? The decision will be recorded in the External audit trail.")) return;
      runAction("Rejecting Terms", () => rpc("review_external_project_terms", {
        p_term_id: termId(), p_decision: "reject", p_reason: reason
      })).catch(() => {});
    });
    $("publishTermsButton").addEventListener("click", () => {
      if (!confirmAction("Publish this approved Terms version to investors? The previous published Terms will be superseded and any published Disclosure will be invalidated. This will not activate the project.")) return;
      runAction("Publishing Terms", () => rpc("publish_external_project_terms", { p_term_id: termId() })).catch(() => {});
    });
    $("startDisclosureButton").addEventListener("click", () => {
      if (!confirmAction("Start a new investor Disclosure draft against the current published Terms and latest upstream controls?")) return;
      runAction("Starting Disclosure version", () => rpc("start_external_project_disclosure", { p_application_id: state.applicationId })).catch(() => {});
    });
    $("saveDisclosureButton").addEventListener("click", () => runAction("Saving Disclosure draft", () => rpc("save_external_project_disclosure_draft", disclosurePayload())).catch(() => {}));
    $("submitDisclosureButton").addEventListener("click", () => {
      try { disclosureContent(true); } catch (error) { setStatus(error.message, true); return; }
      if (!confirmAction("Submit this Disclosure for administrative review? All required sections and current source versions will be checked by Mainnet.")) return;
      runAction("Submitting Disclosure for review", () => rpc("submit_external_project_disclosure", { p_disclosure_id: disclosureId() })).catch(() => {});
    });
    $("approveDisclosureButton").addEventListener("click", () => {
      if (!confirmAction("Approve this Disclosure version? Approval is not publication.")) return;
      runAction("Approving Disclosure", () => rpc("review_external_project_disclosure", {
        p_disclosure_id: disclosureId(), p_decision: "approve", p_reason: $("disclosureReviewReason").value.trim() || null
      })).catch(() => {});
    });
    $("revisionDisclosureButton").addEventListener("click", () => {
      const reason = $("disclosureReviewReason").value.trim();
      if (!reason) { setStatus("A reason is required when requesting a Disclosure revision.", true); return; }
      if (!confirmAction("Request a revision to this Disclosure version?")) return;
      runAction("Requesting Disclosure revision", () => rpc("review_external_project_disclosure", {
        p_disclosure_id: disclosureId(), p_decision: "revision_requested", p_reason: reason
      })).catch(() => {});
    });
    $("rejectDisclosureButton").addEventListener("click", () => {
      const reason = $("disclosureReviewReason").value.trim();
      if (!reason) { setStatus("A reason is required when rejecting a Disclosure.", true); return; }
      if (!confirmAction("Reject this Disclosure version?")) return;
      runAction("Rejecting Disclosure", () => rpc("review_external_project_disclosure", {
        p_disclosure_id: disclosureId(), p_decision: "reject", p_reason: reason
      })).catch(() => {});
    });
    $("publishDisclosureButton").addEventListener("click", () => {
      if (!confirmAction("Publish this approved investor Disclosure? Only the exact current Terms and upstream versions can be published.")) return;
      runAction("Publishing Disclosure", () => rpc("publish_external_project_disclosure", { p_disclosure_id: disclosureId() })).catch(() => {});
    });
    $("logoutButton").addEventListener("click", async () => {
      try { await auth().signOut(); } finally { window.location.replace("admin-login.html"); }
    });
  }

  async function init() {
    try {
      renderRequiredSections();
      await verifyAdminSession();
      bind();
      const query = new URLSearchParams(window.location.search);
      const requestedId = query.get("application_id");
      await loadQueue();
      if (requestedId && state.applications.some((row) => String(row.id) === requestedId)) {
        state.applicationId = requestedId;
        $("applicationSelect").value = requestedId;
        await loadWorkspace(requestedId);
      }
    } catch (error) {
      console.error("[ALBUKHR EXTERNAL TERMS/DISCLOSURE]", error);
      $("securityState").textContent = "ACCESS ERROR";
      setStatus(error.message || "Unable to initialize External Terms and Disclosure governance.", true);
      $("workspace").hidden = true;
      $("emptyWorkspace").hidden = false;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(window, document);
