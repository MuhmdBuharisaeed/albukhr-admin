(function (window) {
    "use strict";

    // =====================================================
    // ALBUKHR SUPABASE ADMIN AUTH
    //
    // MAINNET ADMIN SECURITY CLIENT
    //
    // Authority:
    //
    // Supabase Auth
    // ↓
    // albukhr_security.get_my_admin_context()
    // ↓
    // admin_users
    // admin_role_assignments
    // core_admin_bindings
    // scoped_admin_bindings
    //
    // IMPORTANT:
    //
    // Client-side JavaScript is NOT the final authority.
    //
    // Database RPC + RLS + SECURITY DEFINER functions
    // remain the security authority.
    // =====================================================


    const CORE_NAME =
        "ALBUKHR Supabase Admin Auth";


    const LOGIN_URL =
        "admin-login.html";


    // =====================================================
    // INTERNAL STATE
    // =====================================================

    let initialized = false;

    let currentAdmin = null;

    let authSubscription = null;

    let initializationPromise = null;

    let contextPromise = null;


    // =====================================================
    // ERROR
    // =====================================================

    function fail(message) {

        throw new Error(
            String(
                message ||
                "Admin authentication error."
            )
        );

    }


    // =====================================================
    // ENVIRONMENT
    // =====================================================

    function getEnvironment() {

        const environment =
            window.ALBukhrEnvironment;


        if (
            !environment ||
            typeof environment.isKnown !== "function"
        ) {

            fail(
                "ALBUKHR Environment Core is unavailable."
            );

        }


        if (
            !environment.isKnown()
        ) {

            fail(
                "ALBUKHR environment is unknown."
            );

        }


        if (
            !environment.isMainnet()
        ) {

            fail(
                "Admin authentication is available only on ALBUKHR MAINNET."
            );

        }


        return environment;

    }


    // =====================================================
    // SUPABASE CORE
    // =====================================================

    function getSupabaseCore() {

        const core =
            window.ALBUKHR_SUPABASE;


        if (
            !core ||
            !core.client
        ) {

            fail(
                "ALBUKHR Supabase Core is unavailable."
            );

        }


        // =================================================
        // MAINNET HARD CHECK
        // =================================================

        if (
            String(core.environment || "")
                .toLowerCase()
            !==
            "mainnet"
        ) {

            fail(
                "Admin Auth cannot use a non-Mainnet Supabase client."
            );

        }


        if (
            String(core.network || "")
                .toLowerCase()
            !==
            "mainnet"
        ) {

            fail(
                "Admin Auth network validation failed."
            );

        }


        return core;

    }


    // =====================================================
    // SUPABASE CLIENT
    // =====================================================

    function getClient() {

        getEnvironment();

        return getSupabaseCore().client;

    }


    // =====================================================
    // SESSION
    // =====================================================

    async function getSession() {

        const client =
            getClient();


        const {
            data,
            error
        } =
            await client.auth.getSession();


        if (error) {

            throw error;

        }


        return (
            data &&
            data.session
        )
            ? data.session
            : null;

    }


    // =====================================================
    // REFRESH SESSION
    //
    // IMPORTANT FOR MFA:
    //
    // After MFA verification, JWT AAL may change.
    //
    // We refresh the session before requesting
    // get_my_admin_context().
    // =====================================================

    async function refreshSession() {

        const client =
            getClient();


        const {
            data,
            error
        } =
            await client.auth.refreshSession();


        if (error) {

            throw error;

        }


        return (
            data &&
            data.session
        )
            ? data.session
            : null;

    }


    // =====================================================
    // NORMALIZE ADMIN CONTEXT
    // =====================================================

    function normalizeAdminContext(
        raw,
        session
    ) {

        const source =
            Array.isArray(raw)
                ? (
                    raw[0] ||
                    null
                )
                : raw;


        // =================================================
        // NO CONTEXT
        // =================================================

        if (!source) {

            return Object.freeze({

                is_admin:
                    false,

                user_id:
                    session &&
                    session.user
                        ? session.user.id
                        : null,

                email:
                    session &&
                    session.user
                        ? (
                            session.user.email ||
                            null
                        )
                        : null,

                email_snapshot:
                    null,

                status:
                    "inactive",

                mfa_required:
                    true,

                mfa_verified:
                    false,

                roles:
                    Object.freeze([]),

                core_projects:
                    Object.freeze([]),

                scoped_projects:
                    Object.freeze([]),

                testnet_access:
                    false

            });

        }


        // =================================================
        // ROLES
        // =================================================

        const roles =
            Array.isArray(source.roles)
                ? source.roles.map(
                    function (role) {

                        return String(role);

                    }
                )
                : [];


        // =================================================
        // CORE PROJECTS
        // =================================================

        const coreProjects =
            Array.isArray(
                source.core_projects
            )
                ? source.core_projects
                : [];


        // =================================================
        // SCOPED PROJECTS
        // =================================================

        const scopedProjects =
            Array.isArray(
                source.scoped_projects
            )
                ? source.scoped_projects
                : [];


        return Object.freeze({

            // =============================================
            // ADMIN
            // =============================================

            is_admin:
                Boolean(
                    source.is_admin
                ),


            // =============================================
            // USER
            // =============================================

            user_id:

                source.user_id ||

                (
                    session &&
                    session.user
                        ? session.user.id
                        : null
                ),


            // =============================================
            // EMAIL
            // =============================================

            email:

                session &&
                session.user

                    ? (
                        session.user.email ||
                        null
                    )

                    : null,


            email_snapshot:

                source.email_snapshot ||
                null,


            // =============================================
            // STATUS
            // =============================================

            status:

                String(
                    source.status ||
                    "inactive"
                ),


            // =============================================
            // MFA
            // =============================================

            mfa_required:

                source.mfa_required !== false,


            mfa_verified:

                Boolean(
                    source.mfa_verified
                ),


            // =============================================
            // ROLES
            // =============================================

            roles:

                Object.freeze(
                    roles
                ),


            // =============================================
            // CORE PROJECTS
            // =============================================

            core_projects:

                Object.freeze(
                    coreProjects
                ),


            // =============================================
            // SCOPED PROJECTS
            // =============================================

            scoped_projects:

                Object.freeze(
                    scopedProjects
                ),


            // =============================================
            // TESTNET
            // =============================================

            testnet_access:

                Boolean(
                    source.testnet_access
                )

        });

    }


    // =====================================================
    // FETCH ADMIN CONTEXT
    //
    // SERVER-SIDE SECURITY AUTHORITY:
    //
    // albukhr_security.get_my_admin_context()
    // =====================================================

    async function fetchAdminContext() {

        // =============================================
        // PREVENT DUPLICATE SIMULTANEOUS REQUESTS
        // =============================================

        if (contextPromise) {

            return contextPromise;

        }


        contextPromise =
            (async function () {

                try {

                    const client =
                        getClient();


                    const session =
                        await getSession();


                    // =====================================
                    // NO SESSION
                    // =====================================

                    if (
                        !session ||
                        !session.user
                    ) {

                        currentAdmin =
                            null;

                        return null;

                    }


                    // =====================================
                    // CUSTOM SCHEMA SUPPORT
                    // =====================================

                    if (
                        typeof client.schema !==
                        "function"
                    ) {

                        fail(
                            "Supabase client does not support custom schemas."
                        );

                    }


                    // =====================================
                    // SERVER ADMIN CONTEXT
                    // =====================================

                    const {
                        data,
                        error
                    } =
                        await client
                            .schema(
                                "albukhr_security"
                            )
                            .rpc(
                                "get_my_admin_context"
                            );


                    if (error) {

                        throw error;

                    }


                    // =====================================
                    // NORMALIZE
                    // =====================================

                    const context =
                        normalizeAdminContext(
                            data,
                            session
                        );


                    currentAdmin =
                        context;


                    return context;

                }

                finally {

                    contextPromise =
                        null;

                }

            })();


        return contextPromise;

    }


    // =====================================================
    // CLEAR ADMIN CONTEXT
    // =====================================================

    function clearAdminContext() {

        currentAdmin =
            null;

        contextPromise =
            null;

    }


    // =====================================================
    // INITIALIZE
    // =====================================================

    async function init() {

        if (initialized) {

            return true;

        }


        if (
            initializationPromise
        ) {

            return initializationPromise;

        }


        initializationPromise =
            (async function () {

                // =========================================
                // ENVIRONMENT CHECK
                // =========================================

                getEnvironment();


                // =========================================
                // SUPABASE CHECK
                // =========================================

                const client =
                    getClient();


                // =========================================
                // EXISTING SESSION
                // =========================================

                const session =
                    await getSession();


                if (
                    session &&
                    session.user
                ) {

                    try {

                        await fetchAdminContext();

                    }

                    catch (error) {

                        console.error(

                            CORE_NAME +
                            " context initialization failed:",

                            error

                        );


                        clearAdminContext();

                    }

                }


                // =========================================
                // AUTH STATE SUBSCRIPTION
                // =========================================

                if (
                    !authSubscription
                ) {

                    const {
                        data
                    } =
                        client.auth
                            .onAuthStateChange(

                                function (
                                    event,
                                    session
                                ) {

                                    console.info(

                                        "[ALBUKHR ADMIN AUTH]",

                                        event

                                    );


                                    // =================================
                                    // SIGNED OUT
                                    // =================================

                                    if (
                                        !session ||
                                        !session.user
                                    ) {

                                        clearAdminContext();

                                        return;

                                    }


                                    // =================================
                                    // IMPORTANT:
                                    //
                                    // Do not call heavy Supabase work
                                    // directly inside the callback.
                                    //
                                    // Run asynchronously after the
                                    // auth event completes.
                                    // =================================

                                    setTimeout(

                                        async function () {

                                            try {

                                                clearAdminContext();

                                                await fetchAdminContext();

                                            }

                                            catch (error) {

                                                console.error(

                                                    "Admin context refresh failed:",

                                                    error

                                                );


                                                clearAdminContext();

                                            }

                                        },

                                        0

                                    );

                                }

                            );


                    authSubscription =
                        data &&
                        data.subscription

                            ? data.subscription

                            : null;

                }


                initialized =
                    true;


                console.info(

                    "✅ " +
                    CORE_NAME +
                    " initialized."

                );


                return true;

            })();


        try {

            return await initializationPromise;

        }

        finally {

            initializationPromise =
                null;

        }

    }


    // =====================================================
    // SIGN IN
    // =====================================================

    async function signIn(
        email,
        password
    ) {

        getEnvironment();


        if (
            !email ||
            !password
        ) {

            fail(
                "Email and password are required."
            );

        }


        const client =
            getClient();


        // =============================================
        // NORMALIZE EMAIL
        // =============================================

        const normalizedEmail =
            String(email)
                .trim()
                .toLowerCase();


        // =============================================
        // AUTHENTICATE
        // =============================================

        const {
            data,
            error
        } =
            await client.auth
                .signInWithPassword({

                    email:
                        normalizedEmail,

                    password:
                        String(password)

                });


        if (error) {

            throw error;

        }


        if (
            !data ||
            !data.session ||
            !data.user
        ) {

            fail(
                "Supabase authentication returned no valid session."
            );

        }


        // =============================================
        // CLEAR OLD CONTEXT
        // =============================================

        clearAdminContext();


        let context;


        try {

            context =
                await fetchAdminContext();

        }

        catch (error) {

            console.error(

                "Admin authorization RPC failed:",

                error

            );


            await safeSignOut();


            throw new Error(

                "Admin authorization could not be verified: " +

                String(
                    error &&
                    error.message

                        ? error.message

                        : "security RPC failed."
                )

            );

        }


        // =============================================
        // ADMIN CHECK
        // =============================================

        if (
            !context ||
            !context.is_admin
        ) {

            await safeSignOut();


            fail(
                "This account is not authorized for ALBUKHR administration."
            );

        }


        // =============================================
        // ACTIVE CHECK
        // =============================================

        if (
            context.status !==
            "active"
        ) {

            await safeSignOut();


            fail(
                "This admin account is not active."
            );

        }


        return context;

    }


    // =====================================================
    // REQUIRE ADMIN
    // =====================================================

    async function requireAdmin(
        options = {}
    ) {

        await init();


        const redirect =
            options.redirect !== false;


        const loginUrl =
            options.loginUrl ||
            LOGIN_URL;


        // =============================================
        // SESSION
        // =============================================

        const session =
            await getSession();


        if (
            !session ||
            !session.user
        ) {

            clearAdminContext();


            if (redirect) {

                location.replace(
                    loginUrl
                );

            }


            return null;

        }


        let context;


        try {

            context =
                await fetchAdminContext();

        }

        catch (error) {

            console.error(

                "Admin authorization check failed:",

                error

            );


            await safeSignOut();


            if (redirect) {

                location.replace(
                    loginUrl
                );

            }


            return null;

        }


        // =============================================
        // ADMIN
        // =============================================

        if (
            !context ||
            !context.is_admin ||
            context.status !== "active"
        ) {

            await safeSignOut();


            if (redirect) {

                location.replace(
                    loginUrl
                );

            }


            return null;

        }


        return context;

    }


    // =====================================================
    // REQUIRE ROLE
    //
    // Database roles:
    //
    // super_admin
    // registry_admin
    // approval_admin
    // finance_admin
    // core_admin
    // internal_admin
    // external_admin
    // =====================================================

    async function requireRole(
        roles,
        options = {}
    ) {

        const admin =
            await requireAdmin(
                options
            );


        if (!admin) {

            return null;

        }


        const allowed =
            Array.isArray(roles)

                ? roles.map(
                    function (role) {

                        return String(role);

                    }
                )

                : [

                    String(roles)

                ];


        if (

            !allowed.some(

                function (role) {

                    return admin.roles.includes(
                        role
                    );

                }

            )

        ) {

            if (

                typeof options.onDenied ===
                "function"

            ) {

                options.onDenied(
                    admin
                );

            }

            else {

                console.error(

                    "❌ Admin role denied:",

                    {

                        required:
                            allowed,

                        actual:
                            admin.roles

                    }

                );

            }


            return null;

        }


        return admin;

    }


    // =====================================================
    // REQUIRE SUPER ADMIN
    // =====================================================

    async function requireSuperAdmin(
        options = {}
    ) {

        return requireRole(
            "super_admin",
            options
        );

    }


    // =====================================================
    // REQUIRE REGISTRY ADMIN
    // =====================================================

    async function requireRegistryAdmin(
        options = {}
    ) {

        return requireRole(
            "registry_admin",
            options
        );

    }


    // =====================================================
    // REQUIRE APPROVAL ADMIN
    // =====================================================

    async function requireApprovalAdmin(
        options = {}
    ) {

        return requireRole(
            "approval_admin",
            options
        );

    }


    // =====================================================
    // REQUIRE FINANCE ADMIN
    // =====================================================

    async function requireFinanceAdmin(
        options = {}
    ) {

        return requireRole(
            "finance_admin",
            options
        );

    }


    // =====================================================
    // REQUIRE CORE ADMIN
    //
    // IMPORTANT:
    //
    // A Core Team member may be authorized by:
    //
    // 1. super_admin role
    //
    // OR
    //
    // 2. active core_admin role
    //
    // OR
    //
    // 3. active core_admin_binding
    //
    // This matches the current ALBUKHR architecture.
    // =====================================================

    async function requireCoreAdmin(
        options = {}
    ) {

        const admin =
            await requireAdmin(
                options
            );


        if (!admin) {

            return null;

        }


        // =============================================
        // SUPER ADMIN
        // =============================================

        if (
            admin.roles.includes(
                "super_admin"
            )
        ) {

            return admin;

        }


        // =============================================
        // EXPLICIT CORE ROLE
        // =============================================

        if (
            admin.roles.includes(
                "core_admin"
            )
        ) {

            return admin;

        }


        // =============================================
        // CORE BINDING
        // =============================================

        if (

            Array.isArray(
                admin.core_projects
            )

            &&

            admin.core_projects.some(

                function (project) {

                    return (
                        project &&
                        project.active === true
                    );

                }

            )

        ) {

            return admin;

        }


        // =============================================
        // DENIED
        // =============================================

        if (

            typeof options.onDenied ===
            "function"

        ) {

            options.onDenied(
                admin
            );

        }

        else {

            console.error(

                "❌ Core Admin authorization denied."

            );

        }


        return null;

    }


    // =====================================================
    // REQUIRE INTERNAL ADMIN
    // =====================================================

    async function requireInternalAdmin(
        options = {}
    ) {

        const admin =
            await requireAdmin(
                options
            );


        if (!admin) {

            return null;

        }


        // =============================================
        // SUPER ADMIN
        // =============================================

        if (
            admin.roles.includes(
                "super_admin"
            )
        ) {

            return admin;

        }


        // =============================================
        // GLOBAL ROLE
        // =============================================

        if (
            admin.roles.includes(
                "internal_admin"
            )
        ) {

            return admin;

        }


        // =============================================
        // SCOPED BINDING
        // =============================================

        if (

            admin.scoped_projects.some(

                function (project) {

                    return (

                        project &&
                        project.active === true &&

                        project.role ===
                        "internal_admin"

                    );

                }

            )

        ) {

            return admin;

        }


        if (

            typeof options.onDenied ===
            "function"

        ) {

            options.onDenied(
                admin
            );

        }


        return null;

    }


    // =====================================================
    // REQUIRE EXTERNAL ADMIN
    // =====================================================

    async function requireExternalAdmin(
        options = {}
    ) {

        const admin =
            await requireAdmin(
                options
            );


        if (!admin) {

            return null;

        }


        // =============================================
        // SUPER ADMIN
        // =============================================

        if (
            admin.roles.includes(
                "super_admin"
            )
        ) {

            return admin;

        }


        // =============================================
        // GLOBAL ROLE
        // =============================================

        if (
            admin.roles.includes(
                "external_admin"
            )
        ) {

            return admin;

        }


        // =============================================
        // SCOPED BINDING
        // =============================================

        if (

            admin.scoped_projects.some(

                function (project) {

                    return (

                        project &&
                        project.active === true &&

                        project.role ===
                        "external_admin"

                    );

                }

            )

        ) {

            return admin;

        }


        if (

            typeof options.onDenied ===
            "function"

        ) {

            options.onDenied(
                admin
            );

        }


        return null;

    }


    // =====================================================
    // CORE PROJECT ACCESS
    //
    // Super Admin:
    //
    // → all Core Projects
    //
    // Core Member:
    //
    // → only bound Core Project
    // =====================================================

    function canManageCoreProject(
        projectId
    ) {

        if (!currentAdmin) {

            return false;

        }


        // =============================================
        // SUPER ADMIN
        // =============================================

        if (

            currentAdmin.roles.includes(
                "super_admin"
            )

        ) {

            return true;

        }


        // =============================================
        // CORE BINDING
        // =============================================

        return currentAdmin
            .core_projects
            .some(

                function (project) {

                    if (
                        !project ||
                        project.active !== true
                    ) {

                        return false;

                    }


                    const boundProjectId =

                        project.id ||

                        project.core_project_id ||

                        null;


                    return (

                        boundProjectId !== null

                        &&

                        String(
                            boundProjectId
                        )

                        ===

                        String(
                            projectId
                        )

                    );

                }

            );

    }


    // =====================================================
    // INTERNAL PROJECT ACCESS
    // =====================================================

    function canManageInternalProject(
        projectId
    ) {

        if (!currentAdmin) {

            return false;

        }


        if (

            currentAdmin.roles.includes(
                "super_admin"
            )

        ) {

            return true;

        }


        return currentAdmin
            .scoped_projects
            .some(

                function (project) {

                    return (

                        project &&

                        project.active === true &&

                        project.role ===
                        "internal_admin"

                        &&

                        String(
                            project.project_id
                        )

                        ===

                        String(
                            projectId
                        )

                    );

                }

            );

    }


    // =====================================================
    // EXTERNAL PROJECT ACCESS
    // =====================================================

    function canManageExternalProject(
        projectId
    ) {

        if (!currentAdmin) {

            return false;

        }


        if (

            currentAdmin.roles.includes(
                "super_admin"
            )

        ) {

            return true;

        }


        return currentAdmin
            .scoped_projects
            .some(

                function (project) {

                    return (

                        project &&

                        project.active === true &&

                        project.role ===
                        "external_admin"

                        &&

                        String(
                            project.project_id
                        )

                        ===

                        String(
                            projectId
                        )

                    );

                }

            );

    }


    // =====================================================
    // MFA STATUS
    // =====================================================

    async function ensureMfa() {

        const admin =
            currentAdmin;


        // =============================================
        // MFA NOT REQUIRED
        // =============================================

        if (
            admin &&
            admin.mfa_required === false
        ) {

            return Object.freeze({

                required:
                    false,

                verified:
                    true,

                enrolled:
                    false,

                factorId:
                    null

            });

        }


        const client =
            getClient();


        // =============================================
        // MFA FACTORS
        // =============================================

        const {
            data,
            error
        } =
            await client.auth.mfa
                .listFactors();


        if (error) {

            throw error;

        }


        const factors =
            Array.isArray(
                data &&
                data.totp
            )

                ? data.totp

                : [];


        const verifiedFactor =
            factors.find(

                function (factor) {

                    return (
                        factor &&
                        factor.status ===
                        "verified"
                    );

                }

            );


        // =============================================
        // NOT ENROLLED
        // =============================================

        if (!verifiedFactor) {

            return Object.freeze({

                required:
                    true,

                verified:
                    false,

                enrolled:
                    false,

                factorId:
                    null

            });

        }


        // =============================================
        // ASSURANCE LEVEL
        // =============================================

        const {
            data: assurance,
            error: assuranceError
        } =
            await client.auth.mfa
                .getAuthenticatorAssuranceLevel();


        if (assuranceError) {

            throw assuranceError;

        }


        return Object.freeze({

            required:
                true,

            verified:

                assurance &&
                assurance.currentLevel ===
                "aal2",

            enrolled:
                true,

            factorId:
                verifiedFactor.id

        });

    }


    // =====================================================
    // VERIFY MFA
    //
    // After successful verification:
    //
    // 1. Refresh Supabase session
    // 2. Clear old admin context
    // 3. Reload server context
    //
    // This is necessary because AAL may move:
    //
    // aal1 → aal2
    // =====================================================

    async function verifyMfa(
        factorId,
        code
    ) {

        if (
            !factorId ||
            !code
        ) {

            fail(
                "MFA factor and verification code are required."
            );

        }


        const client =
            getClient();


        // =============================================
        // CHALLENGE
        // =============================================

        const {
            data: challenge,
            error: challengeError
        } =
            await client.auth.mfa
                .challenge({

                    factorId:
                        factorId

                });


        if (challengeError) {

            throw challengeError;

        }


        // =============================================
        // VERIFY
        // =============================================

        const {
            data,
            error
        } =
            await client.auth.mfa
                .verify({

                    factorId:
                        factorId,

                    challengeId:
                        challenge.id,

                    code:
                        String(code)
                            .trim()

                });


        if (error) {

            throw error;

        }


        // =============================================
        // REFRESH JWT
        // =============================================

        await refreshSession();


        // =============================================
        // REMOVE OLD CONTEXT
        // =============================================

        clearAdminContext();


        // =============================================
        // LOAD NEW SERVER CONTEXT
        // =============================================

        await fetchAdminContext();


        return data;

    }


    // =====================================================
    // PASSWORD RESET
    // =====================================================

    async function resetPassword(
        email,
        redirectTo
    ) {

        getEnvironment();


        if (!email) {

            fail(
                "Email is required."
            );

        }


        const options = {};


        if (redirectTo) {

            options.redirectTo =
                String(redirectTo);

        }


        const {
            error
        } =
            await getClient()
                .auth
                .resetPasswordForEmail(

                    String(email)
                        .trim()
                        .toLowerCase(),

                    options

                );


        if (error) {

            throw error;

        }


        return true;

    }


    // =====================================================
    // UPDATE PASSWORD
    // =====================================================

    async function updatePassword(
        password
    ) {

        if (
            !password ||
            String(password).length < 12
        ) {

            fail(
                "Admin password must be at least 12 characters."
            );

        }


        const {
            data,
            error
        } =
            await getClient()
                .auth
                .updateUser({

                    password:
                        String(password)

                });


        if (error) {

            throw error;

        }


        return data;

    }


    // =====================================================
    // SIGN OUT
    // =====================================================

    async function safeSignOut() {

        try {

            await getClient()
                .auth
                .signOut();

        }

        catch (error) {

            console.error(

                "Admin sign-out error:",

                error

            );

        }

        finally {

            clearAdminContext();

        }

    }


    // =====================================================
    // CURRENT ADMIN
    // =====================================================

    function getCurrentAdmin() {

        return currentAdmin;

    }


    // =====================================================
    // AUTHENTICATED ADMIN
    // =====================================================

    function isAuthenticated() {

        return Boolean(

            currentAdmin &&

            currentAdmin.is_admin === true &&

            currentAdmin.status ===
            "active"

        );

    }


    // =====================================================
    // HAS ROLE
    // =====================================================

    function hasRole(
        role
    ) {

        return Boolean(

            currentAdmin &&

            currentAdmin.roles.includes(
                String(role)
            )

        );

    }


    // =====================================================
    // GET ROLES
    // =====================================================

    function getRoles() {

        return currentAdmin

            ? [

                ...currentAdmin.roles

            ]

            : [];

    }


    // =====================================================
    // GET PRIMARY ROLE
    // =====================================================

    function getRole() {

        return (

            currentAdmin &&
            currentAdmin.roles &&
            currentAdmin.roles.length > 0

        )

            ? currentAdmin.roles[0]

            : null;

    }


    // =====================================================
    // TESTNET ACCESS
    // =====================================================

    function hasTestnetAccess() {

        return Boolean(

            currentAdmin &&

            currentAdmin.is_admin === true &&

            currentAdmin.status ===
            "active" &&

            currentAdmin.testnet_access === true

        );

    }


    // =====================================================
    // DESTROY
    // =====================================================

    function destroy() {

        if (

            authSubscription &&

            typeof authSubscription.unsubscribe ===
            "function"

        ) {

            authSubscription.unsubscribe();

        }


        authSubscription =
            null;


        initialized =
            false;


        initializationPromise =
            null;


        clearAdminContext();

    }


    // =====================================================
    // PUBLIC API
    // =====================================================

    window.AlbukhrSupabaseAdminAuth =

        Object.freeze({

            // =============================================
            // INITIALIZATION
            // =============================================

            init,


            // =============================================
            // AUTHENTICATION
            // =============================================

            signIn,

            signOut:
                safeSignOut,

            getSession,

            refreshSession,


            // =============================================
            // ADMIN
            // =============================================

            requireAdmin,

            refreshAdminContext:
                fetchAdminContext,

            getCurrentAdmin,

            isAuthenticated,


            // =============================================
            // ROLES
            // =============================================

            requireRole,

            requireSuperAdmin,

            requireRegistryAdmin,

            requireApprovalAdmin,

            requireFinanceAdmin,

            requireCoreAdmin,

            requireInternalAdmin,

            requireExternalAdmin,

            hasRole,

            getRoles,

            getRole,


            // =============================================
            // PROJECT ACCESS
            // =============================================

            canManageCoreProject,

            canManageInternalProject,

            canManageExternalProject,


            // =============================================
            // MFA
            // =============================================

            ensureMfa,

            verifyMfa,


            // =============================================
            // PASSWORD
            // =============================================

            resetPassword,

            updatePassword,


            // =============================================
            // TESTNET
            // =============================================

            hasTestnetAccess,


            // =============================================
            // LIFECYCLE
            // =============================================

            destroy

        });


    console.info(

        "✅ " +
        CORE_NAME +
        " loaded."

    );


})(window);
