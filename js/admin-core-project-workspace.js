/*
 * ALBUKHR CORE PROJECT WORKSPACE
 * Mainnet only. Read-only project workspace and project-scoped governance view.
 *
 * Security authority:
 * - Supabase Admin Auth verifies active admin identity and AAL2.
 * - get_core_project_workspace() is the authoritative project-scope gate.
 * - Core Admin receives exactly one assigned Mainnet Core Project.
 * - Super Admin receives the seven Mainnet Core Projects.
 * - Project Updates access is confirmed by the trusted Mainnet API using the
 *   current Supabase Auth bearer token and the publisher-grant ledger.
 * - Audit history is read only and scoped by a trusted SECURITY DEFINER RPC.
 * - This page performs no treasury, payment, staking, or audit writes.
 */
(function (window, document) {
    "use strict";

    const LOGIN_URL = "admin-login.html";
    const MFA_URL = "admin-mfa.html";
    const WORKSPACE_RPC = "get_core_project_workspace";
    const AUDIT_RPC = "get_core_project_audit_trail";
    const PROJECT_UPDATES_API = "https://albukhr-api.onrender.com/api/project-updates";
    const MAINNET = "mainnet";
    const CORE_PROJECT_COUNT = 7;
    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const $ = (id) => document.getElementById(id);

    let adminContext = null;
    let adminAuth = null;
    let workspaceData = null;
    let selectedProjectId = null;
    let initialized = false;
    let publisherRequestVersion = 0;
    let auditRequestVersion = 0;

    function fail(message) {
        throw new Error(String(message || "Core Project Workspace security error."));
    }

    function setStatus(message, isError) {
        const element = $("pageStatus");
        if (!element) return;
        element.textContent = message || "";
        element.className = "status" + (isError ? " error" : "");
    }

    function setState(id, message, isReady) {
        const element = $(id);
        if (!element) return;
        element.textContent = String(message || "");
        element.classList.toggle("locked", !isReady);
    }

    function getRoles() {
        return Array.isArray(adminContext && adminContext.roles)
            ? adminContext.roles.map((role) => String(role).trim().toLowerCase()).filter(Boolean)
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
        const supabaseCore = window.ALBUKHR_SUPABASE;

        if (
            !environment ||
            typeof environment.isKnown !== "function" ||
            typeof environment.isMainnet !== "function" ||
            !environment.isKnown() ||
            !environment.isMainnet()
        ) {
            fail("Core Project Workspace is available only on the approved ALBUKHR Mainnet host.");
        }

        if (!supabaseCore || String(supabaseCore.network || "").toLowerCase() !== MAINNET) {
            fail("The Admin Supabase Core is not connected to Mainnet.");
        }
    }

    function getClient() {
        assertMainnet();
        const client = window.ALBUKHR_SUPABASE && window.ALBUKHR_SUPABASE.client;
        if (!client || typeof client.schema !== "function" || !client.auth) {
            fail("ALBUKHR Mainnet Supabase Core is unavailable.");
        }
        return client;
    }

    function normalizeRpcPayload(raw) {
        const payload = Array.isArray(raw) ? (raw[0] || null) : raw;

        if (!payload || typeof payload !== "object") {
            fail("The Core Project Workspace service returned an invalid response.");
        }

        if (String(payload.network || "").toLowerCase() !== MAINNET) {
            fail("The Core Project Workspace service returned a non-Mainnet response.");
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
            if (payload.scope !== "all_core_projects" || payload.projects.length !== CORE_PROJECT_COUNT) {
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

        const projectIds = new Set();
        const coreSlots = new Set();
        payload.projects.forEach((project) => {
            const projectId = String(project && (project.project_id || project.id) || "");
            const coreSlot = Number(project && project.core_slot);
            if (
                !project ||
                !UUID_PATTERN.test(projectId) ||
                String(project.network || "").toLowerCase() !== MAINNET ||
                String(project.project_type || "").toLowerCase() !== "core" ||
                !Number.isInteger(coreSlot) || coreSlot < 1 || coreSlot > CORE_PROJECT_COUNT ||
                projectIds.has(projectId) || coreSlots.has(coreSlot)
            ) {
                fail("The server returned a project outside the valid Mainnet Core Project boundary.");
            }
            projectIds.add(projectId);
            coreSlots.add(coreSlot);
        });

        if (isSuperAdmin() && coreSlots.size !== CORE_PROJECT_COUNT) {
            fail("The Mainnet Core Project registry did not contain all seven unique Core slots.");
        }

        return payload;
    }

    async function fetchWorkspace() {
        const response = await getClient().schema("albukhr_security").rpc(WORKSPACE_RPC);
        if (response.error) throw response.error;
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
        if ($("mfaValue")) $("mfaValue").textContent = "NOT VERIFIED";
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
            const nextId = String(select.value || "");
            if (!projects.some((project) => String(project.project_id || project.id || "") === nextId)) {
                return;
            }
            selectedProjectId = nextId;
            renderWorkspace();
        };
    }

    function renderAdminShortcuts() {
        document.querySelectorAll("[data-required-roles]").forEach((link) => {
            const requiredRoles = String(link.getAttribute("data-required-roles") || "")
                .split(",").map((role) => role.trim().toLowerCase()).filter(Boolean);
            const allowed = requiredRoles.some((role) => getRoles().includes(role));
            link.classList.toggle("hidden", !allowed);
        });

        const moderationLink = $("openModerationLink");
        if (moderationLink) moderationLink.classList.toggle("hidden", !isSuperAdmin());
    }

    function renderAuditEvent(event) {
        const item = document.createElement("article");
        item.className = "audit-event";

        const heading = document.createElement("div");
        heading.className = "audit-event-heading";

        const action = document.createElement("b");
        action.textContent = String(event && event.action || "Project action")
            .replace(/_/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
        heading.appendChild(action);

        const date = document.createElement("time");
        const rawDate = event && event.created_at;
        const parsedDate = rawDate ? new Date(rawDate) : null;
        if (parsedDate && !Number.isNaN(parsedDate.getTime())) {
            date.dateTime = parsedDate.toISOString();
            date.textContent = new Intl.DateTimeFormat(undefined, {
                year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
            }).format(parsedDate);
        } else {
            date.textContent = "Date unavailable";
        }
        heading.appendChild(date);
        item.appendChild(heading);

        const details = event && event.details && typeof event.details === "object" ? event.details : {};
        const detailParts = [];
        if (details.project_code) detailParts.push(String(details.project_code));
        if (details.core_slot != null) detailParts.push("Core Slot " + String(details.core_slot));
        if (details.previous_status || details.new_status) {
            detailParts.push(String(details.previous_status || "—") + " → " + String(details.new_status || "—"));
        }
        if (details.reason) detailParts.push(String(details.reason));

        if (detailParts.length) {
            const description = document.createElement("p");
            description.textContent = detailParts.join(" · ");
            item.appendChild(description);
        }

        const footer = document.createElement("div");
        footer.className = "audit-event-footer";
        const actorId = String(event && event.actor_id || "");
        const actorLabel = actorId && UUID_PATTERN.test(actorId)
            ? "Actor …" + actorId.slice(-8)
            : "Actor not recorded";
        const resultLabel = event && event.success === true ? "RECORDED" : event && event.success === false ? "FAILED" : "EVENT";
        footer.textContent = actorLabel + " · " + resultLabel;
        item.appendChild(footer);
        return item;
    }

    function setAuditStatus(message, isError) {
        const element = $("auditTrailStatus");
        if (!element) return;
        element.textContent = String(message || "");
        element.className = "audit-status" + (isError ? " error" : "");
    }

    async function loadAuditTrail(projectId) {
        const requestVersion = ++auditRequestVersion;
        const list = $("auditTrailList");
        if (list) list.replaceChildren();
        if ($("auditCount")) $("auditCount").textContent = "—";
        setState("auditState", "LOADING AUDIT HISTORY", false);
        setAuditStatus("Loading authorized project history…", false);

        try {
            const response = await getClient().schema("albukhr_security").rpc(AUDIT_RPC, {
                p_project_id: projectId,
                p_limit: 30
            });
            if (response.error) throw response.error;
            const payload = Array.isArray(response.data) ? response.data[0] : response.data;

            if (!payload || typeof payload !== "object" || payload.authorized !== true ||
                String(payload.network || "").toLowerCase() !== MAINNET ||
                String(payload.project_id || "") !== projectId || !Array.isArray(payload.events)) {
                throw new Error(payload && payload.message || "The project audit service returned an invalid or unauthorized response.");
            }

            if (requestVersion !== auditRequestVersion || projectId !== selectedProjectId) return;
            if (list) {
                if (payload.events.length === 0) {
                    const empty = document.createElement("p");
                    empty.className = "audit-empty";
                    empty.textContent = "No recorded project actions were returned for this project.";
                    list.appendChild(empty);
                } else {
                    payload.events.forEach((event) => list.appendChild(renderAuditEvent(event)));
                }
            }
            if ($("auditCount")) $("auditCount").textContent = String(payload.events.length) + " / 30 events";
            setState("auditState", "AUDIT TRAIL CONNECTED", true);
            setAuditStatus(payload.message || "Project audit history loaded securely.", false);
        } catch (error) {
            if (requestVersion !== auditRequestVersion || projectId !== selectedProjectId) return;
            console.error("[ALBUKHR CORE PROJECT AUDIT]", error);
            if (list) {
                const unavailable = document.createElement("p");
                unavailable.className = "audit-empty";
                unavailable.textContent = "Audit history could not be loaded. No unverified or cached history is displayed.";
                list.appendChild(unavailable);
            }
            setState("auditState", "AUDIT HISTORY UNAVAILABLE", false);
            setAuditStatus(error && error.message ? error.message : "Project audit history is temporarily unavailable.", true);
        }
    }

    async function loadPublisherAccess(project) {
        const projectId = String(project && (project.project_id || project.id) || "");
        const requestVersion = ++publisherRequestVersion;
        const link = $("openProjectUpdatesLink");
        const hint = $("updatesHint");

        setState("updatesState", "CHECKING PUBLISHER PERMISSION", false);
        if (link) {
            link.classList.add("hidden");
            link.href = "admin-project-updates.html";
        }
        if (hint) hint.textContent = "Checking the active publisher grant for this authenticated Admin identity…";

        try {
            const client = getClient();
            const sessionResult = await client.auth.getSession();
            if (sessionResult && sessionResult.error) throw sessionResult.error;
            const accessToken = String(sessionResult && sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token || "").trim();
            if (!accessToken) throw new Error("The Admin session has expired. Sign in again to verify publisher access.");

            const response = await window.fetch(PROJECT_UPDATES_API + "/publisher-projects", {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Authorization": "Bearer " + accessToken,
                    "x-albukhr-auth-provider": "supabase-auth"
                },
                cache: "no-store",
                credentials: "omit"
            });
            let payload;
            try {
                payload = await response.json();
            } catch (_) {
                throw new Error("Project Updates API returned an unreadable response.");
            }

            if (!response.ok || !payload || payload.success !== true) {
                const apiError = new Error(String(payload && payload.error || "Publisher permission could not be verified."));
                apiError.status = response.status;
                apiError.code = String(payload && payload.code || "PUBLISHER_CHECK_FAILED");
                throw apiError;
            }
            if (String(payload.network || "").toLowerCase() !== MAINNET || !Array.isArray(payload.data)) {
                throw new Error("The Project Updates API returned an invalid or non-Mainnet publisher response.");
            }

            if (requestVersion !== publisherRequestVersion || projectId !== selectedProjectId) return;
            const granted = payload.data.some((item) =>
                item &&
                String(item.project_id || "") === projectId &&
                String(item.network || "").toLowerCase() === MAINNET &&
                String(item.project_type || "").toLowerCase() === "core" &&
                ["approved", "active"].includes(String(item.status || "").toLowerCase())
            );

            if (granted) {
                setState("updatesState", "PUBLISHER ACCESS VERIFIED", true);
                if (link) {
                    link.href = "admin-project-updates.html?project_id=" + encodeURIComponent(projectId);
                    link.classList.remove("hidden");
                }
                if (hint) hint.textContent = "The trusted API confirmed an active Mainnet publisher grant for this Admin and project.";
            } else {
                setState("updatesState", "PUBLISHER GRANT NOT ASSIGNED", false);
                if (hint) hint.textContent = "This Admin identity has no active publisher grant for the selected Core Project. The page will not assume access from its dashboard role.";
            }
        } catch (error) {
            if (requestVersion !== publisherRequestVersion || projectId !== selectedProjectId) return;
            console.error("[ALBUKHR CORE PROJECT PUBLISHER CHECK]", error);
            setState("updatesState", "PUBLISHER CHECK UNAVAILABLE", false);
            if (hint) hint.textContent = "Publisher permission could not be confirmed. Publishing must not be treated as available until the trusted API check succeeds.";
        }
    }

    function refreshSelectedProjectPanels(project) {
        const projectId = String(project && (project.project_id || project.id) || "");
        if (!UUID_PATTERN.test(projectId)) {
            setState("updatesState", "INVALID PROJECT REFERENCE", false);
            setState("auditState", "INVALID PROJECT REFERENCE", false);
            setAuditStatus("The selected project does not contain a valid project ID.", true);
            return;
        }
        void loadPublisherAccess(project);
        void loadAuditTrail(projectId);
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
            String(project.network || MAINNET).toUpperCase(),
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
        setState("withdrawalsState", "NOT IMPLEMENTED", false);

        $("roleValue").textContent = isSuperAdmin() ? "SUPER ADMIN" : "CORE ADMIN";
        $("scopeValue").textContent = isSuperAdmin() ? "ALL 7 CORE PROJECTS" : "ASSIGNED PROJECT ONLY";
        $("mfaValue").textContent = "AAL2 VERIFIED";
        if ($("securityState")) $("securityState").textContent = "Authenticated • AAL2";

        renderAdminShortcuts();
        refreshSelectedProjectPanels(project);
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
            const firstProject = workspaceData.projects[0];
            selectedProjectId = String(firstProject && (firstProject.project_id || firstProject.id) || "");
            renderWorkspace();
            setStatus("Core Project Workspace loaded from the Mainnet security layer.", false);
        } catch (error) {
            console.error("[ALBUKHR CORE PROJECT WORKSPACE]", error);
            workspaceData = null;
            selectedProjectId = null;
            publisherRequestVersion += 1;
            auditRequestVersion += 1;

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
            adminAuth = window.AlbukhrSupabaseAdminAuth;
            if (!adminAuth) fail("ALBUKHR Admin Auth Core is unavailable.");

            await adminAuth.init();
            adminContext = await adminAuth.requireAdmin({
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

            const mfa = await adminAuth.ensureMfa();
            if (adminContext.mfa_required !== false && !mfa?.verified) {
                window.location.replace(MFA_URL);
                return;
            }

            const assurance = await getClient().auth.mfa.getAuthenticatorAssuranceLevel();
            if (assurance.error) throw assurance.error;
            if (!assurance.data || String(assurance.data.currentLevel || "").toLowerCase() !== "aal2") {
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
                const auth = adminAuth || window.AlbukhrSupabaseAdminAuth;
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
