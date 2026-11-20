"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const WORKSPACE_SOURCE = fs.readFileSync(
  path.join(__dirname, "../js/admin-core-project-workspace.js"),
  "utf8"
);

class MockElement {
  constructor(id) {
    this.id = id;
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.children = [];
    this.listeners = Object.create(null);
    this._classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this._classes.add(name)),
      remove: (...names) => names.forEach((name) => this._classes.delete(name)),
      contains: (name) => this._classes.has(name),
      toggle: (name, force) => {
        const shouldAdd = force === undefined ? !this._classes.has(name) : Boolean(force);
        if (shouldAdd) this._classes.add(name);
        else this._classes.delete(name);
        return shouldAdd;
      }
    };
  }

  addEventListener(type, callback) {
    this.listeners[type] = callback;
  }

  querySelector(selector) {
    if (selector === "h2" || selector === "p") {
      if (!this.descendants) this.descendants = Object.create(null);
      if (!this.descendants[selector]) this.descendants[selector] = new MockElement(`${this.id}-${selector}`);
      return this.descendants[selector];
    }
    return null;
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

function makeProject(slot, overrides = {}) {
  return {
    id: `project-${slot}`,
    project_id: `project-${slot}`,
    project_code: `CORE-${slot}`,
    name: `Core Project ${slot}`,
    network: "mainnet",
    project_type: "core",
    core_slot: slot,
    status: "active",
    treasury: { id: null, status: "not_configured", verified_liquidity: null },
    staking: { total_term_count: 0 },
    ...overrides
  };
}

function makePayload(role, projects) {
  return {
    authorized: true,
    network: "mainnet",
    scope: role === "super_admin" ? "all_core_projects" : "assigned_core_project",
    projects,
    message: "Workspace loaded"
  };
}

function createHarness(options = {}) {
  const ids = [
    "pageStatus", "deniedPanel", "workspacePanel", "roleValue", "scopeValue",
    "securityState", "mfaValue", "projectPickerWrap", "projectPicker",
    "projectName", "projectMeta", "projectStatus", "coreSlot",
    "verifiedLiquidity", "treasuryStatus", "overviewState", "treasuryState",
    "stakingState", "updatesState", "withdrawalsState", "auditState",
    "refreshButton", "logoutButton"
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new MockElement(id)]));
  elements.workspacePanel.classList.add("hidden");
  elements.deniedPanel.classList.add("hidden");
  elements.projectPickerWrap.classList.add("hidden");

  const rpcCalls = [];
  const navigation = [];
  const authCalls = [];
  const unexpectedDatabaseMethods = [];
  let rpcIndex = 0;
  const rpcResponses = options.rpcResponses || [
    { data: makePayload(options.role || "core_admin", [makeProject(options.slot || 1)]), error: null }
  ];

  const client = {
    schema(schemaName) {
      assert.equal(schemaName, "albukhr_security");
      return {
        async rpc(functionName) {
          rpcCalls.push(functionName);
          const response = rpcResponses[Math.min(rpcIndex, rpcResponses.length - 1)];
          rpcIndex += 1;
          if (typeof response === "function") return response();
          return response;
        }
      };
    },
    auth: {
      mfa: {
        async getAuthenticatorAssuranceLevel() {
          authCalls.push("getAuthenticatorAssuranceLevel");
          return {
            data: { currentLevel: options.assuranceLevel || "aal2" },
            error: null
          };
        }
      }
    }
  };

  // Any unexpected persistence method fails loudly instead of silently simulating a write.
  ["from", "insert", "update", "upsert", "delete", "rpcWrite"].forEach((method) => {
    client[method] = (...args) => {
      unexpectedDatabaseMethods.push({ method, args });
      throw new Error(`Unexpected database method: ${method}`);
    };
  });

  const role = options.role || "core_admin";
  const adminContext = options.adminContext === null ? null : {
    is_admin: options.isAdmin !== false,
    status: options.adminStatus || "active",
    roles: options.roles || [role],
    mfa_required: false
  };
  const adminAuth = {
    async init() { authCalls.push("init"); },
    async requireAdmin() {
      authCalls.push("requireAdmin");
      return adminContext;
    },
    async ensureMfa() {
      authCalls.push("ensureMfa");
      return { verified: true };
    },
    async signOut() { authCalls.push("signOut"); }
  };

  const document = {
    readyState: "complete",
    getElementById(id) { return elements[id] || null; },
    createElement(tag) { return new MockElement(tag); },
    addEventListener() {}
  };
  const window = {
    ALBukhrEnvironment: options.environment === false ? null : {
      isKnown: () => options.knownEnvironment !== false,
      isMainnet: () => options.mainnet !== false
    },
    ALBUKHR_SUPABASE: { client },
    AlbukhrSupabaseAdminAuth: adminAuth,
    location: { replace(url) { navigation.push(url); } }
  };
  const sandbox = {
    window,
    document,
    console: { error() {}, warn() {}, log() {} }
  };

  vm.runInNewContext(WORKSPACE_SOURCE, sandbox, {
    filename: "js/admin-core-project-workspace.js",
    timeout: 1000
  });

  return {
    elements,
    rpcCalls,
    navigation,
    authCalls,
    unexpectedDatabaseMethods,
    async settle() {
      // Let the initialization/load promise chain finish without exposing internals.
      for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve));
    }
  };
}

