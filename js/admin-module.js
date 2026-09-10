(function (w, d) {
    "use strict";

    const A = () => w.AlbukhrSupabaseAdminAuth;
    const C = () => w.ALBUKHR_SUPABASE && w.ALBUKHR_SUPABASE.client;
    const $ = id => d.getElementById(id);

    const MODULES = {
        security: ["Security & Access", "Administrator roles, MFA assurance and security controls.", ["super_admin"], "Review the authenticated administrator security context."],
        registry: ["Project Registry", "Core project registry administration.", ["super_admin", "registry_admin", "core_admin"], "Project registry operations will use dedicated server-authoritative RPCs."],
        approvals: ["Project Approvals", "Core Project approval workflow.", ["super_admin", "approval_admin"], "Loading the server-authoritative Core Project approval queue."],
        finance: ["Finance", "Administrative finance oversight.", ["super_admin", "finance_admin"], "Finance operations will use dedicated server-authoritative RPCs."],
        internal: ["Internal Projects", "Internal project scope administration.", ["super_admin", "internal_admin"], "Internal project operations will use scoped server authorization."],
        external: ["External Projects", "External project scope administration.", ["super_admin", "external_admin"], "External project operations will use scoped server authorization."]
    };

    function label(v) {
        return String(v || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    }

    function status(t, e) {
        const x = $("pageStatus");
        if (!x) return;
        x.textContent = t || "";
        x.className = "status" + (e ? " error" : "");
    }

    function esc(v) {
        return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[c]));
    }

    function dependencyError() {
        if (!w.AlbukhrEnvironment) {
            return "ALBUKHR Environment Core is unavailable.";
        }
        if (typeof w.AlbukhrEnvironment.isMainnet !== "function") {
            return "ALBUKHR Environment Core is invalid.";
        }
        if (!w.AlbukhrEnvironment.isMainnet()) {
            return "Admin module is available only on ALBUKHR MAINNET.";
        }
        if (!A()) {
            return "ALBUKHR Supabase Admin Auth is unavailable.";
        }
        if (!w.ALBUKHR_SUPABASE) {
            return "ALBUKHR Supabase Core is unavailable.";
        }
        if (!C()) {
            return "ALBUKHR Supabase client is unavailable.";
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
        if (!c) throw Error("Supabase client unavailable.");
        const r = await c.schema("albukhr_security").rpc(name, params || {});
        if (r.error) throw r.error;
        return r.data;
    }

    function renderApprovalQueue(records) {
        const host = $("workspaceText");
        if (!host) return;

        if (!records.length) {
            host.innerHTML = '<div class="notice"><b>No Core Projects awaiting approval.</b><span>The server-authoritative approval queue is empty.</span></div>';
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
                '<p>Status: <strong>' + esc(String(p.status || "").toUpperCase()) + '</strong></p>' +
                '</div>' +
                '<div class="approval-actions">' +
                '<button type="button" data-action="history">Approval History</button>' +
                '<button type="button" data-action="approve">Approve Project</button>' +
                '</div>' +
                '<div class="approval-history" hidden></div>' +
                '</article>';
        }).join("");

        host.querySelectorAll("[data-action]").forEach(btn => {
            btn.addEventListener("click", async () => {
                const card = btn.closest(".approval-item");
                const id = card && card.dataset.projectId;
                if (!id) return;
                if (btn.dataset.action === "history") return loadHistory(card, id);
                return approveProject(id, btn);
            });
        });
    }

    async function loadApprovalQueue() {
        const result = await rpc("get_core_project_approval_queue");
        if (!result || result.authorized !== true) {
            throw Error("Core Project approval authorization denied.");
        }
        renderApprovalQueue(Array.isArray(result.records) ? result.records : []);
    }

    async function loadHistory(card, projectId) {
        const box = card.querySelector(".approval-history");
        if (!box) return;

        box.hidden = false;
        box.textContent = "Loading approval history...";

        try {
            const r = await rpc("get_core_project_approval_history", { p_project_id: projectId });
            const rows = Array.isArray(r && r.records) ? r.records : [];

            box.innerHTML = rows.length
                ? rows.map(x =>
                    '<div><b>' + esc(String(x.decision || "").toUpperCase()) + '</b> ' +
                    '<span>' + esc(x.previous_status) + ' → ' + esc(x.new_status) + '</span>' +
                    '<small>' + esc(x.created_at) + '</small>' +
                    (x.reason ? '<p>' + esc(x.reason) + '</p>' : "") +
                    '</div>'
                ).join("")
                : "<span>No Core approval decisions recorded.</span>";
        } catch (e) {
            console.error(e);
            box.textContent = e && e.message ? e.message : "Unable to load approval history.";
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
                throw Error("Server did not confirm the approval.");
            }

            status("Core Project approved successfully. Project status is now APPROVED.");
            await loadApprovalQueue();
        } catch (e) {
            console.error(e);
            status(e && e.message ? e.message : "Core Project approval failed.", true);
            button.disabled = false;
        }
    }

    async function init() {
        try {
            status("Loading ALBUKHR security core...");

            // Do not fail immediately if deferred dependencies are still settling.
            await waitForSecurityDependencies(8000);

            status("Verifying administrator authorization...");

            const auth = A();
            await auth.init();

            const a = await auth.requireAdmin({ redirect: false });

            if (!a) {
                location.replace("admin-login.html");
                return;
            }

            const m = await auth.ensureMfa();

            if (a.mfa_required && !m.verified) {
                location.replace("admin-mfa.html");
                return;
            }

            const key = new URLSearchParams(location.search).get("module");
            const mod = MODULES[key];

            if (!mod) {
                location.replace("admin-dashboard.html");
                return;
            }

            $("moduleTitle").textContent = mod[0];
            $("moduleDescription").textContent = mod[1];
            $("adminEmail").textContent = a.email || a.email_snapshot || "Authenticated administrator";
            $("adminId").textContent = a.user_id || "Authenticated session";
            $("adminStatus").textContent = label(a.status);
            $("mfaStatus").textContent = m.verified ? "AAL2 verified" : "Not verified";
            $("securityState").textContent = "Authenticated • AAL2";

            if (!mod[2].some(r => (a.roles || []).includes(r))) {
                $("authorizationState").textContent = "DENIED";
                $("authorizationTitle").textContent = "Role authorization required";
                status("You are authenticated but not authorized for this module.", true);
                return;
            }

            $("authorizationState").textContent = "AUTHORIZED";
            $("authorizationTitle").textContent = "Server-authoritative access granted";
            $("authorizationText").textContent = "Accepted role: " + mod[2].join(" / ");

            if (key === "approvals") {
                $("workspaceTitle").textContent = "Core Project Approval Queue";
                $("workspaceText").textContent = "Loading Core Project approval queue...";
                await loadApprovalQueue();
                status("Core Project approval workspace ready.");
                return;
            }

            $("workspaceText").textContent = mod[3];
            status("Module authorization verified.");
        } catch (e) {
            console.error(e);
            status(
                e && e.message ? e.message : "Admin authorization failed.",
                true
            );
            $("securityState").textContent = "Security check failed";
        }
    }

    const logout = $("logoutButton");
    if (logout) {
        logout.onclick = async () => {
            try {
                if (A()) await A().signOut();
            } finally {
                location.replace("admin-login.html");
            }
        };
    }

    init();
})(window, document);
