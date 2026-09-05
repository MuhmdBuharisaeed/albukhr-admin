(function (window, document) {
    "use strict";


    // =====================================================
    // DOM HELPER
    // =====================================================

    const $ = function (id) {
        return document.getElementById(id);
    };


    // =====================================================
    // RUNTIME STATE
    //
    // Invitation data is intentionally kept only in memory.
    // =====================================================

    let invitationData = null;

    let isAccepting = false;


    // =====================================================
    // SUPABASE CLIENT
    // =====================================================

    function getClient() {

        const client =
            window.ALBUKHR_SUPABASE?.client;


        if (!client) {

            throw new Error(
                "ALBUKHR Supabase Core is unavailable."
            );

        }


        return client;

    }


    // =====================================================
    // MAINNET SECURITY
    // =====================================================

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


    // =====================================================
    // STATUS
    // =====================================================

    function setStatus(message, isError) {

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


    // =====================================================
    // STATE VISIBILITY
    // =====================================================

    function show(id) {

        const element =
            $(id);


        if (element) {

            element.classList.remove(
                "hidden"
            );

        }

    }


    function hide(id) {

        const element =
            $(id);


        if (element) {

            element.classList.add(
                "hidden"
            );

        }

    }


    // =====================================================
    // BUTTON STATE
    // =====================================================

    function setContinueLoading(
        loading,
        message
    ) {

        const button =
            $("continueButton");


        if (!button) {
            return;
        }


        button.disabled =
            Boolean(loading);


        if (loading) {

            button.dataset.originalText =
                button.textContent;

            button.textContent =
                message ||
                "Processing...";

        } else {

            button.textContent =
                button.dataset.originalText ||
                "Continue";

        }

    }


    // =====================================================
    // INVITATION TOKEN
    //
    // Expected URL:
    //
    // project-invitation.html
    // #token=albukhr_inv_<64_hex>
    // =====================================================

    function getInvitationToken() {

        const hash =
            String(
                window.location.hash || ""
            );


        if (!hash.startsWith("#")) {
            return "";
        }


        const params =
            new URLSearchParams(
                hash.slice(1)
            );


        return (
            params.get("token") ||
            ""
        );

    }


    // =====================================================
    // PROJECT TYPE FORMATTER
    // =====================================================

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


    // =====================================================
    // DATE FORMATTER
    // =====================================================

    function formatDate(value) {

        if (!value) {
            return "—";
        }


        const date =
            new Date(value);


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return "—";

        }


        return date.toLocaleString();

    }


    // =====================================================
    // INVALID STATE
    // =====================================================

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


    // =====================================================
    // VALID STATE
    // =====================================================

    function showValid(data) {

        hide("loadingState");

        hide("invalidState");

        show("validState");


        const projectType =
            $("projectType");


        if (projectType) {

            projectType.textContent =
                formatProjectType(
                    data.project_type
                );

        }


        const expiresAt =
            $("expiresAt");


        if (expiresAt) {

            expiresAt.textContent =
                formatDate(
                    data.expires_at
                );

        }


        const message =
            $("validMessage");


        if (message) {

            message.textContent =
                data.message ||
                "Your invitation has been securely verified.";

        }

    }


    // =====================================================
    // AUTHENTICATED USER
    // =====================================================

    async function getAuthenticatedUser() {

        const client =
            getClient();


        const response =
            await client.auth.getUser();


        if (response.error) {

            throw response.error;

        }


        const user =
            response.data?.user;


        return user || null;

    }


    // =====================================================
    // VALIDATE INVITATION
    // =====================================================

    async function validateInvitation() {

        assertMainnet();


        const token =
            getInvitationToken();


        if (!token) {

            showInvalid(
                "No invitation token was found in this link."
            );

            return null;

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

            return null;

        }


        invitationData =
            data;


        showValid(
            invitationData
        );


        return invitationData;

    }


    // =====================================================
    // ACCEPT CORE INVITATION
    //
    // Server-authoritative operation.
    //
    // Database function:
    //
    // albukhr_security
    // .accept_core_project_invitation(
    //     p_invitation_token text
    // )
    // =====================================================

    async function acceptCoreInvitation() {

        assertMainnet();


        const token =
            getInvitationToken();


        if (!token) {

            throw new Error(
                "Invitation token is unavailable."
            );

        }


        const client =
            getClient();


        const response =
            await client
                .schema("albukhr_security")
                .rpc(
                    "accept_core_project_invitation",
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
            data.accepted !== true
        ) {

            throw new Error(

                data?.message ||

                "Core Team invitation acceptance failed."

            );

        }


        return data;

    }


    // =====================================================
    // REDIRECT AFTER SUCCESS
    //
    // IMPORTANT:
    //
    // Replace this route with the final Core Admin
    // destination when the ALBUKHR architecture
    // is finalized.
    // =====================================================

    function redirectAfterCoreAcceptance() {

        window.location.replace(
            "/"
        );

    }


    // =====================================================
    // CONTINUE BUTTON
    // =====================================================

    async function handleContinue() {

        if (isAccepting) {
            return;
        }


        try {

            assertMainnet();


            // =============================================
            // ENSURE INVITATION IS VALID
            // =============================================

            if (!invitationData) {

                throw new Error(
                    "Invitation verification data is unavailable."
                );

            }


            // =============================================
            // GET TOKEN
            // =============================================

            const token =
                getInvitationToken();


            if (!token) {

                throw new Error(
                    "Invitation token is unavailable."
                );

            }


            // =============================================
            // AUTHENTICATION REQUIRED
            // =============================================

            const user =
                await getAuthenticatedUser();


            if (!user) {

                setStatus(
                    "Please sign in with the email address that received this invitation.",
                    true
                );

                return;

            }


            // =============================================
            // CORE INVITATION
            // =============================================

            const projectType =
                String(
                    invitationData.project_type || ""
                )
                    .trim()
                    .toLowerCase();


            if (projectType === "core") {

                isAccepting =
                    true;


                setContinueLoading(
                    true,
                    "Accepting invitation..."
                );


                setStatus(
                    "Securely accepting your Core Team invitation...",
                    false
                );


                const result =
                    await acceptCoreInvitation();


                setStatus(
                    result.message ||
                    "Core Team invitation accepted successfully.",
                    false
                );


                /*
                 * SECURITY:
                 *
                 * Remove the raw token from browser history.
                 *
                 * The invitation has already been consumed
                 * by the database.
                 */

                window.history.replaceState(
                    null,
                    document.title,
                    window.location.pathname
                );


                /*
                 * Short delay so the user sees success.
                 */

                window.setTimeout(
                    function () {

                        redirectAfterCoreAcceptance();

                    },
                    1000
                );


                return;

            }


            // =============================================
            // INTERNAL INVITATION
            //
            // No acceptance RPC currently exists.
            // =============================================

            if (projectType === "internal") {

                setStatus(
                    "This Internal Project invitation is valid, but its server-side acceptance workflow has not yet been connected.",
                    true
                );

                return;

            }


            // =============================================
            // UNKNOWN TYPE
            // =============================================

            throw new Error(
                "Unsupported invitation type."
            );


        } catch (error) {

            console.error(
                "[ALBUKHR PROJECT INVITATION ACCEPTANCE]",
                error
            );


            setStatus(
                error?.message ||
                "Invitation acceptance failed.",
                true
            );


        } finally {

            isAccepting =
                false;


            setContinueLoading(
                false
            );

        }

    }


    // =====================================================
    // INITIALIZATION
    // =====================================================

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


    // =====================================================
    // START
    // =====================================================

    initialize();


})(
    window,
    document
);
