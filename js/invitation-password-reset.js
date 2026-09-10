(function (window, document) {
    "use strict";

    const $ = (id) => document.getElementById(id);
    let invitationId = "";
    let isUpdating = false;

    function assertMainnet() {
        const e = window.ALBukhrEnvironment;
        if (!e || typeof e.isKnown !== "function" ||
            typeof e.isMainnet !== "function" ||
            !e.isKnown() || !e.isMainnet()) {
            throw new Error("Password recovery is available only on ALBUKHR MAINNET.");
        }
    }

    function auth() {
        if (!window.AlbukhrInvitationAuth) {
            throw new Error("ALBUKHR Invitation Auth is unavailable.");
        }
        return window.AlbukhrInvitationAuth;
    }

    function status(message, error) {
        const el = $("pageStatus");
        if (!el) return;
        el.textContent = message || "";
        el.className = error ? "status error" : "status";
    }

    function show(id) {
        const el = $(id);
        if (el) el.classList.remove("hidden");
    }

    function hide(id) {
        const el = $(id);
        if (el) el.classList.add("hidden");
    }

    function busy(id, value, busyText, normalText) {
        const el = $(id);
        if (!el) return;
        el.disabled = Boolean(value);
        el.textContent = value ? busyText : normalText;
    }

    function getInvitationId() {
        const value = String(
            new URLSearchParams(window.location.search || "")
                .get("invitation_id") || ""
        ).trim();

        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
            ? value
            : "";
    }

    function invitationUrl() {
        return invitationId
            ? "project-invitation.html?invitation_id=" +
              encodeURIComponent(invitationId)
            : "project-invitation.html";
    }

    function invalid(message) {
        hide("loadingState");
        hide("resetState");
        show("invalidState");
        const el = $("invalidMessage");
        if (el) el.textContent = message;
    }

    async function initialize() {
        try {
            assertMainnet();
            invitationId = getInvitationId();

            if (!invitationId) {
                invalid("Invitation context is missing from the recovery link.");
                return;
            }

            const session = await auth().getSession();

            if (!session || !session.user) {
                invalid("The password recovery session is missing or expired. Request a new reset email.");
                return;
            }

            hide("loadingState");
            show("resetState");

            const form = $("passwordResetForm");
            if (form) {
                form.addEventListener("submit", async function (event) {
                    event.preventDefault();
                    if (isUpdating) return;

                    try {
                        const password = String($("newPassword")?.value || "");
                        const confirm = String($("confirmPassword")?.value || "");

                        if (password.length < 12) {
                            throw new Error("Password must contain at least 12 characters.");
                        }

                        if (password !== confirm) {
                            throw new Error("The new passwords do not match.");
                        }

                        isUpdating = true;
                        busy("resetButton", true, "Updating password...", "Update Password");
                        status("Updating the account password securely...", false);

                        await auth().updatePassword(password);

                        $("newPassword").value = "";
                        $("confirmPassword").value = "";

                        status("Password updated successfully. Returning to your invitation...", false);

                        window.setTimeout(function () {
                            window.location.replace(invitationUrl());
                        }, 700);
                    } catch (error) {
                        console.error("[ALBUKHR PASSWORD RESET]", error);
                        status(
                            error && error.message
                                ? error.message
                                : "Password update failed.",
                            true
                        );
                    } finally {
                        isUpdating = false;
                        busy("resetButton", false, "Updating password...", "Update Password");
                    }
                });
            }

            const returnButton = $("returnButton");
            if (returnButton) {
                returnButton.addEventListener("click", function () {
                    window.location.replace(invitationUrl());
                });
            }
        } catch (error) {
            console.error("[ALBUKHR PASSWORD RESET]", error);
            invalid(
                error && error.message
                    ? error.message
                    : "Password recovery initialization failed."
            );
        }
    }

    initialize();
})(window, document);
