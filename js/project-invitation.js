(function (window, document) {
    "use strict";

    const $ = function (id) {
        return document.getElementById(id);
    };

    function getClient() {
        const client = window.ALBUKHR_SUPABASE?.client;

        if (!client) {
            throw new Error(
                "ALBUKHR Supabase Core is unavailable."
            );
        }

        return client;
    }

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
                "Project invitations are available only on ALBUKHR MAINNET."
            );
        }
    }

    function setStatus(message, isError) {
        const element = $("pageStatus");

        if (!element) {
            return;
        }

        element.textContent = message || "";
        element.className =
            isError ? "status error" : "status";
    }

    function show(id) {
        const element = $(id);

        if (element) {
            element.classList.remove("hidden");
        }
    }

    function hide(id) {
        const element = $(id);

        if (element) {
            element.classList.add("hidden");
        }
    }

    /*
     * The token is intentionally read from the URL fragment:
     *
     * project-invitation.html#token=albukhr_inv_...
     *
     * Fragments are not normal HTTP query parameters.
     */
    function getInvitationToken() {
        const hash = String(
            window.location.hash || ""
        );

        if (!hash.startsWith("#")) {
            return "";
        }

        const params =
            new URLSearchParams(
                hash.slice(1)
            );

        return params.get("token") || "";
    }

    function formatProjectType(value) {
        const type =
            String(value || "")
                .trim()
                .toLowerCase();

        if (type === "core") {
            return "Core Team";
        }

        if (type === "internal") {
            return "Internal Project";
        }

        return type || "—";
    }

    function formatDate(value) {
        if (!value) {
            return "—";
        }

        const date =
            new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return date.toLocaleString();
    }

    function showInvalid(message) {
        hide("loadingState");
        hide("validState");
        show("invalidState");

        const element =
            $("invalidMessage");

        if (element) {
            element.textContent =
                message ||
                "This invitation is invalid or unavailable.";
        }
    }

    function showValid(data) {
        hide("loadingState");
        hide("invalidState");
        show("validState");

        $("projectType").textContent =
            formatProjectType(
                data.project_type
            );

        $("expiresAt").textContent =
            formatDate(
                data.expires_at
            );

        const message =
            $("validMessage");

        if (message) {
            message.textContent =
                data.message ||
                "Your invitation has been securely verified.";
        }
    }

    async function validateInvitation() {
        assertMainnet();

        const token =
            getInvitationToken();

        if (!token) {
            showInvalid(
                "No invitation token was found in this link."
            );

            return;
        }

        const response =
            await getClient()
                .schema("albukhr_security")
                .rpc(
                    "validate_project_invitation",
                    {
                        p_invitation_token:
                            token
                    }
                );

        if (response.error) {
            throw response.error;
        }

        const data =
            response.data;

        if (
            !data ||
            data.success !== true ||
            data.valid !== true
        ) {
            showInvalid(
                data?.message ||
                "This invitation is invalid or unavailable."
            );

            return;
        }

        showValid(data);
    }

    function handleContinue() {
        /*
         * IMPORTANT:
         *
         * Invitation validation is intentionally separated
         * from invitation consumption.
         *
         * A future server-authoritative acceptance RPC should:
         *
         * 1. require auth.uid()
         * 2. require appropriate MFA/AAL
         * 3. hash the token server-side
         * 4. verify invitation
         * 5. atomically mark used_at
         * 6. create the correct server-side membership/binding
         *
         * This page MUST NOT directly write security tables.
         */

        setStatus(
            "Invitation verified. Account acceptance is not yet connected to a server-side acceptance RPC."
        );
    }

    async function initialize() {
        try {
            assertMainnet();

            const continueButton =
                $("continueButton");

            if (continueButton) {
                continueButton.addEventListener(
                    "click",
                    handleContinue
                );
            }

            await validateInvitation();

        } catch (error) {
            console.error(
                "[ALBUKHR PROJECT INVITATION]",
                error
            );

            showInvalid(
                error?.message ||
                "Invitation verification failed."
            );
        }
    }

    initialize();

})(
    window,
    document
);
