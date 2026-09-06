(function (window, document) {
    "use strict";

    const $ = (id) => document.getElementById(id);

    let invitationData = null;
    let isAccepting = false;

    function getClient() {
        const client = window.ALBUKHR_SUPABASE && window.ALBUKHR_SUPABASE.client;

        if (!client) {
            throw new Error("ALBUKHR Supabase Core is unavailable.");
        }

        return client;
    }

    function getInvitationAuth() {
        if (!window.AlbukhrInvitationAuth) {
            throw new Error("ALBUKHR Invitation Auth is unavailable.");
        }

        return window.AlbukhrInvitationAuth;
    }

    function assertMainnet() {
        const environment = window.ALBukhrEnvironment;

        if (!environment || typeof environment.isMainnet !== "function") {
            throw new Error("ALBUKHR environment security is unavailable.");
        }

        if (!environment.isMainnet()) {
            throw new Error("Project invitations are available only on ALBUKHR MAINNET.");
        }
    }

    function getAlbukhrAppUrl() {
        const environment = window.ALBukhrEnvironment;

        if (environment && typeof environment.getAppUrl === "function") {
            const url = String(environment.getAppUrl() || "").trim();

            if (/^https:\/\/app\.albukhr\.com\/?$/i.test(url)) {
                return url.replace(/\/?$/, "/");
            }
        }

        return "https://app.albukhr.com/";
    }

    function returnToAlbukhr() {
        window.location.replace(getAlbukhrAppUrl());
    }

    function setStatus(message, isError) {
        const element = $("pageStatus");

        if (!element) {
            return;
        }

        element.textContent = message || "";
        element.className = isError ? "status error" : "status";
    }

    function show(id) {
        const element = $(id);
        if (element) element.classList.remove("hidden");
    }

    function hide(id) {
        const element = $(id);
        if (element) element.classList.add("hidden");
    }

    function setButtonBusy(id, busy, busyText, normalText) {
        const button = $(id);

        if (!button) {
            return;
        }

        button.disabled = Boolean(busy);
        button.textContent = busy ? busyText : normalText;
    }

    function getInvitationToken() {
        const hash = String(window.location.hash || "");

        if (!hash.startsWith("#")) {
            return "";
        }

        return new URLSearchParams(hash.slice(1)).get("token") || "";
    }

    function formatProjectType(value) {
        const type = String(value || "").trim().toLowerCase();

        if (type === "core") return "Core Team";
        if (type === "internal") return "Internal Project";

        return type || "—";
    }

    function formatDate(value) {
        if (!value) return "—";

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? "—"
            : date.toLocaleString();
    }

    function showInvalid(message) {
        hide("loadingState");
        hide("validState");
        show("invalidState");

        const element = $("invalidMessage");

        if (element) {
            element.textContent =
                message || "This invitation is invalid or unavailable.";
        }
    }

    function showValid(data) {
        hide("loadingState");
        hide("invalidState");
        show("validState");

        const projectType = $("projectType");
        if (projectType) {
            projectType.textContent = formatProjectType(data.project_type);
        }

        const expiresAt = $("expiresAt");
        if (expiresAt) {
            expiresAt.textContent = formatDate(data.expires_at);
        }

        const message = $("validMessage");
        if (message) {
            message.textContent =
                data.message || "Your invitation has been securely verified.";
        }
    }

    async function refreshAccountUi() {
        const user = await getInvitationAuth().getUser();

        show("accountState");

        if (user && user.email) {
            hide("accountSignedOut");
            show("accountSignedIn");

            const email = $("signedInEmail");
            if (email) {
                email.textContent = String(user.email);
            }

            return user;
        }

        hide("accountSignedIn");
        show("accountSignedOut");

        return null;
    }

    async function validateInvitation() {
        assertMainnet();

        const token = getInvitationToken();

        if (!token) {
            showInvalid("No invitation token was found in this link.");
            return null;
        }

        const response = await getClient()
            .schema("albukhr_security")
            .rpc("validate_project_invitation", {
                p_invitation_token: token
            });

        if (response.error) {
            throw response.error;
        }

        const data = response.data;

        if (!data || data.success !== true || data.valid !== true) {
            showInvalid(
                data && data.message
                    ? data.message
                    : "This invitation is invalid or unavailable."
            );

            return null;
        }

        invitationData = data;

        showValid(invitationData);

        await refreshAccountUi();

        return invitationData;
    }

    async function acceptCoreInvitation() {
        assertMainnet();

        const token = getInvitationToken();

        if (!token) {
            throw new Error("Invitation token is unavailable.");
        }

        const response = await getClient()
            .schema("albukhr_security")
            .rpc("accept_core_project_invitation", {
                p_invitation_token: token
            });

        if (response.error) {
            throw response.error;
        }

        const data = response.data;

        if (!data || data.success !== true || data.accepted !== true) {
            throw new Error(
                data && data.message
                    ? data.message
                    : "Core Team invitation acceptance failed."
            );
        }

        return data;
    }

    function redirectAfterCoreAcceptance() {
        /*
         * Do not send a newly accepted admin directly to the app root.
         * The admin login/MFA engines remain the established security gate.
         */
        window.location.replace("admin-login.html");
    }

    function bindReturnButton() {
        const button = $("returnButton");

        if (!button) {
            return;
        }

        button.addEventListener("click", returnToAlbukhr);
    }

    function invitationRedirectUrl() {
        /*
         * Keep the invitation token in the URL fragment. The fragment is not
         * sent to the server as a normal request parameter.
         */
        const token = getInvitationToken();

        if (!token) {
            return window.location.origin + "/project-invitation.html";
        }

        return (
            window.location.origin +
            "/project-invitation.html#token=" +
            encodeURIComponent(token)
        );
    }

    async function handleSignIn(event) {
        event.preventDefault();

        try {
            const email = $("invitationEmail");
            const password = $("invitationPassword");

            setButtonBusy(
                "invitationSignInButton",
                true,
                "Signing in...",
                "Sign In and Continue"
            );

            setStatus("Authenticating the invitation account...", false);

            await getInvitationAuth().signIn(
                email ? email.value : "",
                password ? password.value : ""
            );

            if (password) {
                password.value = "";
            }

            await refreshAccountUi();

            setStatus(
                "Signed in successfully. You may now accept the invitation.",
                false
            );
        }

        catch (error) {
            console.error("[ALBUKHR INVITATION SIGN IN]", error);

            setStatus(
                error && error.message
                    ? error.message
                    : "Invitation sign-in failed.",
                true
            );
        }

        finally {
            setButtonBusy(
                "invitationSignInButton",
                false,
                "Signing in...",
                "Sign In and Continue"
            );
        }
    }

    async function handleCreateAccount() {
        try {
            const email = $("invitationEmail");
            const password = $("invitationPassword");

            setButtonBusy(
                "invitationCreateButton",
                true,
                "Creating account...",
                "Create Account"
            );

            setStatus(
                "Creating the invitation account securely...",
                false
            );

            const result = await getInvitationAuth().signUp(
                email ? email.value : "",
                password ? password.value : "",
                {
                    redirectTo: invitationRedirectUrl()
                }
            );

            if (password) {
                password.value = "";
            }

            if (result.session) {
                await refreshAccountUi();

                setStatus(
                    "Account created successfully. You may now accept the invitation.",
                    false
                );

                return;
            }

            setStatus(
                "Account created. Check the invitation email address for the confirmation message, complete verification, then open the invitation link again.",
                false
            );
        }

        catch (error) {
            console.error("[ALBUKHR INVITATION SIGN UP]", error);

            setStatus(
                error && error.message
                    ? error.message
                    : "Account creation failed.",
                true
            );
        }

        finally {
            setButtonBusy(
                "invitationCreateButton",
                false,
                "Creating account...",
                "Create Account"
            );
        }
    }

    async function handleSwitchAccount() {
        try {
            setStatus("Signing out the current account...", false);

            await getInvitationAuth().signOut();

            await refreshAccountUi();

            setStatus(
                "Current account signed out. Sign in with the email address that received this invitation.",
                false
            );
        }

        catch (error) {
            console.error("[ALBUKHR INVITATION SWITCH ACCOUNT]", error);

            setStatus(
                error && error.message
                    ? error.message
                    : "Could not switch the invitation account.",
                true
            );
        }
    }

    async function handleContinue() {
        if (isAccepting) {
            return;
        }

        try {
            assertMainnet();

            if (!invitationData) {
                throw new Error("Invitation verification data is unavailable.");
            }

            const user = await refreshAccountUi();

            if (!user) {
                setStatus(
                    "Sign in with the email address that received this invitation.",
                    true
                );

                return;
            }

            const projectType =
                String(invitationData.project_type || "")
                    .trim()
                    .toLowerCase();

            if (projectType !== "core") {
                if (projectType === "internal") {
                    throw new Error(
                        "This Internal Project invitation is valid, but its server-side acceptance workflow has not yet been connected."
                    );
                }

                throw new Error("Unsupported invitation type.");
            }

            isAccepting = true;

            setButtonBusy(
                "continueButton",
                true,
                "Accepting invitation...",
                "Accept Invitation"
            );

            setStatus(
                "Securely accepting your Core Team invitation...",
                false
            );

            const result = await acceptCoreInvitation();

            setStatus(
                result.message ||
                    "Core Team invitation accepted successfully.",
                false
            );

            /*
             * Remove the token only after successful server-side acceptance.
             */
            window.history.replaceState(
                null,
                document.title,
                window.location.pathname
            );

            window.setTimeout(redirectAfterCoreAcceptance, 900);
        }

        catch (error) {
            console.error(
                "[ALBUKHR PROJECT INVITATION ACCEPTANCE]",
                error
            );

            const message =
                error && error.message
                    ? error.message
                    : "Invitation acceptance failed.";

            setStatus(message, true);

            /*
             * The database remains authoritative. If it reports an email
             * mismatch, preserve the security rule and allow the person to
             * deliberately switch accounts.
             */
            if (
                String(message)
                    .toLowerCase()
                    .includes("different email")
            ) {
                setStatus(
                    "This invitation belongs to a different email address. Use “Use a Different Email” and sign in with the invited email.",
                    true
                );
            }
        }

        finally {
            isAccepting = false;

            setButtonBusy(
                "continueButton",
                false,
                "Accepting invitation...",
                "Accept Invitation"
            );
        }
    }

    async function initialize() {
        try {
            assertMainnet();

            bindReturnButton();

            const form = $("invitationAuthForm");
            if (form) {
                form.addEventListener("submit", handleSignIn);
            }

            const createButton = $("invitationCreateButton");
            if (createButton) {
                createButton.addEventListener(
                    "click",
                    handleCreateAccount
                );
            }

            const continueButton = $("continueButton");
            if (continueButton) {
                continueButton.addEventListener(
                    "click",
                    handleContinue
                );
            }

            const switchButton = $("switchAccountButton");
            if (switchButton) {
                switchButton.addEventListener(
                    "click",
                    handleSwitchAccount
                );
            }

            await validateInvitation();
        }

        catch (error) {
            console.error("[ALBUKHR PROJECT INVITATION]", error);

            showInvalid(
                error && error.message
                    ? error.message
                    : "Invitation verification failed."
            );
        }
    }

    initialize();

})(window, document);
