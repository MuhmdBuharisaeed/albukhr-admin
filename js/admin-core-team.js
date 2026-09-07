(function (window, document) {
    "use strict";

    const ADMIN_LOGIN_PAGE = "admin-login.html";
    const ADMIN_MFA_PAGE = "admin-mfa.html";
    const PROJECT_INVITATION_PAGE = "project-invitation.html";
    const CORE_TEAM_SIZE = 7;
    const INVITATION_EXPIRATION_HOURS = 168;

    const RPC_GET_CORE_TEAM_MEMBERS = "get_core_team_members";
    const RPC_GET_ACTIVE_CORE_INVITATIONS = "get_active_core_invitations";
    const RPC_CREATE_PROJECT_INVITATION = "create_project_invitation";

    const $ = (id) => document.getElementById(id);

    let adminContext = null;
    let currentCoreMembers = [];
    let currentInvitationRecords = [];
    let initializationComplete = false;

    function fail(message) {
        throw new Error(String(message || "ALBUKHR Core Team security error."));
    }

    function setStatus(message, isError) {
        const element = $("pageStatus");
        if (!element) return;
        element.textContent = message || "";
        element.className = isError ? "status error" : "status";
    }

    function setSecurityState(message) {
        const element = $("securityState");
        if (element) element.textContent = message || "";
    }

    function setBusy(id, busy, idleText, busyText) {
        const button = $(id);
        if (!button) return;
        button.disabled = Boolean(busy);
        button.textContent = busy ? busyText : idleText;
    }

    function assertMainnet() {
        const environment = window.ALBukhrEnvironment;
        if (!environment || typeof environment.isKnown !== "function" ||
            typeof environment.isMainnet !== "function") {
            fail("ALBUKHR environment security is unavailable.");
        }
        if (!environment.isKnown() || !environment.isMainnet()) {
            fail("Core Team is available only on ALBUKHR MAINNET.");
        }
    }

    function getClient() {
        assertMainnet();
        const client = window.ALBUKHR_SUPABASE && window.ALBUKHR_SUPABASE.client;
        if (!client || typeof client.schema !== "function") {
            fail("ALBUKHR Mainnet Supabase Core is unavailable.");
        }
        return client;
    }

    function getAdminAuth() {
        const auth = window.AlbukhrSupabaseAdminAuth;
        if (!auth) fail("ALBUKHR Supabase Admin Auth is unavailable.");
        return auth;
    }

    function roles() {
        return Array.isArray(adminContext && adminContext.roles)
            ? adminContext.roles.map((r) => String(r || "").trim().toLowerCase()).filter(Boolean)
            : [];
    }

    function isSuperAdmin() {
        return roles().includes("super_admin");
    }

    function normalizeCoreSlot(value) {
        const slot = Number(value);
        return Number.isInteger(slot) && slot >= 1 && slot <= CORE_TEAM_SIZE ? slot : null;
    }

    function normalizeEmail(value) {
        const email = String(value || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            fail("Enter a valid email address.");
        }
        return email;
    }

    function escapeHtml(value) {
        const node = document.createElement("div");
        node.textContent = String(value == null ? "" : value);
        return node.innerHTML;
    }

    function formatDate(value) {
        if (!value) return "";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        try { return date.toLocaleString(); } catch (_) { return date.toISOString(); }
    }

    async function requireFreshAal2() {
        const auth = getAdminAuth();
        const mfa = await auth.ensureMfa();

        if (!mfa || mfa.required !== true || mfa.verified !== true) {
            window.location.replace(ADMIN_MFA_PAGE);
            fail("AAL2 MFA verification is required.");
        }

        const client = getClient();
        const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (error) throw error;

        if (!data || data.currentLevel !== "aal2") {
            window.location.replace(ADMIN_MFA_PAGE);
            fail("Current session does not have AAL2 assurance.");
        }

        adminContext = await auth.refreshAdminContext();
        if (!adminContext || adminContext.is_admin !== true ||
            String(adminContext.status || "").toLowerCase() !== "active") {
            fail("Admin authorization is no longer active.");
        }

        if (!isSuperAdmin()) {
            fail("Only Super Admin can manage the Core Team.");
        }

        return adminContext;
    }

    function showAuthorized() {
        $("deniedPanel")?.classList.add("hidden");
        $("corePanel")?.classList.remove("hidden");
        $("recordsPanel")?.classList.remove("hidden");
        if ($("authorization")) $("authorization").textContent = "AUTHORIZED";
        if ($("securityLevel")) $("securityLevel").textContent = "AAL2 VERIFIED";
    }

    function showDenied() {
        $("deniedPanel")?.classList.remove("hidden");
        $("corePanel")?.classList.add("hidden");
        $("recordsPanel")?.classList.add("hidden");
        $("tokenPanel")?.classList.add("hidden");
        if ($("authorization")) $("authorization").textContent = "DENIED";
        if ($("securityLevel")) $("securityLevel").textContent = "RESTRICTED";
    }

    function updateMemberCount(count) {
        const element = $("memberCount");
        if (element) element.textContent = Math.max(0, Math.min(Number(count) || 0, CORE_TEAM_SIZE)) + " / " + CORE_TEAM_SIZE;
    }

    function renderCoreTeam(rows) {
        const list = $("invitationList");
        const emptyState = $("emptyState");
        currentCoreMembers = Array.isArray(rows) ? rows : [];
        updateMemberCount(currentCoreMembers.length);
        if (!list) return;
        list.innerHTML = "";

        if (!currentCoreMembers.length) {
            emptyState?.classList.remove("hidden");
            return;
        }

        emptyState?.classList.add("hidden");

        currentCoreMembers.slice()
            .sort((a, b) => (normalizeCoreSlot(a.core_slot) || 999) - (normalizeCoreSlot(b.core_slot) || 999))
            .forEach((member) => {
                const record = document.createElement("article");
                record.className = "record";
                const email = member.email_snapshot || member.email || "No email snapshot";
                const slot = normalizeCoreSlot(member.core_slot) || "—";
                const grantedAt = formatDate(member.granted_at);

                record.innerHTML =
                    '<div class="record-main"><b>' + escapeHtml(email) + '</b><small>Core Slot ' +
                    escapeHtml(slot) + (grantedAt ? " • Granted " + escapeHtml(grantedAt) : "") +
                    '</small></div><span class="record-status">ACTIVE</span>';

                list.appendChild(record);
            });
    }

    async function rpc(name, parameters) {
        await requireFreshAal2();
        const response = await getClient().schema("albukhr_security").rpc(name, parameters || {});
        if (response.error) throw response.error;
        return response.data;
    }

    async function loadCoreTeam() {
        const data = await rpc(RPC_GET_CORE_TEAM_MEMBERS);
        renderCoreTeam(Array.isArray(data) ? data : []);
    }

    async function loadActiveCoreInvitations() {
        const data = await rpc(RPC_GET_ACTIVE_CORE_INVITATIONS);
        currentInvitationRecords = Array.isArray(data) ? data : [];
    }

    function reservedSlots() {
        const slots = new Set();
        currentCoreMembers.forEach((row) => {
            const slot = normalizeCoreSlot(row.core_slot);
            if (slot !== null) slots.add(slot);
        });
        currentInvitationRecords.forEach((row) => {
            const slot = normalizeCoreSlot(row.core_slot);
            if (slot !== null) slots.add(slot);
        });
        return slots;
    }

    function updateSlotOptions() {
        const select = $("coreSlot");
        if (!select) return;
        const reserved = reservedSlots();
        Array.from(select.options).forEach((option) => {
            const slot = normalizeCoreSlot(option.value);
            if (slot !== null) option.disabled = reserved.has(slot);
        });
    }

    async function refreshCoreTeam() {
        await Promise.all([loadCoreTeam(), loadActiveCoreInvitations()]);
        updateSlotOptions();
        setStatus("Core Team security state refreshed.");
    }

    function clearInvitationToken() {
        const input = $("invitationToken");
        if (input) input.value = "";
        $("tokenPanel")?.classList.add("hidden");
    }

    function showInvitationToken(rawToken) {
        if (typeof rawToken !== "string" || !rawToken) {
            fail("The invitation service returned no usable invitation token.");
        }

        const url = new URL(PROJECT_INVITATION_PAGE, window.location.href);
        url.searchParams.set("token", rawToken);

        const input = $("invitationToken");
        if (!input) fail("Invitation URL field is unavailable.");

        input.value = url.toString();
        $("tokenPanel")?.classList.remove("hidden");
        $("tokenPanel")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    async function createCoreTeamInvitation(email, coreSlot) {
        const data = await rpc(RPC_CREATE_PROJECT_INVITATION, {
            p_project_type: "core",
            p_invited_email: email,
            p_expires_in_hours: INVITATION_EXPIRATION_HOURS,
            p_core_slot: coreSlot
        });

        if (!data || typeof data !== "object") {
            fail("The invitation service returned an invalid response.");
        }
        if (data.success === false || data.authorized === false) {
            fail(data.message || "Core Team invitation was denied.");
        }
        if (typeof data.invitation_token !== "string" || !data.invitation_token) {
            fail("The invitation was created but no usable invitation token was returned.");
        }
        return data;
    }

    async function handleInviteSubmit(event) {
        event.preventDefault();

        try {
            const email = normalizeEmail($("inviteEmail")?.value);
            const slot = normalizeCoreSlot($("coreSlot")?.value);
            if (slot === null) fail("Select a Core Slot from 1 to 7.");

            // UX only. Database constraints and RPC authorization remain authoritative.
            if (reservedSlots().has(slot)) {
                fail("This Core Slot is already occupied or reserved by an active invitation.");
            }

            setBusy("inviteButton", true, "Create Core Team Invitation", "Creating...");
            clearInvitationToken();
            setStatus("Creating secure Core Team invitation...");

            const result = await createCoreTeamInvitation(email, slot);
            showInvitationToken(result.invitation_token);
            $("inviteForm")?.reset();

            try { await refreshCoreTeam(); }
            catch (refreshError) { console.error("[ALBUKHR CORE TEAM POST-CREATE REFRESH]", refreshError); }

            setStatus(result.message || "Core Team invitation created successfully. Copy and securely deliver the invitation link.");
        } catch (error) {
            console.error("[ALBUKHR CORE TEAM INVITATION]", error);
            setStatus(error?.message || "Core Team invitation failed.", true);
        } finally {
            setBusy("inviteButton", false, "Create Core Team Invitation", "Creating...");
        }
    }

    async function handleRefresh() {
        try {
            setBusy("refreshButton", true, "Refresh", "Refreshing...");
            await refreshCoreTeam();
        } catch (error) {
            console.error("[ALBUKHR CORE TEAM REFRESH]", error);
            setStatus(error?.message || "Core Team refresh failed.", true);
        } finally {
            setBusy("refreshButton", false, "Refresh", "Refreshing...");
        }
    }

    async function copyInvitationToken() {
        try {
            const input = $("invitationToken");
            const value = input?.value || "";
            if (!value) fail("No invitation URL is available.");

            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
            } else {
                input.focus();
                input.select();
                if (!document.execCommand("copy")) fail("Clipboard copy failed.");
            }

            setStatus("Invitation URL copied successfully.");
        } catch (error) {
            setStatus(error?.message || "Invitation URL copy failed.", true);
        }
    }

    async function handleLogout() {
        try { await getAdminAuth().signOut(); }
        catch (error) { console.error("[ALBUKHR ADMIN LOGOUT]", error); }
        finally { window.location.replace(ADMIN_LOGIN_PAGE); }
    }

    async function initialize() {
        if (initializationComplete) return;

        try {
            assertMainnet();
            clearInvitationToken();

            const auth = getAdminAuth();
            await auth.init();

            adminContext = await auth.requireAdmin({ redirect: false });
            if (!adminContext) {
                window.location.replace(ADMIN_LOGIN_PAGE);
                return;
            }

            const mfa = await auth.ensureMfa();
            if (adminContext.mfa_required && !mfa?.verified) {
                window.location.replace(ADMIN_MFA_PAGE);
                return;
            }

            await requireFreshAal2();
            setSecurityState("Authenticated • AAL2");

            if (!isSuperAdmin()) {
                showDenied();
                setStatus("Core Team management requires Super Admin.", true);
                initializationComplete = true;
                return;
            }

            showAuthorized();
            await refreshCoreTeam();
            initializationComplete = true;
        } catch (error) {
            console.error("[ALBUKHR CORE TEAM INIT]", error);
            showDenied();
            setSecurityState("Security verification failed");
            setStatus(error?.message || "Core Team authorization failed.", true);
        }
    }

    function bindEvents() {
        $("inviteForm")?.addEventListener("submit", handleInviteSubmit);
        $("copyTokenButton")?.addEventListener("click", copyInvitationToken);
        $("refreshButton")?.addEventListener("click", handleRefresh);
        $("logoutButton")?.addEventListener("click", handleLogout);
    }

    function start() {
        bindEvents();
        initialize();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})(window, document);
