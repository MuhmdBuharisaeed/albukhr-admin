(function (window) {
    "use strict";

    /*
     * ALBUKHR INVITATION AUTH
     *
     * Purpose:
     * Authenticate an invited person with ordinary Supabase Auth.
     *
     * IMPORTANT:
     * This engine DOES NOT create admin authority.
     * Admin authority remains server-side and is granted only by
     * the invitation acceptance RPC + database security rules.
     */

    const CORE_NAME = "ALBUKHR Invitation Auth";

    function fail(message) {
        throw new Error(String(message || "Invitation authentication error."));
    }

    function getEnvironment() {
        const environment = window.ALBukhrEnvironment;

        if (!environment || typeof environment.isKnown !== "function") {
            fail("ALBUKHR Environment Core is unavailable.");
        }

        if (!environment.isKnown() || !environment.isMainnet()) {
            fail("Invitation authentication is available only on ALBUKHR MAINNET.");
        }

        return environment;
    }

    function getClient() {
        getEnvironment();

        const core = window.ALBUKHR_SUPABASE;

        if (!core || !core.client) {
            fail("ALBUKHR Supabase Core is unavailable.");
        }

        if (String(core.environment || "").toLowerCase() !== "mainnet") {
            fail("Invitation authentication cannot use a non-Mainnet client.");
        }

        return core.client;
    }

    function normalizeEmail(email) {
        const value = String(email || "").trim().toLowerCase();

        if (!value) {
            fail("Email address is required.");
        }

        return value;
    }

    function normalizePassword(password) {
        const value = String(password || "");

        if (value.length < 12) {
            fail("Password must contain at least 12 characters.");
        }

        return value;
    }

    /*
     * A missing Auth session is a normal state on the invitation page.
     * In particular, after "Use a Different Email", signOut() intentionally
     * removes the current session before the UI refreshes to the signed-out
     * authentication form.
     *
     * Supabase may report this state as AuthSessionMissingError / an
     * "Auth session missing" message. That must map to a signed-out user,
     * not to an application failure.
     */
    function isExpectedMissingSessionError(error) {
        if (!error) {
            return false;
        }

        const name = String(error.name || "").toLowerCase();
        const code = String(error.code || "").toLowerCase();
        const message = String(error.message || "").toLowerCase();

        return (
            name === "authsessionmissingerror" ||
            code === "session_not_found" ||
            message.includes("auth session missing") ||
            message.includes("session missing") ||
            message.includes("no session")
        );
    }

    async function getUser() {
        const response = await getClient().auth.getUser();

        if (response.error) {
            if (isExpectedMissingSessionError(response.error)) {
                return null;
            }

            throw response.error;
        }

        return response.data && response.data.user
            ? response.data.user
            : null;
    }

    async function getSession() {
        const response = await getClient().auth.getSession();

        if (response.error) {
            if (isExpectedMissingSessionError(response.error)) {
                return null;
            }

            throw response.error;
        }

        return response.data && response.data.session
            ? response.data.session
            : null;
    }

    async function signIn(email, password) {
        const response = await getClient().auth.signInWithPassword({
            email: normalizeEmail(email),
            password: normalizePassword(password)
        });

        if (response.error) {
            throw response.error;
        }

        if (!response.data || !response.data.user) {
            fail("Authentication did not return a valid user.");
        }

        return response.data.user;
    }

    async function signUp(email, password, options = {}) {
        const normalizedEmail = normalizeEmail(email);
        const normalizedPassword = normalizePassword(password);

        const authOptions = {};

        if (options.redirectTo) {
            authOptions.emailRedirectTo = String(options.redirectTo);
        }

        const response = await getClient().auth.signUp({
            email: normalizedEmail,
            password: normalizedPassword,
            options: authOptions
        });

        if (response.error) {
            throw response.error;
        }

        if (!response.data || !response.data.user) {
            fail("Account creation did not return a valid user.");
        }

        return Object.freeze({
            user: response.data.user,
            session: response.data.session || null,
            requiresEmailConfirmation: !response.data.session
        });
    }

    async function signOut() {
        const response = await getClient().auth.signOut();

        if (response.error) {
            throw response.error;
        }

        return true;
    }

    window.AlbukhrInvitationAuth = Object.freeze({
        getUser,
        getSession,
        signIn,
        signUp,
        signOut
    });

    console.info("ALBUKHR Invitation Auth loaded.");
})(window);
