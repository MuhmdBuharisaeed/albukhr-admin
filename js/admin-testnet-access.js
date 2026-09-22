(function(window, document){
  "use strict";
  var ISSUER="https://ribpntyqdleytsyktdfb.supabase.co/functions/v1/testnet-admin-issuer";
  var TESTNET_URL="https://test.albukhr.com/admin-dashboard.html";
  var status=document.getElementById("status");
  function msg(v,type){ if(!status)return; status.textContent=String(v||""); status.className="status"+(type?" "+type:""); }
  function goLogin(){ window.location.replace("admin-login.html?redirect="+encodeURIComponent("admin-testnet-access.html")); }
  function goMfa(){ window.location.replace("admin-mfa.html?redirect="+encodeURIComponent("admin-testnet-access.html")); }
  async function run(){
    try{
      if(!window.ALBukhrEnvironment || !window.ALBukhrEnvironment.isKnown() || !window.ALBukhrEnvironment.isMainnet()) throw new Error("MAINNET_ADMIN_ENVIRONMENT_REQUIRED");
      var auth=window.AlbukhrSupabaseAdminAuth;
      if(!auth) throw new Error("ADMIN_AUTH_UNAVAILABLE");
      await auth.init();
      var admin=await auth.requireAdmin({redirect:false});
      if(!admin){ goLogin(); return; }
      var mfa=await auth.ensureMfa();
      if(mfa.required===true && mfa.verified!==true){ goMfa(); return; }
      if(admin.testnet_access!==true){ throw new Error("TESTNET_ADMIN_ACCESS_DENIED"); }
      var session=await auth.getSession();
      if(!session || !session.access_token) throw new Error("ADMIN_SESSION_TOKEN_UNAVAILABLE");
      msg("Issuing one-time Testnet admin access…");
      var response=await fetch(ISSUER,{method:"POST",headers:{"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json"},body:"{}"});
      var body=null; try{body=await response.json();}catch(_){ }
      if(!response.ok || !body || !body.code) throw new Error(String(body && (body.error||body.message)||"TESTNET_ADMIN_ISSUER_FAILED"));
      window.location.replace(TESTNET_URL+"?admin_code="+encodeURIComponent(body.code));
    }catch(error){ console.error("[ALBUKHR TESTNET ADMIN ACCESS]",error); msg("Secure Testnet admin handoff failed: "+(error.message||error),"error"); }
  }
  run();
})(window,document);
