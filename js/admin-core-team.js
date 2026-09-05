(function (window, document) {
    "use strict";


    // =========================================================
    // ALBUKHR — ADMIN CORE TEAM
    // MAINNET SECURITY BOUNDARY
    //
    // SECURITY ARCHITECTURE
    // ---------------------------------------------------------
    // Browser must NEVER directly read:
    //
    // albukhr_security.project_invitations
    // albukhr_security.core_admin_bindings
    // albukhr_security.admin_users
    //
    // Protected data is accessed through SECURITY DEFINER RPCs.
    // =========================================================


    // =========================================================
    // CONSTANTS
    // =========================================================

    const ADMIN_LOGIN_PAGE =
        "admin-login.html";


    const ADMIN_MFA_PAGE =
        "admin-mfa.html";


    const PROJECT_INVITATION_PAGE =
        "project-invitation.html";


    const MAINNET_ONLY_MESSAGE =
        "Core Team is available only on ALBUKHR MAINNET.";


    const CORE_TEAM_SIZE =
        7;


    const INVITATION_EXPIRATION_HOURS =
        168;


    // =========================================================
    // RPC NAMES
    // =========================================================

    const RPC_GET_CORE_TEAM_MEMBERS =
        "get_core_team_members";


    const RPC_GET_ACTIVE_CORE_INVITATIONS =
        "get_active_core_invitations";


    const RPC_CREATE_PROJECT_INVITATION =
        "create_project_invitation";


    // =========================================================
    // DOM
    // =========================================================

    const $ = function (id) {

        return document.getElementById(id);

    };


    // =========================================================
    // STATE
    // =========================================================

    let adminContext =
        null;


    let currentCoreMembers =
        [];


    let currentInvitationRecords =
        [];


    let initializationComplete =
        false;


    // =========================================================
    // ADMIN AUTH
    // =========================================================

    function getAdminAuth() {

        return window.AlbukhrSupabaseAdminAuth;

    }


    // =========================================================
    // SUPABASE
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
    // MAINNET
    // =========================================================

    function assertMainnet() {

        const environment =
            window.ALBukhrEnvironment;


        if (

            !environment ||

            typeof environment.isMainnet !==
            "function"

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
    // INVITE BUTTON
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
    // REFRESH BUTTON
    // =========================================================

    function setRefreshBusy(
        busy
    ) {

        const button =
            $("refreshButton");


        if (!button) {

            return;

        }


        button.disabled =
            Boolean(busy);


        if (busy) {

            button.textContent =
                "Refreshing...";

        }

        else {

            button.textContent =
                "Refresh";

        }

    }


    // =========================================================
    // ADMIN ROLES
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

            .map(

                function (role) {

                    return String(
                        role || ""
                    )

                        .trim()

                        .toLowerCase();

                }

            )

            .filter(Boolean);

    }


    // =========================================================
    // SUPER ADMIN
    // =========================================================

    function isSuperAdmin() {

        return getAdminRoles()

            .includes(
                "super_admin"
            );

    }


    // =========================================================
    // AUTHORIZED UI
    // =========================================================

    function showAuthorized() {

        const deniedPanel =
            $("deniedPanel");


        const corePanel =
            $("corePanel");


        const recordsPanel =
            $("recordsPanel");


        const authorization =
            $("authorization");


        const securityLevel =
            $("securityLevel");


        if (deniedPanel) {

            deniedPanel.classList
                .add("hidden");

        }


        if (corePanel) {

            corePanel.classList
                .remove("hidden");

        }


        if (recordsPanel) {

            recordsPanel.classList
                .remove("hidden");

        }


        if (authorization) {

            authorization.textContent =
                "AUTHORIZED";

        }


        if (securityLevel) {

            securityLevel.textContent =
                "AAL2 VERIFIED";

        }

    }


    // =========================================================
    // DENIED UI
    // =========================================================

    function showDenied() {

        const deniedPanel =
            $("deniedPanel");


        const corePanel =
            $("corePanel");


        const recordsPanel =
            $("recordsPanel");


        const tokenPanel =
            $("tokenPanel");


        const authorization =
            $("authorization");


        const securityLevel =
            $("securityLevel");


        if (deniedPanel) {

            deniedPanel.classList
                .remove("hidden");

        }


        if (corePanel) {

            corePanel.classList
                .add("hidden");

        }


        if (recordsPanel) {

            recordsPanel.classList
                .add("hidden");

        }


        if (tokenPanel) {

            tokenPanel.classList
                .add("hidden");

        }


        if (authorization) {

            authorization.textContent =
                "DENIED";

        }


        if (securityLevel) {

            securityLevel.textContent =
                "RESTRICTED";

        }

    }


    // =========================================================
    // HTML ESCAPE
    // =========================================================

    function escapeHtml(
        value
    ) {

        const element =
            document.createElement(
                "div"
            );


        element.textContent =
            String(value ?? "");


        return element.innerHTML;

    }


    // =========================================================
    // CORE SLOT NORMALIZATION
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
    // DATE FORMAT
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

        }

        catch (_) {

            return date.toISOString();

        }

    }


    // =========================================================
    // MEMBER COUNT
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

                emptyState.classList
                    .remove("hidden");

            }


            return;

        }


        if (emptyState) {

            emptyState.classList
                .add("hidden");

        }


        data

            .slice()

            .sort(

                function (
                    first,
                    second
                ) {

                    const firstSlot =
                        normalizeCoreSlot(
                            first.core_slot
                        ) || 999;


                    const secondSlot =
                        normalizeCoreSlot(
                            second.core_slot
                        ) || 999;


                    return (
                        firstSlot -
                        secondSlot
                    );

                }

            )

            .forEach(

                function (
                    member
                ) {

                    const record =
                        document.createElement(
                            "article"
                        );


                    record.className =
                        "record";


                    const email =

                        member.email_snapshot ||

                        member.email ||

                        "No email snapshot";


                    const coreSlot =

                        normalizeCoreSlot(
                            member.core_slot
                        )

                        || "—";


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

                        "ACTIVE" +

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
    // SECURITY:
    //
    // Uses SECURITY DEFINER RPC.
    //
    // NEVER directly reads:
    //
    // albukhr_security.core_admin_bindings
    // =========================================================

    async function loadCoreTeam() {

        if (!isSuperAdmin()) {

            throw new Error(

                "Only Super Admin can manage the Core Team."

            );

        }


        const response =

            await getSupabaseClient()

                .schema(
                    "albukhr_security"
                )

                .rpc(
                    RPC_GET_CORE_TEAM_MEMBERS
                );


        if (response.error) {

            throw response.error;

        }


        const rows =

            Array.isArray(
                response.data
            )

                ? response.data

                : [];


        renderCoreTeam(
            rows
        );

    }


    // =========================================================
    // LOAD ACTIVE CORE INVITATIONS
    //
    // SECURITY:
    //
    // Uses SECURITY DEFINER RPC.
    //
    // IMPORTANT:
    //
    // Browser must NEVER execute:
    //
    // .from("project_invitations")
    //
    // This fixes:
    //
    // permission denied for table project_invitations
    //
    // Active invitations reserve Core Slots.
    //
    // Database remains authoritative.
    // =========================================================

    async function loadActiveCoreInvitations() {

        if (!isSuperAdmin()) {

            throw new Error(

                "Only Super Admin can load Core Team invitations."

            );

        }


        const response =

            await getSupabaseClient()

                .schema(
                    "albukhr_security"
                )

                .rpc(
                    RPC_GET_ACTIVE_CORE_INVITATIONS
                );


        if (response.error) {

            throw response.error;

        }


        const rows =

            Array.isArray(
                response.data
            )

                ? response.data

                : [];


        currentInvitationRecords =
            rows;

    }


    // =========================================================
    // ACTIVE MEMBER SLOTS
    // =========================================================

    function getActiveMemberSlots() {

        const slots =
            new Set();


        currentCoreMembers

            .forEach(

                function (
                    member
                ) {

                    const slot =

                        normalizeCoreSlot(
                            member.core_slot
                        );


                    if (

                        slot !== null

                    ) {

                        slots.add(
                            slot
                        );

                    }

                }

            );


        return slots;

    }


    // =========================================================
    // ACTIVE INVITATION SLOTS
    // =========================================================

    function getActiveInvitationSlots() {

        const slots =
            new Set();


        currentInvitationRecords

            .forEach(

                function (
                    invitation
                ) {

                    const slot =

                        normalizeCoreSlot(
                            invitation.core_slot
                        );


                    if (

                        slot !== null

                    ) {

                        slots.add(
                            slot
                        );

                    }

                }

            );


        return slots;

    }


    // =========================================================
    // RESERVED CORE SLOTS
    //
    // Reserved =
    //
    // Active Core Member
    // +
    // Active Core Invitation
    // =========================================================

    function getReservedCoreSlots() {

        const slots =
            new Set();


        getActiveMemberSlots()

            .forEach(

                function (
                    slot
                ) {

                    slots.add(
                        slot
                    );

                }

            );


        getActiveInvitationSlots()

            .forEach(

                function (
                    slot
                ) {

                    slots.add(
                        slot
                    );

                }

            );


        return slots;

    }


    // =========================================================
    // SLOT OPTIONS
    // =========================================================

    function updateCoreSlotOptions() {

        const select =
            $("coreSlot");


        if (!select) {

            return;

        }


        const reservedSlots =
            getReservedCoreSlots();


        Array

            .from(
                select.options
            )

            .forEach(

                function (
                    option
                ) {

                    if (!option.value) {

                        return;

                    }


                    const slot =

                        normalizeCoreSlot(
                            option.value
                        );


                    option.disabled =

                        slot !== null &&

                        reservedSlots.has(
                            slot
                        );

                }

            );


        // =============================================
        // RESET INVALID SELECTION
        // =============================================

        const selectedSlot =

            normalizeCoreSlot(
                select.value
            );


        if (

            selectedSlot !== null &&

            reservedSlots.has(
                selectedSlot
            )

        ) {

            select.value =
                "";

        }

    }


    // =========================================================
    // REFRESH CORE TEAM
    //
    // Both RPCs execute independently.
    //
    // Promise.all ensures the UI is updated only after
    // both authoritative datasets are loaded.
    // =========================================================

    async function refreshCoreTeam() {

        if (!isSuperAdmin()) {

            throw new Error(

                "Only Super Admin can manage the Core Team."

            );

        }


        setStatus(

            "Loading official Core Team records..."

        );


        await Promise.all([

            loadCoreTeam(),

            loadActiveCoreInvitations()

        ]);


        updateCoreSlotOptions();


        setStatus(

            "Official Core Team records loaded."

        );

    }


    // =========================================================
    // EMAIL VALIDATION
    // =========================================================

    function validateEmail(
        email
    ) {

        const normalized =

            String(email || "")

                .trim()

                .toLowerCase();


        if (

            !normalized ||

            normalized.length > 320

        ) {

            return null;

        }


        if (

            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/

                .test(
                    normalized
                )

        ) {

            return null;

        }


        return normalized;

    }


    // =========================================================
    // INVITATION TOKEN
    // =========================================================

    function clearInvitationToken() {

        const panel =
            $("tokenPanel");


        const input =
            $("invitationToken");


        if (input) {

            input.value =
                "";

        }


        if (panel) {

            panel.classList
                .add("hidden");

        }

    }


    // =========================================================
    // BUILD INVITATION URL
    //
    // Example:
    //
    // https://app.albukhr.com/
    // project-invitation.html?token=...
    // =========================================================

    function buildInvitationUrl(
        token
    ) {

        if (

            typeof token !==
            "string" ||

            !token

        ) {

            throw new Error(

                "Invitation token is invalid."

            );

        }


        const url =

            new URL(

                PROJECT_INVITATION_PAGE,

                window.location.href

            );


        url.searchParams.set(

            "token",

            token

        );


        return url.toString();

    }


    // =========================================================
    // SHOW INVITATION
    //
    // Raw invitation token exists only here.
    //
    // Database stores ONLY token hash.
    // =========================================================

    function showInvitationToken(
        token
    ) {

        if (

            typeof token !==
            "string" ||

            !token

        ) {

            throw new Error(

                "Invitation token was not returned."

            );

        }


        const panel =
            $("tokenPanel");


        const input =
            $("invitationToken");


        if (

            !panel ||

            !input

        ) {

            throw new Error(

                "Invitation token panel is unavailable."

            );

        }


        const invitationUrl =

            buildInvitationUrl(
                token
            );


        input.value =
            invitationUrl;


        panel.classList
            .remove("hidden");


        input.focus();

        input.select();

        input.setSelectionRange(

            0,

            invitationUrl.length

        );


        try {

            panel.scrollIntoView({

                behavior:
                    "smooth",

                block:
                    "center"

            });

        }

        catch (_) {

            // Ignore UI scroll failure.

        }

    }


    // =========================================================
    // COPY INVITATION URL
    // =========================================================

    async function copyInvitationToken() {

        try {

            const input =
                $("invitationToken");


            if (!input) {

                throw new Error(

                    "Invitation URL field is unavailable."

                );

            }


            const invitationUrl =
                input.value;


            if (

                typeof invitationUrl !==
                "string" ||

                !invitationUrl

            ) {

                throw new Error(

                    "No invitation URL is available."

                );

            }


            if (

                navigator.clipboard &&

                typeof navigator
                    .clipboard
                    .writeText ===
                    "function"

            ) {

                await navigator

                    .clipboard

                    .writeText(
                        invitationUrl
                    );

            }

            else {

                input.focus();

                input.select();

                input.setSelectionRange(

                    0,

                    invitationUrl.length

                );


                const copied =

                    document.execCommand(
                        "copy"
                    );


                if (!copied) {

                    throw new Error(

                        "Clipboard copy failed."

                    );

                }

            }


            setStatus(

                "Invitation URL copied successfully."

            );


            const button =
                $("copyTokenButton");


            if (button) {

                button.textContent =
                    "Copied ✓";


                setTimeout(

                    function () {

                        if (button) {

                            button.textContent =
                                "Copy Invitation Link";

                        }

                    },

                    2000

                );

            }

        }

        catch (error) {

            console.error(

                "[ALBUKHR INVITATION COPY]",

                error

            );


            setStatus(

                error?.message ||

                "Invitation URL copy failed.",

                true

            );


            const input =
                $("invitationToken");


            if (input) {

                input.focus();

                input.select();

            }

        }

    }


    // =========================================================
    // CREATE CORE INVITATION
    //
    // SECURITY:
    //
    // create_project_invitation is SECURITY DEFINER.
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


        const response =

            await getSupabaseClient()

                .schema(
                    "albukhr_security"
                )

                .rpc(

                    RPC_CREATE_PROJECT_INVITATION,

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


        if (response.error) {

            throw response.error;

        }


        const data =
            response.data;


        if (

            !data ||

            typeof data !==
            "object"

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


        if (

            typeof data.invitation_token !==
            "string" ||

            !data.invitation_token

        ) {

            throw new Error(

                "The invitation was created but no usable invitation token was returned."

            );

        }


        return data;

    }


    // =========================================================
    // INVITATION SUBMIT
    // =========================================================

    async function handleInviteSubmit(
        event
    ) {

        event.preventDefault();


        try {

            // =============================================
            // MAINNET
            // =============================================

            assertMainnet();


            // =============================================
            // AUTHORIZATION
            // =============================================

            if (!isSuperAdmin()) {

                throw new Error(

                    "Only Super Admin can create a Core Team invitation."

                );

            }


            // =============================================
            // DOM
            // =============================================

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


            // =============================================
            // EMAIL
            // =============================================

            const email =

                validateEmail(
                    emailInput.value
                );


            if (!email) {

                throw new Error(

                    "Enter a valid email address."

                );

            }


            // =============================================
            // CORE SLOT
            // =============================================

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


            // =============================================
            // CLIENT-SIDE UX CHECK
            //
            // Database remains authoritative.
            // =============================================

            if (

                getReservedCoreSlots()

                    .has(
                        coreSlot
                    )

            ) {

                throw new Error(

                    "This Core Slot is already occupied or reserved by an active invitation."

                );

            }


            // =============================================
            // BUSY
            // =============================================

            setInviteBusy(
                true
            );


            clearInvitationToken();


            setStatus(

                "Creating secure Core Team invitation..."

            );


            // =============================================
            // CREATE INVITATION
            // =============================================

            const result =

                await createCoreTeamInvitation(

                    email,

                    coreSlot

                );


            // =============================================
            // SHOW TOKEN IMMEDIATELY
            //
            // Raw token is available ONLY in the
            // creation response.
            // =============================================

            showInvitationToken(

                result.invitation_token

            );


            // =============================================
            // RESET FORM
            // =============================================

            const form =
                $("inviteForm");


            if (form) {

                form.reset();

            }


            // =============================================
            // REFRESH DATA
            //
            // Important:
            //
            // If refresh fails, invitation is STILL valid.
            // Do not hide the newly-created URL.
            // =============================================

            try {

                await refreshCoreTeam();

            }

            catch (
                refreshError
            ) {

                console.error(

                    "[ALBUKHR CORE TEAM POST-CREATE REFRESH]",

                    refreshError

                );

            }


            // =============================================
            // SUCCESS
            // =============================================

            setStatus(

                result.message ||

                "Core Team invitation created successfully. Copy and securely deliver the invitation link."

            );

        }

        catch (error) {

            console.error(

                "[ALBUKHR CORE TEAM INVITATION]",

                error

            );


            setStatus(

                error?.message ||

                "Core Team invitation failed.",

                true

            );

        }

        finally {

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


            if (!isSuperAdmin()) {

                throw new Error(

                    "Only Super Admin can refresh the Core Team."

                );

            }


            setRefreshBusy(
                true
            );


            await refreshCoreTeam();

        }

        catch (error) {

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

        finally {

            setRefreshBusy(
                false
            );

        }

    }


    // =========================================================
    // LOGOUT
    // =========================================================

    async function handleLogout() {

        try {

            clearInvitationToken();


            const auth =
                getAdminAuth();


            if (

                auth &&

                typeof auth.signOut ===
                "function"

            ) {

                await auth.signOut();

            }

        }

        catch (error) {

            console.error(

                "[ALBUKHR ADMIN LOGOUT]",

                error

            );

        }

        finally {

            window.location.replace(

                ADMIN_LOGIN_PAGE

            );

        }

    }


    // =========================================================
    // EVENTS
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


        const copyTokenButton =
            $("copyTokenButton");


        if (copyTokenButton) {

            copyTokenButton.addEventListener(

                "click",

                copyInvitationToken

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
    // INITIALIZE
    // =========================================================

    async function initialize() {

        if (

            initializationComplete

        ) {

            return;

        }


        try {

            // =============================================
            // 1. MAINNET SECURITY
            // =============================================

            assertMainnet();


            // =============================================
            // 2. CLEAR OLD RAW INVITATION TOKEN
            //
            // Raw invitation URLs are never persisted.
            // =============================================

            clearInvitationToken();


            // =============================================
            // 3. ADMIN AUTH
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
            // 4. INITIALIZE ADMIN AUTH
            // =============================================

            await adminAuth.init();


            // =============================================
            // 5. REQUIRE ADMIN
            // =============================================

            adminContext =

                await adminAuth.requireAdmin({

                    redirect:
                        false

                });


            if (!adminContext) {

                window.location.replace(

                    ADMIN_LOGIN_PAGE

                );

                return;

            }


            // =============================================
            // 6. MFA ENGINE
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


            // =============================================
            // 7. MFA REQUIRED
            // =============================================

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
            // 8. SECURITY STATE
            // =============================================

            setSecurityState(

                mfa?.verified

                    ? "Authenticated • AAL2"

                    : "Authenticated"

            );


            // =============================================
            // 9. SUPER ADMIN AUTHORIZATION
            // =============================================

            if (!isSuperAdmin()) {

                showDenied();


                setStatus(

                    "Core Team management requires Super Admin.",

                    true

                );


                initializationComplete =
                    true;


                return;

            }


            // =============================================
            // 10. AUTHORIZED UI
            // =============================================

            showAuthorized();


            // =============================================
            // 11. LOAD DATABASE STATE
            //
            // SECURITY DEFINER RPCs:
            //
            // get_core_team_members()
            //
            // get_active_core_invitations()
            // =============================================

            await refreshCoreTeam();


            initializationComplete =
                true;

        }

        catch (error) {

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

    function start() {

        bindEvents();


        initialize();

    }


    // =========================================================
    // DOM READY
    // =========================================================

    if (

        document.readyState ===
        "loading"

    ) {

        document.addEventListener(

            "DOMContentLoaded",

            start,

            {

                once:
                    true

            }

        );

    }

    else {

        start();

    }


})(window, document);
