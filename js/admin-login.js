/* =========================================================
   ALBUKHR ADMIN LOGIN CONTROLLER
   File:
   js/admin-login.js

   Purpose:
   - Control Admin Login UI
   - Call Supabase Admin Auth Core
   - Never implement authentication directly
   - Never store credentials
   - Never store admin roles in LocalStorage
   - Never trust role from URL
   - Verify authentication AND authorization
========================================================= */


(function (
  window,
  document
) {

  "use strict";


  /* =====================================================
     DOM
  ===================================================== */

  const form =
    document.getElementById(
      "adminLoginForm"
    );


  const emailInput =
    document.getElementById(
      "adminEmail"
    );


  const passwordInput =
    document.getElementById(
      "adminPassword"
    );


  const loginButton =
    document.getElementById(
      "loginButton"
    );


  const forgotButton =
    document.getElementById(
      "forgotPasswordButton"
    );


  const togglePassword =
    document.getElementById(
      "togglePassword"
    );


  const status =
    document.getElementById(
      "authStatus"
    );


  /* =====================================================
     STATUS
  ===================================================== */

  function setStatus(
    message,
    type
  ) {

    if (!status) {

      return;

    }


    status.textContent =
      String(
        message || ""
      );


    status.className =
      "status show";


    if (type) {

      status.classList.add(
        type
      );

    }

  }


  function clearStatus() {

    if (!status) {

      return;

    }


    status.textContent =
      "";

    status.className =
      "status";

  }


  /* =====================================================
     BUTTON STATE
  ===================================================== */

  function setBusy(
    busy,
    text
  ) {

    if (!loginButton) {

      return;

    }


    loginButton.disabled =
      Boolean(
        busy
      );


    loginButton.textContent =
      text ||
      (
        busy
          ? "Signing in..."
          : "Sign In"
      );

  }


  /* =====================================================
     DEPENDENCY CHECK
  ===================================================== */

  function checkDependencies() {

    if (
      !window.ALBukhrEnvironment
    ) {

      throw new Error(
        "ALBUKHR Environment Core is unavailable."
      );

    }


    if (
      !window.ALBukhrAdminAuth
    ) {

      throw new Error(
        "ALBUKHR Admin Auth Core is unavailable."
      );

    }


    if (
      !window.ALBukhrAdminAuth.isMainnet()
    ) {

      throw new Error(
        "Admin authentication must run through Mainnet."
      );

    }

  }


  /* =====================================================
     SAFE REDIRECT
     
     Only same-origin redirects are accepted.
  ===================================================== */

  function getSafeRedirect() {

    const params =
      new URLSearchParams(
        window.location.search
      );


    const requested =
      params.get(
        "redirect"
      );


    if (!requested) {

      return "index.html";

    }


    try {

      const url =
        new URL(
          requested,
          window.location.origin
        );


      if (
        url.origin !==
        window.location.origin
      ) {

        return "index.html";

      }


      if (
        url.protocol !==
        window.location.protocol
      ) {

        return "index.html";

      }


      return (
        url.pathname +
        url.search +
        url.hash
      );

    }
    catch (
      error
    ) {

      return "index.html";

    }

  }


  /* =====================================================
     LOGIN
  ===================================================== */

  async function login(
    event
  ) {

    if (event) {

      event.preventDefault();

    }


    clearStatus();


    try {

      checkDependencies();


      const email =
        String(
          emailInput?.value || ""
        )
          .trim()
          .toLowerCase();


      const password =
        String(
          passwordInput?.value || ""
        );


      if (!email) {

        throw new Error(
          "Enter your admin email address."
        );

      }


      if (!password) {

        throw new Error(
          "Enter your admin password."
        );

      }


      if (
        password.length < 12
      ) {

        throw new Error(
          "Admin password must contain at least 12 characters."
        );

      }


      setBusy(
        true,
        "Authenticating..."
      );


      setStatus(
        "Verifying secure admin credentials..."
      );


      /* -----------------------------------------------
         SUPABASE AUTHENTICATION
      ------------------------------------------------ */

      await window.ALBukhrAdminAuth.signIn(
        email,
        password
      );


      /* -----------------------------------------------
         ADMIN AUTHORIZATION
         
         Being authenticated does NOT automatically
         make an account an administrator.
      ------------------------------------------------ */

      setStatus(
        "Authentication successful. Verifying admin authorization..."
      );


      const authorization =
        await window.ALBukhrAdminAuth.requireAdmin({
          redirect:
            false
        });


      if (!authorization) {

        /*
         * Authenticated but not authorized.
         *
         * Immediately terminate the session.
         */

        await window.ALBukhrAdminAuth.signOut();


        throw new Error(
          "Your account is authenticated but is not authorized as an ALBUKHR administrator."
        );

      }


      /* -----------------------------------------------
         SUCCESS
      ------------------------------------------------ */

      setStatus(
        "Admin authorization verified. Opening Control Center...",
        "success"
      );


      setBusy(
        true,
        "Opening Admin..."
      );


      /*
       * Clear password input immediately.
       */

      if (passwordInput) {

        passwordInput.value =
          "";

      }


      window.setTimeout(
        function () {

          window.location.replace(
            getSafeRedirect()
          );

        },
        500
      );

    }
    catch (
      error
    ) {

      console.error(
        "❌ ALBUKHR Admin Login Error:",
        error
      );


      setBusy(
        false,
        "Sign In"
      );


      /*
       * Do not expose sensitive backend details.
       */

      let message =
        "Admin sign-in failed. Check your credentials and try again.";


      if (
        error &&
        typeof error.message ===
          "string"
      ) {

        const raw =
          error.message
            .trim()
            .toLowerCase();


        if (
          raw.includes(
            "invalid login credentials"
          )
        ) {

          message =
            "Invalid email or password.";

        }

        else if (
          raw.includes(
            "email not confirmed"
          )
        ) {

          message =
            "This admin account has not completed email verification.";

        }

        else if (
          raw.includes(
            "too many requests"
          )
        ) {

          message =
            "Too many attempts. Please wait before trying again.";

        }

        else if (
          raw.includes(
            "mainnet"
          )
        ) {

          message =
            error.message;

        }

      }


      setStatus(
        "❌ " +
        message,
        "error"
      );

    }

  }


  /* =====================================================
     PASSWORD RECOVERY
  ===================================================== */

  async function forgotPassword() {

    clearStatus();


    try {

      checkDependencies();


      const email =
        String(
          emailInput?.value || ""
        )
          .trim()
          .toLowerCase();


      if (!email) {

        setStatus(
          "Enter your admin email first, then select Forgot password."
        );


        emailInput?.focus();

        return;

      }


      setBusy(
        true,
        "Sending..."
      );


      setStatus(
        "Preparing secure password recovery..."
      );


      await window.ALBukhrAdminAuth
        .requestPasswordReset(
          email
        );


      /*
       * Deliberately generic response.
       *
       * This prevents account enumeration.
       */

      setStatus(
        "If this email is registered for an ALBUKHR admin account, a password recovery message has been sent.",
        "success"
      );

    }
    catch (
      error
    ) {

      console.error(
        "❌ Admin password recovery error:",
        error
      );


      /*
       * Same generic response even when an error occurs.
       */

      setStatus(
        "If this email is registered for an ALBUKHR admin account, a password recovery message has been sent.",
        "success"
      );

    }
    finally {

      setBusy(
        false,
        "Sign In"
      );

    }

  }


  /* =====================================================
     PASSWORD VISIBILITY
  ===================================================== */

  function togglePasswordVisibility() {

    if (!passwordInput) {

      return;

    }


    const showing =
      passwordInput.type ===
      "text";


    passwordInput.type =
      showing
        ? "password"
        : "text";


    if (togglePassword) {

      togglePassword.textContent =
        showing
          ? "Show"
          : "Hide";


      togglePassword.setAttribute(
        "aria-label",
        showing
          ? "Show password"
          : "Hide password"
      );


      togglePassword.setAttribute(
        "aria-pressed",
        String(
          !showing
        )
      );

    }

  }


  /* =====================================================
     INITIALIZATION
  ===================================================== */

  async function initialize() {

    try {

      checkDependencies();


      /*
       * If an existing Supabase session is present,
       * verify that the account is actually an admin.
       */

      const valid =
        await window.ALBukhrAdminAuth
          .validateSession();


      if (valid) {

        const admin =
          await window.ALBukhrAdminAuth
            .requireAdmin({
              redirect:
                false
            });


        if (admin) {

          setStatus(
            "You are already authenticated. Opening Admin Control Center...",
            "success"
          );


          window.setTimeout(
            function () {

              window.location.replace(
                getSafeRedirect()
              );

            },
            400
          );


          return;

        }

      }


      setStatus(
        "Secure admin login ready."
      );

    }
    catch (
      error
    ) {

      console.error(
        "❌ Admin login initialization failed:",
        error
      );


      setBusy(
        true,
        "Login unavailable"
      );


      setStatus(
        "❌ Admin authentication system is unavailable.",
        "error"
      );

    }

  }


  /* =====================================================
     EVENTS
  ===================================================== */

  if (form) {

    form.addEventListener(
      "submit",
      login
    );

  }


  if (forgotButton) {

    forgotButton.addEventListener(
      "click",
      forgotPassword
    );

  }


  if (togglePassword) {

    togglePassword.addEventListener(
      "click",
      togglePasswordVisibility
    );

  }


  /* =====================================================
     DOM READY
  ===================================================== */

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      initialize
    );

  }
  else {

    initialize();

  }


})(window, document);
