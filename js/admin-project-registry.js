(function (
    window,
    document
) {

    "use strict";


    // =====================================================
    // ALBUKHR PROJECT REGISTRY
    //
    // MAINNET ADMIN PROJECT REGISTRY
    //
    // SECURITY MODEL:
    //
    // Browser:
    //   - initializes authenticated admin session
    //   - verifies AAL2 through the admin auth engine
    //   - provides UI/UX authorization boundaries
    //   - calls the authoritative registry RPC
    //
    // Server:
    //   - validates auth.uid()
    //   - validates active admin identity
    //   - validates registry authorization
    //   - returns Mainnet projects only
    //
    // The server remains authoritative.
    // =====================================================


    // =====================================================
    // HELPERS
    // =====================================================

    const A = () =>
        window.AlbukhrSupabaseAdminAuth;


    const $ = (id) =>
        document.getElementById(
            id
        );


    // =====================================================
    // ROLE POLICY
    //
    // Registry access:
    //
    //   - super_admin
    //   - registry_admin
    //   - core_admin
    //
    // Project creation:
    //
    //   - super_admin
    //   - registry_admin
    //
    // Server-side RPC authorization remains authoritative.
    // =====================================================

    const REGISTRY_ROLES = [

        "super_admin",

        "registry_admin",

        "core_admin"

    ];


    const CREATION_ROLES = [

        "super_admin",

        "registry_admin"

    ];


    // =====================================================
    // CURRENT STATE
    // =====================================================

    let currentAdmin = null;


    let loading = false;


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
    // ESCAPE HTML
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
    // PICK VALUE
    // =====================================================

    function pick(
        object,
        names,
        fallback = "—"
    ) {

        for (
            const name of names
        ) {

            if (

                object

                &&

                object[name] != null

                &&

                object[name] !== ""

            ) {

                return object[
                    name
                ];

            }

        }


        return fallback;

    }


    // =====================================================
    // GET CLIENT
    // =====================================================

    function getClient() {

        const client =
            window.ALBUKHR_SUPABASE?.client;


        if (!client) {

            throw Error(

                "ALBUKHR Supabase Core is unavailable."

            );

        }


        return client;

    }


    // =====================================================
    // MAINNET CHECK
    // =====================================================

    function requireMainnet() {

        if (

            !window.ALBukhrEnvironment
                ?.isMainnet()

        ) {

            throw Error(

                "Project Registry is available only on ALBUKHR MAINNET."

            );

        }

    }


    // =====================================================
    // NORMALIZE ROLES
    // =====================================================

    function getRoles(
        admin
    ) {

        if (

            !Array.isArray(
                admin?.roles
            )

        ) {

            return [];

        }


        return admin.roles
            .map(

                (role) =>

                    String(
                        role || ""
                    )
                        .trim()
                        .toLowerCase()

            )

            .filter(
                Boolean
            );

    }


    // =====================================================
    // HAS ROLE
    // =====================================================

    function hasAnyRole(
        admin,
        allowedRoles
    ) {

        const roles =
            getRoles(
                admin
            );


        return allowedRoles.some(

            (role) =>

                roles.includes(
                    role
                )

        );

    }


    // =====================================================
    // REGISTRY ACCESS
    // =====================================================

    function hasRegistryAccess(
        admin
    ) {

        return hasAnyRole(

            admin,

            REGISTRY_ROLES

        );

    }


    // =====================================================
    // PROJECT CREATION ACCESS
    // =====================================================

    function hasCreationAccess(
        admin
    ) {

        return hasAnyRole(

            admin,

            CREATION_ROLES

        );

    }


    // =====================================================
    // PROJECT INITIALS
    //
    // Used when:
    //
    //   - project has no logo
    //   - logo URL is unavailable
    //   - image fails to load
    // =====================================================

    function projectInitials(
        name
    ) {

        const words =
            String(
                name || ""
            )

                .trim()

                .split(
                    /\s+/
                )

                .filter(
                    Boolean
                );


        if (!words.length) {

            return "P";

        }


        return words

            .slice(
                0,
                2
            )

            .map(

                (word) =>

                    word.charAt(
                        0
                    )

                    .toUpperCase()

            )

            .join("");

    }


    // =====================================================
    // VALID LOGO URL
    //
    // Only HTTP/HTTPS URLs are accepted for rendering.
    // =====================================================

    function getLogoUrl(
        row
    ) {

        const value =
            pick(

                row,

                [

                    "logo_url",

                    "logoUrl"

                ],

                ""

            );


        if (

            !value

            ||

            value === "—"

        ) {

            return "";

        }


        try {

            const url =
                new URL(
                    String(value)
                );


            if (

                url.protocol !== "https:"

                &&

                url.protocol !== "http:"

            ) {

                return "";

            }


            return url.href;

        }

        catch {

            return "";

        }

    }


    // =====================================================
    // CREATE LOGO ELEMENT
    //
    // IMPORTANT:
    //
    // The image is explicitly constrained by:
    //
    //   .project-logo-image
    //
    // Therefore original logo dimensions can never
    // expand the project card.
    // =====================================================

    function createProjectLogo(
        row,
        name
    ) {

        const logo =
            document.createElement(
                "div"
            );


        logo.className =
            "project-logo";


        const logoUrl =
            getLogoUrl(
                row
            );


        const initials =
            projectInitials(
                name
            );


        // =============================================
        // NO LOGO
        // =============================================

        if (!logoUrl) {

            logo.classList.add(
                "project-logo-fallback"
            );


            logo.textContent =
                initials;


            logo.setAttribute(

                "aria-label",

                "Project logo unavailable"

            );


            return logo;

        }


        // =============================================
        // IMAGE
        // =============================================

        const image =
            document.createElement(
                "img"
            );


        image.className =
            "project-logo-image";


        image.src =
            logoUrl;


        image.alt =
            `${name} logo`;


        image.loading =
            "lazy";


        image.decoding =
            "async";


        // =============================================
        // IMAGE ERROR FALLBACK
        // =============================================

        image.addEventListener(

            "error",

            () => {

                logo.innerHTML =
                    "";


                logo.classList.add(
                    "project-logo-fallback"
                );


                logo.textContent =
                    initials;


                logo.setAttribute(

                    "aria-label",

                    "Project logo unavailable"

                );

            },

            {
                once: true
            }

        );


        logo.appendChild(
            image
        );


        return logo;

    }


    // =====================================================
    // CREATE PROJECT CARD
    // =====================================================

    function createProjectCard(
        row,
        index
    ) {

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


        const projectCode =
            pick(

                row,

                [

                    "project_code",

                    "code"

                ],

                "—"

            );


        const slug =
            pick(

                row,

                [

                    "slug"

                ],

                "—"

            );


        const statusValue =
            pick(

                row,

                [

                    "status",

                    "state"

                ],

                "—"

            );


        const projectType =
            pick(

                row,

                [

                    "project_type",

                    "type",

                    "category"

                ],

                "—"

            );


        const network =
            pick(

                row,

                [

                    "network"

                ],

                "mainnet"

            );


        const description =
            pick(

                row,

                [

                    "description"

                ],

                ""

            );


        const card =
            document.createElement(
                "article"
            );


        card.className =
            "project";


        // =============================================
        // PROJECT HEADER
        // =============================================

        const head =
            document.createElement(
                "div"
            );


        head.className =
            "project-head";


        // =============================================
        // PROJECT IDENTITY
        // =============================================

        const identity =
            document.createElement(
                "div"
            );


        identity.className =
            "project-identity";


        // =============================================
        // LOGO
        // =============================================

        const logo =
            createProjectLogo(

                row,

                name

            );


        // =============================================
        // TITLE AREA
        // =============================================

        const titleArea =
            document.createElement(
                "div"
            );


        titleArea.className =
            "project-title";


        const code =
            document.createElement(
                "span"
            );


        code.className =
            "project-code";


        code.textContent =
            projectCode;


        const title =
            document.createElement(
                "h3"
            );


        title.textContent =
            name;


        const meta =
            document.createElement(
                "span"
            );


        meta.className =
            "project-type";


        meta.textContent =

            `${label(projectType)} • ${label(network)}`;


        titleArea.appendChild(
            code
        );


        titleArea.appendChild(
            title
        );


        titleArea.appendChild(
            meta
        );


        identity.appendChild(
            logo
        );


        identity.appendChild(
            titleArea
        );


        // =============================================
        // STATUS
        // =============================================

        const statusBadge =
            document.createElement(
                "em"
            );


        statusBadge.textContent =
            label(
                statusValue
            );


        head.appendChild(
            identity
        );


        head.appendChild(
            statusBadge
        );


        card.appendChild(
            head
        );


        // =============================================
        // DESCRIPTION
        // =============================================

        if (

            description

            &&

            description !== "—"

        ) {

            const descriptionElement =
                document.createElement(
                    "p"
                );


            descriptionElement.className =
                "project-description";


            descriptionElement.textContent =
                description;


            card.appendChild(
                descriptionElement
            );

        }


        // =============================================
        // DETAILS
        // =============================================

        const list =
            document.createElement(
                "dl"
            );


        const details = [

            [

                "Project type",

                label(
                    projectType
                )

            ],

            [

                "Slug",

                slug

            ],

            [

                "Project ID",

                id

            ]

        ];


        details.forEach(

            ([term, value]) => {

                const rowElement =
                    document.createElement(
                        "div"
                    );


                const dt =
                    document.createElement(
                        "dt"
                    );


                const dd =
                    document.createElement(
                        "dd"
                    );


                dt.textContent =
                    term;


                dd.textContent =
                    value;


                rowElement.appendChild(
                    dt
                );


                rowElement.appendChild(
                    dd
                );


                list.appendChild(
                    rowElement
                );

            }

        );


        card.appendChild(
            list
        );


        // =============================================
        // ACTIONS
        // =============================================

        const actions =
            document.createElement(
                "div"
            );


        actions.className =
            "project-actions";


        const edit =
            document.createElement(
                "a"
            );


        edit.className =
            "edit-project";


        edit.href =

            "admin-project-edit.html?id=" +

            encodeURIComponent(
                id
            );


        edit.textContent =
            "Edit Project";


        actions.appendChild(
            edit
        );


        card.appendChild(
            actions
        );


        // =============================================
        // RAW RECORD
        //
        // Useful for administrative inspection.
        // =================================================

        const extra =
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


        extra.appendChild(
            summary
        );


        extra.appendChild(
            pre
        );


        card.appendChild(
            extra
        );


        return card;

    }


    // =====================================================
    // RENDER PROJECTS
    // =====================================================

    function render(
        rows
    ) {

        const box =
            $("projects");


        const emptyState =
            $("emptyState");


        if (!box) {

            return;

        }


        box.innerHTML =
            "";


        const safeRows =
            Array.isArray(
                rows
            )

                ? rows

                : [];


        $("recordCount").textContent =
            safeRows.length;


        // =============================================
        // EMPTY
        // =============================================

        if (

            !safeRows.length

        ) {

            emptyState?.classList.remove(
                "hidden"
            );


            return;

        }


        emptyState?.classList.add(
            "hidden"
        );


        // =============================================
        // PROJECTS
        // =============================================

        safeRows.forEach(

            (
                row,
                index
            ) => {

                const card =
                    createProjectCard(

                        row,

                        index

                    );


                box.appendChild(
                    card
                );

            }

        );

    }


    // =====================================================
    // BUSY STATE
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
    // LOAD PROJECT REGISTRY
    // =====================================================

    async function load() {

        if (loading) {

            return;

        }


        setLoading(
            true
        );


        $("sourceState").textContent =
            "LOADING";


        try {

            // =============================================
            // MAINNET
            // =============================================

            requireMainnet();


            // =============================================
            // CLIENT
            // =============================================

            const client =
                getClient();


            // =============================================
            // AUTHORITATIVE RPC
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
            // JSONB RESPONSE
            // =============================================

            const payload =

                Array.isArray(
                    data
                )

                    ? (

                        data[0] || {}

                    )

                    : (

                        data || {}

                    );


            // =============================================
            // SERVER AUTHORIZATION
            //
            // Never trust frontend role checks alone.
            // =============================================

            if (

                payload.authorized !== true

            ) {

                $("authorization").textContent =
                    "DENIED";


                $("sourceState").textContent =
                    label(

                        payload.source ||

                        "ALBUKHR Security"

                    );


                $("recordCount").textContent =
                    "0";


                $("registryPanel")
                    ?.classList.add(
                        "hidden"
                    );


                $("deniedPanel")
                    ?.classList.remove(
                        "hidden"
                    );


                status(

                    payload.message ||

                    "Project Registry authorization denied.",

                    true

                );


                return;

            }


            // =============================================
            // MAINNET RESPONSE VERIFICATION
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

            $("sourceState").textContent =

                payload.source ===
                "public.projects"

                    ? "public.projects"

                    : label(

                        payload.source ||

                        "RPC"

                    );


            // =============================================
            // DESCRIPTION
            // =============================================

            $("registryDescription").textContent =

                payload.message ||

                "Registry records returned by the Mainnet security RPC.";


            // =============================================
            // EMPTY TEXT
            // =============================================

            $("emptyText").textContent =

                payload.message ||

                "The registry RPC returned no project records.";


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


            $("sourceState").textContent =
                "ERROR";


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
    // INITIALIZATION
    // =====================================================

    async function init() {

        try {

            // =============================================
            // ADMIN AUTH ENGINE
            // =============================================

            if (!A()) {

                throw Error(

                    "Admin authentication engine unavailable."

                );

            }


            // =============================================
            // MAINNET ONLY
            // =============================================

            requireMainnet();


            // =============================================
            // INITIALIZE AUTH
            // =============================================

            await A().init();


            // =============================================
            // REQUIRE ADMIN
            // =============================================

            currentAdmin =
                await A().requireAdmin({

                    redirect:
                        false

                });


            if (!currentAdmin) {

                location.replace(

                    "admin-login.html"

                );

                return;

            }


            // =============================================
            // MFA
            // =============================================

            const mfa =
                await A().ensureMfa();


            if (

                !mfa?.verified

            ) {

                location.replace(

                    "admin-mfa.html"

                );

                return;

            }


            // =============================================
            // SECURITY STATE
            // =============================================

            $("securityState").textContent =

                "Authenticated • AAL2";


            // =============================================
            // FRONTEND REGISTRY GUARD
            //
            // UI/UX only.
            //
            // get_project_registry RPC remains authoritative.
            // =============================================

            const allowed =
                hasRegistryAccess(

                    currentAdmin

                );


            $("authorization").textContent =

                allowed

                    ? "AUTHORIZED"

                    : "DENIED";


            if (!allowed) {

                $("deniedPanel")
                    ?.classList.remove(
                        "hidden"
                    );


                status(

                    "Authenticated, but Project Registry authorization was denied.",

                    true

                );


                return;

            }


            // =============================================
            // SHOW REGISTRY
            // =============================================

            $("registryPanel")
                ?.classList.remove(
                    "hidden"
                );


            // =============================================
            // CREATE BUTTON
            //
            // Only UI visibility.
            //
            // create_project RPC remains authoritative.
            // =============================================

            if (

                hasCreationAccess(
                    currentAdmin
                )

            ) {

                $("createProjectButton")
                    ?.classList.remove(
                        "hidden"
                    );

            }


            // =============================================
            // LOAD
            // =============================================

            await load();

        }

        catch (error) {

            console.error(

                "[ALBUKHR PROJECT REGISTRY INIT]",

                error

            );


            status(

                String(
                    error?.message ||
                    error
                ),

                true

            );


            $("authorization").textContent =
                "ERROR";


            $("sourceState").textContent =
                "ERROR";


            $("refreshButton").disabled =
                true;

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

                load

            );


        // =============================================
        // LOGOUT
        // =============================================

        $("logoutButton")
            ?.addEventListener(

                "click",

                async () => {

                    try {

                        await A()?.signOut();

                    }

                    finally {

                        location.replace(

                            "admin-login.html"

                        );

                    }

                }

            );

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
