(function (
    window,
    document
) {

    "use strict";


    // =====================================================
    // ALBUKHR PROJECT REGISTRY ENGINE
    //
    // MAINNET ADMIN PROJECT REGISTRY
    //
    // SECURITY MODEL:
    //
    // Browser:
    //
    //   - initializes authenticated admin session
    //   - verifies AAL2 / MFA state
    //   - provides UI/UX role guard
    //   - requests registry through security RPC
    //   - renders only server-authoritative records
    //
    // Server:
    //
    //   - validates auth.uid()
    //   - validates AAL2
    //   - validates active admin
    //   - validates registry authorization
    //   - forces Mainnet registry source
    //   - reads authoritative public.projects records
    //
    // Browser authorization is NOT authoritative.
    //
    // get_project_registry()
    // remains the server security boundary.
    // =====================================================


    // =====================================================
    // HELPERS
    // =====================================================

    const A = () =>
        window.AlbukhrSupabaseAdminAuth;


    const $ = (
        id
    ) =>
        document.getElementById(
            id
        );


    // =====================================================
    // STATE
    // =====================================================

    let admin = null;

    let loading = false;


    // =====================================================
    // PROJECT REGISTRY ROLES
    //
    // IMPORTANT:
    //
    // This is a frontend UI/UX guard only.
    //
    // Server-side authorization inside:
    //
    // albukhr_security.get_project_registry()
    //
    // remains authoritative.
    // =====================================================

    const REGISTRY_ROLES = [

        "super_admin",

        "registry_admin",

        "core_admin"

    ];


    // =====================================================
    // STATUS
    // =====================================================

    function status(
        text,
        error = false
    ) {

        const element =
            $("pageStatus");


        if (!element) {

            return;

        }


        element.textContent =
            text || "";


        element.className =
            "status" +
            (
                error
                    ? " error"
                    : ""
            );

    }


    // =====================================================
    // SECURITY STATE
    // =====================================================

    function setSecurityState(
        text
    ) {

        const element =
            $("securityState");


        if (!element) {

            return;

        }


        element.textContent =
            text || "";

    }


    // =====================================================
    // AUTHORIZATION STATE
    // =====================================================

    function setAuthorization(
        value
    ) {

        const element =
            $("authorization");


        if (!element) {

            return;

        }


        element.textContent =
            value || "CHECKING";

    }


    // =====================================================
    // SOURCE STATE
    // =====================================================

    function setSourceState(
        value
    ) {

        const element =
            $("sourceState");


        if (!element) {

            return;

        }


        element.textContent =
            value || "CHECKING";

    }


    // =====================================================
    // RECORD COUNT
    // =====================================================

    function setRecordCount(
        value
    ) {

        const element =
            $("recordCount");


        if (!element) {

            return;

        }


        element.textContent =
            String(
                Number.isFinite(
                    Number(value)
                )

                    ? Number(value)

                    : 0
            );

    }


    // =====================================================
    // LABEL
    // =====================================================

    function label(
        value
    ) {

        return String(
            value ?? ""
        )

            .replace(
                /_/g,
                " "
            )

            .replace(

                /\b\w/g,

                (character) =>

                    character.toUpperCase()

            );

    }


    // =====================================================
    // ESCAPE HTML
    //
    // Prevents server-returned text from being
    // interpreted as HTML during rendering.
    // =====================================================

    function esc(
        value
    ) {

        const element =
            document.createElement(
                "div"
            );


        element.textContent =
            String(
                value ?? ""
            );


        return element.innerHTML;

    }


    // =====================================================
    // PICK RECORD VALUE
    // =====================================================

    function pick(
        object,
        names,
        fallback = "—"
    ) {

        for (

            const name

            of names

        ) {

            if (

                object

                &&

                object[name] != null

                &&

                object[name] !== ""

            ) {

                return object[name];

            }

        }


        return fallback;

    }


    // =====================================================
    // MAINNET CHECK
    // =====================================================

    function requireMainnet() {

        if (

            !window
                .ALBukhrEnvironment
                ?.isMainnet()

        ) {

            throw Error(

                "Project Registry is available only on ALBUKHR MAINNET."

            );

        }

    }


    // =====================================================
    // SUPABASE CLIENT
    // =====================================================

    function getClient() {

        const client =
            window
                .ALBUKHR_SUPABASE
                ?.client;


        if (!client) {

            throw Error(

                "ALBUKHR Supabase Core is unavailable."

            );

        }


        return client;

    }


    // =====================================================
    // FRONTEND ROLE CHECK
    //
    // UI/UX ONLY
    // =====================================================

    function hasRegistryRole(
        currentAdmin
    ) {

        if (

            !currentAdmin

        ) {

            return false;

        }


        const roles =

            Array.isArray(
                currentAdmin.roles
            )

                ? currentAdmin.roles

                : [];


        return REGISTRY_ROLES.some(

            (role) =>

                roles.includes(
                    role
                )

        );

    }


    // =====================================================
    // CREATE PROJECT ACCESS
    //
    // Project creation currently belongs to:
    //
    //   - super_admin
    //   - registry_admin
    //
    // This is only a UI guard.
    //
    // create_project()
    // remains authoritative.
    // =====================================================

    function canCreateProject(
        currentAdmin
    ) {

        if (

            !currentAdmin

        ) {

            return false;

        }


        const roles =

            Array.isArray(
                currentAdmin.roles
            )

                ? currentAdmin.roles

                : [];


        return [

            "super_admin",

            "registry_admin"

        ].some(

            (role) =>

                roles.includes(
                    role
                )

        );

    }


    // =====================================================
    // CREATE BUTTON
    // =====================================================

    function updateCreateButton() {

        const button =
            $("createProjectButton");


        if (!button) {

            return;

        }


        const allowed =
            canCreateProject(
                admin
            );


        if (!allowed) {

            button.classList.add(
                "hidden"
            );

            return;

        }


        button.classList.remove(
            "hidden"
        );

    }


    // =====================================================
    // LOADING STATE
    // =====================================================

    function setLoading(
        value
    ) {

        loading =
            !!value;


        const button =
            $("refreshButton");


        if (!button) {

            return;

        }


        button.disabled =
            loading;


        button.textContent =

            loading

                ? "Refreshing..."

                : "Refresh";

    }


    // =====================================================
    // EMPTY STATE
    // =====================================================

    function showEmpty(
        message
    ) {

        const empty =
            $("emptyState");


        const projects =
            $("projects");


        if (projects) {

            projects.innerHTML =
                "";

        }


        if (empty) {

            empty.classList.remove(
                "hidden"
            );

        }


        const text =
            $("emptyText");


        if (text) {

            text.textContent =

                message ||

                "The registry RPC returned no project records.";

        }

    }


    // =====================================================
    // HIDE EMPTY STATE
    // =====================================================

    function hideEmpty() {

        $("emptyState")
            ?.classList.add(

                "hidden"

            );

    }


    // =====================================================
    // HIDE REGISTRY
    // =====================================================

    function hideRegistry() {

        $("registryPanel")
            ?.classList.add(

                "hidden"

            );

    }


    // =====================================================
    // SHOW REGISTRY
    // =====================================================

    function showRegistry() {

        $("registryPanel")
            ?.classList.remove(

                "hidden"

            );

    }


    // =====================================================
    // SHOW DENIED
    // =====================================================

    function showDenied() {

        $("deniedPanel")
            ?.classList.remove(

                "hidden"

            );

    }


    // =====================================================
    // HIDE DENIED
    // =====================================================

    function hideDenied() {

        $("deniedPanel")
            ?.classList.add(

                "hidden"

            );

    }


    // =====================================================
    // RENDER PROJECTS
    // =====================================================

    function render(
        rows
    ) {

        const projects =
            $("projects");


        if (!projects) {

            return;

        }


        const records =

            Array.isArray(
                rows
            )

                ? rows

                : [];


        projects.innerHTML =
            "";


        setRecordCount(
            records.length
        );


        // =============================================
        // EMPTY
        // =============================================

        if (

            records.length === 0

        ) {

            showEmpty(

                "No Mainnet projects are currently registered."

            );

            return;

        }


        hideEmpty();


        // =============================================
        // PROJECTS
        // =============================================

        records.forEach(

            (
                row,
                index
            ) => {

                // =====================================
                // ID
                // =====================================

                const id =
                    pick(

                        row,

                        [
                            "id",
                            "project_id",
                            "uuid"
                        ],

                        String(
                            index + 1
                        )

                    );


                // =====================================
                // PROJECT CODE
                // =====================================

                const projectCode =
                    pick(

                        row,

                        [
                            "project_code",
                            "code"
                        ],

                        "—"

                    );


                // =====================================
                // NAME
                // =====================================

                const name =
                    pick(

                        row,

                        [
                            "name",
                            "project_name",
                            "title"
                        ],

                        "Unnamed project"

                    );


                // =====================================
                // STATUS
                // =====================================

                const statusValue =
                    pick(

                        row,

                        [
                            "status",
                            "state"
                        ],

                        "—"

                    );


                // =====================================
                // TYPE
                // =====================================

                const projectType =
                    pick(

                        row,

                        [
                            "project_type",
                            "category",
                            "type"
                        ],

                        "—"

                    );


                // =====================================
                // SLUG
                // =====================================

                const projectSlug =
                    pick(

                        row,

                        [
                            "slug"
                        ],

                        "—"

                    );


                // =====================================
                // NETWORK
                // =====================================

                const network =
                    pick(

                        row,

                        [
                            "network"
                        ],

                        "mainnet"

                    );


                // =====================================
                // LOGO
                // =====================================

                const logoUrl =
                    pick(

                        row,

                        [
                            "logo_url"
                        ],

                        ""

                    );


                // =====================================
                // CARD
                // =====================================

                const card =
                    document.createElement(
                        "article"
                    );


                card.className =
                    "project";


                // =====================================
                // PROJECT CARD
                // =====================================

                card.innerHTML =

                    '<div class="project-head">' +

                        '<div>' +

                            '<span class="index">' +

                                esc(
                                    projectCode
                                ) +

                            '</span>' +


                            '<h3>' +

                                esc(
                                    name
                                ) +

                            '</h3>' +

                        '</div>' +


                        '<em>' +

                            esc(
                                label(
                                    statusValue
                                )
                            ) +

                        '</em>' +

                    '</div>' +



                    // =================================
                    // LOGO
                    // =================================

                    (

                        logoUrl

                            ?

                            '<div class="project-logo">' +

                                '<img ' +

                                    'src="' +

                                        esc(
                                            logoUrl
                                        ) +

                                    '" ' +

                                    'alt="' +

                                        esc(
                                            name
                                        ) +

                                    ' logo" ' +

                                    'loading="lazy">' +

                            '</div>'

                            :

                            ''

                    ) +



                    // =================================
                    // PROJECT DETAILS
                    // =================================

                    '<dl>' +


                        '<div>' +

                            '<dt>Project type</dt>' +

                            '<dd>' +

                                esc(
                                    label(
                                        projectType
                                    )
                                ) +

                            '</dd>' +

                        '</div>' +



                        '<div>' +

                            '<dt>Slug</dt>' +

                            '<dd>' +

                                esc(
                                    projectSlug
                                ) +

                            '</dd>' +

                        '</div>' +



                        '<div>' +

                            '<dt>Network</dt>' +

                            '<dd>' +

                                esc(
                                    String(
                                        network
                                    ).toUpperCase()
                                ) +

                            '</dd>' +

                        '</div>' +



                        '<div>' +

                            '<dt>Project ID</dt>' +

                            '<dd>' +

                                esc(
                                    id
                                ) +

                            '</dd>' +

                        '</div>' +


                    '</dl>' +



                    // =================================
                    // ACTIONS
                    // =================================

                    '<div class="project-actions">' +


                        '<a ' +

                            'class="edit-project" ' +

                            'href="admin-project-edit.html?id=' +

                                encodeURIComponent(
                                    id
                                ) +

                            '">' +


                            'Edit Project' +


                        '</a>' +


                    '</div>';


                // =====================================
                // RAW AUTHORITATIVE RECORD
                // =====================================

                const details =
                    document.createElement(
                        "details"
                    );


                const summary =
                    document.createElement(
                        "summary"
                    );


                summary.textContent =
                    "View registry record";


                const pre =
                    document.createElement(
                        "pre"
                    );


                pre.textContent =
                    JSON.stringify(

                        row,

                        null,

                        2

                    );


                details.appendChild(
                    summary
                );


                details.appendChild(
                    pre
                );


                card.appendChild(
                    details
                );


                projects.appendChild(
                    card
                );

            }

        );

    }


    // =====================================================
    // NORMALIZE RPC RESPONSE
    // =====================================================

    function normalizePayload(
        data
    ) {

        if (

            Array.isArray(
                data
            )

        ) {

            return data[0] || {};

        }


        if (

            data

            &&

            typeof data === "object"

        ) {

            return data;

        }


        return {};

    }


    // =====================================================
    // LOAD PROJECT REGISTRY
    // =====================================================

    async function load() {

        if (loading) {

            return;

        }


        setLoading(
            true
        );


        setSourceState(
            "LOADING"
        );


        status(

            "Synchronizing Project Registry with the Mainnet security layer..."

        );


        try {

            // =============================================
            // MAINNET DEFENSE
            // =============================================

            requireMainnet();


            // =============================================
            // CLIENT
            // =============================================

            const client =
                getClient();


            // =============================================
            // RPC
            // =============================================

            const {

                data,
                error

            } =
                await client

                    .schema(
                        "albukhr_security"
                    )

                    .rpc(
                        "get_project_registry"
                    );


            if (error) {

                throw error;

            }


            // =============================================
            // NORMALIZE RESPONSE
            // =============================================

            const payload =
                normalizePayload(
                    data
                );


            // =============================================
            // SERVER SUCCESS CHECK
            //
            // Compatible with the hardened RPC.
            //
            // Older server versions without
            // "success" remain supported.
            // =============================================

            if (

                Object.prototype.hasOwnProperty.call(

                    payload,

                    "success"

                )

                &&

                payload.success !== true

            ) {

                throw Error(

                    payload.message ||

                    "Project Registry request failed."

                );

            }


            // =============================================
            // SERVER AUTHORIZATION
            //
            // IMPORTANT:
            //
            // Never interpret authorization denial
            // as an empty registry.
            // =============================================

            if (

                payload.authorized !== true

            ) {

                throw Error(

                    payload.message ||

                    "Project Registry authorization denied."

                );

            }


            // =============================================
            // NETWORK VERIFICATION
            // =============================================

            if (

                payload.network != null

                &&

                String(
                    payload.network
                )

                    .trim()

                    .toLowerCase()

                !==

                "mainnet"

            ) {

                throw Error(

                    "Project Registry network verification failed."

                );

            }


            // =============================================
            // RECORDS
            // =============================================

            const rows =

                Array.isArray(
                    payload.records
                )

                    ? payload.records

                    : [];


            // =============================================
            // SOURCE
            // =============================================

            setSourceState(

                payload.source ===
                "public.projects"

                    ? "public.projects"

                    : label(
                        payload.source ||
                        "RPC"
                    )

            );


            // =============================================
            // DESCRIPTION
            // =============================================

            const description =
                $("registryDescription");


            if (description) {

                description.textContent =

                    payload.message ||

                    "Registry records returned by the Mainnet security RPC.";

            }


            // =============================================
            // EMPTY MESSAGE
            // =============================================

            const emptyText =
                $("emptyText");


            if (emptyText) {

                emptyText.textContent =

                    payload.message ||

                    "The registry RPC returned no project records.";

            }


            // =============================================
            // FINAL MAINNET CHECK
            // =============================================

            requireMainnet();


            // =============================================
            // RENDER
            // =============================================

            render(
                rows
            );


            // =============================================
            // SUCCESS
            // =============================================

            status(

                "Project Registry synchronized with the Mainnet security layer."

            );

        }

        catch (error) {

            console.error(

                "[ALBUKHR PROJECT REGISTRY]",

                error

            );


            // =============================================
            // ERROR STATE
            // =============================================

            setSourceState(
                "ERROR"
            );


            setRecordCount(
                0
            );


            $("projects").innerHTML =
                "";


            hideEmpty();


            status(

                "Project Registry could not be loaded: " +

                String(
                    error?.message ||
                    error
                ),

                true

            );

        }

        finally {

            setLoading(
                false
            );

        }

    }


    // =====================================================
    // LOGOUT
    // =====================================================

    async function signOut() {

        try {

            await A()
                ?.signOut();

        }

        finally {

            location.replace(

                "admin-login.html"

            );

        }

    }


    // =====================================================
    // BIND EVENTS
    // =====================================================

    function bind() {

        // =============================================
        // REFRESH
        // =============================================

        $("refreshButton")
            ?.addEventListener(

                "click",

                () => {

                    load();

                }

            );


        // =============================================
        // LOGOUT
        // =============================================

        $("logoutButton")
            ?.addEventListener(

                "click",

                signOut

            );

    }


    // =====================================================
    // INITIALIZATION
    // =====================================================

    async function init() {

        try {

            // =============================================
            // MAINNET
            // =============================================

            requireMainnet();


            // =============================================
            // ADMIN AUTH ENGINE
            // =============================================

            if (!A()) {

                throw Error(

                    "Admin authentication engine unavailable."

                );

            }


            // =============================================
            // INITIALIZE AUTH
            // =============================================

            await A()
                .init();


            // =============================================
            // REQUIRE ADMIN
            // =============================================

            admin =
                await A()
                    .requireAdmin({

                        redirect:
                            false

                    });


            // =============================================
            // NO ADMIN
            // =============================================

            if (!admin) {

                location.replace(

                    "admin-login.html"

                );

                return;

            }


            // =============================================
            // MFA / AAL2
            // =============================================

            const mfa =
                await A()
                    .ensureMfa();


            // =============================================
            // AAL2 REQUIRED
            // =============================================

            if (

                !mfa

                ||

                mfa.verified !== true

            ) {

                location.replace(

                    "admin-mfa.html"

                );

                return;

            }


            // =============================================
            // SECURITY STATE
            // =============================================

            setSecurityState(

                "Authenticated • AAL2"

            );


            // =============================================
            // FRONTEND ROLE GUARD
            //
            // Server remains authoritative.
            // =============================================

            if (

                !hasRegistryRole(
                    admin
                )

            ) {

                setAuthorization(
                    "DENIED"
                );


                setSourceState(
                    "DENIED"
                );


                setRecordCount(
                    0
                );


                hideRegistry();


                showDenied();


                status(

                    "Authenticated, but Project Registry authorization was denied.",

                    true

                );


                return;

            }


            // =============================================
            // FRONTEND AUTHORIZED
            // =============================================

            setAuthorization(
                "AUTHORIZED"
            );


            hideDenied();


            showRegistry();


            updateCreateButton();


            // =============================================
            // LOAD REGISTRY
            // =============================================

            await load();

        }

        catch (error) {

            console.error(

                "[ALBUKHR PROJECT REGISTRY INIT]",

                error

            );


            setSecurityState(
                "SECURITY ERROR"
            );


            setAuthorization(
                "ERROR"
            );


            setSourceState(
                "ERROR"
            );


            status(

                String(
                    error?.message ||
                    error
                ),

                true

            );


            hideRegistry();


            setTimeout(

                () => {

                    location.replace(

                        "admin-login.html"

                    );

                },

                900

            );

        }

    }


    // =====================================================
    // START
    // =====================================================

    bind();


    init();


})(
    window,
    document
);
