(function (window, document) {
    "use strict";

    const A = () => window.AlbukhrSupabaseAdminAuth;
    const $ = (id) => document.getElementById(id);

    let projectId = null;
    let loaded = null;
    let busy = false;


    // =====================================================
    // UI STATUS
    // =====================================================

    function msg(text, isError) {

        const el = $("pageStatus");

        el.textContent = text || "";

        el.className =
            "status" +
            (isError ? " error" : "");

    }


    // =====================================================
    // BUSY STATE
    // =====================================================

    function setBusy(value) {

        busy = !!value;

        const button =
            $("saveButton");

        button.disabled =
            busy || !loaded;

        button.textContent =
            busy
                ? "Saving..."
                : "Save Project Changes";

    }


    // =====================================================
    // SLUG GENERATOR
    // =====================================================

    function slugify(value) {

        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 160);

    }


    // =====================================================
    // PROJECT UUID
    // =====================================================

    function getProjectId() {

        const id =
            new URLSearchParams(
                location.search
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


    // =====================================================
    // CORE PROJECT UI
    // =====================================================

    function setCore() {

        const isCore =
            $("projectType").value ===
            "core";


        $("coreSlotWrap")
            .classList.toggle(
                "hidden",
                !isCore
            );


        if (!isCore) {

            $("coreSlot").value =
                "";

        }

    }


    // =====================================================
    // POPULATE PROJECT
    // =====================================================

    function populate(project) {

        $("projectId").textContent =
            project.id || "—";


        $("network").textContent =
            String(
                project.network || "—"
            ).toUpperCase();


        $("projectStatus").textContent =
            String(
                project.status || "—"
            );


        $("projectCode").value =
            project.project_code || "";


        $("projectName").value =
            project.name || "";


        $("projectSlug").value =
            project.slug || "";


        $("projectType").value =
            project.project_type || "";


        $("coreSlot").value =
            project.core_slot == null
                ? ""
                : String(
                    project.core_slot
                );


        $("description").value =
            project.description || "";


        setCore();

    }


    // =====================================================
    // LOAD SPECIFIC PROJECT
    //
    // SECURITY:
    //
    // Browser sends only the requested UUID.
    //
    // Server:
    //   - validates auth.uid()
    //   - requires AAL2
    //   - validates active admin
    //   - validates project scope
    //   - forces Mainnet
    //
    // No registry-wide project download.
    // =====================================================

    async function loadProject() {

        const client =
            window.ALBUKHR_SUPABASE?.client;


        if (!client) {

            throw Error(
                "ALBUKHR Supabase Core is unavailable."
            );

        }


        msg(
            "Loading authorized Mainnet project..."
        );


        const {
            data,
            error
        } =
            await client
                .schema("albukhr_security")
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
            data || {};


        // =================================================
        // SERVER SUCCESS
        // =================================================

        if (
            response.success !== true
        ) {

            throw Error(

                response.message ||

                "Project loading authorization denied."

            );

        }


        // =================================================
        // SERVER AUTHORIZATION
        // =================================================

        if (
            response.authorized !== true
        ) {

            throw Error(

                response.message ||

                "Project edit authorization denied."

            );

        }


        // =================================================
        // RESPONSE NETWORK
        // =================================================

        if (

            String(
                response.network || ""
            )
                .trim()
                .toLowerCase()

            !==

            "mainnet"

        ) {

            throw Error(

                "Project edit is available only on ALBUKHR MAINNET."

            );

        }


        // =================================================
        // PROJECT OBJECT
        // =================================================

        const project =
            response.project;


        if (
            !project ||
            !project.id
        ) {

            throw Error(

                "The authorized project response is invalid."

            );

        }


        // =================================================
        // PROJECT IDENTITY VERIFICATION
        //
        // The returned project MUST be exactly
        // the project requested.
        // =================================================

        if (

            String(project.id)

            !==

            String(projectId)

        ) {

            throw Error(

                "Project identity verification failed."

            );

        }


        // =================================================
        // PROJECT NETWORK VERIFICATION
        //
        // Defense in depth.
        // =================================================

        if (

            String(
                project.network || ""
            )
                .trim()
                .toLowerCase()

            !==

            "mainnet"

        ) {

            throw Error(

                "Project network verification failed."

            );

        }


        // =================================================
        // PROJECT TYPE VERIFICATION
        // =================================================

        const projectType =
            String(
                project.project_type || ""
            )
                .trim()
                .toLowerCase();


        if (

            ![
                "core",
                "internal",
                "external"
            ].includes(projectType)

        ) {

            throw Error(

                "Project type verification failed."

            );

        }


        // =================================================
        // STORE AUTHORIZED PROJECT
        // =================================================

        loaded = project;

populate(project);

setBusy(false);

msg(
    "Authorized Mainnet project loaded. Review the changes before saving."
);

    }


    // =====================================================
    // READ AND VALIDATE FORM
    // =====================================================

    function readForm() {

        const code =
            $("projectCode")
                .value
                .trim();


        const name =
            $("projectName")
                .value
                .trim();


        const slug =
            $("projectSlug")
                .value
                .trim();


        const type =
            $("projectType")
                .value;


        const description =
            $("description")
                .value
                .trim();


        const slot =
            $("coreSlot")
                .value;


        // =================================================
        // PROJECT CODE
        // =================================================

        if (!code) {

            throw Error(
                "Project code is required."
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


        // =================================================
        // PROJECT NAME
        // =================================================

        if (!name) {

            throw Error(
                "Project name is required."
            );

        }


        // =================================================
        // SLUG
        // =================================================

        if (

            !/^[a-z0-9][a-z0-9-]*$/
                .test(slug)

        ) {

            throw Error(

                "Slug must contain only lowercase letters, numbers and hyphens."

            );

        }


        // =================================================
        // PROJECT TYPE
        // =================================================

        if (!type) {

            throw Error(
                "Select a project type."
            );

        }


        if (

            ![
                "core",
                "internal",
                "external"
            ].includes(type)

        ) {

            throw Error(
                "Invalid project type."
            );

        }


        // =================================================
        // CORE SLOT
        // =================================================

        if (
            type === "core"
        ) {

            if (!slot) {

                throw Error(

                    "Core projects require a core slot from 1 to 7."

                );

            }


            const number =
                Number(slot);


            if (

                !Number.isInteger(number) ||

                number < 1 ||

                number > 7

            ) {

                throw Error(

                    "Core slot must be between 1 and 7."

                );

            }

        }

        else if (slot) {

            throw Error(

                "Only core projects may have a core slot."

            );

        }


        // =================================================
        // SECURE RPC PAYLOAD
        //
        // Network is NOT supplied.
        // Logo fields are NOT supplied.
        // =================================================

        return {

            p_project_id:
                projectId,

            p_project_code:
                code.toUpperCase(),

            p_slug:
                slug.toLowerCase(),

            p_name:
                name,

            p_project_type:
                type,

            p_description:
                description || null,

            p_core_slot:
                slot
                    ? Number(slot)
                    : null

        };

    }


    // =====================================================
    // SAVE PROJECT
    // =====================================================

    async function save() {

        if (
            busy ||
            !loaded
        ) {

            return;

        }


        setBusy(true);


        msg(
            "Saving authorized project changes..."
        );


        try {

            const client =
                window.ALBUKHR_SUPABASE?.client;


            if (!client) {

                throw Error(

                    "ALBUKHR Supabase Core is unavailable."

                );

            }


            const payload =
                readForm();


            // =============================================
            // DEFENSE IN DEPTH
            //
            // Ensure project identity has not changed.
            // =============================================

            if (

                String(
                    payload.p_project_id
                )

                !==

                String(
                    loaded.id
                )

            ) {

                throw Error(

                    "Project identity changed unexpectedly."

                );

            }


            // =============================================
            // SERVER-AUTHORIZED UPDATE
            // =============================================

            const {
                data,
                error
            } =
                await client
                    .schema("albukhr_security")
                    .rpc(
                        "update_project",
                        payload
                    );


            if (error) {

                throw error;

            }


            const response =
                data || {};


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


            // =============================================
            // RESPONSE ID VERIFICATION
            // =============================================

            if (

                String(
                    response.project_id
                )

                !==

                String(
                    projectId
                )

            ) {

                throw Error(

                    "Project update identity verification failed."

                );

            }


            // =============================================
            // RESPONSE NETWORK VERIFICATION
            // =============================================

            if (

                String(
                    response.network || ""
                )
                    .trim()
                    .toLowerCase()

                !==

                "mainnet"

            ) {

                throw Error(

                    "Project update network verification failed."

                );

            }


            msg(
                "Project updated successfully."
            );


            // =============================================
            // RETURN TO REGISTRY
            // =============================================

            setTimeout(
                () => {

                    location.replace(
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


    // =====================================================
    // PROJECT TYPE CHANGE
    // =====================================================

    $("projectType")
        .addEventListener(
            "change",
            setCore
        );


    // =====================================================
    // AUTO SLUG
    // =====================================================

    $("projectName")
        .addEventListener(
            "input",
            () => {

                if (

                    !$("projectSlug")
                        .dataset
                        .edited

                ) {

                    $("projectSlug").value =
                        slugify(

                            $("projectName")
                                .value

                        );

                }

            }
        );


    $("projectSlug")
        .addEventListener(
            "input",
            () => {

                $("projectSlug")
                    .dataset
                    .edited =
                    "1";


                $("projectSlug").value =
                    slugify(

                        $("projectSlug")
                            .value

                    );

            }
        );


    // =====================================================
    // FORM SUBMIT
    // =====================================================

    $("projectForm")
        .addEventListener(
            "submit",
            (event) => {

                event.preventDefault();

                save();

            }
        );


    // =====================================================
    // LOGOUT
    // =====================================================

    $("logoutButton")
        .addEventListener(
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


    // =====================================================
    // INITIALIZATION
    // =====================================================

    (async () => {

        try {

            // =============================================
            // AUTH ENGINE
            // =============================================

            if (!A()) {

                throw Error(

                    "ALBUKHR Admin Authentication Engine is unavailable."

                );

            }


            // =============================================
            // MAINNET ONLY
            // =============================================

            if (

                !window.ALBukhrEnvironment?.isMainnet()

            ) {

                throw Error(

                    "Project editing is available only on ALBUKHR MAINNET."

                );

            }


            // =============================================
            // PROJECT UUID
            // =============================================

            projectId =
                getProjectId();


            if (!projectId) {

                throw Error(

                    "A valid project ID is required."

                );

            }


            // =============================================
            // INITIALIZE ADMIN SESSION
            // =============================================

            await A().init();


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

                !mfa.verified

            ) {

                location.replace(

                    "admin-mfa.html?redirect=" +

                    encodeURIComponent(

                        location.pathname +

                        location.search

                    )

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
            // DIRECT SECURE LOAD
            // =============================================

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


            $("saveButton").disabled =
                true;

        }

    })();


})(window, document);
