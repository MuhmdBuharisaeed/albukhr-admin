(function (window, document) {
    "use strict";

    const $ = (id) => document.getElementById(id);
    let invitationData = null;
    let isAccepting = false;

    function getClient() {
        const client = window.ALBUKHR_SUPABASE?.client;
        if (!client) throw new Error("ALBUKHR Supabase Core is unavailable.");
        return client;
    }

    function assertMainnet() {
        const environment = window.ALBukhrEnvironment;
        if (!environment || typeof environment.isMainnet !== "function") {
            throw new Error("ALBUKHR environment security is unavailable.");
        }
        if (!environment.isMainnet()) {
            throw new Error("Project invitations are available only on ALBUKHR MAINNET.");
        }
    }

    // FIX: Never return to "/" on admin.albukhr.com.
    function getAlbukhrAppUrl() {
        const environment = window.ALBukhrEnvironment;
        if (environment && typeof environment.getAppUrl === "function") {
            const url = String(environment.getAppUrl() || "").trim();
            if (/^https:\/\/app\.albukhr\.com\/?$/i.test(url)) {
                return url.replace(/\/?$/, "/");
            }
        }
        return "https://app.albukhr.com/";
    }

    function returnToAlbukhr() {
        window.location.replace(getAlbukhrAppUrl());
    }

    function setStatus(message, isError) {
        const element = $("pageStatus");
        if (!element) return;
        element.textContent = message || "";
        element.className = isError ? "status error" : "status";
    }

    function show(id) { const e=$(id); if(e)e.classList.remove("hidden"); }
    function hide(id) { const e=$(id); if(e)e.classList.add("hidden"); }

    function setContinueLoading(loading, message) {
        const button=$("continueButton");
        if(!button)return;
        button.disabled=Boolean(loading);
        if(loading){
            button.dataset.originalText=button.textContent;
            button.textContent=message||"Processing...";
        }else{
            button.textContent=button.dataset.originalText||"Continue";
        }
    }

    function getInvitationToken() {
        const hash=String(window.location.hash||"");
        if(!hash.startsWith("#"))return "";
        return new URLSearchParams(hash.slice(1)).get("token")||"";
    }

    function formatProjectType(value) {
        const type=String(value||"").trim().toLowerCase();
        if(type==="core")return "Core Team";
        if(type==="internal")return "Internal Project";
        return type||"—";
    }

    function formatDate(value) {
        if(!value)return "—";
        const date=new Date(value);
        return Number.isNaN(date.getTime())?"—":date.toLocaleString();
    }

    function showInvalid(message) {
        hide("loadingState"); hide("validState"); show("invalidState");
        const element=$("invalidMessage");
        if(element)element.textContent=message||"This invitation is invalid or unavailable.";
    }

    function showValid(data) {
        hide("loadingState"); hide("invalidState"); show("validState");
        const projectType=$("projectType");
        if(projectType)projectType.textContent=formatProjectType(data.project_type);
        const expiresAt=$("expiresAt");
        if(expiresAt)expiresAt.textContent=formatDate(data.expires_at);
        const message=$("validMessage");
        if(message)message.textContent=data.message||"Your invitation has been securely verified.";
    }

    async function getAuthenticatedUser() {
        const response=await getClient().auth.getUser();
        if(response.error)throw response.error;
        return response.data?.user||null;
    }

    async function validateInvitation() {
        assertMainnet();
        const token=getInvitationToken();
        if(!token){
            showInvalid("No invitation token was found in this link.");
            return null;
        }

        const response=await getClient().schema("albukhr_security").rpc(
            "validate_project_invitation",{p_invitation_token:token}
        );
        if(response.error)throw response.error;

        const data=response.data;
        if(!data||data.success!==true||data.valid!==true){
            showInvalid(data?.message||"This invitation is invalid or unavailable.");
            return null;
        }

        invitationData=data;
        showValid(invitationData);
        return invitationData;
    }

    async function acceptCoreInvitation() {
        assertMainnet();
        const token=getInvitationToken();
        if(!token)throw new Error("Invitation token is unavailable.");

        const response=await getClient().schema("albukhr_security").rpc(
            "accept_core_project_invitation",{p_invitation_token:token}
        );
        if(response.error)throw response.error;

        const data=response.data;
        if(!data||data.success!==true||data.accepted!==true){
            throw new Error(data?.message||"Core Team invitation acceptance failed.");
        }
        return data;
    }

    function redirectAfterCoreAcceptance() {
        returnToAlbukhr();
    }

    // Backward-safe interception for legacy Return buttons/links.
    function bindReturnButtons() {
        const selectors=[
            "#returnButton",
            "[data-return-to-albukhr]",
            'a[href="/"]',
            'a[href="https://admin.albukhr.com/"]',
            'a[href="https://admin.albukhr.com"]'
        ];

        document.querySelectorAll(selectors.join(",")).forEach((element)=>{
            if(element.dataset.albukhrReturnBound==="true")return;
            element.dataset.albukhrReturnBound="true";
            element.addEventListener("click",(event)=>{
                event.preventDefault();
                returnToAlbukhr();
            });
        });
    }

    async function handleContinue() {
        if(isAccepting)return;

        try{
            assertMainnet();

            if(!invitationData){
                throw new Error("Invitation verification data is unavailable.");
            }

            const token=getInvitationToken();
            if(!token)throw new Error("Invitation token is unavailable.");

            const user=await getAuthenticatedUser();
            if(!user){
                setStatus(
                    "Please sign in with the email address that received this invitation.",
                    true
                );
                return;
            }

            const projectType=String(invitationData.project_type||"")
                .trim().toLowerCase();

            if(projectType==="core"){
                isAccepting=true;
                setContinueLoading(true,"Accepting invitation...");
                setStatus("Securely accepting your Core Team invitation...",false);

                const result=await acceptCoreInvitation();

                setStatus(
                    result.message||"Core Team invitation accepted successfully.",
                    false
                );

                window.history.replaceState(
                    null,document.title,window.location.pathname
                );

                window.setTimeout(redirectAfterCoreAcceptance,1000);
                return;
            }

            if(projectType==="internal"){
                setStatus(
                    "This Internal Project invitation is valid, but its server-side acceptance workflow has not yet been connected.",
                    true
                );
                return;
            }

            throw new Error("Unsupported invitation type.");

        }catch(error){
            console.error("[ALBUKHR PROJECT INVITATION ACCEPTANCE]",error);
            setStatus(
                error?.message||"Invitation acceptance failed.",
                true
            );
        }finally{
            isAccepting=false;
            setContinueLoading(false);
        }
    }

    async function initialize() {
        try{
            assertMainnet();
            bindReturnButtons();

            const continueButton=$("continueButton");
            if(continueButton){
                continueButton.addEventListener("click",handleContinue);
            }

            await validateInvitation();

        }catch(error){
            console.error("[ALBUKHR PROJECT INVITATION]",error);
            showInvalid(
                error?.message||"Invitation verification failed."
            );
        }
    }

    initialize();

})(window, document);
