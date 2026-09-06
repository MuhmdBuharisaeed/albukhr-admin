(function (window) {
    "use strict";

    /*
     * ALBUKHR ADMIN ENVIRONMENT CORE
     *
     * Canonical Admin authority:
     * https://admin.albukhr.com
     *
     * IMPORTANT:
     * www.admin.albukhr.com is NOT an approved ALBUKHR
     * Admin host.
     *
     * This file is the compatibility path currently loaded
     * by existing Admin HTML pages.
     */

    if (window.ALBukhrEnvironment) {
        return;
    }

    const host =
        String(
            window.location.hostname || ""
        ).toLowerCase();

    const known =
        host ===
        "admin.albukhr.com";

    const config =
        Object.freeze({

            key:
                "mainnet",

            name:
                "App Albukhr",

            network:
                "mainnet",

            appUrl:
                "https://app.albukhr.com",

            adminUrl:
                "https://admin.albukhr.com",

            testnetUrl:
                "https://test.albukhr.com",

            supabaseUrl:
                "https://ribpntyqdleytsyktdfb.supabase.co"

        });

    window.ALBukhrEnvironment =
        Object.freeze({

            isKnown:
                function () {
                    return known;
                },

            isMainnet:
                function () {
                    return known;
                },

            isTestnet:
                function () {
                    return false;
                },

            getKey:
                function () {
                    return config.key;
                },

            getName:
                function () {
                    return config.name;
                },

            getNetwork:
                function () {
                    return config.network;
                },

            getAppUrl:
                function () {
                    return config.appUrl;
                },

            getAdminUrl:
                function () {
                    return config.adminUrl;
                },

            getTestnetUrl:
                function () {
                    return config.testnetUrl;
                },

            getSupabaseUrl:
                function () {
                    return config.supabaseUrl;
                }

        });

    console.info(
        known
            ? "ALBUKHR Admin Environment: MAINNET"
            : "ALBUKHR Admin Environment: unknown host."
    );

})(window);
