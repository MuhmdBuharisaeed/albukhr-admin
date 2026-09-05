(function (window, document) {
    "use strict";

    // =========================================================
    // ALBUKHR — ADMIN CORE TEAM
    // MAINNET SECURITY BOUNDARY
    // =========================================================

    const ADMIN_LOGIN_PAGE = "admin-login.html";
    const ADMIN_MFA_PAGE = "admin-mfa.html";

    const PROJECT_INVITATION_PAGE =
        "project-invitation.html";

    const MAINNET_ONLY_MESSAGE =
        "Core Team is available only on ALBUKHR MAINNET.";

    const CORE_TEAM_SIZE = 7;

    const INVITATION_EXPIRATION_HOURS = 168;


    // =========================================================
    // DOM
    // =========================================================

    const $ = function (id) {
        return document.getElementById(id);
    };


    // =========================================================
    // STATE
    // =========================================================

    let adminContext = null;

    let currentCoreMembers = [];

    let currentInvitationRecords = [];


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

    function setStatus(message, isError) {

        const element =
            $("pageStatus");

        if (!element) return;


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

    function setSecurityState(message) {

        const element =
            $("securityState");

        if (element) {

            element.textContent =
                message || "";

        }

    }


    // =========================================================
    // INVITE BUTTON
    // =========================================================

    function setInviteBusy(busy) {

        const button =
            $("inviteButton");

        if (!button) return;


        button.disabled =
            Boolean(busy);


        button.textContent =
            busy
                ? "Creating..."
                : "Create Core Team Invitation";

    }


    // =========================================================
    // ADMIN ROLES
    // =========================================================

    function getAdminRoles() {

        if (
            !adminContext ||
            !Array.isArray(adminContext.roles)
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


        const authorization =
            $("authorization");

        const securityLevel =
            $("securityLevel");


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


        const authorization =
            $("authorization");

        const securityLevel =
            $("securityLevel");


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

    function escapeHtml(value) {

        const element =
            document.createElement("div");


        element.textContent =
            String(value ?? "");


        return element.innerHTML;

    }


    // =========================================================
    // CORE SLOT NORMALIZATION
    // =========================================================

    function normalizeCoreSlot(value) {

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

    function formatDate(value) {

        if (!value) return "";


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

    function updateMemberCount(count) {

        const element =
            $("memberCount");


        if (!element) return;


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

    function renderCoreTeam(rows) {

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


        if (!list) return;


        list.innerHTML = "";


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


        data.forEach(function (member) {

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


            const grantedAt =
                formatDate(
                    member.granted_at
                );


            record.innerHTML =

                '<div class="record-main">' +

                "<b>" +

                escapeHtml(email) +

                "</b>" +

                "<small>" +

                "Core Slot " +

                escapeHtml(coreSlot) +

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

        });

    }


    // =========================================================
    // LOAD CORE TEAM
    // =========================================================

    async function loadCoreTeam() {

        if (!isSuperAdmin()) {

            throw new Error(
                "Only Super Admin can manage the Core Team."
            );

        }


        setStatus(
            "Loading official Core Team records..."
        );


        const response =

            await getSupabaseClient()

                .schema(
                    "albukhr_security"
                )

                .rpc(
                    "get_core_team_members"
                );


        if (response.error) {

            throw response.error;

        }


        renderCoreTeam(
            response.data
        );


        setStatus(
            "Official Core Team records loaded."
        );

    }


    // =========================================================
    // LOAD ACTIVE CORE INVITATIONS
    //
    // IMPORTANT:
    //
    // Active invitations reserve Core Slots.
    //
    // Database remains authoritative.
    // =========================================================

    async function loadActiveCoreInvitations() {

        const response =

            await getSupabaseClient()

                .schema(
                    "albukhr_security"
                )

                .from(
                    "project_invitations"
                )

                .select(
                    [
                        "id",
                        "core_slot",
                        "invited_email",
                        "expires_at",
                        "used_at",
                        "revoked_at",
                        "project_type"
                    ].join(",")
                )

                .eq(
                    "project_type",
                    "core"
                )

                .is(
                    "used_at",
                    null
                )

                .is(
                    "revoked_at",
                    null
                )

                .gt(
                    "expires_at",

                    new Date()
                        .toISOString()
                );


        if (response.error) {

            throw response.error;

        }


        currentInvitationRecords =

            Array.isArray(
                response.data
            )

                ? response.data

                : [];

    }


    // =========================================================
    // ACTIVE MEMBER SLOTS
    // =========================================================

    function getActiveMemberSlots() {

        const slots =
            new Set();


        currentCoreMembers

            .forEach(
                function (member) {

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
                function (invitation) {

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
    // Member + Active Invitation
    // =========================================================

    function getReservedCoreSlots() {

        const slots =
            new Set();


        getActiveMemberSlots()

            .forEach(
                function (slot) {

                    slots.add(
                        slot
                    );

                }
            );


        getActiveInvitationSlots()

            .forEach(
                function (slot) {

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


        if (!select) return;


        const reservedSlots =
            getReservedCoreSlots();


        Array

            .from(
                select.options
            )

            .forEach(
                function (option) {

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

    }


    // =========================================================
    // REFRESH CORE TEAM
    // =========================================================

    async function refreshCoreTeam() {

        await Promise.all([

            loadCoreTeam(),

            loadActiveCoreInvitations()

        ]);


        updateCoreSlotOptions();

    }


    // =========================================================
    // EMAIL VALIDATION
    // =========================================================

    function validateEmail(email) {

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

                .test(normalized)

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

            input.value = "";

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
    // https://app.albukhr.com/project-invitation.html?token=...
    // =========================================================

    function buildInvitationUrl(token) {

        if (

            typeof token !== "string" ||

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
    // The field contains the complete URL.
    // =========================================================

    function showInvitationToken(token) {

        if (

            typeof token !== "string" ||

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

        catch (_) {}

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

                typeof invitationUrl !== "string" ||

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
                    .writeText === "function"

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


        if (response.error) {

            throw response.error;

        }


        const data =
            response.data;


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


        if (

            typeof data.invitation_token !== "string" ||

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

    async function handleInviteSubmit(event) {

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


            if (

                getReservedCoreSlots()

                    .has(coreSlot)

            ) {

                throw new Error(

                    "This Core Slot is already occupied or reserved by an active invitation."

                );

            }


            setInviteBusy(true);


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
            // SHOW URL IMMEDIATELY
            //
            // Raw token is only available from this response.
            // =============================================

            showInvitationToken(

                result.invitation_token

            );


            const form =
                $("inviteForm");


            if (form) {

                form.reset();

            }


            // =============================================
            // INVITATION WAS SUCCESSFUL.
            //
            // Refresh failure must NOT invalidate the
            // already-created invitation.
            // =============================================

            try {

                await refreshCoreTeam();

            }

            catch (refreshError) {

                console.error(

                    "[ALBUKHR CORE TEAM POST-CREATE REFRESH]",

                    refreshError

                );

            }


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

            setInviteBusy(false);

        }

    }


    // =========================================================
    // REFRESH
    // =========================================================

    async function handleRefresh() {

        try {

            assertMainnet();

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

                typeof auth.signOut === "function"

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

        try {

            // =============================================
            // 1. MAINNET
            // =============================================

            assertMainnet();


            // =============================================
            // 2. TOKEN SECURITY
            //
            // Never retain old raw invitation URLs.
            // =============================================

            clearInvitationToken();


            // =============================================
            // 3. ADMIN AUTH
            // =============================================

            const adminAuth =
                getAdminAuth();


            if (

                !adminAuth ||

                typeof adminAuth.init !== "function"

            ) {

                throw new Error(

                    "ALBUKHR Admin Auth is unavailable."

                );

            }


            // =============================================
            // 4. INITIALIZE
            // =============================================

            await adminAuth.init();


            // =============================================
            // 5. ACTIVE ADMIN
            // =============================================

            adminContext =

                await adminAuth.requireAdmin({

                    redirect: false

                });


            if (!adminContext) {

                window.location.replace(

                    ADMIN_LOGIN_PAGE

                );

                return;

            }


            // =============================================
            // 6. MFA
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


            setSecurityState(

                mfa?.verified

                    ? "Authenticated • AAL2"

                    : "Authenticated"

            );


            // =============================================
            // 7. SUPER ADMIN
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
            // 8. AUTHORIZED
            // =============================================

            showAuthorized();


            // =============================================
            // 9. LOAD DATA
            // =============================================

            await refreshCoreTeam();

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

    bindEvents();

    initialize();


})(window, document);
