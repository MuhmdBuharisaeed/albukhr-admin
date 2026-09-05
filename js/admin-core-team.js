(function (window, document) {
    "use strict";

    // =========================================================
    // ALBUKHR ADMIN CORE TEAM
    //
    // MAINNET SECURITY ARCHITECTURE
    //
    // Browser
    //    ↓
    // ALBUKHR Environment Security
    //    ↓
    // ALBUKHR Supabase Admin Auth
    //    ↓
    // Supabase authenticated session
    //    ↓
    // MFA / AAL2 verification
    //    ↓
    // albukhr_security RPC Security API
    //    ↓
    // auth.uid()
    //    ↓
    // SECURITY DEFINER
    //    ↓
    // Server-side Super Admin authorization
    //
    // IMPORTANT:
    //
    // Browser role checks are UX checks only.
    //
    // Database SECURITY DEFINER RPC functions remain
    // the final authorization authority.
    //
    // =========================================================


    // =========================================================
    // CONSTANTS
    // =========================================================

    const ADMIN_LOGIN_PAGE =
        "admin-login.html";


    const ADMIN_MFA_PAGE =
        "admin-mfa.html";


    const MAINNET_ONLY_MESSAGE =
        "Core Team is available only on ALBUKHR MAINNET.";


    const CORE_TEAM_SIZE =
        7;


    const INVITATION_EXPIRATION_HOURS =
        168;


    const SECURITY_SCHEMA =
        "albukhr_security";


    // =========================================================
    // DOM HELPERS
    // =========================================================

    const $ = function (id) {

        return document.getElementById(id);

    };


    // =========================================================
    // PAGE STATE
    // =========================================================

    let adminContext =
        null;


    let currentCoreMembers =
        [];


    let initializationComplete =
        false;


    let refreshInProgress =
        false;


    // =========================================================
    // ALBUKHR ADMIN AUTH
    // =========================================================

    function getAdminAuth() {

        const auth =
            window.AlbukhrSupabaseAdminAuth;


        if (!auth) {

            throw new Error(
                "ALBUKHR Admin Auth is unavailable."
            );

        }


        return auth;

    }


    // =========================================================
    // SUPABASE CLIENT
    // =========================================================

    function getSupabaseClient() {

        const core =
            window.ALBUKHR_SUPABASE;


        const client =
            core?.client;


        if (!client) {

            throw new Error(
                "ALBUKHR Supabase Core is unavailable."
            );

        }


        // =============================================
        // MAINNET CLIENT SECURITY
        // =============================================

        if (
            core.environment !== "mainnet"
        ) {

            throw new Error(
                "Core Team cannot use a non-Mainnet Supabase client."
            );

        }


        if (
            core.network !== "mainnet"
        ) {

            throw new Error(
                "Core Team network validation failed."
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
            typeof environment.isKnown !== "function" ||
            typeof environment.isMainnet !== "function"
        ) {

            throw new Error(
                "ALBUKHR environment security is unavailable."
            );

        }


        if (
            !environment.isKnown()
        ) {

            throw new Error(
                "ALBUKHR environment is unknown."
            );

        }


        if (
            !environment.isMainnet()
        ) {

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
    // REFRESH BUTTON STATE
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
    // AUTHENTICATED SESSION
    //
    // IMPORTANT:
    //
    // Core Team RPC functions depend on:
    //
    // auth.uid()
    //
    // Therefore the browser must have a real Supabase
    // authenticated session.
    //
    // =========================================================

    async function requireAuthenticatedSession() {

        const client =
            getSupabaseClient();


        const response =
            await client.auth.getSession();


        const data =
            response.data;


        const error =
            response.error;


        if (error) {

            throw error;

        }


        const session =
            data?.session;


        if (
            !session ||
            !session.user ||
            !session.access_token
        ) {

            throw new Error(
                "Authenticated Supabase session required."
            );

        }


        return session;

    }


    // =========================================================
    // SESSION / ADMIN IDENTITY CONSISTENCY
    //
    // Prevent accidental mismatch between:
    //
    // Supabase session user
    //
    // and
    //
    // Admin authorization context user.
    //
    // =========================================================

    function verifyIdentityConsistency(
        session,
        context
    ) {

        const sessionUserId =
            session?.user?.id;


        const contextUserId =
            context?.user_id;


        if (!sessionUserId) {

            throw new Error(
                "Supabase session identity is unavailable."
            );

        }


        if (!contextUserId) {

            throw new Error(
                "Admin authorization identity is unavailable."
            );

        }


        if (
            String(sessionUserId)
            !==
            String(contextUserId)
        ) {

            throw new Error(
                "Supabase session and Admin authorization identities do not match."
            );

        }

    }


    // =========================================================
    // AAL2 / MFA
    //
    // Uses the existing Admin Auth engine.
    //
    // This avoids manually guessing JWT state.
    //
    // =========================================================

    async function requireAal2() {

        const adminAuth =
            getAdminAuth();


        if (
            typeof adminAuth.ensureMfa !== "function"
        ) {

            throw new Error(
                "ALBUKHR Admin MFA security is unavailable."
            );

        }


        const mfa =
            await adminAuth.ensureMfa();


        if (!mfa?.verified) {

            const error =
                new Error(
                    "AAL2 MFA assurance is required."
                );


            error.code =
                "AAL2_REQUIRED";


            throw error;

        }


        return mfa;

    }


    // =========================================================
    // ADMIN AUTHORIZATION
    //
    // IMPORTANT:
    //
    // We use the existing Admin Auth engine.
    //
    // requireSuperAdmin()
    //
    // gets its authorization context from:
    //
    // albukhr_security.get_my_admin_context()
    //
    // The Security RPC functions remain the final
    // authorization authority.
    //
    // =========================================================

    async function requireSuperAdminContext() {

        const adminAuth =
            getAdminAuth();


        // =============================================
        // INITIALIZE ADMIN AUTH
        // =============================================

        if (
            typeof adminAuth.init !== "function"
        ) {

            throw new Error(
                "ALBUKHR Admin Auth initialization is unavailable."
            );

        }


        await adminAuth.init();


        // =============================================
        // REQUIRE ADMIN SESSION
        // =============================================

        if (
            typeof adminAuth.requireAdmin !== "function"
        ) {

            throw new Error(
                "ALBUKHR Admin authorization is unavailable."
            );

        }


        const context =
            await adminAuth.requireAdmin(
                {
                    redirect: false
                }
            );


        if (!context) {

            throw new Error(
                "Admin authentication required."
            );

        }


        // =============================================
        // ADMIN STATUS
        // =============================================

        if (
            !context.is_admin
        ) {

            throw new Error(
                "This account is not authorized for ALBUKHR administration."
            );

        }


        if (
            context.status !== "active"
        ) {

            throw new Error(
                "This Admin account is not active."
            );

        }


        // =============================================
        // SUPER ADMIN
        //
        // Existing Admin Auth engine obtains roles
        // from server-side get_my_admin_context().
        //
        // This is a UX/page-access gate.
        //
        // Final authorization remains in the RPC.
        // =============================================

        if (
            typeof adminAuth.requireSuperAdmin ===
            "function"
        ) {

            const superAdminContext =
                await adminAuth.requireSuperAdmin(
                    {
                        redirect: false
                    }
                );


            if (!superAdminContext) {

                throw new Error(
                    "Super Admin authorization required."
                );

            }


            return superAdminContext;

        }


        // =============================================
        // FALLBACK
        // =============================================

        const roles =
            Array.isArray(
                context.roles
            )
                ? context.roles
                : [];


        if (
            !roles.includes(
                "super_admin"
            )
        ) {

            throw new Error(
                "Super Admin authorization required."
            );

        }


        return context;

    }


    // =========================================================
    // LOAD VERIFIED SECURITY CONTEXT
    //
    // One unified security preparation function.
    //
    // =========================================================

    async function establishSecurityContext() {

        // =============================================
        // 1. MAINNET
        // =============================================

        assertMainnet();


        // =============================================
        // 2. SUPABASE CLIENT
        // =============================================

        getSupabaseClient();


        // =============================================
        // 3. ADMIN AUTHORIZATION
        // =============================================

        const context =
            await requireSuperAdminContext();


        // =============================================
        // 4. REAL SUPABASE SESSION
        // =============================================

        const session =
            await requireAuthenticatedSession();


        // =============================================
        // 5. IDENTITY CONSISTENCY
        // =============================================

        verifyIdentityConsistency(

            session,

            context

        );


        // =============================================
        // 6. MFA / AAL2
        // =============================================

        const mfa =
            await requireAal2();


        // =============================================
        // 7. SAVE CONTEXT
        // =============================================

        adminContext =
            context;


        return {

            context:

                context,


            session:

                session,


            mfa:

                mfa

        };

    }


    // =========================================================
    // SHOW AUTHORIZED
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


    // =========================================================
    // SHOW DENIED
    // =========================================================

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
    // REDIRECT TO MFA
    // =========================================================

    function redirectToMfaIfRequired(
        error
    ) {

        if (
            error?.code ===
            "AAL2_REQUIRED"
        ) {

            window.location.replace(
                ADMIN_MFA_PAGE
            );


            return true;

        }


        const message =
            String(
                error?.message || ""
            );


        if (

            message.includes(
                "AAL2 MFA assurance is required"
            )

            ||

            message.includes(
                "AAL2"
            )

        ) {

            window.location.replace(
                ADMIN_MFA_PAGE
            );


            return true;

        }


        return false;

    }


    // =========================================================
    // RENDER CORE TEAM
    //
    // Server-authoritative data only.
    //
    // Source:
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
                    )

                    ||

                    "—";


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

                            ?

                            " • Granted " +

                            escapeHtml(
                                grantedAt
                            )

                            :

                            ""

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
    // SECURITY:
    //
    // No direct browser access to:
    //
    // core_admin_bindings
    //
    // admin_users
    //
    // Browser calls only:
    //
    // get_core_team_members()
    //
    // Database verifies:
    //
    // auth.uid()
    //
    // AAL2
    //
    // is_super_admin()
    //
    // =========================================================

    async function loadCoreTeam() {

        const client =
            getSupabaseClient();


        setStatus(
            "Loading server-authoritative Core Team records..."
        );


        const response =
            await client
                .schema(
                    SECURITY_SCHEMA
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
    // ACTIVE CORE SLOTS
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
    // UPDATE SLOT OPTIONS
    //
    // UX ONLY.
    //
    // Database remains authoritative.
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

                if (
                    !option.value
                ) {

                    return;

                }


                const slot =
                    normalizeCoreSlot(
                        option.value
                    );


                option.disabled =

                    slot !== null

                    &&

                    activeSlots.has(
                        slot
                    );

            }
        );

    }


    // =========================================================
    // REFRESH CORE TEAM
    // =========================================================

    async function refreshCoreTeam() {

        if (refreshInProgress) {

            return;

        }


        refreshInProgress =
            true;


        setRefreshBusy(
            true
        );


        try {

            await loadCoreTeam();

            updateCoreSlotOptions();

        } finally {

            refreshInProgress =
                false;


            setRefreshBusy(
                false
            );

        }

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
    // SECURITY:
    //
    // - NOT localStorage
    // - NOT sessionStorage
    // - NOT database persistence
    //
    // Raw token is returned once by the server.
    //
    // =========================================================

    // =========================================================
// SHOW INVITATION TOKEN
//
// SECURITY RULES:
//
// - Raw token is returned only once by the server.
// - Never write token to localStorage.
// - Never write token to sessionStorage.
// - Never send token to another RPC.
// - Never modify or normalize the token.
// - Remove token from DOM when dialog closes.
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


    // =====================================================
    // REMOVE ANY PREVIOUS TOKEN DIALOG
    // =====================================================

    const existingDialog =
        document.getElementById(
            "albukhrInvitationTokenDialog"
        );


    if (existingDialog) {

        existingDialog.remove();

    }


    // =====================================================
    // CREATE DIALOG
    // =====================================================

    const overlay =
        document.createElement(
            "div"
        );


    overlay.id =
        "albukhrInvitationTokenDialog";


    overlay.setAttribute(
        "role",
        "dialog"
    );


    overlay.setAttribute(
        "aria-modal",
        "true"
    );


    overlay.setAttribute(
        "aria-labelledby",
        "albukhrInvitationTokenTitle"
    );


    // =====================================================
    // OVERLAY STYLE
    // =====================================================

    Object.assign(
        overlay.style,
        {

            position:
                "fixed",

            top:
                "0",

            left:
                "0",

            right:
                "0",

            bottom:
                "0",

            zIndex:
                "999999",

            display:
                "flex",

            alignItems:
                "center",

            justifyContent:
                "center",

            padding:
                "20px",

            background:
                "rgba(0, 0, 0, 0.65)",

            boxSizing:
                "border-box"

        }
    );


    // =====================================================
    // DIALOG BOX
    // =====================================================

    const dialog =
        document.createElement(
            "section"
        );


    Object.assign(
        dialog.style,
        {

            width:
                "100%",

            maxWidth:
                "560px",

            background:
                "#ffffff",

            color:
                "#102a1c",

            borderRadius:
                "20px",

            padding:
                "24px",

            boxSizing:
                "border-box",

            boxShadow:
                "0 20px 60px rgba(0,0,0,0.35)"

        }
    );


    // =====================================================
    // TITLE
    // =====================================================

    const title =
        document.createElement(
            "h2"
        );


    title.id =
        "albukhrInvitationTokenTitle";


    title.textContent =
        "Core Team Invitation Token";


    Object.assign(
        title.style,
        {

            margin:
                "0 0 12px",

            fontSize:
                "22px",

            color:
                "#0f7a3d"

        }
    );


    // =====================================================
    // SECURITY MESSAGE
    // =====================================================

    const message =
        document.createElement(
            "p"
        );


    message.textContent =

        "Copy this invitation token now. " +

        "It is shown only from this creation response. " +

        "Store it securely and send it only to the intended Core Team member.";


    Object.assign(
        message.style,
        {

            margin:
                "0 0 18px",

            lineHeight:
                "1.6",

            color:
                "#46554c"

        }
    );


    // =====================================================
    // TOKEN FIELD
    //
    // IMPORTANT:
    //
    // textContent/value receives the original token exactly.
    //
    // No trim().
    // No lowercase().
    // No normalization().
    // =====================================================

    const tokenField =
        document.createElement(
            "textarea"
        );


    tokenField.value =
        token;


    tokenField.readOnly =
        true;


    tokenField.spellcheck =
        false;


    tokenField.setAttribute(
        "aria-label",
        "Invitation token"
    );


    Object.assign(
        tokenField.style,
        {

            width:
                "100%",

            minHeight:
                "100px",

            padding:
                "14px",

            boxSizing:
                "border-box",

            border:
                "1px solid #c8d4cc",

            borderRadius:
                "12px",

            background:
                "#f7faf8",

            color:
                "#102a1c",

            fontFamily:
                "monospace",

            fontSize:
                "14px",

            lineHeight:
                "1.5",

            resize:
                "none",

            wordBreak:
                "break-all"

        }
    );


    // =====================================================
    // STATUS MESSAGE
    // =====================================================

    const copyStatus =
        document.createElement(
            "p"
        );


    copyStatus.textContent =
        "";


    Object.assign(
        copyStatus.style,
        {

            minHeight:
                "20px",

            margin:
                "12px 0",

            fontSize:
                "14px",

            color:
                "#0f7a3d"

        }
    );


    // =====================================================
    // BUTTON CONTAINER
    // =====================================================

    const actions =
        document.createElement(
            "div"
        );


    Object.assign(
        actions.style,
        {

            display:
                "flex",

            gap:
                "10px",

            justifyContent:
                "flex-end",

            flexWrap:
                "wrap",

            marginTop:
                "18px"

        }
    );


    // =====================================================
    // COPY BUTTON
    // =====================================================

    const copyButton =
        document.createElement(
            "button"
        );


    copyButton.type =
        "button";


    copyButton.textContent =
        "Copy Token";


    Object.assign(
        copyButton.style,
        {

            border:
                "none",

            borderRadius:
                "10px",

            padding:
                "12px 18px",

            background:
                "#0f7a3d",

            color:
                "#ffffff",

            fontWeight:
                "700",

            cursor:
                "pointer"

        }
    );


    // =====================================================
    // CLOSE BUTTON
    // =====================================================

    const closeButton =
        document.createElement(
            "button"
        );


    closeButton.type =
        "button";


    closeButton.textContent =
        "I Have Copied It";


    Object.assign(
        closeButton.style,
        {

            border:
                "1px solid #c8d4cc",

            borderRadius:
                "10px",

            padding:
                "12px 18px",

            background:
                "#ffffff",

            color:
                "#102a1c",

            fontWeight:
                "700",

            cursor:
                "pointer"

        }
    );


    // =====================================================
    // CLOSE FUNCTION
    //
    // Clear the raw token from the DOM before removing it.
    // =====================================================

    function closeDialog() {

        tokenField.value =
            "";


        copyStatus.textContent =
            "";


        overlay.remove();

    }


    // =====================================================
    // COPY TOKEN
    // =====================================================

    async function copyToken() {

        try {

            // =============================================
            // MODERN CLIPBOARD API
            // =============================================

            if (
                navigator.clipboard &&
                typeof navigator.clipboard.writeText ===
                    "function"
            ) {

                await navigator.clipboard.writeText(
                    token
                );

            } else {

                // =========================================
                // FALLBACK
                // =========================================

                tokenField.focus();

                tokenField.select();

                tokenField.setSelectionRange(
                    0,
                    tokenField.value.length
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


            copyStatus.textContent =
                "Invitation token copied successfully.";


            copyButton.textContent =
                "Copied ✓";


            // =============================================
            // IMPORTANT:
            //
            // Do not automatically close immediately.
            //
            // User can verify that copying succeeded.
            // =============================================

        } catch (error) {

            console.error(
                "[ALBUKHR INVITATION TOKEN COPY]",
                error
            );


            copyStatus.textContent =

                "Automatic copy failed. " +

                "Select and copy the token manually.";


            tokenField.focus();

            tokenField.select();

        }

    }


    // =====================================================
    // EVENTS
    // =====================================================

    copyButton.addEventListener(
        "click",
        copyToken
    );


    closeButton.addEventListener(
        "click",
        closeDialog
    );


    // =====================================================
    // ESC KEY
    // =====================================================

    function handleKeyDown(event) {

        if (
            event.key === "Escape"
        ) {

            closeDialog();

        }

    }


    document.addEventListener(
        "keydown",
        handleKeyDown,
        {
            once:
                true
        }
    );


    // =====================================================
    // APPEND
    // =====================================================

    actions.appendChild(
        copyButton
    );


    actions.appendChild(
        closeButton
    );


    dialog.appendChild(
        title
    );


    dialog.appendChild(
        message
    );


    dialog.appendChild(
        tokenField
    );


    dialog.appendChild(
        copyStatus
    );


    dialog.appendChild(
        actions
    );


    overlay.appendChild(
        dialog
    );


    document.body.appendChild(
        overlay
    );


    // =====================================================
    // SELECT TOKEN
    //
    // Makes manual copying easier.
    // =====================================================

    tokenField.focus();

    tokenField.select();

    tokenField.setSelectionRange(
        0,
        token.length
    );

                }
    // =========================================================
    // CREATE CORE TEAM INVITATION
    //
    // RPC:
    //
    // create_project_invitation(
    //
    //   p_project_type,
    //
    //   p_invited_email,
    //
    //   p_expires_in_hours,
    //
    //   p_core_slot
    //
    // )
    //
    // SERVER AUTHORIZATION:
    //
    // auth.uid()
    //
    // AAL2
    //
    // is_super_admin()
    //
    // =========================================================

    async function createCoreTeamInvitation(
        email,
        coreSlot
    ) {

        const client =
            getSupabaseClient();


        const response =
            await client
                .schema(
                    SECURITY_SCHEMA
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

            // =============================================
            // SECURITY RECHECK
            //
            // Do not trust previous page state.
            // =============================================

            await establishSecurityContext();


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


            // =============================================
            // LOCAL UX CHECK
            //
            // Server remains authoritative.
            // =============================================

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


            // =============================================
            // SERVER RPC
            // =============================================

            const result =
                await createCoreTeamInvitation(

                    email,

                    coreSlot

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
            // SHOW RAW TOKEN ONCE
            // =============================================

            if (
                result.invitation_token
            ) {

                showInvitationToken(
                    result.invitation_token
                );

            }


            // =============================================
            // REFRESH RECORDS
            // =============================================

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


            if (
                redirectToMfaIfRequired(
                    error
                )
            ) {

                return;

            }


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

            // =============================================
            // SECURITY RECHECK
            // =============================================

            await establishSecurityContext();


            await refreshCoreTeam();

        } catch (error) {

            console.error(

                "[ALBUKHR CORE TEAM REFRESH]",

                error

            );


            if (
                redirectToMfaIfRequired(
                    error
                )
            ) {

                return;

            }


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
            // STATUS
            // =============================================

            setStatus(
                "Verifying Core Team security..."
            );


            // =============================================
            // 1. COMPLETE SECURITY CONTEXT
            //
            // MAINNET
            //
            // ADMIN AUTH
            //
            // SUPABASE SESSION
            //
            // IDENTITY CONSISTENCY
            //
            // AAL2
            // =============================================

            const security =
                await establishSecurityContext();


            // =============================================
            // SECURITY UI
            // =============================================

            setSecurityState(

                security?.mfa?.verified

                    ?

                    "Authenticated • AAL2"

                    :

                    "Authenticated"

            );


            // =============================================
            // AUTHORIZED UI
            // =============================================

            showAuthorized();


            // =============================================
            // LOAD SERVER DATA
            // =============================================

            await refreshCoreTeam();


            initializationComplete =
                true;


        } catch (error) {

            console.error(

                "[ALBUKHR CORE TEAM INIT]",

                error

            );


            initializationComplete =
                false;


            showDenied();


            setSecurityState(
                "Security verification failed"
            );


            // =============================================
            // MFA REDIRECT
            // =============================================

            if (
                redirectToMfaIfRequired(
                    error
                )
            ) {

                return;

            }


            // =============================================
            // AUTH REDIRECT
            // =============================================

            const message =
                String(
                    error?.message || ""
                );


            if (

                message.includes(
                    "Admin authentication required"
                )

                ||

                message.includes(
                    "Authenticated Supabase session required"
                )

            ) {

                window.location.replace(
                    ADMIN_LOGIN_PAGE
                );


                return;

            }


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
