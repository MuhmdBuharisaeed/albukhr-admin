/* =========================================================
   ALBUKHR SUPABASE ADMIN AUTH CORE
   File:
   js/core/supabase-admin-auth.js

   Purpose:
   - Mainnet-only admin authentication
   - Supabase Auth session handling
   - Role verification through database RPC
   - Session / MFA gate
   - Password recovery flow
   - Safe logout
   - No LocalStorage auth state
   - No client-side trust of URL/query-string roles
   - No service_role key
   ========================================================= */

(function (window) {
  "use strict";

  const CORE_NAME = "ALBUKHR Supabase Admin Auth";
  let initialized = false;
  let currentAdmin = null;
  let authSubscription = null;

  function fail(message) {
    throw new Error(message);
  }

  function getEnvironment() {
    const env = window.ALBukhrEnvironment;
    if (!env || typeof env.isKnown !== "function") {
      fail("ALBUKHR Environment Core is unavailable.");
    }

    if (!env.isKnown() || !env.isMainnet()) {
      fail("Admin authentication is available only on ALBUKHR MAINNET.");
    }

    return env;
  }

  function getSupabaseCore() {
    const core = window.ALBUKHR_SUPABASE;
    if (!core || !core.client) {
      fail("ALBUKHR Supabase Core is unavailable.");
    }
    return core;
  }

  function getClient() {
    getEnvironment();
    return getSupabaseCore().client;
  }

  async function init() {
    if (initialized) return true;

    getEnvironment();
    getClient();

    const { data, error } = await getClient().auth.getSession();
    if (error) {
      console.error(CORE_NAME + " session check failed:", error);
    }

    if (data && data.session) {
      await refreshAdminContext(data.session);
    }

    if (!authSubscription) {
      const { data: listener } = getClient().auth.onAuthStateChange(
        async function (event, session) {
          console.info("[ALBUKHR ADMIN AUTH]", event);

          if (session) {
            try {
              await refreshAdminContext(session);
            } catch (error) {
              console.error("Admin context refresh failed:", error);
              currentAdmin = null;
            }
          } else {
            currentAdmin = null;
          }
        }
      );

      authSubscription = listener && listener.subscription
        ? listener.subscription
        : null;
    }

    initialized = true;
    console.info("✅ " + CORE_NAME + " initialized.");
    return true;
  }

  async function signIn(email, password) {
    getEnvironment();

    if (!email || !password) {
      fail("Email and password are required.");
    }

    const client = getClient();

    const { data, error } = await client.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password: String(password)
    });

    if (error) throw error;
    if (!data || !data.session || !data.user) {
      fail("Supabase authentication returned no valid session.");
    }

    /*
     * Role is NOT accepted from the browser.
     * The database decides whether this user is an admin.
     */
    const context = await refreshAdminContext(data.session);

    if (!context || !context.is_admin) {
      await client.auth.signOut();
      currentAdmin = null;
      fail("This account is not authorized for ALBUKHR administration.");
    }

    return context;
  }

  async function refreshAdminContext(session) {
    if (!session || !session.user) {
      currentAdmin = null;
      return null;
    }

    const client = getClient();

    /*
     * get_my_admin_role() must be SECURITY DEFINER and must
     * derive identity from auth.uid() on the server.
     */
    const { data, error } = await client.rpc("get_my_admin_role");

    if (error) throw error;

    let row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      currentAdmin = {
        is_admin: false,
        user_id: session.user.id,
        email: session.user.email || null,
        role: null,
        active: false
      };
      return currentAdmin;
    }

    currentAdmin = Object.freeze({
      is_admin: Boolean(row.is_admin),
      user_id: session.user.id,
      email: session.user.email || null,
      role: row.role || null,
      active: row.active !== false,
      mfa_required: row.mfa_required !== false,
      mfa_verified: Boolean(row.mfa_verified)
    });

    return currentAdmin;
  }

  async function requireAdmin(options = {}) {
    await init();

    const redirect = options.redirect !== false;
    const loginUrl = options.loginUrl || "admin-login.html";

    const { data, error } = await getClient().auth.getSession();
    if (error) throw error;

    if (!data || !data.session) {
      currentAdmin = null;

      if (redirect) {
        window.location.replace(loginUrl);
      }
      return null;
    }

    const context = await refreshAdminContext(data.session);

    if (!context || !context.is_admin || context.active === false) {
      await getClient().auth.signOut();
      currentAdmin = null;

      if (redirect) {
        window.location.replace(loginUrl);
      }
      return null;
    }

    return context;
  }

  async function requireRole(roles, options = {}) {
    const admin = await requireAdmin(options);
    if (!admin) return null;

    const allowed = Array.isArray(roles)
      ? roles.map(String)
      : [String(roles)];

    if (!allowed.includes(admin.role)) {
      if (options.onDenied) {
        options.onDenied(admin);
      } else {
        console.error("❌ Admin role denied:", admin.role);
      }
      return null;
    }

    return admin;
  }

  async function ensureMfa() {
    const client = getClient();

    /*
     * Supabase MFA verification is intentionally performed
     * through Supabase Auth. Do not build a custom OTP system
     * in browser JavaScript.
     */
    const { data, error } = await client.auth.mfa.listFactors();
    if (error) throw error;

    const verifiedTotp = (data.totp || []).find(
      factor => factor.status === "verified"
    );

    if (!verifiedTotp) {
      return { required: false, verified: true };
    }

    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;

    if (assurance.data.currentLevel === "aal2") {
      return { required: true, verified: true };
    }

    return {
      required: true,
      verified: false,
      factorId: verifiedTotp.id
    };
  }

  async function verifyMfa(factorId, code) {
    if (!factorId || !code) {
      fail("MFA factor and verification code are required.");
    }

    const client = getClient();

    const { data: challenge, error: challengeError } =
      await client.auth.mfa.challenge({ factorId });

    if (challengeError) throw challengeError;

    const { data, error } = await client.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: String(code).trim()
    });

    if (error) throw error;

    return data;
  }

  async function resetPassword(email, redirectTo) {
    getEnvironment();

    if (!email) fail("Email is required.");

    const options = {};
    if (redirectTo) {
      options.redirectTo = redirectTo;
    }

    const { error } = await getClient().auth.resetPasswordForEmail(
      String(email).trim().toLowerCase(),
      options
    );

    if (error) throw error;
    return true;
  }

  async function updatePassword(newPassword) {
    if (!newPassword || String(newPassword).length < 12) {
      fail("Admin password must be at least 12 characters.");
    }

    const { data, error } = await getClient().auth.updateUser({
      password: String(newPassword)
    });

    if (error) throw error;
    return data;
  }

  async function signOut() {
    try {
      await getClient().auth.signOut();
    } finally {
      currentAdmin = null;
    }
  }

  function getCurrentAdmin() {
    return currentAdmin;
  }

  function isAuthenticated() {
    return Boolean(currentAdmin && currentAdmin.is_admin);
  }

  function hasRole(role) {
    return Boolean(
      currentAdmin &&
      currentAdmin.is_admin &&
      currentAdmin.role === String(role)
    );
  }

  function getRole() {
    return currentAdmin ? currentAdmin.role : null;
  }

  const api = Object.freeze({
    init,
    signIn,
    requireAdmin,
    requireRole,
    refreshAdminContext,
    ensureMfa,
    verifyMfa,
    resetPassword,
    updatePassword,
    signOut,
    getCurrentAdmin,
    isAuthenticated,
    hasRole,
    getRole
  });

  window.AlbukhrSupabaseAdminAuth = api;

})(window);
