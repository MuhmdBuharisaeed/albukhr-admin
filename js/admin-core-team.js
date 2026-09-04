(function (window, document) {
    "use strict";

    // =========================================================
    // ALBUKHR ADMIN CORE TEAM
    //
    // Approved architecture:
    //
    // Browser
    //    ↓
    // Existing ALBUKHR Admin Auth
    //    ↓
    // Supabase authenticated session
    //    ↓
    // albukhr_security RPC Security API
    //    ↓
    // auth.uid() + AAL2 + server authorization
    //    ↓
    // SECURITY DEFINER
    //    ↓
    // ALBUKHR security tables
    //
    // No direct browser access to:
    // - core_admin_bindings
    // - admin_users
    // - project_invitations
    //
    // =========================================================


    // =========================================================
    // CONSTANTS
    // =========================================================

    const ADMIN_LOGIN_PAGE = "admin-login.html";

    const ADMIN_MFA_PAGE = "admin-mfa.html";

    const MAINNET_ONLY_MESSAGE =
        "Core Team is available only on ALBUKHR MAINNET.";

    const CORE_TEAM_SIZE = 7;

    /*
     * The current HTML does not expose an expiration selector.
     *
     * create_project_invitation() requires:
     *
     * p_expires_in_hours
     *
     * This value must be between 1 and 720.
     *
     * 168 hours = 7 days.
     */
    const INVITATION_EXPIRATION_HOURS = 168;


    // =========================================================
    // DOM HELPERS
    // =========================================================

    const $ = function (id) {
        return document.getElementById(id);
    };


    // =========================================================
    // PAGE STATE
    // =========================================================

    let adminContext = null;

    let currentCoreMembers = [];


    // =========================================================
    // ALBUKHR ADMIN AUTH
    // =========================================================

    function getAdminAuth() {

        return window.AlbukhrSupabaseAdminAuth;

    }


    // =========================================================
    // SUPABASE CLIENT
    // =========================================================

    function getSupabaseClient() {

        const client =
            window.ALBUKHR_SUPABASE?.client;

        if (!client) {

            throw new Error(
                "ALBUKHR Supabase Core is unavailable."
            );

        }

        return client;

    }


    // =========================================================
    // ENVIRONMENT
    // =========================================================

    function assertMainnet() {

        const environment =
            window.ALBukhrEnvironment;

        if (
            !environment ||
            typeof environment.isMainnet !== "function"
        ) {

            throw new Error(
                "ALBUKHR environment security is unavailable."
            );

        }

        if (!environment.isMainnet()) {

            throw new Error(
                MAINNET_ONLY_MESSAGE
            );

        }

    }


    // =========================================================
    // STATUS
    // =========================================================

    function setStatus(
        message,
        isError
    ) {

        const element =
            $("pageStatus");

        if (!element) {
            return;
        }

        element.textContent =
            message || "";

        element.className =
            isError
                ? "status error"
                : "status";

    }


    // =========================================================
    // SECURITY STATE
    // =========================================================

    function setSecurityState(
        message
    ) {

        const element =
            $("securityState");

        if (!element) {
            return;
        }

        element.textContent =
            message || "";

    }


    // =========================================================
    // BUTTON STATE
    // =========================================================

    function setInviteBusy(
        busy
    ) {

        const button =
            $("inviteButton");

        if (!button) {
            return;
        }

        button.disabled =
            Boolean(busy);

        button.textContent =
            busy
                ? "Creating..."
                : "Create Core Team Invitation";

    }


    // =========================================================
    // AUTHORIZATION HELPERS
    // =========================================================

    function getAdminRoles() {

        if (
            !adminContext ||
            !Array.isArray(
                adminContext.roles
            )
        ) {

            return [];

        }

        return adminContext.roles
            .map(function (role) {

                return String(
                    role || ""
                )
                    .trim()
                    .toLowerCase();

            })
            .filter(Boolean);

    }


    function isSuperAdmin() {

        return getAdminRoles()
            .includes(
                "super_admin"
            );

    }


    // =========================================================
    // PAGE PANELS
    // =========================================================

    function showAuthorized() {

        const deniedPanel =
            $("deniedPanel");

        const corePanel =
            $("corePanel");

        const recordsPanel =
            $("recordsPanel");


        if (deniedPanel) {

            deniedPanel.classList.add(
                "hidden"
            );

        }


        if (corePanel) {

            corePanel.classList.remove(
                "hidden"
            );

        }


        if (recordsPanel) {

            recordsPanel.classList.remove(
                "hidden"
            );

        }


        const authorization =
            $("authorization");

        if (authorization) {

            authorization.textContent =
                "AUTHORIZED";

        }


        const securityLevel =
            $("securityLevel");

        if (securityLevel) {

            securityLevel.textContent =
                "AAL2 VERIFIED";

        }

    }


    function showDenied() {

        const deniedPanel =
            $("deniedPanel");

        const corePanel =
            $("corePanel");

        const recordsPanel =
            $("recordsPanel");


        if (deniedPanel) {

            deniedPanel.classList.remove(
                "hidden"
            );

        }


        if (corePanel) {

            corePanel.classList.add(
                "hidden"
            );

        }


        if (recordsPanel) {

            recordsPanel.classList.add(
                "hidden"
            );

        }


        const authorization =
            $("authorization");

        if (authorization) {

            authorization.textContent =
                "DENIED";

        }


        const securityLevel =
            $("securityLevel");

        if (securityLevel) {

            securityLevel.textContent =
                "RESTRICTED";

        }

    }


    // =========================================================
    // HTML ESCAPE
    //
    // Used only for server-returned text.
    // =========================================================

    function escapeHtml(
        value
    ) {

        const element =
            document.createElement("div");

        element.textContent =
            String(
                value ?? ""
            );

        return element.innerHTML;

    }


    // =========================================================
    // NORMALIZE CORE SLOT
    // =========================================================

    function normalizeCoreSlot(
        value
    ) {

        const slot =
            Number(value);

        if (
            !Number.isInteger(slot) ||
            slot < 1 ||
            slot > CORE_TEAM_SIZE
        ) {

            return null;

        }

        return slot;

    }


    // =========================================================
    // FORMAT MEMBER STATUS
    // =========================================================

    function formatMemberStatus(
        status
    ) {

        const normalized =
            String(
                status || ""
            )
                .trim()
                .toLowerCase();

        if (!normalized) {

            return "active";

        }

        return normalized;

    }


    // =========================================================
    // FORMAT DATE
    // =========================================================

    function formatDate(
        value
    ) {

        if (!value) {

            return "";

        }

        const date =
            new Date(value);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return "";

        }

        try {

            return date.toLocaleString();

        } catch (_) {

            return date.toISOString();

        }

    }


    // =========================================================
    // UPDATE MEMBER COUNT
    // =========================================================

    function updateMemberCount(
        count
    ) {

        const element =
            $("memberCount");

        if (!element) {
            return;
        }

        const safeCount =
            Math.max(
                0,
                Math.min(
                    Number(count) || 0,
                    CORE_TEAM_SIZE
                )
            );

        element.textContent =
            safeCount +
            " / " +
            CORE_TEAM_SIZE;

    }


    // =========================================================
    // RENDER CORE TEAM
    //
    // Server-authoritative data from:
    //
    // albukhr_security.get_core_team_members()
    //
    // =========================================================

    function renderCoreTeam(
        rows
    ) {

        const list =
            $("invitationList");

        const emptyState =
            $("emptyState");


        const data =
            Array.isArray(rows)
                ? rows
                : [];


        currentCoreMembers =
            data;


        updateMemberCount(
            data.length
        );


        if (!list) {

            return;

        }


        list.innerHTML =
            "";


        if (!data.length) {

            if (emptyState) {

                emptyState.classList.remove(
                    "hidden"
                );

            }

            return;

        }


        if (emptyState) {

            emptyState.classList.add(
                "hidden"
            );

        }


        data.forEach(
            function (member) {

                const record =
                    document.createElement(
                        "article"
                    );


                record.className =
                    "record";


                const email =
                    member.email_snapshot ||
                    "No email snapshot";


                const coreSlot =
                    normalizeCoreSlot(
                        member.core_slot
                    ) || "—";


                const memberStatus =
                    formatMemberStatus(
                        member.status
                    );


                const grantedAt =
                    formatDate(
                        member.granted_at
                    );


                record.innerHTML =

                    '<div class="record-main">' +

                    "<b>" +

                    escapeHtml(
                        email
                    ) +

                    "</b>" +

                    "<small>" +

                    "Core Slot " +

                    escapeHtml(
                        coreSlot
                    ) +

                    (
                        grantedAt
                            ? " • Granted " +
                              escapeHtml(
                                  grantedAt
                              )
                            : ""
                    ) +

                    "</small>" +

                    "</div>" +

                    '<span class="record-status">' +

                    escapeHtml(
                        memberStatus
                    ) +

                    "</span>";


                list.appendChild(
                    record
                );

            }
        );

    }


    // =========================================================
    // LOAD CORE TEAM
    //
    // IMPORTANT:
    //
    // No direct table query.
    //
    // Browser calls only:
    //
    // get_core_team_members()
    //
    // The database function performs:
    //
    // auth.uid()
    // AAL2 verification
    // Super Admin verification
    //
    // =========================================================

    async function loadCoreTeam() {

        if (!isSuperAdmin()) {

            throw new Error(
                "Only Super Admin can manage the Core Team."
            );

        }


        setStatus(
            "Loading server-authoritative Core Team records..."
        );


        const client =
            getSupabaseClient();


        const response =
            await client
                .schema(
                    "albukhr_security"
                )
                .rpc(
                    "get_core_team_members"
                );


        const data =
            response.data;

        const error =
            response.error;


        if (error) {

            throw error;

        }


        renderCoreTeam(
            data
        );


        setStatus(
            "Official Core Team records loaded."
        );

    }


    // =========================================================
    // GET ACTIVE SLOT
    //
    // This only reflects active Core Team bindings
    // returned by the authoritative Security API.
    //
    // Pending invitation conflicts remain
    // server-authoritative and are enforced by:
    //
    // create_project_invitation()
    //
    // =========================================================

    function getActiveCoreSlots() {

        const slots =
            new Set();


        currentCoreMembers.forEach(
            function (member) {

                const slot =
                    normalizeCoreSlot(
                        member.core_slot
                    );


                if (slot !== null) {

                    slots.add(
                        slot
                    );

                }

            }
        );


        return slots;

    }


    // =========================================================
    // UPDATE SLOT SELECT
    //
    // Already active slots are disabled locally
    // for better UX.
    //
    // The server remains authoritative.
    //
    // =========================================================

    function updateCoreSlotOptions() {

        const select =
            $("coreSlot");

        if (!select) {

            return;

        }


        const activeSlots =
            getActiveCoreSlots();


        Array.from(
            select.options
        ).forEach(
            function (option) {

                const value =
                    option.value;

                if (!value) {

                    return;

                }


                const slot =
                    normalizeCoreSlot(
                        value
                    );


                option.disabled =
                    slot !== null &&
                    activeSlots.has(slot);

            }
        );

    }


    // =========================================================
    // LOAD + UPDATE UI
    // =========================================================

    async function refreshCoreTeam() {

        await loadCoreTeam();

        updateCoreSlotOptions();

    }


    // =========================================================
    // VALIDATE EMAIL
    // =========================================================

    function validateEmail(
        email
    ) {

        const normalized =
            String(
                email || ""
            )
                .trim()
                .toLowerCase();


        if (!normalized) {

            return null;

        }


        if (
            normalized.length > 320
        ) {

            return null;

        }


        const pattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


        if (
            !pattern.test(
                normalized
            )
        ) {

            return null;

        }


        return normalized;

    }


    // =========================================================
    // SHOW INVITATION TOKEN
    //
    // The raw token is returned once by the database.
    //
    // It is:
    //
    // - NOT written to localStorage
    // - NOT written to sessionStorage
    // - NOT inserted by JavaScript
    //
    // The database stores only token_hash.
    //
    // =========================================================

    function showInvitationToken(
        token
    ) {

        if (!token) {

            return;

        }


        /*
         * window.prompt gives the Super Admin
         * a direct opportunity to copy the token.
         *
         * JavaScript does not persist it.
         */
        window.prompt(

            "Copy this invitation token now. " +
            "It is shown only from this creation response.",

            token

        );

    }


    // =========================================================
    // CREATE CORE TEAM INVITATION
    //
    // Uses the existing verified function:
    //
    // create_project_invitation(
    //   p_project_type,
    //   p_invited_email,
    //   p_expires_in_hours,
    //   p_core_slot
    // )
    //
    // =========================================================

    async function createCoreTeamInvitation(
        email,
        coreSlot
    ) {

        if (!isSuperAdmin()) {

            throw new Error(
                "Only Super Admin can create a Core Team invitation."
            );

        }


        const client =
            getSupabaseClient();


        const response =
            await client
                .schema(
                    "albukhr_security"
                )
                .rpc(
                    "create_project_invitation",
                    {

                        p_project_type:
                            "core",

                        p_invited_email:
                            email,

                        p_expires_in_hours:
                            INVITATION_EXPIRATION_HOURS,

                        p_core_slot:
                            coreSlot

                    }
                );


        const data =
            response.data;

        const error =
            response.error;


        if (error) {

            throw error;

        }


        if (
            !data ||
            typeof data !== "object"
        ) {

            throw new Error(
                "The invitation service returned an invalid response."
            );

        }


        if (
            data.success === false
        ) {

            throw new Error(
                data.message ||
                "Core Team invitation was denied."
            );

        }


        if (
            data.authorized === false
        ) {

            throw new Error(
                data.message ||
                "Core Team invitation authorization failed."
            );

        }


        return data;

    }


    // =========================================================
    // INVITATION FORM
    // =========================================================

    async function handleInviteSubmit(
        event
    ) {

        event.preventDefault();


        try {

            assertMainnet();


            if (!isSuperAdmin()) {

                throw new Error(
                    "Only Super Admin can create a Core Team invitation."
                );

            }


            const emailInput =
                $("inviteEmail");


            const slotSelect =
                $("coreSlot");


            if (
                !emailInput ||
                !slotSelect
            ) {

                throw new Error(
                    "Core Team invitation form is unavailable."
                );

            }


            const email =
                validateEmail(
                    emailInput.value
                );


            if (!email) {

                throw new Error(
                    "Enter a valid email address."
                );

            }


            const coreSlot =
                normalizeCoreSlot(
                    slotSelect.value
                );


            if (
                coreSlot === null
            ) {

                throw new Error(
                    "Select a Core Slot from 1 to 7."
                );

            }


            const activeSlots =
                getActiveCoreSlots();


            if (
                activeSlots.has(
                    coreSlot
                )
            ) {

                throw new Error(
                    "This Core Slot already has an active Core Team member."
                );

            }


            setInviteBusy(
                true
            );


            setStatus(
                "Creating secure Core Team invitation..."
            );


            const result =
                await createCoreTeamInvitation(
                    email,
                    coreSlot
                );


            /*
             * Reset form before refresh.
             */
            const form =
                $("inviteForm");


            if (form) {

                form.reset();

            }


            /*
             * The raw token is returned only in
             * this response.
             *
             * Show it before any later action.
             */
            if (
                result.invitation_token
            ) {

                showInvitationToken(
                    result.invitation_token
                );

            }


            /*
             * Reload active memberships.
             *
             * A newly created invitation does not
             * automatically create a membership binding.
             *
             * Therefore this may correctly remain 0/7
             * until the invitation is accepted and
             * server-side membership is established.
             */
            await refreshCoreTeam();


            setStatus(
                result.message ||
                "Core Team invitation created successfully."
            );

        } catch (error) {

            console.error(
                "[ALBUKHR CORE TEAM INVITATION]",
                error
            );


            setStatus(

                error?.message ||

                "Core Team invitation failed.",

                true

            );

        } finally {

            setInviteBusy(
                false
            );

        }

    }


    // =========================================================
    // REFRESH
    // =========================================================

    async function handleRefresh() {

        try {

            assertMainnet();


            await refreshCoreTeam();


        } catch (error) {

            console.error(
                "[ALBUKHR CORE TEAM REFRESH]",
                error
            );


            setStatus(

                error?.message ||

                "Core Team refresh failed.",

                true

            );

        }

    }


    // =========================================================
    // LOGOUT
    // =========================================================

    async function handleLogout() {

        try {

            const auth =
                getAdminAuth();


            if (
                auth &&
                typeof auth.signOut ===
                    "function"
            ) {

                await auth.signOut();

            }

        } catch (error) {

            console.error(
                "[ALBUKHR ADMIN LOGOUT]",
                error
            );

        } finally {

            window.location.replace(
                ADMIN_LOGIN_PAGE
            );

        }

    }


    // =========================================================
    // BIND EVENTS
    // =========================================================

    function bindEvents() {

        const form =
            $("inviteForm");


        if (form) {

            form.addEventListener(

                "submit",

                handleInviteSubmit

            );

        }


        const refreshButton =
            $("refreshButton");


        if (refreshButton) {

            refreshButton.addEventListener(

                "click",

                handleRefresh

            );

        }


        const logoutButton =
            $("logoutButton");


        if (logoutButton) {

            logoutButton.addEventListener(

                "click",

                handleLogout

            );

        }

    }


    // =========================================================
    // INITIALIZATION
    // =========================================================

    async function initialize() {

        try {

            // =============================================
            // 1. MAINNET SECURITY BOUNDARY
            // =============================================

            assertMainnet();


            // =============================================
            // 2. ADMIN AUTH ENGINE
            // =============================================

            const adminAuth =
                getAdminAuth();


            if (
                !adminAuth ||
                typeof adminAuth.init !==
                    "function"
            ) {

                throw new Error(
                    "ALBUKHR Admin Auth is unavailable."
                );

            }


            // =============================================
            // 3. INITIALIZE AUTH
            // =============================================

            await adminAuth.init();


            // =============================================
            // 4. REQUIRE ADMIN
            // =============================================

            adminContext =
                await adminAuth.requireAdmin(
                    {
                        redirect: false
                    }
                );


            if (!adminContext) {

                window.location.replace(
                    ADMIN_LOGIN_PAGE
                );

                return;

            }


            // =============================================
            // 5. MFA / AAL2
            // =============================================

            if (
                typeof adminAuth.ensureMfa !==
                    "function"
            ) {

                throw new Error(
                    "ALBUKHR Admin MFA security is unavailable."
                );

            }


            const mfa =
                await adminAuth.ensureMfa();


            if (
                adminContext.mfa_required &&
                !mfa?.verified
            ) {

                window.location.replace(
                    ADMIN_MFA_PAGE
                );

                return;

            }


            // =============================================
            // 6. SECURITY UI
            // =============================================

            setSecurityState(

                mfa?.verified
                    ? "Authenticated • AAL2"
                    : "Authenticated"

            );


            // =============================================
            // 7. CLIENT-SIDE UX CHECK
            //
            // Database RPC remains authoritative.
            // =============================================

            if (!isSuperAdmin()) {

                showDenied();


                setStatus(
                    "Core Team management requires Super Admin.",
                    true
                );


                return;

            }


            // =============================================
            // 8. AUTHORIZED UI
            // =============================================

            showAuthorized();


            // =============================================
            // 9. LOAD SERVER-AUTHORITATIVE RECORDS
            // =============================================

            await refreshCoreTeam();

        } catch (error) {

            console.error(
                "[ALBUKHR CORE TEAM INIT]",
                error
            );


            showDenied();


            setSecurityState(
                "Security verification failed"
            );


            setStatus(

                error?.message ||

                "Core Team authorization failed.",

                true

            );

        }

    }


    // =========================================================
    // START
    // =========================================================

    bindEvents();

    initialize();


})(
    window,
    document
);
