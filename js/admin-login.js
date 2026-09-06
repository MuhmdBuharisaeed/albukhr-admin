(function (window, document) {
    "use strict";

    /*
     * ALBUKHR ADMIN LOGIN
     *
     * Client role:
     * authenticate through the shared Admin Auth engine,
     * then route according to server-authoritative admin
     * context and MFA assurance.
     *
     * No admin authority is created in this file.
     */

    const form =
        document.getElementById(
            "adminLoginForm"
        );

    const email =
        document.getElementById(
            "adminEmail"
        );

    const password =
        document.getElementById(
            "adminPassword"
        );

    const login =
        document.getElementById(
            "loginButton"
        );

    const forgot =
        document.getElementById(
            "forgotPasswordButton"
        );

    const toggle =
        document.getElementById(
            "togglePassword"
        );

    const status =
        document.getElementById(
            "authStatus"
        );


    function getAdminAuth() {

        return window.AlbukhrSupabaseAdminAuth;

    }


    function message(
        text,
        type = ""
    ) {

        if (!status) {
            return;
        }

        status.textContent =
            String(text || "");

        status.className =
            "status" +
            (
                type
                    ? " " + type
                    : ""
            );

    }


    function setBusy(
        value,
        text
    ) {

        if (!login) {
            return;
        }

        login.disabled =
            Boolean(value);

        login.textContent =
            text ||
            (
                value
                    ? "Authenticating..."
                    : "Sign In Securely"
            );

    }


    function dependenciesReady() {

        return Boolean(

            window.ALBukhrEnvironment &&

            window.ALBUKHR_SUPABASE &&

            getAdminAuth()

        );

    }


    function destination() {

        const redirect =
            new URLSearchParams(
                window.location.search
            )
                .get(
                    "redirect"
                );


        if (!redirect) {
            return "admin-dashboard.html";
        }


        try {

            const url =
                new URL(
                    redirect,
                    window.location.origin
                );


            return (

                url.origin ===
                window.location.origin

                &&

                url.protocol ===
                window.location.protocol

            )

                ? (

                    url.pathname +

                    url.search +

                    url.hash

                )

                : "admin-dashboard.html";

        }

        catch (_) {

            return "admin-dashboard.html";

        }

    }


    function mfaUrl() {

        return (

            "admin-mfa.html?redirect=" +

            encodeURIComponent(
                destination()
            )

        );

    }


    async function routeAuthenticatedAdmin(
        admin
    ) {

        if (

            !admin ||

            admin.is_admin !==
            true ||

            admin.status !==
            "active"

        ) {

            throw new Error(
                "Admin authorization denied."
            );

        }


        const mfa =
            await getAdminAuth()
                .ensureMfa();


        if (

            mfa.required ===
            true &&

            mfa.verified !==
            true

        ) {

            window.location.replace(
                mfaUrl()
            );

            return false;

        }


        window.location.replace(
            destination()
        );

        return true;

    }


    async function init() {

        try {

            if (

                !dependenciesReady() ||

                !window.ALBukhrEnvironment
                    .isMainnet()

            ) {

                throw new Error(
                    "Admin authentication system is unavailable."
                );

            }


            await getAdminAuth()
                .init();


            const session =
                await getAdminAuth()
                    .getSession();


            if (
                !session
            ) {

                message(
                    "Secure admin login ready."
                );

                return;

            }


            const admin =
                await getAdminAuth()
                    .requireAdmin({

                        redirect:
                            false

                    });


            if (
                !admin
            ) {

                return;

            }


            const mfa =
                await getAdminAuth()
                    .ensureMfa();


            if (

                mfa.required ===
                true &&

                mfa.verified !==
                true

            ) {

                window.location.replace(
                    mfaUrl()
                );

                return;

            }


            message(

                "Existing admin session verified. Opening Control Center...",

                "success"

            );


            window.setTimeout(

                function () {

                    window.location.replace(
                        destination()
                    );

                },

                350

            );

        }

        catch (
            error
        ) {

            console.error(
                "[ALBUKHR ADMIN LOGIN]",
                error
            );


            setBusy(
                true,
                "Login unavailable"
            );


            message(

                "Admin authentication system is unavailable.",

                "error"

            );

        }

    }


    async function submit(
        event
    ) {

        event.preventDefault();


        try {

            if (
                !dependenciesReady()
            ) {

                throw new Error(
                    "Admin authentication system is unavailable."
                );

            }


            const normalizedEmail =
                String(
                    email
                        ? email.value
                        : ""
                )
                    .trim()
                    .toLowerCase();


            const enteredPassword =
                String(
                    password
                        ? password.value
                        : ""
                );


            if (
                !normalizedEmail
            ) {

                throw new Error(
                    "Enter your admin email address."
                );

            }


            if (
                !enteredPassword
            ) {

                throw new Error(
                    "Enter your admin password."
                );

            }


            if (
                enteredPassword.length <
                12
            ) {

                throw new Error(
                    "Admin password must contain at least 12 characters."
                );

            }


            setBusy(
                true
            );


            message(
                "Verifying secure admin credentials..."
            );


            const admin =
                await getAdminAuth()
                    .signIn(

                        normalizedEmail,

                        enteredPassword

                    );


            if (password) {

                password.value =
                    "";

            }


            const routed =
                await routeAuthenticatedAdmin(
                    admin
                );


            if (!routed) {

                return;

            }

        }

        catch (
            error
        ) {

            console.error(
                "[ALBUKHR ADMIN LOGIN]",
                error
            );


            setBusy(
                false
            );


            let text =
                "Admin sign-in failed. Check your credentials and try again.";


            const reason =
                String(

                    error &&
                    error.message

                        ? error.message

                        : ""

                )
                    .toLowerCase();


            if (

                reason.includes(
                    "invalid login credentials"
                )

            ) {

                text =
                    "Invalid email or password.";

            }

            else if (

                reason.includes(
                    "email not confirmed"
                )

            ) {

                text =
                    "This admin account has not completed email verification.";

            }

            else if (

                reason.includes(
                    "too many requests"
                )

            ) {

                text =
                    "Too many attempts. Please wait before trying again.";

            }


            message(
                text,
                "error"
            );

        }

    }


    async function recover() {

        try {

            if (
                !dependenciesReady()
            ) {

                throw new Error(
                    "Admin authentication system is unavailable."
                );

            }


            const normalizedEmail =
                String(
                    email
                        ? email.value
                        : ""
                )
                    .trim()
                    .toLowerCase();


            if (
                !normalizedEmail
            ) {

                message(

                    "Enter your admin email first, then select Forgot password.",

                    "error"

                );


                email?.focus();

                return;

            }


            forgot.disabled =
                true;


            message(
                "Preparing secure password recovery..."
            );


            await getAdminAuth()
                .resetPassword(

                    normalizedEmail,

                    window.location.origin +
                    "/admin-reset-password.html"

                );


            /*
             * Intentionally generic to avoid account enumeration.
             */

            message(

                "If this email is registered for an ALBUKHR admin account, a password recovery message has been sent.",

                "success"

            );

        }

        catch (
            error
        ) {

            console.error(
                "[ALBUKHR ADMIN RECOVERY]",
                error
            );


            message(

                "If this email is registered for an ALBUKHR admin account, a password recovery message has been sent.",

                "success"

            );

        }

        finally {

            if (forgot) {

                forgot.disabled =
                    false;

            }

        }

    }


    function togglePassword() {

        if (
            !password ||
            !toggle
        ) {

            return;

        }


        const visible =
            password.type ===
            "text";


        password.type =
            visible
                ? "password"
                : "text";


        toggle.textContent =
            visible
                ? "Show"
                : "Hide";


        toggle.setAttribute(

            "aria-pressed",

            String(
                !visible
            )

        );

    }


    form?.addEventListener(
        "submit",
        submit
    );

    forgot?.addEventListener(
        "click",
        recover
    );

    toggle?.addEventListener(
        "click",
        togglePassword
    );


    init();

})(
    window,
    document
);
