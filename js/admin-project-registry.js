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
    // SECURITY:
    //
    // Browser:
    //   - initializes authenticated admin session
    //   - verifies MFA / AAL2 flow
    //   - provides UI authorization guard
    //   - calls server-authoritative registry RPC
    //
    // Server:
    //   - validates authenticated identity
    //   - validates active admin authorization
    //   - returns authoritative Mainnet projects
    //
    // Source:
    //   public.projects
    //
    // Network:
    //   MAINNET ONLY
    // =====================================================


    const A = () =>
        window.AlbukhrSupabaseAdminAuth;


    const $ = (id) =>
        document.getElementById(
            id
        );


    // =====================================================
    // FRONTEND ROLE GUARD
    //
    // IMPORTANT:
    //
    // This is UI/UX only.
    //
    // Server-side RPC authorization remains authoritative.
    // =====================================================

    const allowedRoles = [

        "super_admin",

        "registry_admin",

        "core_admin"

    ];


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
    // HTML ESCAPE
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
    // FRONTEND AUTHORIZATION
    // =====================================================

    function authorized(
        admin
    ) {

        const roles =

            Array.isArray(
                admin?.roles
            )

                ? admin.roles

                : [];


        return allowedRoles.some(

            (role) =>

                roles.includes(
                    role
                )

        );

    }


    // =====================================================
    // PICK FIRST AVAILABLE FIELD
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

                object &&

                object[name] != null &&

                object[name] !== ""

            ) {

                return object[name];

            }

        }


        return fallback;

    }


    // =====================================================
    // PROJECT LOGO
    //
    // IMPORTANT:
    //
    // Project logos must never control card dimensions.
    //
    // The image is rendered inside a fixed
    // 44px × 44px container.
    //
    // If logo_url is unavailable or the image fails,
    // a controlled ALBUKHR placeholder is shown.
    // =====================================================

    function createProjectLogo(
        row,
        projectName
    ) {

        const logoUrl =

            pick(

                row,

                [

                    "logo_url",

                    "logoUrl"

                ],

                ""

            );


        // =============================================
        // LOGO WRAPPER
        // =============================================

        const wrapper =
            document.createElement(
                "div"
            );


        wrapper.className =
            "project-logo";


        // =============================================
        // VALID LOGO URL
        // =============================================

        if (

            logoUrl &&
            logoUrl !== "—"

        ) {

            const image =
                document.createElement(
                    "img"
                );


            image.src =
                String(
                    logoUrl
                );


            image.alt =

                String(
                    projectName ||
                    "Project"
                ) +

                " logo";


            image.loading =
                "lazy";


            image.decoding =
                "async";


            // =========================================
            // FALLBACK
            // =========================================

            image.addEventListener(

                "error",

                () => {

                    wrapper.innerHTML =
                        "";


                    const fallback =
                        document.createElement(
                            "span"
                        );


                    fallback.className =
                        "project-logo-fallback";


                    fallback.textContent =
                        "A";


                    fallback.setAttribute(

                        "aria-label",

                        "ALBUKHR project logo unavailable"

                    );


                    wrapper.appendChild(
                        fallback
                    );

                },

                {

                    once:
                        true

                }

            );


            wrapper.appendChild(
                image
            );


            return wrapper;

        }


        // =============================================
        // NO LOGO FALLBACK
        // =============================================

        const fallback =
            document.createElement(
                "span"
            );


        fallback.className =
            "project-logo-fallback";


        fallback.textContent =
            "A";


        fallback.setAttribute(

            "aria-label",

            "Project logo unavailable"

        );


        wrapper.appendChild(
            fallback
        );


        return wrapper;

    }


    // =====================================================
    // RENDER PROJECT REGISTRY
    // =====================================================

    function render(
        rows
    ) {

        const box =
            $("projects");


        if (!box) {

            return;

        }


        box.innerHTML =
            "";


        $("recordCount").textContent =
            rows.length;


        // =============================================
        // EMPTY
        // =============================================

        if (

            !rows.length

        ) {

            $("emptyState")
                ?.classList.remove(
                    "hidden"
                );


            return;

        }


        $("emptyState")
            ?.classList.add(
                "hidden"
            );


        // =============================================
        // PROJECTS
        // =============================================

        rows.forEach(

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
                // PROJECT TYPE
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
                // CARD
                // =====================================

                const card =
                    document.createElement(
                        "article"
                    );


                card.className =
                    "project";


                // =====================================
                // PROJECT HEAD
                // =====================================

                const head =
                    document.createElement(
                        "div"
                    );


                head.className =
                    "project-head";


                // =====================================
                // PROJECT IDENTITY
                // =====================================

                const identity =
                    document.createElement(
                        "div"
                    );


                identity.className =
                    "project-identity";


                // =====================================
                // LOGO
                // =====================================

                const projectLogo =
                    createProjectLogo(

                        row,

                        name

                    );


                // =====================================
                // TITLE
                // =====================================

                const titleGroup =
                    document.createElement(
                        "div"
                    );


                titleGroup.className =
                    "project-title-group";


                const indexElement =
                    document.createElement(
                        "span"
                    );


                indexElement.className =
                    "index";


                indexElement.textContent =
                    projectCode !== "—"

                        ? String(
                            projectCode
                        )

                        : "#" +

                        String(
                            index + 1
                        );


                const title =
                    document.createElement(
                        "h3"
                    );


                title.textContent =
                    String(
                        name
                    );


                titleGroup.appendChild(
                    indexElement
                );


                titleGroup.appendChild(
                    title
                );


                identity.appendChild(
                    projectLogo
                );


                identity.appendChild(
                    titleGroup
                );


                // =====================================
                // STATUS BADGE
                // =====================================

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


                // =====================================
                // DETAILS LIST
                // =====================================

                const details =
                    document.createElement(
                        "dl"
                    );


                // =====================================
                // TYPE
                // =====================================

                const typeRow =
                    document.createElement(
                        "div"
                    );


                const typeTitle =
                    document.createElement(
                        "dt"
                    );


                const typeValue =
                    document.createElement(
                        "dd"
                    );


                typeTitle.textContent =
                    "Project type";


                typeValue.textContent =
                    label(
                        projectType
                    );


                typeRow.appendChild(
                    typeTitle
                );


                typeRow.appendChild(
                    typeValue
                );


                // =====================================
                // NETWORK
                // =====================================

                const networkRow =
                    document.createElement(
                        "div"
                    );


                const networkTitle =
                    document.createElement(
                        "dt"
                    );


                const networkValue =
                    document.createElement(
                        "dd"
                    );


                networkTitle.textContent =
                    "Network";


                networkValue.textContent =
                    String(
                        network
                    )
                        .toUpperCase();


                networkRow.appendChild(
                    networkTitle
                );


                networkRow.appendChild(
                    networkValue
                );


                // =====================================
                // PROJECT ID
                // =====================================

                const idRow =
                    document.createElement(
                        "div"
                    );


                const idTitle =
                    document.createElement(
                        "dt"
                    );


                const idValue =
                    document.createElement(
                        "dd"
                    );


                idTitle.textContent =
                    "Project ID";


                idValue.textContent =
                    String(
                        id
                    );


                idRow.appendChild(
                    idTitle
                );


                idRow.appendChild(
                    idValue
                );


                details.appendChild(
                    typeRow
                );


                details.appendChild(
                    networkRow
                );


                details.appendChild(
                    idRow
                );


                // =====================================
                // ACTIONS
                // =====================================

                const actions =
                    document.createElement(
                        "div"
                    );


                actions.className =
                    "project-actions";


                const editLink =
                    document.createElement(
                        "a"
                    );


                editLink.className =
                    "edit-project";


                editLink.href =

                    "admin-project-edit.html?id=" +

                    encodeURIComponent(
                        id
                    );


                editLink.textContent =
                    "Edit Project";


                actions.appendChild(
                    editLink
                );


                // =====================================
                // RAW RECORD
                // =====================================

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


                // =====================================
                // BUILD CARD
                // =====================================

                card.appendChild(
                    head
                );


                card.appendChild(
                    details
                );


                card.appendChild(
                    actions
                );


                card.appendChild(
                    extra
                );


                box.appendChild(
                    card
                );

            }

        );

    }


    // =====================================================
    // LOAD PROJECT REGISTRY
    // =====================================================

    async function load() {

        const refreshButton =
            $("refreshButton");


        if (refreshButton) {

            refreshButton.disabled =
                true;

        }


        $("sourceState").textContent =
            "LOADING";


        try {

            // =============================================
            // SUPABASE
            // =============================================

            const client =
                window
                    .ALBUKHR_SUPABASE
                    ?.client;


            if (!client) {

                throw Error(

                    "ALBUKHR Supabase Core is unavailable."

                );

            }


            // =============================================
            // AUTHORITATIVE REGISTRY RPC
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
            // RESPONSE
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
            // Server remains authoritative.
            // =============================================

            if (

                payload.authorized !== true

            ) {

                $("authorization")
                    .textContent =
                    "DENIED";


                $("registryPanel")
                    ?.classList.add(
                        "hidden"
                    );


                $("deniedPanel")
                    ?.classList.remove(
                        "hidden"
                    );


                $("sourceState")
                    .textContent =

                    label(

                        payload.source ||

                        "albukhr_security"

                    );


                status(

                    payload.message ||

                    "Project Registry authorization was denied.",

                    true

                );


                return;

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

            $("sourceState")
                .textContent =

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

            $("registryDescription")
                .textContent =

                payload.message ||

                "Registry records returned by the Mainnet security RPC.";


            // =============================================
            // EMPTY MESSAGE
            // =============================================

            $("emptyText")
                .textContent =

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


            $("sourceState")
                .textContent =
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

            if (refreshButton) {

                refreshButton.disabled =
                    false;

            }

        }

    }


    // =====================================================
    // INITIALIZATION
    // =====================================================

    async function init() {

        try {

            // =============================================
            // AUTH ENGINE
            // =============================================

            if (!A()) {

                throw Error(

                    "Admin authentication engine unavailable."

                );

            }


            // =============================================
            // MAINNET ONLY
            // =============================================

            if (

                !window
                    .ALBukhrEnvironment
                    ?.isMainnet()

            ) {

                throw Error(

                    "Project Registry is available only on ALBUKHR MAINNET."

                );

            }


            // =============================================
            // INITIALIZE SESSION
            // =============================================

            await A().init();


            // =============================================
            // REQUIRE ADMIN
            // =============================================

            const admin =
                await A().requireAdmin({

                    redirect:
                        false

                });


            if (!admin) {

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

                admin.mfa_required &&

                !mfa?.verified

            ) {

                location.replace(

                    "admin-mfa.html"

                );

                return;

            }


            // =============================================
            // SECURITY STATUS
            // =============================================

            $("securityState")
                .textContent =

                "Authenticated • AAL2";


            // =============================================
            // FRONTEND UX AUTHORIZATION
            // =============================================

            if (

                !authorized(
                    admin
                )

            ) {

                $("authorization")
                    .textContent =
                    "DENIED";


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
            // FRONTEND AUTHORIZED
            // =============================================

            $("authorization")
                .textContent =
                "AUTHORIZED";


            $("registryPanel")
                ?.classList.remove(
                    "hidden"
                );


            // =============================================
            // LOAD AUTHORITATIVE REGISTRY
            // =============================================

            await load();

        }

        catch (error) {

            console.error(

                "[ALBUKHR PROJECT REGISTRY INIT]",

                error

            );


            status(

                "Admin authorization failed. Returning to secure login.",

                true

            );


            setTimeout(

                () => {

                    location.replace(

                        "admin-login.html"

                    );

                },

                700

            );

        }

    }


    // =====================================================
    // EVENTS
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

                        await A()
                            ?.signOut();

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
