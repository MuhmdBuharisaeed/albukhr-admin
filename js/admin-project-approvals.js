/* ALBUKHR Canonical Core Project Approvals page
 * 1.9 route-hardening companion.
 * Mainnet only. Uses existing server-authoritative Core Approval Engine.
 */
(function (w, d) {
  "use strict";

  const wait = (fn, ms) => new Promise((resolve, reject) => {
    const started = Date.now();
    (function tick() {
      try {
        const value = fn();
        if (value) return resolve(value);
      } catch (_) {}
      if (Date.now() - started >= ms) {
        return reject(new Error("Required Admin security dependencies are unavailable."));
      }
      setTimeout(tick, 50);
    })();
  });

  async function initPage() {
    const auth = await wait(() => w.AlbukhrSupabaseAdminAuth, 8000);
    const env = await wait(() => w.AlbukhrEnvironment, 8000);

    if (!env.isKnown || !env.isKnown() || !env.isMainnet()) {
      throw new Error("ALBUKHR Admin is Mainnet only.");
    }

    await auth.init();
    const admin = await auth.requireAdmin({ redirect: false });

    if (!admin) {
      w.location.replace("/admin-login.html");
      return;
    }

    const mfa = await auth.ensureMfa();
    if (admin.mfa_required && !mfa.verified) {
      w.location.replace("/admin-mfa.html");
      return;
    }

    const roles = Array.isArray(admin.roles) ? admin.roles : [];
    const authorized =
      roles.includes("super_admin") || roles.includes("approval_admin");

    const set = (id, value) => {
      const el = d.getElementById(id);
      if (el) el.textContent = value == null ? "—" : String(value);
    };

    set("adminEmail", admin.email || admin.email_snapshot || "Authenticated administrator");
    set("adminId", admin.user_id || "Authenticated session");
    set("adminStatus", admin.status || "active");
    set("mfaStatus", mfa.verified ? "AAL2 verified" : "Not verified");

    if (!authorized) {
      set("authorizationState", "DENIED");
      set("securityState", mfa.verified ? "Authenticated • AAL2" : "Authenticated");
      set("authorizationTitle", "Approval authorization denied");
      set("authorizationText", "Required role: super_admin or approval_admin.");
      const status = d.getElementById("pageStatus");
      if (status) {
        status.textContent =
          "You are authenticated but not authorized for Core Project approvals.";
        status.className = "status error";
      }
      return;
    }

    set("authorizationState", "AUTHORIZED");
    set("securityState", "Authenticated • AAL2");
    set("authorizationTitle", "Server-authoritative Core approval access granted");
    set("authorizationText", "Accepted roles: super_admin / approval_admin");

    const logout = d.getElementById("logoutButton");
    if (logout) {
      logout.addEventListener("click", async function () {
        logout.disabled = true;
        try {
          await auth.signOut();
        } finally {
          w.location.replace("/admin-login.html");
        }
      });
    }

    if (!w.AlbukhrCoreProjectApproval ||
        typeof w.AlbukhrCoreProjectApproval.init !== "function") {
      throw new Error("Core Project Approval Engine UI is unavailable.");
    }
  }

  d.addEventListener("DOMContentLoaded", function () {
    initPage().catch(function (error) {
      console.error("[ALBUKHR CORE PROJECT APPROVALS]", error);
      const status = d.getElementById("pageStatus");
      if (status) {
        status.textContent = error && error.message
          ? error.message
          : "Unable to initialize Core Project Approvals.";
        status.className = "status error";
      }
    });
  });
})(window, document);