test("Core Admin receives and renders exactly one assigned Mainnet Core Project", async () => {
  const h = createHarness({ role: "core_admin", slot: 4 });
  await h.settle();

  assert.deepEqual(h.rpcCalls, ["get_core_project_workspace"]);
  assert.equal(h.elements.projectName.textContent, "Core Project 4");
  assert.equal(h.elements.coreSlot.textContent, "4");
  assert.equal(h.elements.scopeValue.textContent, "ASSIGNED PROJECT ONLY");
  assert.equal(h.elements.workspacePanel.classList.contains("hidden"), false);
  assert.equal(h.elements.projectPickerWrap.classList.contains("hidden"), true);
  assert.deepEqual(h.unexpectedDatabaseMethods, []);
});

test("Super Admin receives all seven Mainnet Core Projects and a project picker", async () => {
  const projects = Array.from({ length: 7 }, (_, index) => makeProject(index + 1));
  const h = createHarness({
    role: "super_admin",
    rpcResponses: [{ data: makePayload("super_admin", projects), error: null }]
  });
  await h.settle();

  assert.deepEqual(h.rpcCalls, ["get_core_project_workspace"]);
  assert.equal(h.elements.scopeValue.textContent, "ALL 7 CORE PROJECTS");
  assert.equal(h.elements.projectPickerWrap.classList.contains("hidden"), false);
  assert.equal(h.elements.projectPicker.children.length, 7);
  assert.equal(h.elements.projectName.textContent, "Core Project 1");
});

test("a non-Mainnet environment is denied before any Supabase request", async () => {
  const h = createHarness({ mainnet: false });
  await h.settle();

  assert.deepEqual(h.rpcCalls, []);
  assert.equal(h.elements.workspacePanel.classList.contains("hidden"), true);
  assert.equal(h.elements.deniedPanel.classList.contains("hidden"), false);
  assert.match(h.elements.pageStatus.textContent, /Mainnet/i);
});

test("an unknown environment is denied before any Supabase request", async () => {
  const h = createHarness({ knownEnvironment: false });
  await h.settle();

  assert.deepEqual(h.rpcCalls, []);
  assert.equal(h.elements.workspacePanel.classList.contains("hidden"), true);
  assert.equal(h.elements.deniedPanel.classList.contains("hidden"), false);
});

test("a missing admin session redirects to the Admin login page", async () => {
  const h = createHarness({ adminContext: null });
  await h.settle();

  assert.deepEqual(h.navigation, ["admin-login.html"]);
  assert.deepEqual(h.rpcCalls, []);
});

test("an inactive admin account is denied before the workspace RPC", async () => {
  const h = createHarness({ adminStatus: "suspended" });
  await h.settle();

  assert.deepEqual(h.rpcCalls, []);
  assert.equal(h.elements.workspacePanel.classList.contains("hidden"), true);
  assert.equal(h.elements.deniedPanel.classList.contains("hidden"), false);
});

test("AAL1 assurance redirects to MFA and does not call the workspace RPC", async () => {
  const h = createHarness({ assuranceLevel: "aal1" });
  await h.settle();

  assert.deepEqual(h.navigation, ["admin-mfa.html"]);
  assert.deepEqual(h.rpcCalls, []);
});

