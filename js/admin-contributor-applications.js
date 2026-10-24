(function (window, document) {
  "use strict";
  const LOGIN = "admin-login.html";
  const MFA = "admin-mfa.html";
  const ONBOARDING = "https://app.albukhr.com/contributor-onboarding.html";
  const $ = (id) => document.getElementById(id);
  let adminContext = null;
  let records = [];
  let initialized = false;
  function fail(message) { throw new Error(String(message || "Contributor application security check failed.")); }
  function status(message, error) { const node = $("pageStatus"); node.textContent = message || ""; node.classList.toggle("error", Boolean(error)); }
  function assertMainnet() {
    const env = window.ALBukhrEnvironment;
    if (!env?.isKnown?.() || !env.isMainnet?.()) fail("Contributor Applications are available only on ALBUKHR MAINNET.");
  }
  function auth() { if (!window.AlbukhrSupabaseAdminAuth) fail("ALBUKHR Supabase Admin Auth is unavailable."); return window.AlbukhrSupabaseAdminAuth; }
  function client() {
    assertMainnet(); const core = window.ALBUKHR_SUPABASE;
    if (!core?.client) fail("ALBUKHR Mainnet Supabase Core is unavailable.");
    if (String(core.environment).toLowerCase() !== "mainnet" || String(core.network).toLowerCase() !== "mainnet") fail("A Mainnet Supabase session is required.");
    return core.client;
  }
  function roleList() { return Array.isArray(adminContext?.roles) ? adminContext.roles.map((v) => String(v || "").toLowerCase()) : []; }
  async function freshAal2() {
    const a = auth(); const mfa = await a.ensureMfa();
    if (!mfa?.verified) { location.replace(MFA); fail("AAL2 MFA verification is required."); }
    const assurance = await client().auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) throw assurance.error;
    if (assurance.data?.currentLevel !== "aal2") { location.replace(MFA); fail("Current admin session is not AAL2."); }
    adminContext = await a.refreshAdminContext();
    if (!adminContext?.is_admin || String(adminContext.status || "").toLowerCase() !== "active") fail("Admin authorization is not active.");
    if (!roleList().includes("super_admin")) fail("Only Super Admin can review Contributor applications.");
  }
  async function rpc(name, params) {
    await freshAal2();
    const result = await client().schema("albukhr_security").rpc(name, params || {});
    if (result.error) throw result.error;
    return result.data;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text ?? "");
    return node;
  }
  function addMeta(host, label, value) {
    const row = element("div", "record-meta");
    const strong = element("strong", "", `${label}: `);
    row.append(strong, document.createTextNode(String(value ?? "Not provided")));
    host.appendChild(row);
  }
  function renderRecord(record) {
    const card = element("article", "application-record");
    const main = element("div", "record-main");
    const header = element("div", "record-header");
    const titleWrap = element("div");
    titleWrap.append(element("h3", "", record.full_name || "Unnamed applicant"), element("div", "record-ref", record.application_ref || "Reference unavailable"));
    header.append(titleWrap, element("span", "record-status", String(record.status || "submitted").replaceAll("_", " ").toUpperCase()));
    main.appendChild(header);
    addMeta(main, "Email (unverified)", record.contact_email);
    addMeta(main, "Pi username", record.pi_username ? `@${record.pi_username}` : "Not provided");
    addMeta(main, "Pi UID", record.applicant_pi_uid || "Not provided");
    addMeta(main, "Country", record.country);
    addMeta(main, "Occupation", record.occupation);
    addMeta(main, "Primary expertise", record.primary_expertise);
    addMeta(main, "Submitted", record.created_at ? new Date(record.created_at).toLocaleString() : "Unknown");
    main.append(element("h4", "", "Contribution areas"));
    const tags = element("div", "areas-tags");
    (Array.isArray(record.contribution_areas) ? record.contribution_areas : []).forEach((area) => tags.appendChild(element("span", "", area)));
    main.appendChild(tags);
    main.append(element("h4", "", "Relevant experience"), element("p", "", record.experience_summary || "Not provided"));
    main.append(element("h4", "", "Contribution statement"), element("p", "", record.contribution_statement || "Not provided"));
    if (record.applicant_status_message) { main.append(element("h4", "", "Applicant-facing status message"), element("p", "", record.applicant_status_message)); }

    const review = element("div", "record-review");
    const label = element("label", "", "Decision");
    const select = element("select");
    [["under_review","Under review"],["needs_information","Request information"],["approved","Approve application"],["rejected","Reject application"]].forEach(([value,title]) => {
      const opt = element("option", "", title); opt.value = value; select.appendChild(opt);
    });
    if (record.status === "approved") select.value = "approved";
    label.appendChild(select); review.appendChild(label);
    const messageLabel = element("label", "", "Message shown to applicant");
    const message = element("textarea"); message.rows = 3; message.maxLength = 1000;
    message.placeholder = "Explain the decision or what information is needed.";
    message.value = record.applicant_status_message || "";
    messageLabel.appendChild(message); review.appendChild(messageLabel);
    const noteLabel = element("label", "", "Private admin note (not visible to applicant)");
    const note = element("textarea"); note.rows = 2; note.maxLength = 2000; note.placeholder = "Internal review note (optional)."; note.value = record.admin_notes || "";
    noteLabel.appendChild(note); review.appendChild(noteLabel);
    const actions = element("div", "review-actions");
    const save = element("button", "save-review", "Save decision");
    save.addEventListener("click", async () => {
      try {
        save.disabled = true; status(`Recording review for ${record.application_ref}…`);
        const result = await rpc("review_contributor_application", {
          p_application_id: record.id,
          p_status: select.value,
          p_applicant_message: message.value.trim() || null,
          p_admin_note: note.value.trim() || null
        });
        if (!result?.success || !result.authorized) fail(result?.message || "Review decision was not confirmed.");
        await load(); status(`Saved review for ${record.application_ref}.`);
      } catch (error) { console.error(error); status(error?.message || "Review action failed.", true); }
      finally { save.disabled = false; }
    });
    const isReviewable = ["submitted", "under_review", "needs_information", "approved"].includes(String(record.status || "").toLowerCase());
    if (!isReviewable) {
      select.disabled = true;
      message.disabled = true;
      note.disabled = true;
      save.disabled = true;
      save.title = "This application is no longer open for review decisions.";
    }
    actions.appendChild(save);
    const canIssue = ["approved","invite_issued"].includes(String(record.status || "").toLowerCase());
    if (canIssue && !record.has_active_invitation && record.status !== "onboarded") {
      const issue = element("button", "issue-invitation", "Create one-time invitation");
      issue.addEventListener("click", async () => {
        if (!confirm(`Create an invitation bound to ${record.application_ref} and this applicant’s verified Pi UID?`)) return;
        try {
          issue.disabled = true; status(`Creating application-bound invitation for ${record.application_ref}…`);
          const data = await rpc("create_contributor_invitation_for_application", { p_application_id: record.id, p_expires_in_hours: 168 });
          if (!data?.success || !data?.invitation_token) fail(data?.message || "No one-time token was returned.");
          const link = new URL(ONBOARDING); link.searchParams.set("token", data.invitation_token);
          $("invitationLink").value = link.toString();
          $("invitationExpiry").textContent = data.expires_at ? `Expires ${new Date(data.expires_at).toLocaleString()}` : "Expiration confirmed by database";
          $("invitationPanel").classList.remove("hidden");
          status(`Created one-time invitation for ${record.application_ref}. Copy the link now; it cannot be retrieved again.`);
          await load(); window.scrollTo({ top: $("invitationPanel").getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
        } catch (error) { console.error(error); status(error?.message || "Invitation creation failed.", true); }
        finally { issue.disabled = false; }
      });
      actions.appendChild(issue);
    } else if (record.has_active_invitation) {
      const revoke = element("button", "", "Revoke active invitation");
      revoke.addEventListener("click", async () => {
        if (!record.active_invitation_id) { status("Active invitation ID is unavailable; refresh the queue.", true); return; }
        if (!confirm(`Revoke the active one-time invitation for ${record.application_ref}? The applicant will need a newly issued link.`)) return;
        try {
          revoke.disabled = true;
          const result = await rpc("revoke_contributor_invitation", {
            p_invitation_id: record.active_invitation_id,
            p_revoke_reason: "Reissued from Contributor Applications workspace by Super Admin."
          });
          if (!result?.success || !result.authorized) fail(result?.message || "Invitation revocation was not confirmed.");
          await load(); status(`Revoked the active invitation for ${record.application_ref}. You may now issue a replacement.`);
        } catch (error) { console.error(error); status(error?.message || "Invitation revocation failed.", true); }
        finally { revoke.disabled = false; }
      });
      actions.appendChild(revoke);
      const noteText = element("p", "warning-note", "The raw token cannot be retrieved. Revoke it above before issuing a replacement if the original link was lost.");
      review.appendChild(noteText);
    }
    const msg = element("p", "warning-note", "A rejection requires a clear applicant-facing reason. Internal notes remain private.");
    review.append(actions, msg);
    card.append(main, review);
    return card;
  }
  function render(rows) {
    records = Array.isArray(rows) ? rows : [];
    $("totalCount").textContent = String(records.length);
    $("pendingCount").textContent = String(records.filter((r) => ["submitted","under_review","needs_information"].includes(String(r.status || ""))).length);
    const host = $("applicationRecords"); host.replaceChildren();
    $("emptyState").classList.toggle("hidden", records.length > 0);
    records.forEach((record) => host.appendChild(renderRecord(record)));
  }
  async function load() {
    const data = await rpc("list_contributor_applications");
    if (!data?.success || !data.authorized || String(data.network).toLowerCase() !== "mainnet") fail(data?.message || "Application queue access denied.");
    render(data.records);
  }
  async function init() {
    if (initialized) return;
    try {
      assertMainnet(); const a = auth(); await a.init();
      adminContext = await a.requireAdmin({ redirect: false });
      if (!adminContext) { location.replace(LOGIN); return; }
      await freshAal2();
      $("authorization").textContent = "AUTHORIZED"; $("securityState").textContent = "Authenticated · AAL2"; $("securityLevel").textContent = "AAL2 VERIFIED";
      $("queuePanel").classList.remove("hidden"); await load(); status("Contributor application queue ready."); initialized = true;
    } catch (error) {
      console.error(error); $("authorization").textContent = "DENIED"; $("securityState").textContent = "Security verification failed"; $("securityLevel").textContent = "RESTRICTED";
      $("deniedPanel").classList.remove("hidden"); status(error?.message || "Contributor application authorization failed.", true);
    }
  }
  $("refreshButton").addEventListener("click", async () => { try { $("refreshButton").disabled = true; await load(); status("Application queue refreshed."); } catch (error) { status(error?.message || "Refresh failed.", true); } finally { $("refreshButton").disabled = false; } });
  $("logoutButton").addEventListener("click", async () => { try { await auth().signOut(); } finally { location.replace(LOGIN); } });
  $("clearInvitationButton").addEventListener("click", () => { $("invitationLink").value = ""; $("invitationExpiry").textContent = ""; $("invitationPanel").classList.add("hidden"); });
  $("copyInvitationButton").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("invitationLink").value); status("Invitation link copied. Store it securely and deliver only through a verified channel."); } catch (_) { status("Copy failed. Select and copy the link manually; do not refresh before saving it.", true); } });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})(window, document);
