(function (window, document) {
    "use strict";

    /*
     * ALBUKHR ADMIN MFA
     *
     * Canonical MFA page engine.
     *
     * SECURITY AUTHORITY:
     *
     * Supabase Auth MFA
     * +
     * Supabase AAL
     * +
     * ALBUKHR Admin Auth engine
     *
     * This engine intentionally delegates challenge/verify
     * lifecycle handling to:
     *
     * AlbukhrSupabaseAdminAuth.verifyMfa()
     */

    const getAdminAuth =
        function () {
            return window.AlbukhrSupabaseAdminAuth;
        };

    const getElement =
        function (id) {
            return document.getElementById(id);
        };

    const qr =
        getElement("qr");

    const secret =
        getElement("secret");

    const code =
        getElement("mfaCode");

    const verifyButton =
        getElement("verifyButton");

    const status =
        getElement("mfaStatus");

    const enrollPanel =
        getElement("enrollPanel");

    const successPanel =
        getElement("successPanel");

    const continueButton =
        getElement("continueButton");


    let factorId = null;

    let initialized = false;


    function message(
        text,
        type
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

        if (!verifyButton) {
            return;
        }

        verifyButton.disabled =
            Boolean(value);

        verifyButton.textContent =
            text ||
            (
                value
                    ? "Verifying..."
                    : "Verify & Secure Admin"
            );

    }


    function dependenciesReady() {

        const auth =
            getAdminAuth();

        return Boolean(

            window.ALBukhrEnvironment &&

            window.ALBUKHR_SUPABASE &&

            window.ALBUKHR_SUPABASE.client &&

            auth &&

            typeof auth.init ===
            "function" &&

            typeof auth.requireAdmin ===
            "function" &&

            typeof auth.ensureMfa ===
            "function" &&

            typeof auth.verifyMfa ===
            "function"

        );

    }


    function errorText(error) {

        if (!error) {
            return "Unknown error.";
        }

        return String(

            error.message ||

            error.error_description ||

            error.msg ||

            error

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


            if (

                url.origin !==
                window.location.origin

            ) {

                return "admin-dashboard.html";

            }


            return (

                url.pathname +

                url.search +

                url.hash

            );

        }

        catch (_) {

            return "admin-dashboard.html";

        }

    }


    function showSuccess(
        text
    ) {

        if (enrollPanel) {

            enrollPanel.hidden =
                true;

        }


        if (successPanel) {

            successPanel.hidden =
                false;

        }


        message(
            text,
            "success"
        );

    }


    function renderQr(
        qrCode
    ) {

        if (!qr) {

            throw new Error(
                "QR container is missing from admin-mfa.html."
            );

        }


        qr.innerHTML =
            "";


        if (!qrCode) {

            throw new Error(
                "Supabase did not return a TOTP QR code."
            );

        }


        const image =
            document.createElement(
                "img"
            );


        image.alt =
            "ALBUKHR Admin authenticator QR code";

        image.width =
            220;

        image.height =
            220;

        image.style.maxWidth =
            "100%";

        image.style.height =
            "auto";

        image.style.display =
            "block";

        image.style.margin =
            "0 auto";


        /*
         * Supabase returns QR code SVG markup.
         */

        image.src =
            "data:image/svg+xml;charset=utf-8," +

            encodeURIComponent(
                String(qrCode)
            );


        qr.appendChild(
            image
        );

    }


    function renderSecret(
        value
    ) {

        if (!secret) {
            return;
        }

        secret.textContent =
            value

                ? String(value)

                : "No manual setup key was returned by Supabase.";

    }


    async function removeStaleUnverifiedFactors(
        client,
        factors
    ) {

        const stale =
            (
                Array.isArray(
                    factors
                )

                    ? factors

                    : []

            )
                .filter(

                    function (
                        factor
                    ) {

                        return (

                            factor &&

                            factor.factor_type ===
                            "totp" &&

                            factor.status ===
                            "unverified"

                        );

                    }

                );


        for (
            const factor of stale
        ) {

            const response =
                await client.auth.mfa
                    .unenroll({

                        factorId:
                            factor.id

                    });


            if (
                response.error
            ) {

                throw response.error;

            }

        }

    }


    async function enroll() {

        const client =
            window.ALBUKHR_SUPABASE
                .client;


        const existing =
            await client.auth.mfa
                .listFactors();


        if (
            existing.error
        ) {

            throw existing.error;

        }


        const factors =

            Array.isArray(

                existing.data &&

                existing.data.totp

            )

                ? existing.data.totp

                : [];


        const verified =
            factors.find(

                function (
                    factor
                ) {

                    return (

                        factor &&

                        factor.status ===
                        "verified"

                    );

                }

            );


        if (
            verified
        ) {

            factorId =
                verified.id;


            if (qr) {

                qr.innerHTML =
                    "";

            }


            renderSecret(
                "Already enrolled — use your authenticator app."
            );


            message(

                "An authenticator is already enrolled. Enter its current 6-digit code.",

                "success"

            );


            initialized =
                true;


            return;

        }


        await removeStaleUnverifiedFactors(

            client,

            factors

        );


        const result =
            await client.auth.mfa
                .enroll({

                    factorType:
                        "totp",

                    friendlyName:
                        "ALBUKHR Admin Authenticator"

                });


        if (
            result.error
        ) {

            throw result.error;

        }


        if (

            !result.data ||

            !result.data.id

        ) {

            throw new Error(

                "Supabase did not return a valid MFA factor."

            );

        }


        factorId =
            result.data.id;


        const totp =
            result.data.totp ||
            {};


        const qrCode =
            totp.qr_code ||
            "";


        const totpSecret =
            totp.secret ||
            "";


        renderQr(
            qrCode
        );


        renderSecret(
            totpSecret
        );


        message(

            "Authenticator setup is ready. Scan the QR code, then enter the 6-digit code shown in your authenticator app."

        );


        initialized =
            true;

    }


    async function verifyMfa() {

        const value =
            String(

                code

                    ? code.value

                    : ""

            )

                .replace(
                    /\D/g,
                    ""
                );


        if (
            !factorId
        ) {

            throw new Error(

                "MFA factor is not available. Reload the page and try again."

            );

        }


        if (

            !/^\d{6}$/.test(
                value
            )

        ) {

            throw new Error(

                "Enter the 6-digit authenticator code."

            );

        }


        /*
         * Canonical verification:
         *
         * Admin Auth engine performs:
         *
         * challenge
         * → verify
         * → refresh session
         * → clear old context
         * → reload server context
         */

        const result =
            await getAdminAuth()
                .verifyMfa(

                    factorId,

                    value

                );


        const assurance =
            await window.ALBUKHR_SUPABASE
                .client
                .auth
                .mfa
                .getAuthenticatorAssuranceLevel();


        if (
            assurance.error
        ) {

            throw assurance.error;

        }


        if (

            !assurance.data ||

            assurance.data.currentLevel !==
            "aal2"

        ) {

            throw new Error(

                "MFA verification did not establish AAL2 assurance."

            );

        }


        const admin =
            await getAdminAuth()
                .refreshAdminContext();


        if (

            !admin ||

            admin.is_admin !== true ||

            admin.status !==
            "active"

        ) {

            throw new Error(

                "MFA succeeded, but ALBUKHR admin authorization could not be re-verified."

            );

        }


        if (code) {

            code.value =
                "";

        }


        showSuccess(

            "MFA verification successful. Your ALBUKHR admin session is now secured with AAL2."

        );


        return result;

    }


    async function init() {

        try {

            if (
                !dependenciesReady()
            ) {

                throw new Error(

                    "Admin authentication system is unavailable."

                );

            }


            if (

                !window.ALBukhrEnvironment
                    .isMainnet()

            ) {

                throw new Error(

                    "Admin MFA is available only on ALBUKHR MAINNET."

                );

            }


            const auth =
                getAdminAuth();


            await auth.init();


            const admin =
                await auth.requireAdmin({

                    redirect:
                        false

                });


            if (
                !admin
            ) {

                window.location.replace(
                    "admin-login.html"
                );

                return;

            }


            const mfa =
                await auth.ensureMfa();


            if (
                mfa.required === false
            ) {

                showSuccess(

                    "MFA is not required for this admin session."

                );

                return;

            }


            if (

                mfa.required ===
                true &&

                mfa.verified ===
                true

            ) {

                showSuccess(

                    "MFA is already verified for this session."

                );

                return;

            }


            if (

                mfa.enrolled ===
                true &&

                mfa.factorId

            ) {

                factorId =
                    mfa.factorId;

                initialized =
                    true;


                if (qr) {

                    qr.innerHTML =
                        "";

                }


                renderSecret(

                    "Already enrolled — use your authenticator app."

                );


                message(

                    "Enter the current 6-digit code from your authenticator app."

                );


                return;

            }


            await enroll();

        }

        catch (
            error
        ) {

            console.error(

                "[ALBUKHR ADMIN MFA]",

                error

            );


            message(

                "MFA setup failed: " +

                errorText(
                    error
                ),

                "error"

            );


            if (
                verifyButton
            ) {

                verifyButton.disabled =
                    true;

            }

        }

    }


    verifyButton?.addEventListener(

        "click",

        async function () {

            if (

                !initialized ||

                !factorId

            ) {

                return;

            }


            try {

                setBusy(

                    true,

                    "Verifying..."

                );


                message(

                    "Verifying MFA assurance..."

                );


                await verifyMfa();


                setBusy(

                    false,

                    "Verified ✓"

                );

            }

            catch (
                error
            ) {

                console.error(

                    "[ALBUKHR ADMIN MFA VERIFY]",

                    error

                );


                message(

                    "MFA verification failed: " +

                    errorText(
                        error
                    ),

                    "error"

                );


                setBusy(

                    false,

                    "Verify & Secure Admin"

                );

            }

        }

    );


    code?.addEventListener(

        "input",

        function () {

            code.value =

                code.value

                    .replace(
                        /\D/g,
                        ""
                    )

                    .slice(
                        0,
                        6
                    );

        }

    );


    code?.addEventListener(

        "keydown",

        function (
            event
        ) {

            if (

                event.key ===
                "Enter"

            ) {

                event.preventDefault();

                verifyButton?.click();

            }

        }

    );


    continueButton?.addEventListener(

        "click",

        function () {

            window.location.replace(
                destination()
            );

        }

    );


    init();

})(
    window,
    document
);
