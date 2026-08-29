/* =========================================================
   ALBUKHR SUPABASE ADMIN AUTH CORE
   File:
   js/core/supabase-admin-auth.js

   VERSION:
   ALBUKHR Admin Security Architecture

   PURPOSE:
   - Mainnet-only admin authentication
   - Supabase Auth session handling
   - Server-authoritative admin authorization
   - Multi-role support
   - Core project scope support
   - Internal project scope support
   - External project scope support
   - MFA assurance support
   - Password recovery
   - Safe logout
   - Fail-closed authorization
   - No LocalStorage authentication state
   - No client-side role authority
   - No service_role key
   - No URL/query-string role trust
   - Mainnet security authority for Testnet access

   REQUIRED BEFORE THIS FILE:
   1. Supabase JS SDK
   2. js/core/environment-core.js
   3. js/core/supabase-core.js
   4. Mainnet security context RPC

   GLOBAL:
   window.AlbukhrSupabaseAdminAuth
========================================================= */

(function (window) {

  "use strict";


  /* =======================================================
     CONSTANTS
  ======================================================= */

  const CORE_NAME =
    "ALBUKHR Supabase Admin Auth";

  const LOGIN_URL =
    "admin-login.html";


  /* =======================================================
     INTERNAL STATE
  ======================================================= */

  let initialized = false;

  let currentAdmin = null;

  let authSubscription = null;

  let initializationPromise = null;

  let contextPromise = null;


  /* =======================================================
     ERROR HELPER
  ======================================================= */

  function fail(message) {

    throw new Error(
      String(message || "Admin authentication error.")
    );

  }


  /* =======================================================
     ENVIRONMENT
  ======================================================= */

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


    /*
     * ADMIN AUTHORITY EXISTS ONLY ON MAINNET.
     */

    if (
      !environment.isMainnet()
    ) {

      fail(
        "Admin authentication is available only on ALBUKHR MAINNET."
      );

    }


    return environment;

  }


  /* =======================================================
     SUPABASE CORE
  ======================================================= */

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


    /*
     * Additional defense:
     * Admin Auth must use Mainnet Supabase.
     */

    if (
      core.environment !== "mainnet"
    ) {

      fail(
        "Admin Auth cannot use a non-Mainnet Supabase client."
      );

    }


    if (
      core.network !== "mainnet"
    ) {

      fail(
        "Admin Auth network validation failed."
      );

    }


    return core;

  }


  /* =======================================================
     SUPABASE CLIENT
  ======================================================= */

  function getClient() {

    getEnvironment();

    return getSupabaseCore().client;

  }


  /* =======================================================
     AUTH SESSION
  ======================================================= */

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


    return data?.session || null;

  }


  /* =======================================================
     ADMIN CONTEXT RPC
     
     The database is the authority.

     IMPORTANT:
     The RPC must derive identity from auth.uid().
     Browser-supplied user IDs must never be trusted.
  ======================================================= */

  async function fetchAdminContext() {

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


          if (!session || !session.user) {

            currentAdmin =
              null;

            return null;

          }


          /*
           * Dedicated security bridge.
           *
           * This function must be SECURITY DEFINER
           * and must derive identity from auth.uid().
           */

          const {
            data,
            error
          } =
            await client.rpc(
              "get_my_admin_context"
            );


          if (error) {

            throw error;

          }


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


  /* =======================================================
     NORMALIZE ADMIN CONTEXT
  ======================================================= */

  function normalizeAdminContext(
    raw,
    session
  ) {

    if (!raw) {

      return Object.freeze({

        is_admin: false,

        user_id:
          session?.user?.id || null,

        email:
          session?.user?.email || null,

        status:
          "unknown",

        mfa_required:
          false,

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


    const source =
      Array.isArray(raw)
        ? raw[0]
        : raw;


    const roles =
      Array.isArray(source.roles)
        ? source.roles.map(
            role => String(role)
          )
        : [];


    const coreProjects =
      Array.isArray(source.core_projects)
        ? source.core_projects
        : [];


    const scopedProjects =
      Array.isArray(source.scoped_projects)
        ? source.scoped_projects
        : [];


    return Object.freeze({

      is_admin:
        Boolean(source.is_admin),

      user_id:
        session?.user?.id || null,

      email:
        session?.user?.email || null,

      status:
        source.status || "unknown",

      mfa_required:
        source.mfa_required !== false,

      mfa_verified:
        Boolean(source.mfa_verified),

      roles:
        Object.freeze(roles),

      core_projects:
        Object.freeze(coreProjects),

      scoped_projects:
        Object.freeze(scopedProjects),

      testnet_access:
        Boolean(source.testnet_access)

    });

  }


  /* =======================================================
     INITIALIZE
  ======================================================= */

  async function init() {

    if (initialized) {

      return true;

    }


    if (initializationPromise) {

      return initializationPromise;

    }


    initializationPromise =
      (async function () {

        getEnvironment();

        getClient();


        /*
         * Establish current session state.
         */

        const session =
          await getSession();


        if (session) {

          try {

            await fetchAdminContext();

          }
          catch (error) {

            console.error(
              CORE_NAME +
              " context initialization failed:",
              error
            );

            currentAdmin =
              null;

          }

        }


        /*
         * Subscribe to Supabase Auth state.
         */

        if (!authSubscription) {

          const {
            data
          } =
            getClient()
              .auth
              .onAuthStateChange(
                function (
                  event,
                  session
                ) {

                  console.info(
                    "[ALBUKHR ADMIN AUTH]",
                    event
                  );


                  /*
                   * Do not perform complex Supabase
                   * calls synchronously inside the
                   * Auth callback.
                   */

                  window.setTimeout(
                    async function () {

                      if (!session) {

                        currentAdmin =
                          null;

                        return;

                      }


                      try {

                        await fetchAdminContext();

                      }
                      catch (error) {

                        console.error(
                          "Admin context refresh failed:",
                          error
                        );

                        currentAdmin =
                          null;

                      }

                    },
                    0
                  );

                }
              );


          authSubscription =
            data?.subscription || null;

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


  /* =======================================================
     SIGN IN
  ======================================================= */

  async function signIn(
    email,
    password
  ) {

    getEnvironment();


    if (!email || !password) {

      fail(
        "Email and password are required."
      );

    }


    const client =
      getClient();


    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();


    const {
      data,
      error
    } =
      await client.auth.signInWithPassword({

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


    /*
     * Server-side authorization.
     */

    let context;

    try {

      context =
        await fetchAdminContext();

    }
    catch (error) {

      /*
       * Authentication succeeded but authorization
       * could not be verified.
       *
       * Fail closed.
       */

      await safeSignOut();

      throw new Error(
        "Admin authorization could not be verified."
      );

    }


    if (
      !context ||
      !context.is_admin
    ) {

      await safeSignOut();

      fail(
        "This account is not authorized for ALBUKHR administration."
      );

    }


    if (
      context.status !== "active"
    ) {

      await safeSignOut();

      fail(
        "This admin account is not active."
      );

    }


    return context;

  }


  /* =======================================================
     REQUIRE ADMIN
  ======================================================= */

  async function requireAdmin(
    options = {}
  ) {

    await init();


    const redirect =
      options.redirect !== false;


    const loginUrl =
      options.loginUrl ||
      LOGIN_URL;


    const session =
      await getSession();


    if (!session) {

      currentAdmin =
        null;


      if (redirect) {

        window.location.replace(
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

        window.location.replace(
          loginUrl
        );

      }


      return null;

    }


    if (
      !context ||
      !context.is_admin ||
      context.status !== "active"
    ) {

      await safeSignOut();


      if (redirect) {

        window.location.replace(
          loginUrl
        );

      }


      return null;

    }


    return context;

  }


  /* =======================================================
     REQUIRE ROLE
  ======================================================= */

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
            role =>
              String(role)
          )
        : [
            String(roles)
          ];


    const hasAllowedRole =
      allowed.some(
        role =>
          admin.roles.includes(role)
      );


    if (!hasAllowedRole) {

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


  /* =======================================================
     REQUIRE SUPER ADMIN
  ======================================================= */

  async function requireSuperAdmin(
    options = {}
  ) {

    return requireRole(
      "super_admin",
      options
    );

  }


  /* =======================================================
     REQUIRE REGISTRY ADMIN
  ======================================================= */

  async function requireRegistryAdmin(
    options = {}
  ) {

    return requireRole(
      "registry_admin",
      options
    );

  }


  /* =======================================================
     REQUIRE APPROVAL ADMIN
  ======================================================= */

  async function requireApprovalAdmin(
    options = {}
  ) {

    return requireRole(
      "approval_admin",
      options
    );

  }


  /* =======================================================
     REQUIRE FINANCE ADMIN
  ======================================================= */

  async function requireFinanceAdmin(
    options = {}
  ) {

    return requireRole(
      "finance_admin",
      options
    );

  }


  /* =======================================================
     REQUIRE CORE ADMIN
  ======================================================= */

  async function requireCoreAdmin(
    options = {}
  ) {

    return requireRole(
      "core_admin",
      options
    );

  }


  /* =======================================================
     REQUIRE INTERNAL ADMIN
  ======================================================= */

  async function requireInternalAdmin(
    options = {}
  ) {

    return requireRole(
      "internal_admin",
      options
    );

  }


  /* =======================================================
     REQUIRE EXTERNAL ADMIN
  ======================================================= */

  async function requireExternalAdmin(
    options = {}
  ) {

    return requireRole(
      "external_admin",
      options
    );

  }


  /* =======================================================
     CORE PROJECT AUTHORIZATION
  ======================================================= */

  function canManageCoreProject(
    coreProjectId
  ) {

    if (!currentAdmin) {

      return false;

    }


    if (
      currentAdmin.roles
        .includes("super_admin")
    ) {

      return true;

    }


    return currentAdmin
      .core_projects
      .some(
        project =>
          String(
            project.id ||
            project.core_project_id
          ) ===
          String(coreProjectId)
      );

  }


  /* =======================================================
     INTERNAL PROJECT AUTHORIZATION
  ======================================================= */

  function canManageInternalProject(
    projectId
  ) {

    if (!currentAdmin) {

      return false;

    }


    if (
      currentAdmin.roles
        .includes("super_admin")
    ) {

      return true;

    }


    return currentAdmin
      .scoped_projects
      .some(
        project =>
          project.role ===
            "internal_admin" &&
          String(project.project_id) ===
            String(projectId)
      );

  }


  /* =======================================================
     EXTERNAL PROJECT AUTHORIZATION
  ======================================================= */

  function canManageExternalProject(
    projectId
  ) {

    if (!currentAdmin) {

      return false;

    }


    if (
      currentAdmin.roles
        .includes("super_admin")
    ) {

      return true;

    }


    return currentAdmin
      .scoped_projects
      .some(
        project =>
          project.role ===
            "external_admin" &&
          String(project.project_id) ===
            String(projectId)
      );

  }


  /* =======================================================
     MFA STATUS
  ======================================================= */

  async function ensureMfa() {

    const client =
      getClient();


    const {
      data,
      error
    } =
      await client.auth.mfa.listFactors();


    if (error) {

      throw error;

    }


    const totpFactors =
      Array.isArray(data?.totp)
        ? data.totp
        : [];


    const verifiedTotp =
      totpFactors.find(
        factor =>
          factor.status ===
          "verified"
      );


    /*
     * No verified MFA factor.
     *
     * Whether MFA must be enrolled is controlled
     * by the server-side admin_users.mfa_required.
     */

    if (!verifiedTotp) {

      return Object.freeze({

        required:
          Boolean(
            currentAdmin?.mfa_required
          ),

        verified:
          false,

        enrolled:
          false,

        factorId:
          null

      });

    }


    const {
      data: assurance,
      error: assuranceError
    } =
      await client.auth
        .mfa
        .getAuthenticatorAssuranceLevel();


    if (assuranceError) {

      throw assuranceError;

    }


    const verified =
      assurance?.currentLevel ===
      "aal2";


    return Object.freeze({

      required:
        true,

      verified,

      enrolled:
        true,

      factorId:
        verifiedTotp.id

    });

  }


  /* =======================================================
     VERIFY MFA
  ======================================================= */

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


    const {
      data: challenge,
      error:
        challengeError
    } =
      await client.auth
        .mfa
        .challenge({

          factorId

        });


    if (challengeError) {

      throw challengeError;

    }


    const {
      data,
      error
    } =
      await client.auth
        .mfa
        .verify({

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


    /*
     * Re-read authorization after MFA.
     */

    await fetchAdminContext();


    return data;

  }


  /* =======================================================
     REQUIRE VERIFIED MFA
  ======================================================= */

  async function requireVerifiedMfa() {

    const admin =
      currentAdmin ||
      await fetchAdminContext();


    if (!admin) {

      fail(
        "Admin authentication is required."
      );

    }


    const mfa =
      await ensureMfa();


    if (
      admin.mfa_required &&
      !mfa.verified
    ) {

      return Object.freeze({

        verified:
          false,

        required:
          true,

        factorId:
          mfa.factorId,

        enrolled:
          mfa.enrolled

      });

    }


    return Object.freeze({

      verified:
        true,

      required:
        Boolean(
          admin.mfa_required
        ),

      factorId:
        mfa.factorId,

      enrolled:
        mfa.enrolled

    });

  }


  /* =======================================================
     PASSWORD RECOVERY
  ======================================================= */

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


    const options =
      {};


    if (redirectTo) {

      options.redirectTo =
        String(
          redirectTo
        );

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


  /* =======================================================
     UPDATE PASSWORD
  ======================================================= */

  async function updatePassword(
    newPassword
  ) {

    if (
      !newPassword ||
      String(newPassword).length < 12
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
            String(newPassword)

        });


    if (error) {

      throw error;

    }


    return data;

  }


  /* =======================================================
     SAFE SIGN OUT
  ======================================================= */

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

      currentAdmin =
        null;

      contextPromise =
        null;

    }

  }


  /* =======================================================
     PUBLIC SIGN OUT
  ======================================================= */

  async function signOut() {

    await safeSignOut();

  }


  /* =======================================================
     CURRENT ADMIN
  ======================================================= */

  function getCurrentAdmin() {

    return currentAdmin;

  }


  /* =======================================================
     AUTHENTICATED
  ======================================================= */

  function isAuthenticated() {

    return Boolean(
      currentAdmin &&
      currentAdmin.is_admin &&
      currentAdmin.status === "active"
    );

  }


  /* =======================================================
     HAS ROLE
  ======================================================= */

  function hasRole(
    role
  ) {

    if (!currentAdmin) {

      return false;

    }


    return currentAdmin
      .roles
      .includes(
        String(role)
      );

  }


  /* =======================================================
     GET ROLES
  ======================================================= */

  function getRoles() {

    if (!currentAdmin) {

      return [];

    }


    return [
      ...currentAdmin.roles
    ];

  }


  /* =======================================================
     GET ROLE
     
     Compatibility helper.
     Returns first role only.
     
     New code should use getRoles().
  ======================================================= */

  function getRole() {

    return (
      currentAdmin &&
      currentAdmin.roles &&
      currentAdmin.roles[0]
    ) || null;

  }


  /* =======================================================
     TESTNET ACCESS
     
     Mainnet remains the authority.
  ======================================================= */

  function hasTestnetAccess() {

    return Boolean(
      currentAdmin &&
      currentAdmin.is_admin &&
      currentAdmin.status === "active" &&
      currentAdmin.testnet_access
    );

  }


  /* =======================================================
     AUTH STATE CHANGE CLEANUP
  ======================================================= */

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

    currentAdmin =
      null;

    contextPromise =
      null;

  }


  /* =======================================================
     PUBLIC API
  ======================================================= */

  const api =
    Object.freeze({

      init,

      signIn,

      requireAdmin,

      requireRole,

      requireSuperAdmin,

      requireRegistryAdmin,

      requireApprovalAdmin,

      requireFinanceAdmin,

      requireCoreAdmin,

      requireInternalAdmin,

      requireExternalAdmin,

      refreshAdminContext:
        fetchAdminContext,

      ensureMfa,

      requireVerifiedMfa,

      verifyMfa,

      resetPassword,

      updatePassword,

      signOut,

      getCurrentAdmin,

      isAuthenticated,

      hasRole,

      getRoles,

      getRole,

      canManageCoreProject,

      canManageInternalProject,

      canManageExternalProject,

      hasTestnetAccess,

      getSession,

      destroy

    });


  /* =======================================================
     GLOBAL EXPORT
  ======================================================= */

  window.AlbukhrSupabaseAdminAuth =
    api;


  console.info(
    "✅ " +
    CORE_NAME +
    " loaded."
  );


})(window);
