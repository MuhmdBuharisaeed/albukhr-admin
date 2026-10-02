(function(window,document){
"use strict";

const A=()=>window.AlbukhrSupabaseAdminAuth;
const $=id=>document.getElementById(id);

function label(v){
  return String(v||"")
    .replace(/_/g," ")
    .replace(/\b\w/g,c=>c.toUpperCase());
}

function status(t,e){
  const el=$("pageStatus");

  if(!el){
    return;
  }

  el.textContent=t||"";
  el.className="status"+(e?" error":"");
}

function render(a,m){
  $("adminEmail").textContent=
    a.email||
    a.email_snapshot||
    "Authenticated administrator";

  $("adminId").textContent=
    a.user_id||
    "Authenticated session";

  $("adminStatus").textContent=
    label(a.status);

  $("mfaStatus").textContent=
    m.verified
      ?"AAL2 verified"
      :"Not verified";

  const roles=
    Array.isArray(a.roles)
      ?a.roles
      :[];

  $("roleCount").textContent=
    roles.length;

  $("roles").innerHTML=
    roles.map(
      r=>
        '<span class="role">'+
        label(r)+
        "</span>"
    ).join("")||
    "<span>No roles returned.</span>";

  $("coreCount").textContent=
    Array.isArray(a.core_projects)
      ?a.core_projects.length
      :0;

  $("scopedCount").textContent=
    Array.isArray(a.scoped_projects)
      ?a.scoped_projects.length
      :0;

  $("testnetAccess").textContent=
    a.testnet_access
      ?"Granted"
      :"No";

  $("securityState").textContent=
    m.verified
      ?"Authenticated • AAL2"
      :"Authenticated";

  const testnetLink=
    $("testnetAdminLink");

  if(testnetLink){
    testnetLink.hidden=!(
      a.testnet_access===true&&
      (!a.mfa_required||m.verified)
    );
  }

  const defs=[
    [
      "Security & Access",
      "Administrator roles and security controls.",
      ["super_admin"],
      "admin-security.html"
    ],

    [
      "Core Team",
      "Invite and manage the seven official ALBUKHR Core Team members.",
      ["super_admin"],
      "admin-core-team.html"
    ],

    [
      "Project Registry",
      "Core project registry administration.",
      [
        "super_admin",
        "registry_admin",
        "core_admin"
      ],
      "admin-project-registry.html"
    ],

    [
      "Contributor Invitations",
      "Create and securely issue Mainnet Contributor onboarding invitations.",
      ["super_admin"],
      "admin-contributor-invitations.html"
    ],

    [
      "Project Approvals",
      "Project approval workflow.",
      [
        "super_admin",
        "approval_admin"
      ],
      "admin-project-approvals.html"
    ],

    [
      "Core Project Lifecycle",
      "Core treasury, liquidity, staking-term readiness and activation.",
      [
        "super_admin",
        "approval_admin",
        "finance_admin"
      ],
      "admin-core-lifecycle.html"
    ],

    [
      "Staking Contract V2",
      "Review approved Core staking terms and publish them through the secured V2 publication gate.",
      [
        "super_admin",
        "approval_admin",
        "finance_admin"
      ],
      "admin-staking-contract-v2.html"
    ],

    [
      "Contributor Project Approvals",
      "Review Contributor-owned Internal Projects submitted to Mainnet governance.",
      [
        "super_admin",
        "approval_admin"
      ],
      "admin-contributor-projects.html"
    ],

    [
      "Finance",
      "Administrative finance oversight.",
      [
        "super_admin",
        "finance_admin"
      ],
      "admin-module.html?module=finance"
    ],

    [
      "Internal Projects",
      "Internal project scope administration.",
      [
        "super_admin",
        "internal_admin"
      ],
      "admin-module.html?module=internal"
    ],

    [
      "External Projects",
      "External project scope administration.",
      [
        "super_admin",
        "external_admin"
      ],
      "admin-module.html?module=external"
    ]
  ];

  $("modules").innerHTML=
    defs.map(x=>{
      const ok=
        x[2].some(
          r=>roles.includes(r)
        );

      return (
        '<a class="module '+
        (ok?"":"off")+
        '" href="'+
        x[3]+
        '">'+
        "<h3>"+
        x[0]+
        "</h3>"+
        "<p>"+
        x[1]+
        "</p>"+
        "<small>"+
        (ok
          ?"AUTHORIZED"
          :"ROLE REQUIRED")+
        "</small>"+
        "</a>"
      );
    }).join("");
}

async function init(){
  try{
    if(
      !A()||
      !window.AlbukhrEnvironment?.isMainnet()
    ){
      throw new Error(
        "Admin Control Center is unavailable."
      );
    }

    await A().init();

    /*
     * IMPORTANT:
     *
     * A temporary failure while retrieving the server-side admin
     * context must not immediately destroy an otherwise valid
     * authenticated Supabase session.
     *
     * requireAdmin() still performs the authoritative checks:
     *   - authenticated session
     *   - is_admin
     *   - active status
     *
     * The option only prevents a temporary context/RPC error from
     * forcing an unnecessary sign-out.
     */
    const a=await A().requireAdmin({
      redirect:false,
      preserveSessionOnContextError:true
    });

    if(!a){
      location.replace("admin-login.html");
      return;
    }

    /*
     * MFA/AAL2 remains a separate security gate.
     * No authorization is granted by this change.
     */
    const m=await A().ensureMfa();

    if(a.mfa_required&&!m.verified){
      location.replace("admin-mfa.html");
      return;
    }

    render(a,m);

    status(
      "Admin authorization verified."
    );

  }catch(e){
    console.error(
      "[ALBUKHR ADMIN DASHBOARD]",
      e
    );

    const msg=
      String(
        e?.message||
        e||
        ""
      );

    /*
     * MFA/AAL2/factor failures remain directed to the dedicated
     * MFA page rather than being treated as a generic login failure.
     */
    if(
      /mfa|aal2|factor|authenticator/i.test(msg)
    ){
      status(
        "Admin session requires security verification.",
        true
      );

      setTimeout(
        ()=>location.replace("admin-mfa.html"),
        500
      );

      return;
    }

    /*
     * First controlled recovery attempt.
     *
     * We refresh the Supabase session, then ask the authoritative
     * requireAdmin() gate to verify the admin context again.
     *
     * Session preservation remains enabled so a temporary RPC
     * failure does not itself cause logout.
     */
    status(
      "Admin authorization could not be verified. Retrying secure session...",
      true
    );

    try{
      await new Promise(
        resolve=>setTimeout(resolve,350)
      );

      /*
       * Refresh the underlying authenticated Supabase session.
       * This does not grant admin authorization.
       */
      const refreshedSession=
        await A()?.refreshSession();

      if(!refreshedSession?.user){
        throw new Error(
          "Authenticated session could not be refreshed."
        );
      }

      /*
       * Re-run the authoritative admin authorization gate.
       *
       * This is deliberately NOT replaced by a direct context read,
       * because requireAdmin() also validates:
       *   - active Supabase session
       *   - is_admin
       *   - active admin status
       */
      const a=
        await A()?.requireAdmin({
          redirect:false,
          preserveSessionOnContextError:true
        });

      if(
        !a||
        a.is_admin!==true||
        a.status!=="active"
      ){
        throw new Error(
          "Active admin authorization was not returned."
        );
      }

      const m=
        await A().ensureMfa();

      if(
        a.mfa_required&&
        !m.verified
      ){
        location.replace(
          "admin-mfa.html"
        );

        return;
      }

      render(a,m);

      status(
        "Admin authorization verified."
      );

    }catch(retryError){
      console.error(
        "[ALBUKHR ADMIN DASHBOARD RETRY]",
        retryError
      );

      const retryMessage=
        String(
          retryError?.message||
          retryError||
          ""
        );

      /*
       * If the retry failed specifically because MFA/AAL2 is needed,
       * keep the user inside the security flow.
       */
      if(
        /mfa|aal2|factor|authenticator/i.test(
          retryMessage
        )
      ){
        status(
          "Admin session requires security verification.",
          true
        );

        setTimeout(
          ()=>location.replace("admin-mfa.html"),
          500
        );

        return;
      }

      /*
       * Only after the controlled retry fails do we return to the
       * secure login page.
       *
       * We intentionally do not call signOut() here directly.
       * requireAdmin() already preserves the session for temporary
       * context failures, while definitive authorization failures
       * retain the Auth Core's fail-closed behavior.
       */
      status(
        "Admin authorization failed. Returning to secure login.",
        true
      );

      setTimeout(
        ()=>location.replace("admin-login.html"),
        900
      );
    }
  }
}

$("logoutButton")?.addEventListener(
  "click",
  async()=>{
    try{
      await A()?.signOut();
    }finally{
      location.replace(
        "admin-login.html"
      );
    }
  }
);

init();

})(window,document);