test("an administrator without Core Admin or Super Admin role is denied", async () => {
  const h = createHarness({ roles: ["finance_admin"] });
  await h.settle();

  assert.deepEqual(h.rpcCalls, []);
  assert.equal(h.elements.workspacePanel.classList.contains("hidden"), true);
  assert.equal(h.elements.deniedPanel.classList.contains("hidden"), false);
});

test("a Core Admin response containing more than one project is rejected", async () => {
  const h = createHarness({
    role: "core_admin",
    rpcResponses: [{ data: makePayload("core_admin", [makeProject(1), makeProject(2)]), error: null }]
  });
  await h.settle();

  assert.deepEqual(h.rpcCalls, ["get_core_project_workspace"]);
  assert.equal(h.elements.workspacePanel.classList.contains("hidden"), true);
  assert.equal(h.elements.deniedPanel.classList.contains("hidden"), false);
  assert.match(h.elements.pageStatus.textContent, /exactly one/i);
});

test("a Super Admin response with fewer than seven projects is rejected", async () => {
  const h = createHarness({
    role: "super_admin",
    rpcResponses: [{ data: makePayload("super_admin", [makeProject(1)]), error: null }]
  });
  await h.settle();

  assert.equal(h.elements.workspacePanel.classList.contains("hidden"), true);
  assert.equal(h.elements.deniedPanel.classList.contains("hidden"), false);
  assert.match(h.elements.pageStatus.textContent, /seven-project/i);
});

test("a project returned from Testnet or with a non-Core type is rejected", async (t) => {
  for (const invalidProject of [
    makeProject(1, { network: "testnet" }),
    makeProject(1, { project_type: "external" }),
    makeProject(8, { core_slot: 8 })
  ]) {
    await t.test(JSON.stringify({ network: invalidProject.network, type: invalidProject.project_type, slot: invalidProject.core_slot }), async () => {
      const h = createHarness({
        rpcResponses: [{ data: makePayload("core_admin", [invalidProject]), error: null }]
      });
      await h.settle();
      assert.equal(h.elements.workspacePanel.classList.contains("hidden"), true);
      assert.equal(h.elements.deniedPanel.classList.contains("hidden"), false);
    });
  }
});

test("an RPC authorization denial does not reveal workspace data", async () => {
  const h = createHarness({
    rpcResponses: [{
      data: { authorized: false, network: "mainnet", projects: [], message: "AAL2 required" },
      error: null
    }]
  });
  await h.settle();

  assert.equal(h.elements.workspacePanel.classList.contains("hidden"), true);
  assert.equal(h.elements.deniedPanel.classList.contains("hidden"), false);
  assert.equal(h.elements.roleValue.textContent, "DENIED");
  assert.equal(h.elements.scopeValue.textContent, "NONE");
});

test("a failed refresh hides previously rendered project data", async () => {
  const h = createHarness({
    rpcResponses: [
      { data: makePayload("core_admin", [makeProject(3)]), error: null },
      { data: null, error: new Error("simulated refresh failure") }
    ]
  });
  await h.settle();

  assert.equal(h.elements.workspacePanel.classList.contains("hidden"), false);
  assert.equal(typeof h.elements.refreshButton.listeners.click, "function");
  await h.elements.refreshButton.listeners.click();
  await h.settle();

  assert.equal(h.elements.workspacePanel.classList.contains("hidden"), true);
  assert.equal(h.elements.deniedPanel.classList.contains("hidden"), false);
  assert.match(h.elements.pageStatus.textContent, /simulated refresh failure/i);
  assert.deepEqual(h.rpcCalls, ["get_core_project_workspace", "get_core_project_workspace"]);
});

test("workspace page performs no direct database or financial writes", async () => {
  const h = createHarness();
  await h.settle();

  assert.deepEqual(h.rpcCalls, ["get_core_project_workspace"]);
  assert.deepEqual(h.unexpectedDatabaseMethods, []);
  assert.doesNotMatch(WORKSPACE_SOURCE, /\.(?:insert|update|upsert|delete)\s*\(/i);
  assert.doesNotMatch(WORKSPACE_SOURCE, /\b(?:createPayment|sendPayment|withdrawFunds|transferFunds)\s*\(/i);
});
