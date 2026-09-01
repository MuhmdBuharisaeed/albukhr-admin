(function (window, document) {
    "use strict";


    const A = () =>
        window.AlbukhrSupabaseAdminAuth;


    const $ = (id) =>
        document.getElementById(id);


    let projectId = null;
    let loadedProject = null;
    let busy = false;
    let dirty = false;


    /* =====================================================
       STATUS
    ===================================================== */

    function msg(text, isError = false) {

        const element =
            $("pageStatus");


        element.textContent =
            text || "";


        element.className =
            "status" +
            (isError ? " error" : "");

    }


    /* =====================================================
       NORMALIZATION
    ===================================================== */

    function normalize(value) {

        return String(
            value ?? ""
        )
            .trim();

    }


    function normalizeNetwork(value) {

        return normalize(value)
            .toLowerCase();

    }


    function normalizeType(value) {

        return normalize(value)
            .toLowerCase();

    }


    /* =====================================================
       SLUG
    ===================================================== */

    function slugify(value) {

        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 160);

    }


    /* =====================================================
       PROJECT UUID
    ===================================================== */

    function getProjectId() {

        const id =
            new URLSearchParams(
                window.location.search
            ).get("id");


        if (!id) {

            return null;

        }


        const uuidPattern =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


        return uuidPattern.test(id)
            ? id
            : null;

    }


    /* =====================================================
       BUSY STATE
    ===================================================== */

    function setBusy(value) {

        busy =
            !!value;


        const button =
            $("saveButton");


        button.disabled =
            busy ||
            !loadedProject;


        button.textContent =
            busy
                ? "Saving..."
                : "Save Project Changes";

    }


    /* =====================================================
       DIRTY STATE
    ===================================================== */

    function markDirty() {

        dirty = true;

    }


    function resetDirty() {

        dirty = false;

    }


    /* =====================================================
       FORMAT SIZE
    ===================================================== */

    function formatBytes(bytes) {

        const value =
            Number(bytes);


        if (
            !Number.isFinite(value) ||
            value < 0
        ) {

            return "—";

        }


        if (value < 1024) {

            return value + " bytes";

        }


        const units = [
            "KB",
            "MB",
            "GB"
        ];


        let size =
            value / 1024;


        let index = 0;


        while (
            size >= 1024 &&
            index < units.length - 1
        ) {

            size =
                size / 1024;

            index++;

        }


        return (
            size.toFixed(
                size >= 10
                    ? 1
                    : 2
            )
            +
            " "
            +
            units[index]
        );

    }


    /* =====================================================
       PROJECT TYPE LABEL
    ===================================================== */

    function label(value) {

        return String(value ?? "")
            .replace(/_/g, " ")
            .replace(
                /\b\w/g,
                (character) =>
                    character.toUpperCase()
            );

    }


    /* =====================================================
       POPULATE PROJECT
    ===================================================== */

    function populate(project) {

        $("projectId").textContent =
            project.id || "—";


        $("network").textContent =
            normalizeNetwork(
                project.network
            ).toUpperCase()
            || "—";


        $("projectStatus").textContent =
            label(
                project.status
            )
            || "—";


        const projectType =
            normalizeType(
                project.project_type
            );


        $("projectType").value =
            label(projectType);


        $("protectedProjectType").textContent =
            label(projectType)
            || "—";


        $("coreSlot").textContent =
            project.core_slot == null
                ? "Not applicable"
                : String(
                    project.core_slot
                );


        $("projectCode").value =
            project.project_code || "";


        $("projectName").value =
            project.name || "";


        $("projectSlug").value =
            project.slug || "";


        $("description").value =
            project.description || "";


        populateLogo(project);

    }


    /* =====================================================
       LOGO INFORMATION
    ===================================================== */

    function populateLogo(project) {

        const image =
            $("projectLogoPreview");


        const noLogo =
            $("noProjectLogo");


        const logoUrl =
            normalize(
                project.logo_url
            );


        const logoPath =
            normalize(
                project.logo_path
            );


        $("logoPath").textContent =
            logoPath || "—";


        $("logoFormat").textContent =
            normalize(
                project.logo_format
            )
            || "—";


        const width =
            project.logo_width;


        const height =
            project.logo_height;


        $("logoDimensions").textContent =
            (
                width != null &&
                height != null
            )
                ? (
                    width +
                    " × " +
                    height
                )
                : "—";


        $("logoSize").textContent =
            formatBytes(
                project.logo_size_bytes
            );


        image.hidden = true;
        noLogo.hidden = false;
        image.removeAttribute("src");


        if (!logoUrl) {

            return;

        }


        image.src =
            logoUrl;


        image.hidden = false;
        noLogo.hidden = true;


        image.onerror =
            function () {

                image.hidden = true;

                image.removeAttribute(
                    "src"
                );

                noLogo.hidden = false;

            };

    }


    /* =====================================================
       VERIFY PROJECT RESPONSE
    ===================================================== */

    function verifyProjectResponse(
        response
    ) {

        if (
            !response ||
            typeof response !== "object"
        ) {

            throw Error(
                "The project server response is invalid."
            );

        }


        if (
            response.success !== true
        ) {

            throw Error(
                response.message ||
                "Project loading failed."
            );

        }


        if (
            response.authorized !== true
        ) {

            throw Error(
                response.message ||
                "Project authorization denied."
            );

        }


        if (
            normalizeNetwork(
                response.network
            ) !== "mainnet"
        ) {

            throw Error(
                "Project response failed Mainnet verification."
            );

        }


        const project =
            response.project;


        if (
            !project ||
            typeof project !== "object"
        ) {

            throw Error(
                "The authorized project response is missing."
            );

        }


        if (
            !project.id
        ) {

            throw Error(
                "The authorized project identity is missing."
            );

        }


        if (
            String(project.id) !==
            String(projectId)
        ) {

            throw Error(
                "Project identity verification failed."
            );

        }


        if (
            normalizeNetwork(
                project.network
            ) !== "mainnet"
        ) {

            throw Error(
                "Project network verification failed."
            );

        }


        const type =
            normalizeType(
                project.project_type
            );


        if (
            ![
                "core",
                "internal",
                "external"
            ].includes(type)
        ) {

            throw Error(
                "Project scope verification failed."
            );

        }


        return project;

    }


    /* =====================================================
       LOAD PROJECT
    ===================================================== */

    async function loadProject() {

        const client =
            window.ALBUKHR_SUPABASE
                ?.client;


        if (!client) {

            throw Error(
                "ALBUKHR Supabase Core is unavailable."
            );

        }


        setBusy(true);


        msg(
            "Loading authorized Mainnet project..."
        );


        const {
            data,
            error
        } =
            await client
                .schema(
                    "albukhr_security"
                )
                .rpc(
                    "get_project_for_edit",
                    {
                        p_project_id:
                            projectId
                    }
                );


        if (error) {

            throw error;

        }


        const response =
            Array.isArray(data)
                ? (data[0] || {})
                : (data || {});


        const project =
            verifyProjectResponse(
                response
            );


        loadedProject =
            project;


        populate(project);


        resetDirty();


        setBusy(false);


        msg(
            "Authorized Mainnet project loaded. Review editable fields before saving."
        );

    }


    /* =====================================================
       FORM VALIDATION
    ===================================================== */

    function readForm() {

        const code =
            normalize(
                $("projectCode").value
            );


        const name =
            normalize(
                $("projectName").value
            );


        const slug =
            normalize(
                $("projectSlug").value
            );


        const description =
            normalize(
                $("description").value
            );


        if (!code) {

            throw Error(
                "Project code is required."
            );

        }


        if (
            code.length > 64
        ) {

            throw Error(
                "Project code is too long."
            );

        }


        if (
            !/^[A-Z0-9][A-Z0-9_-]*$/i
                .test(code)
        ) {

            throw Error(
                "Project code contains invalid characters."
            );

        }


        if (!name) {

            throw Error(
                "Project name is required."
            );

        }


        if (
            name.length > 160
        ) {

            throw Error(
                "Project name is too long."
            );

        }


        if (!slug) {

            throw Error(
                "Project slug is required."
            );

        }


        if (
            slug.length > 160
        ) {

            throw Error(
                "Project slug is too long."
            );

        }


        if (
            !/^[a-z0-9][a-z0-9-]*$/
                .test(slug)
        ) {

            throw Error(
                "Slug must contain only lowercase letters, numbers and hyphens."
            );

        }


        if (
            description.length > 5000
        ) {

            throw Error(
                "Description is too long."
            );

        }


        /* =============================================
           ONLY EDITABLE FIELDS ARE SENT

           Never sent:
           - network
           - project_type
           - core_slot
           - status
           - logo metadata
        ============================================== */

        return {

            p_project_id:
                projectId,

            p_project_code:
                code.toUpperCase(),

            p_slug:
                slug.toLowerCase(),

            p_name:
                name,

            p_description:
                description || null

        };

    }


    /* =====================================================
       VERIFY UPDATE RESPONSE
    ===================================================== */

    function verifyUpdateResponse(
        response
    ) {

        if (
            !response ||
            typeof response !== "object"
        ) {

            throw Error(
                "Project update server response is invalid."
            );

        }


        if (
            response.success !== true
        ) {

            throw Error(
                response.message ||
                "Project update was denied."
            );

        }


        if (
            response.authorized !== true
        ) {

            throw Error(
                response.message ||
                "Project update authorization denied."
            );

        }


        if (
            !response.project_id ||
            String(
                response.project_id
            )
            !==
            String(projectId)
        ) {

            throw Error(
                "Project update identity verification failed."
            );

        }


        if (
            normalizeNetwork(
                response.network
            ) !== "mainnet"
        ) {

            throw Error(
                "Project update network verification failed."
            );

        }

    }


    /* =====================================================
       SAVE PROJECT
    ===================================================== */

    async function save() {

        if (
            busy ||
            !loadedProject
        ) {

            return;

        }


        if (
            String(
                loadedProject.id
            )
            !==
            String(projectId)
        ) {

            msg(
                "Loaded project identity verification failed.",
                true
            );

            return;

        }


        if (
            normalizeNetwork(
                loadedProject.network
            )
            !== "mainnet"
        ) {

            msg(
                "Only Mainnet projects can be updated here.",
                true
            );

            return;

        }


        let payload;


        try {

            payload =
                readForm();

        }

        catch (error) {

            msg(
                String(
                    error?.message ||
                    error
                ),
                true
            );

            return;

        }


        if (
            String(
                payload.p_project_id
            )
            !==
            String(projectId)
        ) {

            msg(
                "Project update identity verification failed.",
                true
            );

            return;

        }


        if (
            String(
                payload.p_project_id
            )
            !==
            String(
                loadedProject.id
            )
        ) {

            msg(
                "Project identity changed unexpectedly.",
                true
            );

            return;

        }


        setBusy(true);


        msg(
            "Saving authorized Mainnet project changes..."
        );


        try {

            const client =
                window.ALBUKHR_SUPABASE
                    ?.client;


            if (!client) {

                throw Error(
                    "ALBUKHR Supabase Core is unavailable."
                );

            }


            const {
                data,
                error
            } =
                await client
                    .schema(
                        "albukhr_security"
                    )
                    .rpc(
                        "update_project",
                        payload
                    );


            if (error) {

                throw error;

            }


            const response =
                Array.isArray(data)
                    ? (data[0] || {})
                    : (data || {});


            verifyUpdateResponse(
                response
            );


            resetDirty();


            msg(
                "Authorized Mainnet project updated successfully."
            );


            setTimeout(
                () => {

                    window.location.replace(
                        "admin-project-registry.html"
                    );

                },
                700
            );

        }

        catch (error) {

            console.error(
                "[ALBUKHR PROJECT EDIT]",
                error
            );


            msg(
                String(
                    error?.message ||
                    error
                ),
                true
            );


            setBusy(false);

        }

    }


    /* =====================================================
       AUTO SLUG
    ===================================================== */

    $("projectName")
        .addEventListener(
            "input",
            function () {

                if (
                    !$("projectSlug")
                        .dataset
                        .edited
                ) {

                    $("projectSlug").value =
                        slugify(
                            $("projectName").value
                        );

                }


                markDirty();

            }
        );


    $("projectCode")
        .addEventListener(
            "input",
            markDirty
        );


    $("description")
        .addEventListener(
            "input",
            markDirty
        );


    $("projectSlug")
        .addEventListener(
            "input",
            function () {

                $("projectSlug")
                    .dataset
                    .edited =
                    "1";


                $("projectSlug").value =
                    slugify(
                        $("projectSlug").value
                    );


                markDirty();

            }
        );


    /* =====================================================
       FORM SUBMIT
    ===================================================== */

    $("projectForm")
        .addEventListener(
            "submit",
            function (event) {

                event.preventDefault();

                save();

            }
        );


    /* =====================================================
       PAGE EXIT WARNING
    ===================================================== */

    window.addEventListener(
        "beforeunload",
        function (event) {

            if (
                !dirty ||
                busy
            ) {

                return;

            }


            event.preventDefault();

            event.returnValue = "";

        }
    );


    /* =====================================================
       LOGOUT
    ===================================================== */

    $("logoutButton")
        .addEventListener(
            "click",
            async function () {

                try {

                    await A()
                        ?.signOut();

                }

                finally {

                    window.location.replace(
                        "admin-login.html"
                    );

                }

            }
        );


    /* =====================================================
       INITIALIZATION
    ===================================================== */

    (async function () {

        try {

            /* =============================================
               AUTH ENGINE
            ============================================== */

            if (!A()) {

                throw Error(
                    "ALBUKHR Admin Authentication Engine is unavailable."
                );

            }


            /* =============================================
               MAINNET ONLY
            ============================================== */

            if (
                !window.ALBukhrEnvironment
                    ?.isMainnet()
            ) {

                throw Error(
                    "Project editing is available only on ALBUKHR MAINNET."
                );

            }


            /* =============================================
               VALID PROJECT UUID
            ============================================== */

            projectId =
                getProjectId();


            if (!projectId) {

                throw Error(
                    "A valid project ID is required."
                );

            }


            /* =============================================
               INITIALIZE ADMIN AUTH
            ============================================== */

            await A().init();


            const admin =
                await A().requireAdmin({
                    redirect:false
                });


            if (!admin) {

                window.location.replace(
                    "admin-login.html"
                );

                return;

            }


            /* =============================================
               MFA
            ============================================== */

            const mfa =
                await A().ensureMfa();


            if (
                admin.mfa_required &&
                !mfa.verified
            ) {

                window.location.replace(

                    "admin-mfa.html?redirect=" +

                    encodeURIComponent(

                        window.location.pathname +

                        window.location.search

                    )

                );

                return;

            }


            /* =============================================
               SECURITY STATUS
            ============================================== */

            $("securityState")
                .textContent =
                "Authenticated • AAL2";


            /* =============================================
               LOAD AUTHORIZED PROJECT
            ============================================== */

            await loadProject();

        }

        catch (error) {

            console.error(
                "[ALBUKHR PROJECT EDIT INIT]",
                error
            );


            msg(
                "Project edit could not be initialized: " +

                String(
                    error?.message ||
                    error
                ),
                true
            );


            $("saveButton")
                .disabled =
                true;

        }

    })();


})(window, document);
