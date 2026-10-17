
/* ALBUKHR Admin Module — full replacement
 * Includes the existing Core approval module plus the Finance Oversight workspace.
 * Finance test authorization is verification-only: it never sets a project ACTIVE,
 * never calls Pi payment approve/complete, and never writes settlement/accounting rows.
 */
(function (w, d) {
  "use strict";

  const A = () => w.AlbukhrSupabaseAdminAuth;
  const C = () => w.ALBUKHR_SUPABASE && w.ALBUKHR_SUPABASE.client;
  const $ = id => d.getElementById(id);
  let financePreflightResult = null;

  const MODULES = {
    security: ["Security & Access", "Administrator roles, MFA assurance and security controls.", ["super_admin"], "Review the authenticated administrator security context."],
    registry: ["Project Registry", "Core project registry administration.", ["super_admin", "registry_admin", "core_admin"], "Project registry operations use dedicated server-authoritative RPCs."],
    approvals: ["Project Approvals", "Core Project approval workflow.", ["super_admin", "approval_admin"], "Loading the server-authoritative Core Project approval queue."],
    finance: ["Finance", "Administrative finance oversight.", ["super_admin", "finance_admin"], "Loading Mainnet Finance Oversight."],
    internal: ["Internal Projects", "Internal project scope administration.", ["super_admin", "internal_admin"], "Internal project operations use scoped server authorization."],
    external: ["External Projects", "External project scope administration.", ["super_admin", "external_admin"], "External project operations use scoped server authorization."]
  };

  function label(v) {
    return String(v == null ? "" : v)
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function status(t, e) {
    const x = $("pageStatus");
    if (!x) return;
    x.textContent = t || "";
    x.className = "status" + (e ? " error" : "");
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function money(v, asset) {
    const n = Number(v);
    if (v == null || v === "" || !Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, {
      maximumFractionDigits: 7
    }) + " " + (asset || "π");
  }

  function dateTime(v) {
    if (!v) return "—";
    const dt = new Date(v);
    return Number.isNaN(dt.getTime()) ? String(v) : dt.toLocaleString();
  }

  /*
   * FIX:
   * environment-core.js exports window.ALBukhrEnvironment.
   * JavaScript is case-sensitive; do not use window.AlbukhrEnvironment here.
   */
  function dependencyError() {
    if (!w.ALBukhrEnvironment) {
      return "ALBUKHR Environment Core is unavailable.";
    }

    if (
      typeof w.ALBukhrEnvironment.isMainnet !== "function" ||
      !w.ALBukhrEnvironment.isMainnet()
    ) {
      return "Admin module is available only on ALBUKHR MAINNET.";
    }

    if (!A()) {
      return "ALBUKHR Supabase Admin Auth is unavailable.";
    }

    if (!w.ALBUKHR_SUPABASE || !C()) {
      return "ALBUKHR Supabase Core is unavailable.";
    }

    if (
      String(w.ALBUKHR_SUPABASE.environment || "").toLowerCase() !== "mainnet" ||
      String(w.ALBUKHR_SUPABASE.network || "").toLowerCase() !== "mainnet"
    ) {
      return "Admin module requires the authoritative MAINNET Supabase client.";
    }

    return null;
  }

  async function waitForSecurityDependencies(timeoutMs) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const error = dependencyError();
      if (!error) return;

      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new Error(
      dependencyError() ||
      "ALBUKHR Admin security dependencies did not become ready."
    );
  }

  async function rpc(name, params) {
    const c = C();

    if (!c || typeof c.schema !== "function") {
      throw new Error(
        "Supabase client or custom schema support is unavailable."
      );
    }

    const r = await c.schema("albukhr_security").rpc(name, params || {});
    if (r.error) throw r.error;

    return r.data;
  }

  function renderApprovalQueue(records) {
    const host = $("workspaceText");
    if (!host) return;

    if (!records.length) {
      host.innerHTML =
        '<div class="notice"><b>No Core Projects awaiting approval.</b>' +
        '<span>The server-authoritative approval queue is empty.</span></div>';
      return;
    }

    host.innerHTML = records.map(p => {
      const id = esc(p.project_id);

      return '<article class="approval-item" data-project-id="' + id + '">' +
        '<div class="approval-main">' +
        '<small>CORE SLOT ' + esc(p.core_slot) + ' • MAINNET</small>' +
        '<h3>' + esc(p.name) + '</h3>' +
        '<p>' + esc(p.project_code) + ' • ' + esc(p.slug) + '</p>' +
        '<p>Project ID: <code>' + id + '</code></p>' +
        '<p>Status: <strong>' +
        esc(String(p.status || "").toUpperCase()) +
        '</strong></p>' +
        '</div><div class="approval-actions">' +
        '<button type="button" data-action="history">Approval History</button>' +
        '<button type="button" data-action="approve">Approve Project</button>' +
        '</div><div class="approval-history" hidden></div></article>';
    }).join("");

    host.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".approval-item");
        const id = card && card.dataset.projectId;

        if (!id) return;

        if (btn.dataset.action === "history") {
          return loadHistory(card, id);
        }

        return approveProject(id, btn);
      });
    });
  }

  async function loadApprovalQueue() {
    const result = await rpc("get_core_project_approval_queue");

    if (!result || result.authorized !== true) {
      throw new Error("Core Project approval authorization denied.");
    }

    renderApprovalQueue(
      Array.isArray(result.records) ? result.records : []
    );
  }

  async function loadHistory(card, projectId) {
    const box = card.querySelector(".approval-history");
    if (!box) return;

    box.hidden = false;
    box.textContent = "Loading approval history...";

    try {
      const r = await rpc("get_core_project_approval_history", {
        p_project_id: projectId
      });

      const rows = Array.isArray(r && r.records) ? r.records : [];

      box.innerHTML = rows.length
        ? rows.map(x =>
            '<div><b>' +
            esc(String(x.decision || "").toUpperCase()) +
            '</b> <span>' +
            esc(x.previous_status) + ' → ' + esc(x.new_status) +
            '</span><small>' + esc(dateTime(x.created_at)) + '</small>' +
            (x.reason ? '<p>' + esc(x.reason) + '</p>' : '') +
            '</div>'
          ).join("")
        : "<span>No Core approval decisions recorded.</span>";
    } catch (e) {
      console.error("[ALBUKHR APPROVAL HISTORY]", e);
      box.textContent = e && e.message
        ? e.message
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
    status("Submitting approval to the server...");

    try {
      const result = await rpc("approve_core_project", {
        p_project_id: projectId,
        p_reason: reason
      });

      if (!result || result.success !== true) {
        throw new Error("Server did not confirm the approval.");
      }

      status(
        "Core Project approved successfully. Project status is now APPROVED."
      );

      await loadApprovalQueue();
    } catch (e) {
      console.error("[ALBUKHR CORE APPROVAL]", e);
      status(
        e && e.message ? e.message : "Core Project approval failed.",
        true
      );
      button.disabled = false;
    }
  }

  function addFinanceStyles() {
    if ($("financeWorkspaceStyles")) return;

    const style = d.createElement("style");
    style.id = "financeWorkspaceStyles";

    style.textContent = `
      .fin-wrap{display:grid;gap:14px}
      .fin-notice{padding:13px 15px;border:1px solid #d7e8df;border-radius:12px;background:#f5faf7;color:#254d3a;font-size:12px;line-height:1.55}
      .fin-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:9px}
      .fin-metric{padding:13px;border:1px solid #dce9e2;border-radius:13px;background:#fff;min-width:0}
      .fin-metric span{display:block;color:#60776d;font-size:10px;font-weight:800}
      .fin-metric strong{display:block;margin-top:6px;font-size:19px;overflow-wrap:anywhere}
      .fin-metric small{display:block;color:#60776d;margin-top:3px;font-size:10px}
      .fin-section{border:1px solid #dce9e2;border-radius:14px;background:#fff;padding:14px;min-width:0}
      .fin-section h3{margin:0 0 10px;font-size:15px}
      .fin-projects{display:grid;gap:10px}
      .fin-project{border:1px solid #e3eee8;border-radius:12px;padding:12px}
      .fin-project-head{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}
      .fin-project h4{margin:2px 0 5px;font-size:14px}
      .fin-muted{color:#60776d;font-size:11px;overflow-wrap:anywhere}
      .fin-pill{display:inline-block;padding:5px 8px;border-radius:999px;background:#f0f4f2;color:#425e50;font-size:10px;font-weight:900}
      .fin-pass{color:#087a3e}
      .fin-fail{color:#b3261e}
      .fin-checks{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}
      .fin-check{border:1px solid #e3eee8;border-radius:9px;padding:6px 8px;font-size:10px}
      .fin-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
      .fin-actions button{border:1px solid #b9d6c6;border-radius:9px;background:#fff;color:#087a3e;padding:8px 10px;font-size:11px;font-weight:850}
      .fin-actions button.primary{background:#087a3e;color:#fff;border-color:#087a3e}
      .fin-actions button:disabled{opacity:.5}
      .fin-scroll{max-width:100%;overflow:auto}
      .fin-table{border-collapse:collapse;width:100%;font-size:11px;min-width:700px}
      .fin-table th,.fin-table td{text-align:left;padding:9px;border-bottom:1px solid #e9f0ec;vertical-align:top}
      .fin-table th{font-size:10px;color:#60776d;background:#f8fbf9}
      .fin-result{margin-top:12px;border:1px solid #dce9e2;border-radius:12px;padding:12px;background:#f8fbf9}
      .fin-result h4{margin:0 0 8px;font-size:13px}
      .fin-result-row{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid #e3eee8;font-size:11px}
      .fin-result-row:last-child{border-bottom:0}
      .fin-status{font-size:11px;color:#60776d;margin-bottom:10px}
      .fin-withdrawal-link{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;border:1px solid #cfe3d7;border-radius:12px;padding:12px;background:#f8fcf9}
      .fin-withdrawal-link p{margin:5px 0 0}
      .fin-withdrawal-link a{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;border-radius:9px;background:#087a3e;color:#fff;padding:10px 13px;font-size:12px;font-weight:850;white-space:nowrap}
      .fin-withdrawal-link a:focus-visible{outline:3px solid #9ccbb1;outline-offset:2px}
      @media(max-width:520px){
        .fin-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
        .fin-section{padding:10px}
        .fin-metric strong{font-size:16px}
        .fin-withdrawal-link{align-items:stretch}
        .fin-withdrawal-link a{width:100%}
      }
    `;

    d.head.appendChild(style);
  }

  function metric(title, value, note) {
    return '<article class="fin-metric"><span>' + esc(title) +
      '</span><strong>' + esc(value) + '</strong>' +
      (note ? '<small>' + esc(note) + '</small>' : '') +
      '</article>';
  }

  function readiness(labelText, passed) {
    return '<span class="fin-check"><b class="' +
      (passed ? 'fin-pass' : 'fin-fail') + '">' +
      (passed ? '✓ ' : '✕ ') + esc(labelText) +
      '</b></span>';
  }

  function renderPreflightResult(result) {
    if (!result || typeof result !== "object") return "";

    const checks = Array.isArray(result.checks) ? result.checks : [];

    const rows = checks.map(c =>
      '<div class="fin-result-row"><b class="' +
      (c.passed ? "fin-pass" : "fin-fail") + '">' +
      (c.passed ? "PASS" : "BLOCKED") +
      '</b><div><strong>' + esc(label(c.key)) +
      '</strong><div class="fin-muted">' +
      esc(c.detail || "") + '</div></div></div>'
    ).join("");

    const blockers = Array.isArray(result.blockers)
      ? result.blockers
      : [];

    const blockerHtml = blockers.length
      ? '<p class="fin-fail"><b>Blockers:</b> ' +
        blockers.map(b =>
          esc(label(b.key)) + ": " + esc(b.detail || "")
        ).join(" • ") +
        "</p>"
      : "";

    return '<section class="fin-result" aria-live="polite"><h4>' +
      "Verification-only preflight: " +
      (result.readiness_passed
        ? '<span class="fin-pass">CONFIGURATION CHECKS PASSED</span>'
        : '<span class="fin-fail">BLOCKERS REMAIN</span>') +
      '</h4><p class="fin-muted">Project status: ' +
      esc(String(result.project_status || "approved").toUpperCase()) +
      " · Production payment eligible: NO" +
      " · Project status changed: NO" +
      " · Pi approval/completion called: NO" +
      " · Settlement written: NO</p>" +
      "<div>" + rows + "</div>" + blockerHtml +
      '<p class="fin-muted">Pi Authentication and a real Pi PaymentDTO ' +
      "are not tested by this database preflight. No Pi transaction was " +
      "created or completed.</p></section>";
  }

  function renderFinance(data) {
    addFinanceStyles();

    const host = $("workspaceText");
    if (!host) return;

    if (
      !data ||
      data.success !== true ||
      data.authorized !== true ||
      data.network !== "mainnet"
    ) {
      host.innerHTML =
        '<div class="notice"><b>Finance workspace unavailable.</b>' +
        "<span>The server did not confirm authorized Mainnet Finance access.</span></div>";
      return;
    }

    const s = data.summary || {};
    const projects = Array.isArray(data.projects) ? data.projects : [];
    const txns = Array.isArray(data.recent_transactions)
      ? data.recent_transactions
      : [];

    const projectHtml = projects.map(p => {
      const type = String(p.project_type || "").toLowerCase();
      const authId = p.finance_test_authorization_id
        ? String(p.finance_test_authorization_id)
        : "";
      const canTest = p.can_start_finance_test === true;
      const liquidityReady = p.liquidity_ready === true;
      const treasuryReady = p.treasury_ready === true;
      const termsReady = Number(p.published_term_count || 0) > 0;

      let actions = "";

      if (authId) {
        actions =
          '<button type="button" data-finance-action="preflight" data-authorization-id="' +
          esc(authId) + '">Run readiness preflight</button>' +
          '<button type="button" data-finance-action="close" data-authorization-id="' +
          esc(authId) + '">Close test authorization</button>';
      } else if (canTest) {
        actions =
          '<button class="primary" type="button" data-finance-action="start" data-project-id="' +
          esc(p.project_id) +
          '">Authorize verification-only test (15 min)</button>';
      } else {
        actions =
          '<span class="fin-muted">Test authorization unavailable for this status/type.</span>';
      }

      return '<article class="fin-project" data-project-id="' +
        esc(p.project_id) + '" data-authorization-id="' + esc(authId) + '">' +
        '<div class="fin-project-head"><div><h4>' +
        esc(p.name || p.project_code) +
        '</h4><div class="fin-muted">' +
        esc(p.project_code || "") + " · " + esc(label(type)) +
        (p.core_slot ? " · Core Slot " + esc(p.core_slot) : "") +
        " · " + esc(String(p.network || "").toUpperCase()) +
        '</div></div><span class="fin-pill">' +
        esc(String(p.status || "").toUpperCase()) +
        "</span></div>" +
        '<div class="fin-checks">' +
        readiness("Treasury", treasuryReady) +
        readiness("Liquidity", liquidityReady) +
        readiness("Published terms", termsReady) +
        (authId
          ? '<span class="fin-check"><b class="fin-pass">Test authorization active until ' +
            esc(dateTime(p.finance_test_expires_at)) +
            "</b></span>"
          : "") +
        '</div><div class="fin-actions">' + actions +
        "</div></article>";
    }).join("");

    const txHtml = txns.map(t =>
      "<tr><td>" + esc(dateTime(t.created_at)) +
      "</td><td>" + esc(label(t.category)) +
      "</td><td>" + esc(t.project_code || "—") +
      '</td><td><code>' + esc(t.reference_id || "—") +
      "</code></td><td>" +
      esc(money(t.amount, t.asset || "PI")) +
      "</td><td>" + esc(t.status || "—") + "</td></tr>"
    ).join("");

    host.innerHTML =
      '<div class="fin-wrap">' +
      '<div class="fin-notice"><b>Finance / Mainnet oversight.</b> ' +
      "This workspace is read-only for financial ledgers. Verification-only " +
      "test authorization is time-limited and does not change project status, " +
      "call Pi payment approval/completion, create a stake, or settle any " +
      "accounting record. Real U2A payments remain governed by the existing " +
      "server-side project and payment gates.</div>" +

      '<section class="fin-metrics">' +
      metric("Mainnet projects", s.mainnet_projects || 0) +
      metric("Active projects", s.active_projects || 0) +
      metric("Approved projects", s.approved_projects || 0) +
      metric("Active test authorizations", s.active_test_authorizations || 0) +
      metric(
        "Verified Core investments",
        s.core_investment_payment_count || 0,
        money(s.core_investment_gross_pi || 0, "π") + " completed + verified"
      ) +
      metric(
        "Verified Internal investments",
        s.internal_investment_payment_count || 0,
        money(s.internal_investment_gross_pi || 0, "π") + " completed + verified"
      ) +
      metric(
        "Verified Core liquidity",
        s.core_liquidity_payment_count || 0,
        money(s.core_liquidity_gross_pi || 0, "π") + " completed + verified"
      ) +
      metric(
        "Verified Internal liquidity",
        s.internal_liquidity_payment_count || 0,
        money(s.internal_liquidity_gross_pi || 0, "π") + " completed + verified"
      ) +
      metric("Active stakes", s.active_stakes || 0) +
      metric(
        "Open withdrawals",
        s.unresolved_withdrawal_requests || 0
      ) +
      metric(
        "Settled fees",
        money(s.settled_transaction_fees_pi || 0, "π")
      ) +
      "</section>" +

      /* Navigation only: actual withdrawal access is checked again by its own page. */
      '<section class="fin-section" aria-labelledby="withdrawalOpsHeading">' +
      '<h3 id="withdrawalOpsHeading">Withdrawal Operations</h3>' +
      '<div class="fin-withdrawal-link"><div><strong>Withdrawal Review & Reconciliation</strong>' +
      '<p class="fin-muted">Review requests, inspect A2U reconciliation holds, and use the existing guarded manual-payment workflow. Opening the page does not send Pi.</p></div>' +
      '<a href="admin-withdrawals.html" aria-label="Open the secured Withdrawal Review page">Open Withdrawal Review</a></div>' +
      '</section>' +

      '<section class="fin-section"><h3>Mainnet Project Readiness & Test Authorization</h3>' +
      '<p class="fin-muted">Only APPROVED Core or Contributor Internal projects ' +
      "can receive a verification-only test authorization. External projects " +
      "retain their dedicated activation governance. No project status is " +
      "changed by this workspace.</p>" +
      '<div class="fin-projects">' +
      (projectHtml || '<div class="fin-muted">No Mainnet projects were returned.</div>') +
      "</div></section>" +

      '<section class="fin-section"><h3>Recent Mainnet Financial Records</h3>' +
      '<p class="fin-muted">Latest 100 investment, liquidity, treasury-ledger, ' +
      "withdrawal and fee-ledger entries returned by the secured Finance RPC.</p>" +
      '<div class="fin-scroll"><table class="fin-table"><thead><tr>' +
      "<th>Created</th><th>Category</th><th>Project</th><th>Reference</th>" +
      "<th>Amount</th><th>Status</th></tr></thead><tbody>" +
      (txHtml || '<tr><td colspan="6">No financial records returned.</td></tr>') +
      "</tbody></table></div></section>" +

      '<div id="financePreflightResult">' +
      renderPreflightResult(financePreflightResult) +
      "</div>" +

      '<p class="fin-muted">Workspace refreshed: ' +
      esc(dateTime(data.generated_at)) +
      ". All figures are from the Mainnet database; they are not live blockchain balances.</p>" +
      "</div>";

    host.querySelectorAll("[data-finance-action]").forEach(button => {
      button.addEventListener("click", async () => {
        const action = button.dataset.financeAction;
        const projectId = button.dataset.projectId || "";
        const authorizationId = button.dataset.authorizationId || "";

        if (action === "start") {
          return startFinanceTest(projectId, button);
        }

        if (action === "preflight") {
          return runFinancePreflight(authorizationId, button);
        }

        if (action === "close") {
          return closeFinanceTest(authorizationId, button);
        }
      });
    });
  }

  async function loadFinance() {
    const host = $("workspaceText");
    if (host) {
      host.textContent = "Loading secured Mainnet Finance Oversight...";
    }

    const result = await rpc("get_finance_oversight_workspace");

    if (
      !result ||
      result.success !== true ||
      result.authorized !== true
    ) {
      throw new Error(
        "Server-authoritative Finance authorization was not confirmed."
      );
    }

    renderFinance(result);
  }

  async function startFinanceTest(projectId, button) {
    if (!projectId) return;

    const reason = w.prompt(
      "Required reason for verification-only test (10–1000 characters):",
      "Mainnet pre-launch verification of project and U2A payment readiness; no transaction."
    );

    if (reason === null) return;

    if (String(reason).trim().length < 10) {
      status("Enter a test reason with at least 10 characters.", true);
      return;
    }

    button.disabled = true;

    try {
      status("Requesting time-limited Finance test authorization...");

      const result = await rpc("start_finance_project_test", {
        p_project_id: projectId,
        p_reason: String(reason).trim(),
        p_duration_minutes: 15
      });

      if (
        !result ||
        result.success !== true ||
        result.authorized !== true ||
        result.network !== "mainnet" ||
        result.mode !== "verification_only" ||
        result.project_status !== "approved" ||
        result.payment_approval_enabled !== false ||
        result.payment_completion_enabled !== false ||
        result.settlement_enabled !== false
      ) {
        throw new Error(
          "Server did not confirm a verification-only authorization for an APPROVED project."
        );
      }

      financePreflightResult = null;
      await loadFinance();

      status(
        "Verification-only test authorization opened until " +
        dateTime(result.expires_at) +
        ". Project status remains APPROVED."
      );
    } catch (e) {
      console.error("[ALBUKHR FINANCE TEST START]", e);
      status(
        e && e.message ? e.message : "Finance test authorization failed.",
        true
      );
      button.disabled = false;
    }
  }

  async function runFinancePreflight(authorizationId, button) {
    if (!authorizationId) return;

    button.disabled = true;

    try {
      status(
        "Running database-only project readiness preflight. No Pi payment will be made..."
      );

      const result = await rpc("run_finance_project_preflight", {
        p_authorization_id: authorizationId
      });

      if (
        !result ||
        result.success !== true ||
        result.authorized !== true ||
        result.network !== "mainnet" ||
        result.project_status_mutated !== false ||
        result.settlement_written !== false ||
        result.payment_approval_called !== false ||
        result.payment_completion_called !== false ||
        result.production_payment_eligible !== false
      ) {
        throw new Error(
          "Server did not confirm a safe verification-only preflight."
        );
      }

      financePreflightResult = result;

      const target = $("financePreflightResult");
      if (target) {
        target.innerHTML = renderPreflightResult(result);
      }

      status(
        result.readiness_passed
          ? "Configuration checks passed. Production U2A payment remains blocked until normal activation and separate payment checks."
          : "Preflight completed: one or more readiness blockers remain."
      );
    } catch (e) {
      console.error("[ALBUKHR FINANCE PREFLIGHT]", e);
      status(
        e && e.message ? e.message : "Finance preflight failed.",
        true
      );
      button.disabled = false;
    }
  }

  async function closeFinanceTest(authorizationId, button) {
    if (!authorizationId) return;

    const reason = w.prompt(
      "Reason for closing this Finance test authorization:",
      "Verification-only test finished; no payment transaction was executed."
    );

    if (reason === null) return;

    if (String(reason).trim().length < 10) {
      status("Enter a close reason with at least 10 characters.", true);
      return;
    }

    button.disabled = true;

    try {
      status("Closing Finance test authorization...");

      const result = await rpc("close_finance_project_test", {
        p_authorization_id: authorizationId,
        p_reason: String(reason).trim()
      });

      if (
        !result ||
        result.success !== true ||
        result.network !== "mainnet" ||
        result.project_status_mutated !== false
      ) {
        throw new Error(
          "Server did not confirm that the test authorization closed without changing project status."
        );
      }

      financePreflightResult = null;
      await loadFinance();

      status(
        "Finance test authorization closed. Project lifecycle status was not changed."
      );
    } catch (e) {
      console.error("[ALBUKHR FINANCE TEST CLOSE]", e);
      status(
        e && e.message
          ? e.message
          : "Unable to close Finance test authorization.",
        true
      );
      button.disabled = false;
    }
  }

  async function init() {
    try {
      status("Loading ALBUKHR security core...");

      await waitForSecurityDependencies(8000);

      status("Verifying administrator authorization...");

      const auth = A();
      await auth.init();

      const admin = await auth.requireAdmin({
        redirect: false,
        preserveSessionOnContextError: true
      });

      if (!admin) {
        w.location.replace("admin-login.html");
        return;
      }

      const key = new URLSearchParams(w.location.search).get("module");
      const m = await auth.ensureMfa();

      // Finance RPCs require AAL2 unconditionally, even if a legacy admin
      // record has mfa_required=false. Enforce that boundary in the UI too.
      if ((admin.mfa_required || key === "finance") && !m.verified) {
        w.location.replace("admin-mfa.html");
        return;
      }

      const mod = MODULES[key];

      if (!mod) {
        w.location.replace("admin-dashboard.html");
        return;
      }

      $("moduleTitle").textContent = mod[0];
      $("moduleDescription").textContent = mod[1];
      $("adminEmail").textContent =
        admin.email || admin.email_snapshot || "Authenticated administrator";
      $("adminId").textContent = admin.user_id || "Authenticated session";
      $("adminStatus").textContent = label(admin.status);
      $("mfaStatus").textContent =
        m.verified ? "AAL2 verified" : "Not verified";
      $("securityState").textContent =
        m.verified ? "Authenticated • AAL2" : "Authenticated";

      if (!mod[2].some(r => (admin.roles || []).includes(r))) {
        $("authorizationState").textContent = "DENIED";
        $("authorizationTitle").textContent = "Role authorization required";
        status(
          "You are authenticated but not authorized for this module.",
          true
        );
        return;
      }

      $("authorizationState").textContent = "AUTHORIZED";
      $("authorizationTitle").textContent =
        "Server-authoritative access granted";
      $("authorizationText").textContent =
        "Accepted role: " + mod[2].join(" / ");

      if (key === "approvals") {
        $("workspaceTitle").textContent = "Core Project Approval Queue";
        $("workspaceText").textContent =
          "Loading Core Project approval queue...";

        await loadApprovalQueue();
        status("Core Project approval workspace ready.");
        return;
      }

      if (key === "finance") {
        $("workspaceTitle").textContent =
          "Financial Oversight & Readiness Preflight";

        await loadFinance();

        status(
          "Finance Oversight workspace loaded from Mainnet. No payment operations were executed."
        );
        return;
      }

      $("workspaceText").textContent = mod[3];
      status("Module authorization verified.");
    } catch (e) {
      console.error("[ALBUKHR ADMIN MODULE]", e);

      status(
        e && e.message ? e.message : "Admin authorization failed.",
        true
      );

      if ($("securityState")) {
        $("securityState").textContent = "Security check failed";
      }
    }
  }

  const logout = $("logoutButton");

  if (logout) {
    logout.onclick = async () => {
      try {
        if (A()) await A().signOut();
      } finally {
        w.location.replace("admin-login.html");
      }
    };
  }

  init();
})(window, document);
