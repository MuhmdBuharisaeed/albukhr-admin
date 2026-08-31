(function(window,document){
"use strict";

const A=()=>window.AlbukhrSupabaseAdminAuth;
const $=id=>document.getElementById(id);

let projectId=null;
let loaded=null;
let busy=false;


function msg(text,error){
  $("pageStatus").textContent=text||"";
  $("pageStatus").className="status"+(error?" error":"");
}


function setBusy(value){
  busy=!!value;

  $("saveButton").disabled=busy||!loaded;

  $("saveButton").textContent=
    busy
      ?"Saving..."
      :"Save Project Changes";
}


function slugify(value){

  return String(value||"")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,160);

}


function getProjectId(){

  const id=
    new URLSearchParams(
      window.location.search
    ).get("id");

  if(!id){
    return null;
  }

  const uuidPattern=
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidPattern.test(id)
    ?id
    :null;

}


function setCore(){

  const isCore=
    $("projectType").value==="core";

  $("coreSlotWrap").classList.toggle(
    "hidden",
    !isCore
  );

  if(!isCore){
    $("coreSlot").value="";
  }

}


function populate(project){

  $("projectId").textContent=
    project.id||"—";

  $("network").textContent=
    String(
      project.network||"—"
    ).toUpperCase();

  $("projectStatus").textContent=
    String(
      project.status||"—"
    );

  $("projectCode").value=
    project.project_code||"";

  $("projectName").value=
    project.name||"";

  $("projectSlug").value=
    project.slug||"";

  $("projectType").value=
    project.project_type||"";

  $("coreSlot").value=
    project.core_slot==null
      ?""
      :String(project.core_slot);

  $("description").value=
    project.description||"";

  setCore();

}


/* =========================================================
   SECURE PROJECT LOAD

   Browser does NOT query public.projects.

   Browser does NOT load the entire registry.

   Server performs:

   auth.uid()
        ↓
   AAL2
        ↓
   Active admin
        ↓
   Mainnet project
        ↓
   can_manage_project()
        ↓
   Single authorized project
========================================================= */

async function loadProject(){

  const client=
    window.ALBUKHR_SUPABASE?.client;

  if(!client){
    throw Error(
      "ALBUKHR Supabase Core is unavailable."
    );
  }


  msg(
    "Loading authorized project record..."
  );


  const result=
    await client
      .schema("albukhr_security")
      .rpc(
        "get_project_for_edit",
        {
          p_project_id:projectId
        }
      );


  if(result.error){
    throw result.error;
  }


  const payload=
    Array.isArray(result.data)
      ?(result.data[0]||{})
      :(result.data||{});


  if(payload.success!==true){

    throw Error(
      payload.message||
      "Project edit authorization denied."
    );

  }


  if(payload.authorized!==true){

    throw Error(
      payload.message||
      "Project edit authorization denied."
    );

  }


  const project=
    payload.project;


  if(
    !project||
    typeof project!=="object"
  ){

    throw Error(
      "The requested project record was not returned."
    );

  }


  if(
    String(project.id)!==
    String(projectId)
  ){

    throw Error(
      "Project identity verification failed."
    );

  }


  if(
    String(
      project.network||""
    ).toLowerCase()!=="mainnet"
  ){

    throw Error(
      "Only Mainnet projects can be edited here."
    );

  }


  loaded=project;

  populate(project);


  $("saveButton").disabled=false;


  msg(
    payload.message||
    "Project loaded. Review the changes before saving."
  );

}


/* =========================================================
   FORM VALIDATION
========================================================= */

function readForm(){

  const code=
    $("projectCode")
      .value
      .trim();


  const name=
    $("projectName")
      .value
      .trim();


  const slug=
    $("projectSlug")
      .value
      .trim();


  const type=
    $("projectType")
      .value;


  const description=
    $("description")
      .value
      .trim();


  const slot=
    $("coreSlot")
      .value;


  /* -------------------------------------------------------
     PROJECT CODE
  ------------------------------------------------------- */

  if(!code){

    throw Error(
      "Project code is required."
    );

  }


  if(
    !/^[A-Z0-9][A-Z0-9_-]*$/i.test(code)
  ){

    throw Error(
      "Project code contains invalid characters."
    );

  }


  /* -------------------------------------------------------
     PROJECT NAME
  ------------------------------------------------------- */

  if(!name){

    throw Error(
      "Project name is required."
    );

  }


  /* -------------------------------------------------------
     SLUG
  ------------------------------------------------------- */

  if(
    !/^[a-z0-9][a-z0-9-]*$/.test(
      slug.toLowerCase()
    )
  ){

    throw Error(
      "Slug must contain only lowercase letters, numbers and hyphens."
    );

  }


  /* -------------------------------------------------------
     PROJECT TYPE
  ------------------------------------------------------- */

  if(
    !["core","internal","external"]
      .includes(type)
  ){

    throw Error(
      "Select a valid project type."
    );

  }


  /* -------------------------------------------------------
     CORE SLOT
  ------------------------------------------------------- */

  let coreSlot=null;


  if(type==="core"){

    if(!slot){

      throw Error(
        "Core projects require a core slot from 1 to 7."
      );

    }


    const numberSlot=
      Number(slot);


    if(
      !Number.isInteger(numberSlot)||
      numberSlot<1||
      numberSlot>7
    ){

      throw Error(
        "Core slot must be between 1 and 7."
      );

    }


    coreSlot=numberSlot;

  }


  if(
    type!=="core"&&
    slot
  ){

    throw Error(
      "Only core projects may have a core slot."
    );

  }


  /* -------------------------------------------------------
     RETURN RPC PAYLOAD
  ------------------------------------------------------- */

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
      description||null,

    p_core_slot:
      coreSlot

  };

}


