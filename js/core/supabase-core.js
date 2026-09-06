(function (window) {
    "use strict";

    /*
     * ALBUKHR ADMIN SUPABASE CORE
     *
     * MAINNET ONLY
     *
     * This core is intentionally idempotent because multiple
     * pages may load shared engines.
     */

    if (window.ALBUKHR_SUPABASE) {
        return;
    }

    const environment =
        window.ALBukhrEnvironment;

    if (
        !environment ||
        typeof environment.isKnown !== "function" ||
        typeof environment.isMainnet !== "function" ||
        typeof environment.getSupabaseUrl !== "function" ||
        !environment.isKnown() ||
        !environment.isMainnet()
    ) {

        console.error(
            "ALBUKHR Admin Supabase requires known MAINNET environment."
        );

        return;
    }

    if (
        !window.supabase ||
        typeof window.supabase.createClient !== "function"
    ) {

        console.error(
            "Supabase JS SDK is not loaded."
        );

        return;
    }

    const url =
        environment.getSupabaseUrl();

    const key =
        "sb_publishable_6pRDCPwk97eCz2Fpu1cadg__XIQlZX2";

    if (!url) {

        console.error(
            "ALBUKHR Mainnet Supabase URL is unavailable."
        );

        return;
    }

    let client;

    try {

        client =
            window.supabase.createClient(
                url,
                key
            );

    }

    catch (error) {

        console.error(
            "Failed to create Supabase client:",
            error
        );

        return;
    }

    function requireName(value, message) {

        const normalized =
            String(value || "").trim();

        if (!normalized) {
            throw new Error(message);
        }

        return normalized;

    }

    window.ALBUKHR_SUPABASE =
        Object.freeze({

            client,

            environment:
                "mainnet",

            network:
                "mainnet",

            project:
                "App Albukhr",

            url,

            isMainnet:
                function () {
                    return true;
                },

            isTestnet:
                function () {
                    return false;
                },

            isNetwork:
                function (network) {

                    return (
                        String(network || "")
                            .trim()
                            .toLowerCase()
                        ===
                        "mainnet"
                    );

                },

            from:
                function (table) {

                    return client.from(
                        requireName(
                            table,
                            "Supabase table name is required."
                        )
                    );

                },

            rpc:
                function (
                    functionName,
                    parameters = {}
                ) {

                    return client.rpc(
                        requireName(
                            functionName,
                            "Supabase RPC function name is required."
                        ),
                        parameters
                    );

                },

            getClient:
                function () {
                    return client;
                }

        });

    console.info(
        "ALBUKHR Supabase Core initialized: MAINNET"
    );

})(window);
