(function () {
  "use strict";
  const META = document.querySelector('meta[name="albukhr-admin-session-api-base"]');
  const $ = (id) => document.getElementById(id);
  let apiBase = null;
  let currentFactorId = null;

  function setStatus(message, error) {
    const el = $("status");
    el.textContent = String(message || "");
    el.className = "status" + (error ? " error" : "");
  }

  function resolveApiBase() {
    const value = String(META?.content || "").trim();
    if (!value) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password ||
          !url.hostname.toLowerCase().endsWith(".albukhr.com") ||
          url.hostname.toLowerCase() === "albukhr.com" ||
          (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) return null;
      return url.origin;
    } catch (_) { return null; }
  }

  async function request(path, method, payload) {
    if (!apiBase) throw new Error("Set the staging API custom domain in this page's meta tag before testing.");
    const headers = { "Accept": "application/json" };
    const options = { method: method || "GET", headers, credentials: "include", cache: "no-store", redirect: "error" };
    if (payload !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(payload);
    }
    const response = await fetch(apiBase + "/api/admin/session" + path, options);
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.success !== true) {
      throw new Error(data?.error || "Staging Admin Session request failed (" + response.status + ").");
    }
    if (String(data.network || "").toLowerCase() !== "mainnet") throw new Error("Wrong network returned by the API.");
    return data;
  }

  function renderContext(data) {
    const context = data.context || {};
    if (context.requires_mfa || data.requires_mfa) {
      $("context").textContent = "Authenticated Mainnet admin session. MFA/AAL2 is required before roles and scopes are returned.";
      return;
    }
    $("context").textContent = JSON.stringify(context, null, 2);
  }

  function clearFactors() {
    $("factors").replaceChildren();
    $("enrollPanel").classList.add("hidden");
    $("verifyPanel").classList.add("hidden");
    $("qr").removeAttribute("src");
    $("secret").textContent = "";
    $("totpCode").value = "";
    currentFactorId = null;
  }

  async function loadFactors() {
    const result = await request("/mfa/factors", "GET");
    const host = $("factors");
    host.replaceChildren();
    for (const factor of result.factors || []) {
      const card = document.createElement("div");
      card.className = "factor";
      const title = document.createElement("strong");
      title.textContent = factor.friendly_name || "Authenticator";
      const details = document.createElement("small");
      details.textContent = factor.factor_type + " • " + factor.status;
      card.append(title, details);
      if (factor.status === "verified") {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary";
        button.textContent = "Challenge this authenticator";
        button.addEventListener("click", async () => {
          try {
            await request("/mfa/challenge", "POST", { factor_id: factor.id });
            currentFactorId = factor.id;
            $("verifyPanel").classList.remove("hidden");
            $("totpCode").focus();
            setStatus("Challenge created. Enter the current authenticator code within 120 seconds.");
          } catch (error) { setStatus(error.message, true); }
        });
        card.append(button);
      }
      host.append(card);
    }
    if (!(result.factors || []).length) host.textContent = "No authenticator factors are registered for this account.";
    if (result.requires_mfa) setStatus("An existing verified factor must be challenged; do not enroll a replacement from this flow.");
    return result;
  }

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("loginButton");
    button.disabled = true;
    try {
      const result = await request("/login", "POST", { email: $("email").value, password: $("password").value });
      $("password").value = "";
      renderContext(result);
      setStatus(result.requires_mfa ? "Credentials verified. Complete MFA before accessing roles." : "Staging session verified.");
    } catch (error) { $("password").value = ""; setStatus(error.message, true); }
    finally { button.disabled = false; }
  });

  $("checkButton").addEventListener("click", async () => {
    try { const result = await request("/context", "GET"); renderContext(result); setStatus("Session context checked."); }
    catch (error) { $("context").textContent = "No verified session."; setStatus(error.message, true); }
  });

  $("refreshButton").addEventListener("click", async () => {
    try { const result = await request("/refresh", "POST", {}); renderContext(result); setStatus("Session refresh succeeded."); }
    catch (error) { setStatus(error.message, true); }
  });

  $("loadFactorsButton").addEventListener("click", async () => {
    try { clearFactors(); await loadFactors(); }
    catch (error) { setStatus(error.message, true); }
  });

  $("enrollButton").addEventListener("click", async () => {
    try {
      clearFactors();
      const result = await request("/mfa/enroll", "POST", {});
      currentFactorId = result.factor?.id || null;
      if (!currentFactorId) throw new Error("The server did not return an enrollment factor.");
      const qr = String(result.factor.qr_code || "");
      if (qr.startsWith("data:image/")) $("qr").src = qr;
      else if (qr.startsWith("<svg") || qr.includes("<svg")) $("qr").src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qr);
      const secret = String(result.factor.secret || "");
      $("secret").textContent = secret ? "Manual setup key: " + secret : "No manual setup key was returned.";
      $("enrollPanel").classList.remove("hidden");
      $("challengeEnrollmentButton").classList.remove("hidden");
      $("verifyPanel").classList.add("hidden");
      setStatus("Enrollment started. Scan the QR code first. Then create a short-lived enrollment challenge.");
    } catch (error) { setStatus(error.message, true); }
  });

  $("challengeEnrollmentButton").addEventListener("click", async () => {
    try {
      if (!currentFactorId) throw new Error("Start enrollment first.");
      await request("/mfa/challenge", "POST", { factor_id: currentFactorId, purpose: "enroll" });
      $("verifyPanel").classList.remove("hidden");
      $("totpCode").focus();
      setStatus("Enrollment challenge created. Enter the current 6-digit code within 120 seconds.");
    } catch (error) { setStatus(error.message, true); }
  });

  $("verifyButton").addEventListener("click", async () => {
    try {
      if (!currentFactorId) throw new Error("Choose or enroll a factor first.");
      const result = await request("/mfa/verify", "POST", { factor_id: currentFactorId, code: $("totpCode").value });
      $("totpCode").value = "";
      renderContext(result);
      await loadFactors().catch(() => null);
      setStatus(result.requires_mfa ? "MFA is not yet sufficient for admin access." : "MFA verification complete; server context now reports the updated assurance.");
    } catch (error) { $("totpCode").value = ""; setStatus(error.message, true); }
  });

  $("logoutButton").addEventListener("click", async () => {
    try {
      await request("/logout", "POST", {});
      clearFactors();
      $("context").textContent = "Signed out.";
      setStatus("The server signed out the current local session and cleared its HttpOnly cookies.");
    } catch (error) { setStatus(error.message, true); }
  });

  apiBase = resolveApiBase();
  $("configStatus").textContent = apiBase
    ? "Staging API base configured: " + apiBase + ". All requests use credentials: include and cache: no-store."
    : "DISABLED: API base meta tag is empty or invalid. Set it to a reviewed HTTPS custom API domain under albukhr.com on a staging copy only.";
  if (!apiBase) {
    for (const button of document.querySelectorAll("button, input")) button.disabled = true;
    $("configStatus").classList.add("error");
  }
})();