/* =========================================================
   SECURE PROJECT UPDATE
========================================================= */

async function save(){

  if(
    busy||
    !loaded
  ){
    return;
  }


  setBusy(true);


  msg(
    "Validating and saving project changes..."
  );


  try{

    const client=
      window.ALBUKHR_SUPABASE?.client;


    if(!client){

      throw Error(
        "ALBUKHR Supabase Core is unavailable."
      );

    }


    const payload=
      readForm();


    const result=
      await client
        .schema("albukhr_security")
        .rpc(
          "update_project",
          payload
        );


    if(result.error){
      throw result.error;
    }


    const response=
      Array.isArray(result.data)
        ?(result.data[0]||{})
        :(result.data||{});


    if(response.success!==true){

      throw Error(
        response.message||
        "Project update was denied."
      );

    }


    msg(
      response.message||
      "Project updated successfully."
    );


    /*
      Short delay so the administrator
      can see the success confirmation.
    */

    setTimeout(
      ()=>{

        window.location.replace(
          "admin-project-registry.html"
        );

      },
      700
    );


  }catch(error){

    console.error(
      "[ALBUKHR PROJECT EDIT]",
      error
    );


    msg(
      String(
        error?.message||
        error
      ),
      true
    );


    setBusy(false);

  }

}


/* =========================================================
   FORM EVENTS
========================================================= */

$("projectType")
  .addEventListener(
    "change",
    setCore
  );


$("projectName")
  .addEventListener(
    "input",
    ()=>{

      if(
        !$("projectSlug")
          .dataset
          .edited
      ){

        $("projectSlug").value=
          slugify(
            $("projectName").value
          );

      }

    }
  );


$("projectSlug")
  .addEventListener(
    "input",
    ()=>{

      $("projectSlug")
        .dataset
        .edited="1";


      $("projectSlug").value=
        slugify(
          $("projectSlug").value
        );

    }
  );


$("projectForm")
  .addEventListener(
    "submit",
    event=>{

      event.preventDefault();

      save();

    }
  );


/* =========================================================
   LOGOUT
========================================================= */

$("logoutButton")
  .addEventListener(
    "click",

    async()=>{

      try{

        await A()?.signOut();

      }finally{

        window.location.replace(
          "admin-login.html"
        );

      }

    }
  );


/* =========================================================
   INITIALIZATION
========================================================= */

(async()=>{

  try{

    /* -----------------------------------------------------
       MAINNET ONLY
    ----------------------------------------------------- */

    if(
      !A()||
      !window.ALBukhrEnvironment?.isMainnet()
    ){

      throw Error(
        "Project editing is available only on ALBUKHR MAINNET."
      );

    }


    /* -----------------------------------------------------
       VALIDATE URL PROJECT ID
    ----------------------------------------------------- */

    projectId=
      getProjectId();


    if(!projectId){

      throw Error(
        "A valid project ID is required."
      );

    }


    /* -----------------------------------------------------
       INITIALIZE ADMIN AUTH
    ----------------------------------------------------- */

    await A().init();


    const admin=
      await A().requireAdmin({
        redirect:false
      });


    if(!admin){

      window.location.replace(
        "admin-login.html"
      );

      return;

    }


    /* -----------------------------------------------------
       MFA / AAL2
    ----------------------------------------------------- */

    const mfa=
      await A().ensureMfa();


    if(
      admin.mfa_required&&
      !mfa.verified
    ){

      window.location.replace(

        "admin-mfa.html?redirect="+

        encodeURIComponent(
          window.location.pathname+
          window.location.search
        )

      );

      return;

    }


    /* -----------------------------------------------------
       SECURITY STATE
    ----------------------------------------------------- */

    $("securityState").textContent=
      "Authenticated • AAL2";


    /* -----------------------------------------------------
       LOAD SINGLE AUTHORIZED PROJECT
    ----------------------------------------------------- */

    await loadProject();


  }catch(error){

    console.error(
      "[ALBUKHR PROJECT EDIT INIT]",
      error
    );


    msg(

      "Project edit could not be initialized: "+

      String(
        error?.message||
        error
      ),

      true

    );


    $("saveButton").disabled=true;

  }

})();

})(window,document);
