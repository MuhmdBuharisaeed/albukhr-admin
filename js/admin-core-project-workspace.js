/*
 * ALBUKHR CORE PROJECT WORKSPACE
 * Mainnet only. Read-only project workspace.
 *
 * Security authority:
 * - Supabase Admin Auth verifies active admin identity and AAL2.
 * - get_core_project_workspace() is the authoritative project-scope gate.
 * - Core Admin receives exactly one assigned Mainnet Core Project.
 * - Super Admin receives the seven Mainnet Core Projects.
 * - This page performs no treasury, payment, staking, or audit writes.
 */
(function (window, document) {
    "use strict";

    const LOGIN_URL = "admin-login.html";
    const MFA_URL = "admin-mfa.html";
    const WORKSPACE_RPC = "get_core_project_workspace";

    const $ = (id) => document.getElementById(id);

    let adminContext = null;
    let workspaceData = null;
    let selectedProjectId = null;
    let initialized = false;

    function fail(message) {
        throw new Error(String(message || "Core Project Workspace security error."));
    }

    function setStatus(message, isError) {
        const element = $("pageStatus");
        if (!element) return;
        element.textContent = message || "";
        element.className = "status" + (isError ? " error" : "");
    }

    function getRoles() {
        return Array.isArray(adminContext && adminContext.roles)
            ? adminContext.roles.map((role) => String(role).toLowerCase())
            : [];
    }

    function isSuperAdmin() {
        return getRoles().includes("super_admin");
    }

    function isCoreAdmin() {
        return getRoles().includes("core_admin");
    }

    function assertMainnet() {
        const environment = window.ALBukhrEnvironment;

        if (
            !environment ||
            typeof environment.isKnown !== "function" ||
            typeof environment.isMainnet !== "function" ||
            !environment.isKnown() ||
            !environment.isMainnet()
        ) {
            fail("Core Project Workspace is available only on the approved ALBUKHR Mainnet host.");
        }
    }

    function getClient() {
        assertMainnet();

        const client = window.ALBUKHR_SUPABASE && window.ALBUKHR_SUPABASE.client;

        if (!client || typeof client.schema !== "function") {
            fail("ALBUKHR Supabase Core is unavailable.");
        }

        return client;
    }

    function normalizeRpcPayload(raw) {
        const payload = Array.isArray(raw) ? (raw[0] || null) : raw;

        if (!payload || typeof payload !== "object") {
            fail("The Core Project Workspace service returned an invalid response.");
        }

        if (payload.authorized !== true) {
            const error = new Error(payload.message || "The Mainnet security layer denied workspace access.");
            error.workspaceDenied = true;
            throw error;
        }

        if (!Array.isArray(payload.projects)) {
            fail("The Core Project Workspace service returned an invalid project list.");
        }

        if (isSuperAdmin()) {
            if (payload.scope !== "all_core_projects" || payload.projects.length !== 7) {
                fail("Super Admin workspace scope did not match the seven-project Mainnet Core registry.");
            }
        } else if (isCoreAdmin()) {
            if (payload.scope !== "assigned_core_project" || payload.projects.length !== 1) {
                fail("Core Admin workspace must contain exactly one assigned Core Project.");
            }
        } else {
            const error = new Error("Only an active Core Admin or Super Admin can access this workspace.");
            error.workspaceDenied = true;
            throw error;
        }

        payload.projects.forEach((project) => {
            if (
                !project ||
                String(project.network || "").toLowerCase() !== "mainnet" ||
                String(project.project_type || "").toLowerCase() !== "core" ||
                Number(project.core_slot) < 1 ||
                Number(project.core_slot) > 7
            ) {
                fail("The server returned a project outside the Mainnet Core Project boundary.");
            }
        });

        return payload;
    }

    async function fetchWorkspace() {
        const response = await getClient()
            .schema("albukhr_security")
            .rpc(WORKSPACE_RPC);

        if (response.error) {
            throw response.error;
        }

        return normalizeRpcPayload(response.data);
    }

    function showDenied(message) {
        const deniedPanel = $("deniedPanel");
        const workspacePanel = $("workspacePanel");

        if (workspacePanel) workspacePanel.classList.add("hidden");
        if (deniedPanel) {
            deniedPanel.classList.remove("hidden");
            const heading = deniedPanel.querySelector("h2");
            const paragraph = deniedPanel.querySelector("p");
            if (heading) heading.textContent = "Access denied";
            if (paragraph) paragraph.textContent = message || "This account is not authorized for this workspace.";
        }

        if ($("roleValue")) $("roleValue").textContent = "DENIED";
        if ($("scopeValue")) $("scopeValue").textContent = "NONE";
        if ($("securityState")) $("securityState").textContent = "Access denied";
        setStatus(message || "Workspace access denied.", true);
    }

    function showUnavailable(message) {
        const deniedPanel = $("deniedPanel");
        const workspacePanel = $("workspacePanel");

        if (workspacePanel) workspacePanel.classList.add("hidden");
        if (deniedPanel) {
            deniedPanel.classList.remove("hidden");
            const heading = deniedPanel.querySelector("h2");
            const paragraph = deniedPanel.querySelector("p");
            if (heading) heading.textContent = "Workspace unavailable";
            if (paragraph) paragraph.textContent = "The workspace could not refresh its authoritative Mainnet data. No cached project data is being displayed.";
        }

        setStatus(message || "Workspace data is temporarily unavailable.", true);
    }

    function formatPi(value) {
        const amount = Number(value);
        if (!Number.isFinite(amount)) return "Not configured";
        return amount.toLocaleString(undefined, { maximumFractionDigits: 4 }) + " π";
    }

    function populateProjectPicker(projects) {
        const wrapper = $("projectPickerWrap");
        const select = $("projectPicker");

        if (!wrapper || !select) return;

        if (!isSuperAdmin()) {
            wrapper.classList.add("hidden");
            select.onchange = null;
            return;
        }

        wrapper.classList.remove("hidden");
        select.replaceChildren();

        projects.forEach((project) => {
            const option = document.createElement("option");
            option.value = String(project.project_id || project.id || "");
            option.textContent = String(project.name || "Core Project") +
                " — Slot " + String(project.core_slot == null ? "—" : project.core_slot);
            select.appendChild(option);
        });

        if (!selectedProjectId || !projects.some((project) =>
            String(project.project_id || project.id || "") === selectedProjectId
        )) {
            selectedProjectId = String(projects[0].project_id || projects[0].id || "");
        }

        select.value = selectedProjectId;
        select.onchange = function () {
            selectedProjectId = select.value;
            renderWorkspace();
        };
    }

    function renderWorkspace() {
        if (!workspaceData || !Array.isArray(workspaceData.projects)) {
            fail("Workspace data is not available for rendering.");
        }

        const projects = workspaceData.projects;
        if (projects.length === 0) {
            showDenied("No valid Mainnet Core Project is available in this account's authorized scope.");
            return;
        }

        populateProjectPicker(projects);

        const project = isSuperAdmin()
            ? projects.find((item) => String(item.project_id || item.id || "") === selectedProjectId)
            : projects[0];

        if (!project) {
            showDenied("The selected Core Project is outside the server-authorized workspace scope.");
            return;
        }

        const treasury = project.treasury || {};
        const staking = project.staking || {};
        const treasuryConfigured = Boolean(treasury.id);
        const totalTerms = Number(staking.total_term_count || 0);

        $("workspacePanel").classList.remove("hidden");
        $("deniedPanel").classList.add("hidden");

        $("projectName").textContent = project.name || "Core Project";
        $("projectMeta").textContent = [
            project.project_code,
            String(project.network || "MAINNET").toUpperCase(),
            "CORE PROJECT"
        ].filter(Boolean).join(" • ");

        $("projectStatus").textContent = String(project.status || "—").toUpperCase();
        $("coreSlot").textContent = project.core_slot == null ? "—" : String(project.core_slot);
        $("verifiedLiquidity").textContent = treasury.verified_liquidity == null
            ? "Not configured"
            : formatPi(treasury.verified_liquidity);
        $("treasuryStatus").textContent = String(treasury.status || "Not configured").toUpperCase();

        $("overviewState").textContent = project.status ? "DATA AVAILABLE" : "NO PROJECT DATA";
        $("treasuryState").textContent = treasuryConfigured ? "SERVER DATA AVAILABLE" : "NOT CONFIGURED";
        $("stakingState").textContent = totalTerms > 0 ? "SERVER DATA AVAILABLE" : "NO STAKING TERMS";

        // These workflows are deliberately shown as unavailable until their own secure backend contracts exist.
        $("updatesState").textContent = "NOT CONNECTED";
        $("withdrawalsState").textContent = "WORKFLOW NOT ENABLED";
        $("auditState").textContent = "NOT CONNECTED";

        $("roleValue").textContent = isSuperAdmin() ? "SUPER ADMIN" : "CORE ADMIN";
        $("scopeValue").textContent = isSuperAdmin() ? "ALL 7 CORE PROJECTS" : "ASSIGNED PROJECT ONLY";
        $("mfaValue").textContent = "AAL2 VERIFIED";

        if ($("securityState")) $("securityState").textContent = "Authenticated • AAL2";
    }

    async function loadWorkspace() {
        const refreshButton = $("refreshButton");
        if (refreshButton) refreshButton.disabled = true;

        // Never leave previously loaded project data visible if a refresh fails.
        if ($("workspacePanel")) $("workspacePanel").classList.add("hidden");
        if ($("deniedPanel")) $("deniedPanel").classList.add("hidden");

        setStatus("Loading server-authorized Mainnet Core Project data…", false);

        try {
            workspaceData = await fetchWorkspace();
            selectedProjectId = isSuperAdmin()
                ? String(workspaceData.projects[0] && (workspaceData.projects[0].project_id || workspaceData.projects[0].id) || "")
                : String(workspaceData.projects[0] && (workspaceData.projects[0].project_id || workspaceData.projects[0].id) || "");

            renderWorkspace();
            setStatus("Core Project Workspace loaded from the Mainnet security layer.", false);
        } catch (error) {
            console.error("[ALBUKHR CORE PROJECT WORKSPACE]", error);
            workspaceData = null;
            selectedProjectId = null;

            if (error && error.workspaceDenied) {
                showDenied(error.message);
            } else {
                showUnavailable(error && error.message ? error.message : "Unable to load workspace data.");
            }
        } finally {
            if (refreshButton) refreshButton.disabled = false;
        }
    }

    async function initialize() {
        if (initialized) return;
        initialized = true;

        try {
            assertMainnet();

            const auth = window.AlbukhrSupabaseAdminAuth;
            if (!auth) fail("ALBUKHR Admin Auth Core is unavailable.");

            await auth.init();

            adminContext = await auth.requireAdmin({
                redirect: false,
                preserveSessionOnContextError: true
            });

            if (!adminContext) {
                window.location.replace(LOGIN_URL);
                return;
            }

            if (
                adminContext.is_admin !== true ||
                String(adminContext.status || "").toLowerCase() !== "active"
            ) {
                fail("An active ALBUKHR administrator account is required.");
            }

            const mfa = await auth.ensureMfa();
            if (adminContext.mfa_required !== false && !mfa?.verified) {
                window.location.replace(MFA_URL);
                return;
            }

            const assurance = await getClient().auth.mfa.getAuthenticatorAssuranceLevel();
            if (assurance.error) throw assurance.error;
            if (!assurance.data || assurance.data.currentLevel !== "aal2") {
                window.location.replace(MFA_URL);
                return;
            }

            if (!isSuperAdmin() && !isCoreAdmin()) {
                showDenied("Only an active Core Admin or Super Admin can access this workspace.");
                return;
            }

            if ($("securityState")) $("securityState").textContent = "Authenticated • AAL2";
            if ($("refreshButton")) $("refreshButton").addEventListener("click", loadWorkspace);

            await loadWorkspace();
        } catch (error) {
            console.error("[ALBUKHR CORE PROJECT WORKSPACE INIT]", error);

            if (/mfa|aal2|factor|authenticator/i.test(String(error && error.message || error))) {
                window.location.replace(MFA_URL);
                return;
            }

            showDenied(error && error.message ? error.message : "Workspace authorization failed.");
        }
    }

    const logoutButton = $("logoutButton");
    if (logoutButton) {
        logoutButton.addEventListener("click", async function () {
            try {
                const auth = window.AlbukhrSupabaseAdminAuth;
                if (auth && typeof auth.signOut === "function") await auth.signOut();
            } finally {
                window.location.replace(LOGIN_URL);
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})(window, document);
