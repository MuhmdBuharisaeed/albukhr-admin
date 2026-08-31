(function (window, document) {
    "use strict";


    // =====================================================
    // ALBUKHR PROJECT CREATE ENGINE
    //
    // MAINNET ADMIN PROJECT CREATION
    //
    // SECURITY MODEL:
    //
    // Browser:
    //   - validates UI input
    //   - validates logo locally
    //   - uploads validated logo
    //   - calls security RPCs
    //
    // Server:
    //   - validates auth.uid()
    //   - requires AAL2
    //   - validates active admin
    //   - validates creation authorization
    //   - forces Mainnet
    //   - creates authoritative project identity
    //   - authorizes logo attachment
    //
    // The browser never controls:
    //   - authenticated identity
    //   - network
    //   - server authorization
    // =====================================================


    const A = () =>
        window.AlbukhrSupabaseAdminAuth;


    const $ = (id) =>
        document.getElementById(id);


    // =====================================================
    // STATE
    // =====================================================

    let admin = null;

    let logo = null;

    let busy = false;

    let createdProjectId = null;


    // =====================================================
    // FRONTEND ROLE GUARD
    //
    // IMPORTANT:
    //
    // This is ONLY a UI/UX guard.
    //
    // Server-side create_project authorization
    // remains authoritative.
    // =====================================================

    const CREATION_ROLES = [

        "super_admin",

        "registry_admin"

    ];


    // =====================================================
    // UI STATUS
    // =====================================================

    function msg(
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
    // LOGO STATUS
    // =====================================================

    function lmsg(
        text,
        error = false
    ) {

        const element =
            $("logoStatus");


        if (!element) {

            return;

        }


        element.textContent =
            text || "";


        element.className =
            "inline-status" +
            (
                error
                    ? " error"
                    : ""
            );

    }


    // =====================================================
    // MAINNET CHECK
    // =====================================================

    function requireMainnet() {

        if (

            !window.ALBukhrEnvironment?.isMainnet()

        ) {

            throw Error(

                "Project creation is available only on ALBUKHR MAINNET."

            );

        }

    }


    // =====================================================
    // SUPABASE CLIENT
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
    // SLUG GENERATOR
    // =====================================================

    function slug(value) {

        return String(
            value || ""
        )
            .trim()
            .toLowerCase()
            .replace(
                /[^a-z0-9]+/g,
                "-"
            )
            .replace(
                /^-+|-+$/g,
                ""
            )
            .slice(
                0,
                160
            );

    }


    // =====================================================
    // BUSY STATE
    // =====================================================

    function setBusy(value) {

        busy =
            !!value;


        const button =
            $("createButton");


        if (!button) {

            return;

        }


        button.disabled =
            busy;


        button.textContent =
            busy

                ? "Creating..."

                : "Create Mainnet Project";

    }


    // =====================================================
    // CORE SLOT VISIBILITY
    // =====================================================

    function setCoreSlotVisibility() {

        const projectType =
            String(
                $("projectType")?.value || ""
            )
                .trim()
                .toLowerCase();


        const isCore =
            projectType ===
            "core";


        $("coreSlotWrap")
            ?.classList.toggle(

                "hidden",

                !isCore

            );


        if (!isCore) {

            $("coreSlot").value =
                "";

        }

    }


    // =====================================================
    // VALIDATE PROJECT FORM
    // =====================================================

    async function validateForm() {

        const validator =
            window.AlbukhrProjectLogoValidator;


        if (

            !validator?.validate

        ) {

            throw Error(

                "Logo validation engine unavailable."

            );

        }


        // =============================================
        // PROJECT CODE
        // =============================================

        const code =
            $("projectCode")
                .value
                .trim();


        // =============================================
        // PROJECT NAME
        // =============================================

        const name =
            $("projectName")
                .value
                .trim();


        // =============================================
        // PROJECT SLUG
        // =============================================

        const projectSlug =
            $("projectSlug")
                .value
                .trim();


        // =============================================
        // PROJECT TYPE
        // =============================================

        const type =
            String(
                $("projectType")
                    .value || ""
            )
                .trim()
                .toLowerCase();


        // =============================================
        // CORE SLOT
        // =============================================

        const slotValue =
            $("coreSlot")
                .value;


        // =============================================
        // DESCRIPTION
        // =============================================

        const description =
            $("description")
                .value
                .trim();


        // =============================================
        // PROJECT CODE REQUIRED
        // =============================================

        if (!code) {

            throw Error(

                "Project code is required."

            );

        }


        // =============================================
        // PROJECT CODE FORMAT
        // =============================================

        if (

            !/^[A-Z0-9][A-Z0-9_-]*$/i
                .test(code)

        ) {

            throw Error(

                "Project code contains invalid characters."

            );

        }


        // =============================================
        // PROJECT NAME REQUIRED
        // =============================================

        if (!name) {

            throw Error(

                "Project name is required."

            );

        }


        // =============================================
        // SLUG REQUIRED
        // =============================================

        if (!projectSlug) {

            throw Error(

                "Slug is required."

            );

        }


        // =============================================
        // SLUG FORMAT
        // =============================================

        if (

            !/^[a-z0-9][a-z0-9-]*$/i
                .test(projectSlug)

        ) {

            throw Error(

                "Slug must contain only lowercase letters, numbers and hyphens."

            );

        }


        // =============================================
        // PROJECT TYPE REQUIRED
        // =============================================

        if (!type) {

            throw Error(

                "Select a project type."

            );

        }


        // =============================================
        // PROJECT TYPE VALIDATION
        // =============================================

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


        // =============================================
        // CORE SLOT
        // =============================================

        let coreSlot =
            null;


        if (

            type === "core"

        ) {

            if (

                !slotValue

            ) {

                throw Error(

                    "Core projects require a core slot from 1 to 7."

                );

            }


            coreSlot =
                Number(
                    slotValue
                );


            if (

                !Number.isInteger(
                    coreSlot
                )

                ||

                coreSlot < 1

                ||

                coreSlot > 7

            ) {

                throw Error(

                    "Core slot must be between 1 and 7."

                );

            }

        }

        else {

            if (

                slotValue

            ) {

                throw Error(

                    "Only Core projects may have a core slot."

                );

            }


            coreSlot =
                null;

        }


        // =============================================
        // LOGO REQUIRED
        // =============================================

        if (!logo) {

            throw Error(

                "A project logo is required."

            );

        }


        // =============================================
        // AUTHORITATIVE LOCAL LOGO VALIDATION
        //
        // Validation is repeated here so that the
        // creation flow never trusts only the earlier
        // file-change event.
        // =============================================

        const validatedLogo =
            await validator.validate(
                logo
            );


        if (

            !validatedLogo?.file

        ) {

            throw Error(

                "Validated project logo is unavailable."

            );

        }


        // =============================================
        // RETURN NORMALIZED PAYLOAD
        // =============================================

        return {

            code:
                code.toUpperCase(),

            name,

            slug:
                projectSlug.toLowerCase(),

            type,

            slot:
                coreSlot,

            description:
                description || null,

            logo:
                validatedLogo

        };

    }


    // =====================================================
    // UPLOAD PROJECT LOGO
    //
    // Storage identity:
    //
    // projects/{project_id}/logo
    //
    // The project ID comes ONLY from the
    // server-authorized create_project response.
    // =====================================================

    async function uploadLogo(
        projectId,
        metadata
    ) {

        const client =
            getClient();


        if (!projectId) {

            throw Error(

                "Project logo upload requires a project ID."

            );

        }


        if (

            !metadata?.file

        ) {

            throw Error(

                "Validated logo file is unavailable."

            );

        }


        // =============================================
        // PROJECT IDENTITY
        // =============================================

        if (

            createdProjectId &&

            String(projectId)

            !==

            String(createdProjectId)

        ) {

            throw Error(

                "Project identity verification failed before logo upload."

            );

        }


        // =============================================
        // AUTHORITATIVE STORAGE PATH
        // =============================================

        const path =

            "projects/" +

            String(projectId) +

            "/logo";


        // =============================================
        // UPLOAD
        // =============================================

        const {

            error

        } =
            await client
                .storage
                .from(
                    "project-logos"
                )
                .upload(

                    path,

                    metadata.file,

                    {

                        contentType:

                            metadata.file.type,

                        upsert:

                            false,

                        cacheControl:

                            "3600"

                    }

                );


        if (error) {

            throw error;

        }


        // =============================================
        // PUBLIC URL
        // =============================================

        const {

            data

        } =
            client
                .storage
                .from(
                    "project-logos"
                )
                .getPublicUrl(
                    path
                );


        const url =
            data?.publicUrl;


        if (!url) {

            throw Error(

                "Project logo URL could not be generated."

            );

        }


        return {

            path,

            url

        };

    }


    // =====================================================
    // ATTACH PROJECT LOGO
    //
    // The server:
    //
    //   - validates auth.uid()
    //   - requires AAL2
    //   - validates active admin
    //   - validates project authorization
    //   - validates Mainnet
    //   - validates path
    //   - validates logo metadata
    //   - writes authoritative logo identity
    // =====================================================

    async function attachLogo(
        projectId,
        uploadedLogo,
        validatedLogo
    ) {

        const client =
            getClient();


        if (!projectId) {

            throw Error(

                "Project logo attachment requires a project ID."

            );

        }


        if (

            !uploadedLogo?.path ||

            !uploadedLogo?.url

        ) {

            throw Error(

                "Uploaded project logo identity is invalid."

            );

        }


        if (

            !validatedLogo

        ) {

            throw Error(

                "Validated logo metadata is unavailable."

            );

        }


        // =============================================
        // EXPECTED PATH
        // =============================================

        const expectedPath =

            "projects/" +

            String(projectId) +

            "/logo";


        if (

            uploadedLogo.path

            !==

            expectedPath

        ) {

            throw Error(

                "Project logo path verification failed."

            );

        }


        // =============================================
        // ATTACH AUTHORITATIVE LOGO
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

                    "attach_project_logo",

                    {

                        p_project_id:

                            projectId,


                        p_logo_path:

                            uploadedLogo.path,


                        p_logo_url:

                            uploadedLogo.url,


                        p_logo_width:

                            validatedLogo.width,


                        p_logo_height:

                            validatedLogo.height,


                        p_logo_format:

                            validatedLogo.format,


                        p_logo_size_bytes:

                            validatedLogo.size_bytes

                    }

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

                "Logo attachment was denied."

            );

        }


        // =============================================
        // PROJECT ID VERIFICATION
        // =============================================

        if (

            String(
                response.project_id || ""
            )

            !==

            String(
                projectId
            )

        ) {

            throw Error(

                "Logo attachment project identity verification failed."

            );

        }


        return response;

    }


    // =====================================================
    // CREATE PROJECT
    // =====================================================

    async function createProject() {

        if (busy) {

            return;

        }


        setBusy(
            true
        );


        msg(
            "Validating project and logo..."
        );


        try {

            // =============================================
            // MAINNET
            // =============================================

            requireMainnet();


            // =============================================
            // SUPABASE
            // =============================================

            const client =
                getClient();


            // =============================================
            // RESET CREATION IDENTITY
            // =============================================

            createdProjectId =
                null;


            // =============================================
            // VALIDATE
            // =============================================

            const project =
                await validateForm();


            // =============================================
            // CREATE SERVER-AUTHORIZED PROJECT
            // =============================================

            msg(

                "Creating server-authorized Mainnet project..."

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
    "create_project",
    {
        p_project_code: project.code,
        p_slug: project.slug,
        p_name: project.name,
        p_project_type: project.type,
        p_description: project.description,
        p_core_slot: project.slot
    }
);


            if (error) {

                throw error;

            }


            const response =
                data || {};


            // =============================================
            // SERVER SUCCESS
            // =============================================

            if (

                response.success !== true

            ) {

                throw Error(

                    response.message ||

                    "Project creation was denied."

                );

            }


            // =============================================
            // AUTHORIZATION RESPONSE
            //
            // Some server versions may return
            // authorized explicitly.
            //
            // If it exists and is false, reject.
            // =============================================

            if (

                Object.prototype.hasOwnProperty.call(
                    response,
                    "authorized"
                )

                &&

                response.authorized !== true

            ) {

                throw Error(

                    response.message ||

                    "Project creation authorization denied."

                );

            }


            // =============================================
            // PROJECT ID
            // =============================================

            const projectId =
                response.project_id;


            if (!projectId) {

                throw Error(

                    "Project was created without a project ID."

                );

            }


            // =============================================
            // STORE SERVER-AUTHORITATIVE IDENTITY
            // =============================================

            createdProjectId =
                String(projectId);


            // =============================================
            // NETWORK RESPONSE
            //
            // Defense in depth if returned by RPC.
            // =============================================

            if (

                response.network != null

                &&

                String(
                    response.network
                )
                    .trim()
                    .toLowerCase()

                !==

                "mainnet"

            ) {

                throw Error(

                    "Project creation network verification failed."

                );

            }


            // =============================================
            // RECHECK ENVIRONMENT
            // =============================================

            requireMainnet();


            // =============================================
            // UPLOAD LOGO
            // =============================================

            msg(

                "Project created. Uploading validated logo..."

            );


            const uploadedLogo =
                await uploadLogo(

                    projectId,

                    project.logo

                );


            // =============================================
            // ATTACH LOGO
            // =============================================

            msg(

                "Attaching authoritative project logo..."

            );


            await attachLogo(

                projectId,

                uploadedLogo,

                project.logo

            );


            // =============================================
            // FINAL IDENTITY CHECK
            // =============================================

            if (

                String(
                    createdProjectId
                )

                !==

                String(
                    projectId
                )

            ) {

                throw Error(

                    "Final project identity verification failed."

                );

            }


            // =============================================
            // SUCCESS
            // =============================================

            msg(

                "Project and authoritative logo created successfully."

            );


            setTimeout(

                () => {

                    location.replace(

                        "admin-project-registry.html"

                    );

                },

                900

            );

        }

        catch (error) {

            console.error(

                "[ALBUKHR PROJECT CREATE]",

                error

            );


            msg(

                String(
                    error?.message ||
                    error
                ),

                true

            );


            createdProjectId =
                null;

        }

        finally {

            setBusy(
                false
            );

        }

    }


    // =====================================================
    // LOGO FILE SELECTION
    // =====================================================

    async function handleLogoSelection(
        event
    ) {

        logo =
            null;


        const preview =
            $("logoPreview");


        preview?.classList.add(
            "hidden"
        );


        lmsg(
            ""
        );


        const files =

            [
                ...(
                    event.target.files || []
                )
            ];


        // =============================================
        // EXACTLY ONE FILE
        // =============================================

        if (

            files.length !== 1

        ) {

            event.target.value =
                "";


            lmsg(

                "Select exactly one image.",

                true

            );

            return;

        }


        try {

            const validator =
                window.AlbukhrProjectLogoValidator;


            if (

                !validator?.validate

            ) {

                throw Error(

                    "Logo validation engine unavailable."

                );

            }


            // =============================================
            // VALIDATE
            // =============================================

            const metadata =
                await validator.validate(

                    files[0]

                );


            if (

                !metadata?.file

            ) {

                throw Error(

                    "Logo validation did not return a valid file."

                );

            }


            // =============================================
            // STORE FILE
            // =============================================

            logo =
                metadata.file;


            // =============================================
            // PREVIEW
            // =============================================

            const previewImage =
                $("previewImage");


            if (previewImage) {

                previewImage.src =

                    URL.createObjectURL(

                        metadata.file

                    );

            }


            $("logoName").textContent =

                metadata.file.name;


            $("logoMeta").textContent =

                `${metadata.width} × ${metadata.height}px • ` +

                `${(metadata.size_bytes / 1024).toFixed(1)} KB • ` +

                `${String(
                    metadata.format || ""
                ).toUpperCase()}`;


            preview?.classList.remove(
                "hidden"
            );


            lmsg(

                "Logo passed validation."

            );

        }

        catch (error) {

            logo =
                null;


            event.target.value =
                "";


            lmsg(

                String(
                    error?.message ||
                    error
                ),

                true

            );

        }

    }


    // =====================================================
    // REMOVE LOGO
    // =====================================================

    function removeLogo() {

        logo =
            null;


        const input =
            $("logoFile");


        if (input) {

            input.value =
                "";

        }


        const image =
            $("previewImage");


        if (image) {

            image.removeAttribute(
                "src"
            );

        }


        $("logoPreview")
            ?.classList.add(
                "hidden"
            );


        lmsg(
            ""
        );

    }


    // =====================================================
    // BIND EVENTS
    // =====================================================

    function bind() {

        // =============================================
        // PROJECT TYPE
        // =============================================

        $("projectType")
            ?.addEventListener(

                "change",

                setCoreSlotVisibility

            );


        // =============================================
        // AUTO SLUG
        // =============================================

        $("projectName")
            ?.addEventListener(

                "input",

                () => {

                    const slugInput =
                        $("projectSlug");


                    if (

                        !slugInput
                            ?.dataset
                            .edited

                    ) {

                        slugInput.value =

                            slug(

                                $("projectName")
                                    .value

                            );

                    }

                }

            );


        // =============================================
        // MANUAL SLUG
        // =============================================

        $("projectSlug")
            ?.addEventListener(

                "input",

                () => {

                    const slugInput =
                        $("projectSlug");


                    slugInput.dataset.edited =
                        "1";


                    slugInput.value =

                        slug(

                            slugInput.value

                        );

                }

            );


        // =============================================
        // LOGO
        // =============================================

        $("logoFile")
            ?.addEventListener(

                "change",

                handleLogoSelection

            );


        // =============================================
        // REMOVE LOGO
        // =============================================

        $("removeLogo")
            ?.addEventListener(

                "click",

                removeLogo

            );


        // =============================================
        // FORM
        // =============================================

        $("projectForm")
            ?.addEventListener(

                "submit",

                (event) => {

                    event.preventDefault();


                    createProject();

                }

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
            // INITIALIZE SESSION
            // =============================================

            await A().init();


            // =============================================
            // REQUIRE ADMIN
            // =============================================

            admin =
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


            // =============================================
            // AAL2 REQUIRED
            // =============================================

            if (

                !mfa?.verified

            ) {

                location.replace(

                    "admin-mfa.html"

                );

                return;

            }


            // =============================================
            // FRONTEND ROLE UX GUARD
            //
            // SERVER create_project remains
            // authoritative.
            // =============================================

            const roles =

                Array.isArray(
                    admin.roles
                )

                    ? admin.roles

                    : [];


            const allowed =
                CREATION_ROLES.some(

                    (role) =>

                        roles.includes(
                            role
                        )

                );


            if (!allowed) {

                throw Error(

                    "Project Registry creation authorization denied."

                );

            }


            // =============================================
            // SECURITY STATUS
            // =============================================

            $("securityState")
                .textContent =

                "Authenticated • AAL2";


            // =============================================
            // READY
            // =============================================

            setCoreSlotVisibility();


            msg(

                "Project creation is ready."

            );

        }

        catch (error) {

            console.error(

                "[ALBUKHR PROJECT CREATE INIT]",

                error

            );


            msg(

                String(
                    error?.message ||
                    error
                ),

                true

            );


            const button =
                $("createButton");


            if (button) {

                button.disabled =
                    true;

            }

        }

    }


    // =====================================================
    // START
    // =====================================================

    bind();

    init();


})(window, document);
