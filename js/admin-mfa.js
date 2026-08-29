(function(window, document) {
"use strict";

const A = () => window.AlbukhrSupabaseAdminAuth;
const qr = document.getElementById("qr");
const secret = document.getElementById("secret");
const code = document.getElementById("mfaCode");
const verify = document.getElementById("verifyButton");
const status = document.getElementById("mfaStatus");
const enrollPanel = document.getElementById("enrollPanel");
const successPanel = document.getElementById("successPanel");
const continueButton = document.getElementById("continueButton");

let factorId = null;
let initialized = false;

function msg(text, type) {
  status.textContent = String(text || "");
  status.className = "status" + (type ? " " + type : "");
}

function setBusy(value, text) {
  verify.disabled = !!value;
  verify.textContent = text || (value ? "Verifying..." : "Verify & Secure Admin");
}

function depsReady() {
  return !!(
    window.ALBukhrEnvironment &&
    window.ALBUKHR_SUPABASE &&
    A()
  );
}

function safeError(error) {
  if (!error) return "Unknown error.";
  const parts = [];
  if (error.name) parts.push("name=" + String(error.name));
  if (error.code) parts.push("code=" + String(error.code));
  if (error.status) parts.push("status=" + String(error.status));
  if (error.message) parts.push("message=" + String(error.message));
  return parts.join(" | ") || String(error);
}

function destination() {
  const r = new URLSearchParams(location.search).get("redirect");
  if (!r) return "admin-dashboard.html";
  try {
    const u = new URL(r, location.origin);
    return u.origin === location.origin &&
           u.protocol === location.protocol
      ? u.pathname + u.search + u.hash
      : "admin-dashboard.html";
  } catch (_) {
    return "admin-dashboard.html";
  }
}

async function enroll() {
  const client = window.ALBUKHR_SUPABASE.client;

  const existing = await client.auth.mfa.listFactors();
  if (existing.error) throw existing.error;

  const verified = Array.isArray(existing.data && existing.data.totp)
    ? existing.data.totp.find(f => f.status === "verified")
    : null;

  if (verified) {
    factorId = verified.id;
    msg("An authenticator is already enrolled. Enter its current 6-digit code.", "success");
    secret.textContent = "Already enrolled — use your authenticator app.";
    qr.innerHTML = "";
    return;
  }

  const result = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "ALBUKHR Admin Authenticator"
  });

  if (result.error) throw result.error;

  factorId = result.data.id;

  secret.textContent =
    result.data.secret ||
    "Use the QR code to complete setup.";

  qr.innerHTML = "";

  if (window.QRCode && result.data.qr) {
    new window.QRCode(qr, {
      text: result.data.qr,
      width: 220,
      height: 220,
      correctLevel: window.QRCode.CorrectLevel.M
    });
  } else if (result.data.qr) {
    const pre = document.createElement("code");
    pre.textContent = result.data.qr;
    qr.appendChild(pre);
  }

  msg("Authenticator setup is ready. Enter the 6-digit code shown in your authenticator app.");
}

async function verifyMfa() {
  const value = String(code.value || "").replace(/\D/g, "");

  if (!factorId) {
    throw new Error("MFA factor is not available. Reload the page and try again.");
  }

  if (!/^\d{6}$/.test(value)) {
    throw new Error("Enter the 6-digit authenticator code.");
  }

  const client = window.ALBUKHR_SUPABASE.client;

  const challenge = await client.auth.mfa.challenge({
    factorId: factorId
  });

  if (challenge.error) throw challenge.error;

  const result = await client.auth.mfa.verify({
    factorId: factorId,
    challengeId: challenge.data.id,
    code: value
  });

  if (result.error) throw result.error;

  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error) throw assurance.error;

  if (assurance.data.currentLevel !== "aal2") {
    throw new Error("MFA verification did not establish AAL2 assurance.");
  }

  await A().refreshAdminContext();

  enrollPanel.hidden = true;
  successPanel.hidden = false;
  msg("MFA verification successful.", "success");
}

async function init() {
  try {
    if (!depsReady()) {
      throw new Error("Admin authentication system is unavailable.");
    }

    if (!window.ALBukhrEnvironment.isMainnet()) {
      throw new Error("Admin MFA is available only on ALBUKHR MAINNET.");
    }

    await A().init();

    const admin = await A().requireAdmin({ redirect: false });
    if (!admin) {
      location.replace("admin-login.html");
      return;
    }

    const mfa = await A().ensureMfa();

    if (mfa.required && mfa.verified) {
      successPanel.hidden = false;
      enrollPanel.hidden = true;
      msg("MFA is already verified for this session.", "success");
      return;
    }

    await enroll();
    initialized = true;
  } catch (error) {
    console.error("[ALBUKHR ADMIN MFA]", error);
    msg("MFA setup failed: " + safeError(error), "error");
    verify.disabled = true;
  }
}

verify.addEventListener("click", async function() {
  if (!initialized && !factorId) return;

  try {
    setBusy(true);
    msg("Verifying MFA assurance...");
    await verifyMfa();
  } catch (error) {
    console.error("[ALBUKHR ADMIN MFA VERIFY]", error);
    msg("MFA verification failed: " + safeError(error), "error");
    setBusy(false);
  }
});

code.addEventListener("input", function() {
  code.value = code.value.replace(/\D/g, "").slice(0, 6);
});

code.addEventListener("keydown", function(event) {
  if (event.key === "Enter") verify.click();
});

continueButton.addEventListener("click", function() {
  location.replace(destination());
});

init();

})(window, document);
