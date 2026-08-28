/* =========================================================
   ALBUKHR SUPABASE ADMIN AUTH CORE
   File:
   js/core/supabase-admin-auth.js

   Purpose:
   - Secure authentication foundation for ALBUKHR Admin Host
   - Supabase Authentication only
   - MAINNET is the authority for admin authentication
   - No LocalStorage as authentication source of truth
   - No Pi Browser / Pi Authentication dependency
   - No service-role key in browser
   - Centralized admin session handling
   - Centralized role authorization
   - Password recovery support
   - Secure session validation
   - Mainnet-only security authority
   - Supports controlled TESTNET access later

   Required before this file:
   1. Supabase JS SDK
   2. js/core/environment-core.js
   3. js/core/supabase-core.js OR compatible MAINNET
      Supabase configuration

   IMPORTANT:
   - NEVER place Supabase service_role key here.
   - Browser must use publishable/anon key only.
   - Actual admin authorization MUST be enforced
     by Supabase/PostgreSQL RLS and server-side policies.
   ========================================================= */

(function (window) {

  "use strict";


  /* =======================================================
     PREVENT DUPLICATE INITIALIZATION
  ======================================================= */

  if (window.ALBukhrAdminAuth) {

    console.warn(
      "⚠️ ALBUKHR Supabase Admin Auth Core already initialized."
    );

    return;

  }


  /* =======================================================
     SUPABASE SDK CHECK
  ======================================================= */

  if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
  ) {

    console.error(
      "❌ Supabase JS SDK is unavailable."
    );

    return;

  }


  /* =======================================================
     ENVIRONMENT CORE CHECK
  ======================================================= */

  const environment =
    window.ALBukhrEnvironment;


  if (!environment) {

    console.error(
      "❌ ALBUKHR Environment Core is unavailable."
    );

    return;

  }


  /* =======================================================
     ADMIN AUTHORITY RULE
     
     Admin authentication authority is MAINNET.

     TESTNET is NOT an independent admin identity
     authority.
  ======================================================= */

  if (
    typeof environment.getKey !== "function"
  ) {

    console.error(
      "❌ Environment Core does not expose getKey()."
    );

    return;

  }


  const currentEnvironment =
    environment.getKey();


  /*
   * Admin login is intentionally restricted to MAINNET.
   *
   * A testnet page may later request permission from
   * the authenticated MAINNET admin session, but it
   * must never create an independent admin identity.
   */

  if (
    currentEnvironment !== "mainnet"
  ) {

    console.error(
      "❌ Admin authentication must originate from MAINNET.",
      {
        environment:
          currentEnvironment
      }
    );

    return;

  }


  /* =======================================================
     MAINNET SUPABASE CONFIGURATION
  ======================================================= */

  const CONFIG = Object.freeze({

    environment:
      "mainnet",

    network:
      "mainnet",

    project:
      "App Albukhr",

    url:
      "https://ribpntyqdleytsyktdfb.supabase.co",

    /*
     * Publishable key only.
     *
     * NEVER replace this with a service_role key.
     */

    key:
      "sb_publishable_6pRDCPwk97eCz2Fpu1cadg__XIQlZX2"

  });


  /* =======================================================
     ENVIRONMENT CROSS-CHECK
  ======================================================= */

  if (
    typeof environment.getSupabaseUrl === "function"
  ) {

    const environmentUrl =
      environment.getSupabaseUrl();


    if (
      environmentUrl !==
      CONFIG.url
    ) {

      console.error(
        "❌ Admin Auth Supabase URL mismatch.",
        {
          environmentUrl,
          configuredUrl:
            CONFIG.url
        }
      );

      return;

    }

  }


  /* =======================================================
     CREATE DEDICATED ADMIN AUTH CLIENT
     
     This is deliberately independent from any other
     page-level Supabase client.

     The client still uses the public publishable key.
  ======================================================= */

  let client;


  try {

    client =
      window.supabase.createClient(
        CONFIG.url,
        CONFIG.key,
        {

          auth: {

            /*
             * Supabase manages the authenticated session.
             *
             * No application LocalStorage object is used
             * as the source of truth.
             */

            persistSession:
              true,

            autoRefreshToken:
              true,

            detectSessionInUrl:
              true

          }

        }
      );

  }
  catch (error) {

    console.error(
      "❌ Failed to initialize Admin Auth client.",
      error
    );

    return;

  }


  /* =======================================================
     ADMIN ROLE DEFINITIONS
  ======================================================= */

  const ROLES =
    Object.freeze({

      SUPER_ADMIN:
        "super_admin",

      REGISTRY_ADMIN:
        "registry_admin",

      APPROVAL_ADMIN:
        "approval_admin",

      FINANCE_ADMIN:
        "finance_admin",

      CORE_ADMIN:
        "core_admin",

      INTERNAL_ADMIN:
        "internal_admin",

      EXTERNAL_ADMIN:
        "external_admin"

    });


  /* =======================================================
     ROLE LIST
  ======================================================= */

  const ROLE_LIST =
    Object.freeze(
      Object.values(ROLES)
    );


  /* =======================================================
     INTERNAL STATE
     
     This is runtime memory only.

     It is NOT the authentication source of truth.
  ======================================================= */

  let currentUser = null;

  let currentAdmin =
    null;

  let initialized =
    false;


  /* =======================================================
     BASIC HELPERS
  ======================================================= */

  function normalizeEmail(email) {

    return String(
      email || ""
    )
      .trim()
      .toLowerCase();

  }


  function normalizeRole(role) {

    return String(
      role || ""
    )
      .trim()
      .toLowerCase();

  }


  function isValidEmail(email) {

    if (!email) return false;

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      .test(email);

  }


  function isKnownRole(role) {

    return ROLE_LIST.includes(
      normalizeRole(role)
    );

  }


  /* =======================================================
     GET CURRENT SUPABASE SESSION
     
     IMPORTANT:
     This asks Supabase directly.
     It does not read a custom LocalStorage object.
  ======================================================= */

  async function getSession() {

    const result =
      await client.auth.getSession();


    if (result.error) {

      throw result.error;

    }


    return result.data?.session || null;

  }


  /* =======================================================
     GET CURRENT AUTH USER
  ======================================================= */

  async function getUser() {

    const result =
      await client.auth.getUser();


    if (result.error) {

      /*
       * No valid authenticated user.
       */

      if (
        result.error.status === 401
      ) {

        return null;

      }

      throw result.error;

    }


    return result.data?.user || null;

  }


  /* =======================================================
     AUTHENTICATION STATE
  ======================================================= */

  async function isAuthenticated() {

    try {

      const session =
        await getSession();


      return Boolean(
        session &&
        session.user
      );

    }
    catch (error) {

      console.error(
        "❌ Admin session check failed:",
        error
      );

      return false;

    }

  }


  /* =======================================================
     SIGN IN
     
     Email + Password

     No role is accepted from the browser.
     Role comes from protected database records.
  ======================================================= */

  async function signIn(
    email,
    password
  ) {

    const normalizedEmail =
      normalizeEmail(email);


    if (
      !isValidEmail(
        normalizedEmail
      )
    ) {

      throw new Error(
        "Enter a valid admin email address."
      );

    }


    if (
      typeof password !== "string" ||
      !password
    ) {

      throw new Error(
        "Admin password is required."
      );

    }


    const result =
      await client.auth.signInWithPassword({

        email:
          normalizedEmail,

        password:
          password

      });


    if (result.error) {

      throw result.error;

    }


    const user =
      result.data?.user;


    const session =
      result.data?.session;


    if (
      !user ||
      !session
    ) {

      throw new Error(
        "Supabase authentication did not return a valid admin session."
      );

    }


    /*
     * Runtime only.
     *
     * This does not replace Supabase session state.
     */

    currentUser =
      user;


    /*
     * Role verification happens separately.
     */

    currentAdmin =
      null;


    return Object.freeze({

      user,
      session

    });

  }


  /* =======================================================
     SIGN OUT
  ======================================================= */

  async function signOut() {

    const result =
      await client.auth.signOut();


    if (result.error) {

      throw result.error;

    }


    currentUser =
      null;

    currentAdmin =
      null;


    return true;

  }


  /* =======================================================
     PASSWORD RESET REQUEST
     
     Supabase sends the recovery email.
  ======================================================= */

  async function requestPasswordReset(
    email,
    redirectTo
  ) {

    const normalizedEmail =
      normalizeEmail(email);


    if (
      !isValidEmail(
        normalizedEmail
      )
    ) {

      throw new Error(
        "Enter the admin email address used for this account."
      );

    }


    const callback =
      redirectTo ||
      (
        window.location.origin +
        "/admin-reset-password.html"
      );


    const result =
      await client.auth.resetPasswordForEmail(
        normalizedEmail,
        {
          redirectTo:
            callback
        }
      );


    if (result.error) {

      throw result.error;

    }


    /*
     * Do not reveal whether an email exists.
     *
     * The UI should use a generic message.
     */

    return true;

  }


  /* =======================================================
     UPDATE PASSWORD
     
     Used after Supabase recovery flow has established
     a valid recovery session.
  ======================================================= */

  async function updatePassword(
    newPassword
  ) {

    if (
      typeof newPassword !== "string" ||
      newPassword.length < 12
    ) {

      throw new Error(
        "Admin password must contain at least 12 characters."
      );

    }


    const result =
      await client.auth.updateUser({

        password:
          newPassword

      });


    if (result.error) {

      throw result.error;

    }


    return result.data?.user || null;

  }


  /* =======================================================
     ROLE AUTHORIZATION
     
     IMPORTANT:
     The role MUST be retrieved from a protected
     Supabase table/RPC.

     This function intentionally does NOT trust:
       - URL parameters
       - HTML
       - LocalStorage
       - sessionStorage
       - query strings
       - client-side role variables
  ======================================================= */

  async function getAdminRole() {

    const user =
      await getUser();


    if (!user) {

      currentAdmin =
        null;

      return null;

    }


    /*
     * The final table/RPC name will be created as part
     * of the ALBUKHR Admin Security schema.
     *
     * It should be protected by RLS.
     *
     * Expected RPC:
     *
     *   get_my_admin_role()
     *
     * Expected result:
     *
     *   {
     *      role: "core_admin"
     *   }
     *
     * or NULL.
     */

    const result =
      await client.rpc(
        "get_my_admin_role"
      );


    if (result.error) {

      console.error(
        "❌ Admin role verification failed:",
        result.error
      );

      throw new Error(
        "Unable to verify admin authorization."
      );

    }


    const row =
      Array.isArray(result.data)
        ? result.data[0]
        : result.data;


    if (
      !row ||
      !isKnownRole(row.role)
    ) {

      currentAdmin =
        null;

      return null;

    }


    currentAdmin =
      Object.freeze({

        userId:
          user.id,

        role:
          normalizeRole(row.role)

      });


    return currentAdmin;

  }


  /* =======================================================
     REQUIRE AUTHENTICATED ADMIN
     
     Use on every admin page.
  ======================================================= */

  async function requireAdmin(
    options = {}
  ) {

    const redirect =
      options.redirect !== false;


    const user =
      await getUser();


    if (!user) {

      if (redirect) {

        redirectToLogin();

      }

      return null;

    }


    const admin =
      await getAdminRole();


    if (!admin) {

      /*
       * Authenticated does NOT automatically mean
       * authorized.
       */

      if (redirect) {

        redirectUnauthorized();

      }

      return null;

    }


    return Object.freeze({

      user,
      admin

    });

  }


  /* =======================================================
     REQUIRE SPECIFIC ROLE
  ======================================================= */

  async function requireRole(
    role,
    options = {}
  ) {

    const normalizedRole =
      normalizeRole(role);


    if (
      !isKnownRole(
        normalizedRole
      )
    ) {

      throw new Error(
        "Unknown ALBUKHR admin role."
      );

    }


    const result =
      await requireAdmin(
        options
      );


    if (!result) {

      return null;

    }


    if (
      result.admin.role !==
      normalizedRole
    ) {

      /*
       * SUPER ADMIN OVERRIDE
       *
       * Super admin may access administrative
       * areas, but actual database actions must
       * still be protected by RLS/RPC policies.
       */

      if (
        result.admin.role !==
        ROLES.SUPER_ADMIN
      ) {

        if (
          options.redirect !== false
        ) {

          redirectUnauthorized();

        }

        return null;

      }

    }


    return result;

  }


  /* =======================================================
     REQUIRE ANY OF MULTIPLE ROLES
  ======================================================= */

  async function requireAnyRole(
    roles,
    options = {}
  ) {

    if (
      !Array.isArray(roles) ||
      roles.length === 0
    ) {

      throw new Error(
        "At least one admin role is required."
      );

    }


    const normalizedRoles =
      roles
        .map(normalizeRole)
        .filter(isKnownRole);


    if (
      normalizedRoles.length === 0
    ) {

      throw new Error(
        "No valid admin roles were supplied."
      );

    }


    const result =
      await requireAdmin(
        options
      );


    if (!result) {

      return null;

    }


    if (
      result.admin.role ===
      ROLES.SUPER_ADMIN
    ) {

      return result;

    }


    if (
      !normalizedRoles.includes(
        result.admin.role
      )
    ) {

      if (
        options.redirect !== false
      ) {

        redirectUnauthorized();

      }

      return null;

    }


    return result;

  }


  /* =======================================================
     REDIRECTION
  ======================================================= */

  function redirectToLogin() {

    const current =
      window.location.href;


    const encoded =
      encodeURIComponent(
        current
      );


    window.location.replace(
      "admin-login.html?redirect=" +
      encoded
    );

  }


  function redirectUnauthorized() {

    window.location.replace(
      "admin-unauthorized.html"
    );

  }


  /* =======================================================
     SAFE CURRENT USER
  ======================================================= */

  function getCachedUser() {

    return currentUser;

  }


  /* =======================================================
     SAFE CURRENT ADMIN
  ======================================================= */

  function getCachedAdmin() {

    return currentAdmin;

  }


  /* =======================================================
     AUTH STATE LISTENER
     
     Supabase remains the authority.
  ======================================================= */

  client.auth.onAuthStateChange(
    function (
      event,
      session
    ) {

      currentUser =
        session?.user || null;


      /*
       * Never blindly assign role from auth metadata.
       *
       * The database authorization layer remains
       * authoritative.
       */

      if (!session) {

        currentAdmin =
          null;

      }


      window.dispatchEvent(
        new CustomEvent(
          "albukhr-admin-auth-state",
          {
            detail: {

              event,

              authenticated:
                Boolean(session),

              user:
                session?.user || null

            }

          }
        )
      );

    }
  );


  /* =======================================================
     SESSION VALIDATION
  ======================================================= */

  async function validateSession() {

    try {

      const session =
        await getSession();


      if (!session) {

        currentUser =
          null;

        currentAdmin =
          null;

        return false;

      }


      const user =
        await getUser();


      if (!user) {

        currentUser =
          null;

        currentAdmin =
          null;

        return false;

      }


      currentUser =
        user;


      return true;

    }
    catch (error) {

      console.error(
        "❌ Admin session validation error:",
        error
      );

      currentUser =
        null;

      currentAdmin =
        null;

      return false;

    }

  }


  /* =======================================================
     INITIALIZATION
  ======================================================= */

  async function initialize() {

    if (initialized) {

      return true;

    }


    const valid =
      await validateSession();


    initialized =
      true;


    return valid;

  }


  /* =======================================================
     PUBLIC CORE
  ======================================================= */

  const core = {

    /* -----------------------------------------------
       CONFIG
    ------------------------------------------------ */

    environment:
      CONFIG.environment,

    network:
      CONFIG.network,

    project:
      CONFIG.project,

    url:
      CONFIG.url,


    /* -----------------------------------------------
       ROLES
    ------------------------------------------------ */

    ROLES,

    ROLE_LIST,


    /* -----------------------------------------------
       CLIENT
    ------------------------------------------------ */

    getClient() {

      return client;

    },


    /* -----------------------------------------------
       SESSION
    ------------------------------------------------ */

    getSession,

    getUser,

    isAuthenticated,

    validateSession,

    initialize,


    /* -----------------------------------------------
       LOGIN
    ------------------------------------------------ */

    signIn,

    signOut,


    /* -----------------------------------------------
       PASSWORD RECOVERY
    ------------------------------------------------ */

    requestPasswordReset,

    updatePassword,


    /* -----------------------------------------------
       AUTHORIZATION
    ------------------------------------------------ */

    getAdminRole,

    requireAdmin,

    requireRole,

    requireAnyRole,


    /* -----------------------------------------------
       RUNTIME USER
    ------------------------------------------------ */

    getCurrentUser() {

      return getCachedUser();

    },


    getCurrentAdmin() {

      return getCachedAdmin();

    },


    /* -----------------------------------------------
       ENVIRONMENT
    ------------------------------------------------ */

    isMainnet() {

      return (
        CONFIG.environment ===
        "mainnet"
      );

    },


    isTestnet() {

      return false;

    }

  };


  /* =======================================================
     FREEZE PUBLIC CORE
  ======================================================= */

  Object.freeze(core);


  /* =======================================================
     GLOBAL EXPORT
  ======================================================= */

  window.ALBukhrAdminAuth =
    core;


  /* =======================================================
     DEVELOPMENT LOG
  ======================================================= */

  console.info(
    "✅ ALBUKHR Supabase Admin Auth Core initialized.",
    {
      environment:
        CONFIG.environment,

      network:
        CONFIG.network,

      project:
        CONFIG.project
    }
  );


})(window);
