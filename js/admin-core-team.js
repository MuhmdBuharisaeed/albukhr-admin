(function (window, document) {
"use strict";

const A = () => window.AlbukhrSupabaseAdminAuth;
const $ = (id) => document.getElementById(id);

const MAINNET_INVITATION_EXPIRY_HOURS = 168;
const CORE_SLOT_COUNT = 7;

let admin = null;
let activeMembers = [];

function client() {
  const c = window.ALBUKHR_SUPABASE?.client;
  if (!c) throw new Error("ALBUKHR Supabase Core is unavailable.");
  return c;
}

function status(message, isError) {
  const node = $("pageStatus");
  node.textContent = message || "";
  node.className = "status" + (isError ? " error" : "");
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function isSuperAdmin() {
  return Array.isArray(admin?.roles) && admin.roles.includes("super_admin");
}

function setBusy(busy) {
  const button = $("inviteButton");
  button.disabled = !!busy;
  button.textContent = busy
    ? "Creating..."
    : "Create Core Team Invitation";
}

function showAuthorized() {
  $("deniedPanel").classList.add("hidden");
  $("corePanel").classList.remove("hidden");
  $("recordsPanel").classList.remove("hidden");
  $("authorization").textContent = "AUTHORIZED";
  $("securityLevel").textContent = "AAL2 VERIFIED";
}

function showDenied() {
  $("authorization").textContent = "DENIED";
  $("securityLevel").textContent = "RESTRICTED";
  $("deniedPanel").classList.remove("hidden");
  $("corePanel").classList.add("hidden");
  $("tokenPanel").classList.add("hidden");
  $("recordsPanel").classList.add("hidden");
}

function activeBinding(member) {
  return member?.active === true && !member?.revoked_at;
}

function memberLabel(member) {
  const email = String(member?.email_snapshot || "").trim();
  return email || "Email unavailable";
}

function renderMembers(rows) {
  const list = $("invitationList");
  const empty = $("emptyState");

  activeMembers = (Array.isArray(rows) ? rows : [])
    .filter(activeBinding)
    .sort((a, b) => Number(a.core_slot) - Number(b.core_slot));

  $("memberCount").textContent =
    activeMembers.length + " / " + CORE_SLOT_COUNT;

  list.innerHTML = "";

  if (!activeMembers.length) {
    empty.classList.remove("hidden");
    updateSlotOptions();
    return;
  }

  empty.classList.add("hidden");

  activeMembers.forEach((member) => {
    const item = document.createElement("article");
    item.className = "record";

    const slot = Number(member.core_slot);
    const email = escapeHtml(memberLabel(member));

    item.innerHTML =
      '<div class="record-main">' +
        "<b>" + email + "</b>" +
        "<small>Core Slot " + escapeHtml(slot) + "</small>" +
      "</div>" +
      '<span class="record-status">ACTIVE</span>';

    list.appendChild(item);
  });

  updateSlotOptions();
}

function updateSlotOptions() {
  const select = $("coreSlot");
  if (!select) return;

  const occupied = new Set(
    activeMembers
      .map((member) => Number(member.core_slot))
      .filter((slot) => Number.isInteger(slot))
  );

  Array.from(select.options).forEach((option) => {
    if (!option.value) return;

    const slot = Number(option.value);
    const isOccupied = occupied.has(slot);

    option.disabled = isOccupied;
    option.textContent = isOccupied
      ? "Core Slot " + slot + " — Occupied"
      : "Core Slot " + slot;
  });

  if (select.value && occupied.has(Number(select.value))) {
    select.value = "";
  }
}

async function loadMembers() {
  if (!isSuperAdmin()) {
    throw new Error("Only Super Admin can manage Core Team.");
  }

  status("Loading server-authoritative Core Team records...");

  const { data: bindings, error: bindingError } = await client()
    .schema("albukhr_security")
    .from("core_admin_bindings")
    .select("user_id, core_slot, core_project_id, active, revoked_at")
    .eq("active", true)
    .is("revoked_at", null)
    .order("core_slot", { ascending: true });

  if (bindingError) throw bindingError;

  const safeBindings = Array.isArray(bindings) ? bindings : [];
  const userIds = [
    ...new Set(
      safeBindings
        .map((binding) => binding.user_id)
        .filter(Boolean)
    )
  ];

  let usersById = new Map();

  if (userIds.length) {
    const { data: users, error: userError } = await client()
      .schema("albukhr_security")
      .from("admin_users")
      .select("user_id, email_snapshot, status")
      .in("user_id", userIds);

    if (userError) throw userError;

    usersById = new Map(
      (Array.isArray(users) ? users : [])
        .map((user) => [user.user_id, user])
    );
  }

  const rows = safeBindings.map((binding) => {
    const user = usersById.get(binding.user_id);

    return {
      user_id: binding.user_id,
      core_slot: binding.core_slot,
      core_project_id: binding.core_project_id,
      active: binding.active,
      revoked_at: binding.revoked_at,
      email_snapshot: user?.email_snapshot || null
    };
  });

  renderMembers(rows);
  status("Core Team records loaded.");
}

function showInvitationToken(token) {
  const normalized = String(token || "").trim();

  if (!normalized) {
    throw new Error(
      "The server created the invitation but did not return a usable one-time token."
    );
  }

  $("invitationToken").value = normalized;
  $("tokenPanel").classList.remove("hidden");
}

async function copyInvitationToken() {
  const token = $("invitationToken").value;

  if (!token) {
    throw new Error("No invitation token is available to copy.");
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(token);
  } else {
    const input = $("invitationToken");
    input.focus();
    input.select();

    const copied = document.execCommand("copy");
    input.setSelectionRange(0, 0);

    if (!copied) {
      throw new Error("Unable to copy the invitation token.");
    }
  }

  status("Invitation token copied. Deliver it only through a secure channel.");
}

async function createInvitation(event) {
  event.preventDefault();

  try {
    if (!isSuperAdmin()) {
      throw new Error(
        "Only Super Admin can create a Core Team invitation."
      );
    }

    const email = $("inviteEmail").value
      .trim()
      .toLowerCase();

    const slot = Number($("coreSlot").value);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Enter a valid email.");
    }

    if (
      !Number.isInteger(slot) ||
      slot < 1 ||
      slot > CORE_SLOT_COUNT
    ) {
      throw new Error("Select Core Slot 1 to 7.");
    }

    if (
      activeMembers.some(
        (member) => Number(member.core_slot) === slot
      )
    ) {
      throw new Error(
        "Core Slot " + slot + " already has an active member."
      );
    }

    setBusy(true);
    $("tokenPanel").classList.add("hidden");
    $("invitationToken").value = "";

    status("Creating secure Core Team invitation...");

    const { data, error } = await client()
      .schema("albukhr_security")
      .rpc("create_project_invitation", {
        p_project_type: "core",
        p_invited_email: email,
        p_expires_in_hours: MAINNET_INVITATION_EXPIRY_HOURS,
        p_core_slot: slot
      });

    if (error) throw error;

    if (data?.success === false) {
      throw new Error(
        data.message || "Core Team invitation was denied."
      );
    }

    showInvitationToken(data?.invitation_token);

    $("inviteForm").reset();

    await loadMembers();

    status(
      "Core Team invitation created. The one-time token must now be delivered securely."
    );
  } catch (error) {
    console.error("[ALBUKHR CORE TEAM]", error);

    status(
      error?.message || "Core Team invitation failed.",
      true
    );
  } finally {
    setBusy(false);
  }
}

async function initialize() {
  try {
    if (
      !A() ||
      !window.ALBukhrEnvironment?.isMainnet()
    ) {
      throw new Error(
        "Core Team is available only on ALBUKHR MAINNET."
      );
    }

    await A().init();

    admin = await A().requireAdmin({ redirect: false });

    if (!admin) {
      location.replace("admin-login.html");
      return;
    }

    const mfa = await A().ensureMfa();

    if (admin.mfa_required && !mfa?.verified) {
      location.replace("admin-mfa.html");
      return;
    }

    $("securityState").textContent =
      mfa?.verified
        ? "Authenticated • AAL2"
        : "Authenticated";

    if (!isSuperAdmin()) {
      showDenied();
      status("Core Team management requires Super Admin.");
      return;
    }

    showAuthorized();
    await loadMembers();
  } catch (error) {
    console.error("[ALBUKHR CORE TEAM]", error);

    status(
      error?.message || "Core Team authorization failed.",
      true
    );
  }
}

$("inviteForm").addEventListener("submit", createInvitation);

$("refreshButton").addEventListener("click", () => {
  loadMembers().catch((error) => {
    status(error?.message || "Refresh failed.", true);
  });
});

$("copyTokenButton").addEventListener("click", () => {
  copyInvitationToken().catch((error) => {
    status(error?.message || "Copy failed.", true);
  });
});

$("logoutButton").addEventListener("click", async () => {
  try {
    await A()?.signOut();
  } finally {
    location.replace("admin-login.html");
  }
});

initialize();

})(window, document);
