const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'admin-repo/admin-core-project-workspace.html'), 'utf8');
const script = fs.readFileSync(path.join(ROOT, 'admin-repo/js/admin-core-project-workspace.js'), 'utf8');

function makeClassList(initial = '') {
  const values = new Set(String(initial).split(/\s+/).filter(Boolean));
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); },
    toggle(value, force) {
      const shouldAdd = force === undefined ? !values.has(value) : Boolean(force);
      if (shouldAdd) values.add(value); else values.delete(value);
      return shouldAdd;
    }
  };
}

function parseIds(source) {
  const ids = new Set();
  const regex = /\bid="([^"]+)"/g;
  let match;
  while ((match = regex.exec(source))) ids.add(match[1]);
  return ids;
}

class FakeElement {
  constructor(id = '', attributes = {}) {
    this.id = id;
    this.attributes = attributes;
    this.classList = makeClassList(attributes.class || '');
    this.textContent = '';
    this.className = '';
    this.href = attributes.href || '';
    this.value = '';
    this.disabled = false;
    this.children = [];
    this.listeners = {};
    this.onchange = null;
    this.dataset = {};
    this.dateTime = '';
  }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  querySelector(selector) {
    if (selector === 'h2') return this.heading || (this.heading = new FakeElement(this.id + '-heading'));
    if (selector === 'p') return this.paragraph || (this.paragraph = new FakeElement(this.id + '-paragraph'));
    return null;
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
}

function createScenario({ roles = ['core_admin'], publisherProjectIds = [], apiFailure = false, mainnet = true } = {}) {
  const nodes = new Map();
  const ids = parseIds(html);
  ids.forEach(id => nodes.set(id, new FakeElement(id)));
  const dataRoleNodes = [];
  const roleRegex = /<a\b([^>]*data-required-roles="[^"]+"[^>]*)>/g;
  let roleMatch;
  while ((roleMatch = roleRegex.exec(html))) {
    const attrs = {};
    for (const attr of roleMatch[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[attr[1]] = attr[2];
    const node = new FakeElement('', attrs);
    dataRoleNodes.push(node);
  }
  const project1 = {
    id: '25af782e-d91b-467a-9219-3dd45294aaff',
    project_id: '25af782e-d91b-467a-9219-3dd45294aaff',
    name: 'RAHEEM PHARMACY', project_code: 'RAHEEM-25', project_type: 'core',
    status: 'approved', network: 'mainnet', core_slot: 1,
    treasury: { id: 'treasury-1', status: 'configured', verified_liquidity: 45 },
    staking: { total_term_count: 2, active_stake_count: 1 }
  };
  const project2 = {
    id: '388dfff9-e36a-4f69-b178-2995c83e629b',
    project_id: '388dfff9-e36a-4f69-b178-2995c83e629b',
    name: 'AZMAN FUTURES MAKERS LAB', project_code: 'AZMAN-4080', project_type: 'core',
    status: 'approved', network: 'mainnet', core_slot: 2,
    treasury: { id: 'treasury-2', status: 'configured', verified_liquidity: 0 },
    staking: { total_term_count: 0 }
  };
  const projects = roles.includes('super_admin') ? [project1, project2, ...[3,4,5,6,7].map(slot => ({
    id: `00000000-0000-4000-8000-${String(slot).padStart(12,'0')}`,
    project_id: `00000000-0000-4000-8000-${String(slot).padStart(12,'0')}`,
    name: `CORE ${slot}`, project_code: `CORE-${slot}`, project_type: 'core', status: 'approved', network: 'mainnet', core_slot: slot,
    treasury: {}, staking: {}
  }))] : [project1];

  const calls = { workspace: 0, audit: [], publisher: 0 };
  const client = {
    schema(schemaName) {
      assert.equal(schemaName, 'albukhr_security');
      return {
        async rpc(name, args) {
          if (name === 'get_core_project_workspace') {
            calls.workspace += 1;
            return { data: { authorized: true, network: 'mainnet', scope: roles.includes('super_admin') ? 'all_core_projects' : 'assigned_core_project', projects }, error: null };
          }
          if (name === 'get_core_project_audit_trail') {
            calls.audit.push(args.p_project_id);
            return { data: {
              authorized: true, network: 'mainnet', project_id: args.p_project_id,
              events: [{ id: 1, action: 'approve_core_project', created_at: '2026-11-22T12:00:00Z', actor_id: '68572b6b-22bf-4f4c-bf68-8a1330531047', success: true, details: { project_code: args.p_project_id === project1.id ? 'RAHEEM-25' : 'AZMAN-4080', core_slot: args.p_project_id === project1.id ? 1 : 2, previous_status: 'draft', new_status: 'approved', reason: 'Approved after review.' } }],
              message: 'Mainnet Core Project audit history loaded successfully.'
            }, error: null };
          }
          throw new Error('Unexpected RPC ' + name);
        }
      };
    },
    auth: {
      async getSession() { return { data: { session: { access_token: 'test-supabase-session-token' } }, error: null }; },
      mfa: { async getAuthenticatorAssuranceLevel() { return { data: { currentLevel: 'aal2' }, error: null }; } }
    }
  };
  const windowListeners = {};
  const windowMock = {
    ALBukhrEnvironment: { isKnown: () => true, isMainnet: () => mainnet },
    ALBUKHR_SUPABASE: { network: 'mainnet', client },
    AlbukhrSupabaseAdminAuth: {
      async init() {},
      async requireAdmin() { return { is_admin: true, status: 'active', mfa_required: true, roles }; },
      async ensureMfa() { return { verified: true }; },
      async signOut() {}
    },
    location: { replace(value) { windowMock.redirectedTo = value; } },
    async fetch(url, options) {
      calls.publisher += 1;
      assert.equal(url, 'https://albukhr-api.onrender.com/api/project-updates/publisher-projects');
      assert.equal(options.headers['x-albukhr-auth-provider'], 'supabase-auth');
      assert.equal(options.headers.Authorization, 'Bearer test-supabase-session-token');
      if (apiFailure) return { ok: false, status: 503, async json() { return { success: false, error: 'Publisher service unavailable' }; } };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            success: true, network: 'mainnet',
            data: projects.filter(p => publisherProjectIds.includes(p.id)).map(p => ({
              project_id: p.id, project_type: 'core', status: p.status, network: 'mainnet'
            }))
          };
        }
      };
    }
  };
  const documentMock = {
    readyState: 'loading',
    getElementById(id) { return nodes.get(id) || null; },
    createElement(tag) { return new FakeElement('', { tag }); },
    querySelectorAll(selector) { return selector === '[data-required-roles]' ? dataRoleNodes : []; },
    addEventListener(name, callback) { windowListeners[name] = callback; }
  };
  const context = {
    window: windowMock, document: documentMock,
    console: { error() {}, log() {} },
    Intl, Date, URL, Promise, Number, String, Boolean, Set, Array, Object, Math, Error, encodeURIComponent
  };
  vm.runInNewContext(script, context, { filename: 'admin-core-project-workspace.js' });
  return { nodes, dataRoleNodes, calls, windowMock, windowListeners, project1, project2, documentMock };
}

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 10));
  await Promise.resolve();
}

(async () => {
  // Core Admin: valid publisher grant and own-project audit history.
  {
    const s = createScenario({ roles: ['core_admin'], publisherProjectIds: ['25af782e-d91b-467a-9219-3dd45294aaff'] });
    s.windowListeners.DOMContentLoaded();
    await settle();
    assert.equal(s.nodes.get('workspacePanel').classList.contains('hidden'), false);
    assert.equal(s.nodes.get('updatesState').textContent, 'PUBLISHER ACCESS VERIFIED');
    assert.equal(s.nodes.get('openProjectUpdatesLink').href, 'admin-project-updates.html?project_id=25af782e-d91b-467a-9219-3dd45294aaff');
    assert.equal(s.nodes.get('auditState').textContent, 'AUDIT TRAIL CONNECTED');
    assert.equal(s.nodes.get('auditTrailList').children.length, 1);
    assert.equal(s.nodes.get('withdrawalsState').textContent, 'NOT IMPLEMENTED');
    assert.equal(s.nodes.get('openModerationLink').classList.contains('hidden'), true);
    assert.equal(s.calls.publisher, 1);
    assert.deepEqual(s.calls.audit, ['25af782e-d91b-467a-9219-3dd45294aaff']);
  }

  // No grant: must not display an available publisher link.
  {
    const s = createScenario({ roles: ['core_admin'], publisherProjectIds: [] });
    s.windowListeners.DOMContentLoaded();
    await settle();
    assert.equal(s.nodes.get('updatesState').textContent, 'PUBLISHER GRANT NOT ASSIGNED');
    assert.equal(s.nodes.get('openProjectUpdatesLink').classList.contains('hidden'), true);
  }

  // API failure: do not report access as verified.
  {
    const s = createScenario({ roles: ['core_admin'], apiFailure: true });
    s.windowListeners.DOMContentLoaded();
    await settle();
    assert.equal(s.nodes.get('updatesState').textContent, 'PUBLISHER CHECK UNAVAILABLE');
    assert.equal(s.nodes.get('openProjectUpdatesLink').classList.contains('hidden'), true);
  }

  // Testnet is rejected before any authenticated workspace or publishing call.
  {
    const s = createScenario({ roles: ['core_admin'], mainnet: false });
    s.windowListeners.DOMContentLoaded();
    await settle();
    assert.equal(s.calls.workspace, 0);
    assert.equal(s.calls.publisher, 0);
    assert.equal(s.nodes.get('workspacePanel').classList.contains('hidden'), true);
    assert.equal(s.nodes.get('securityState').textContent, 'Access denied');
  }

  // An unrelated administrator role cannot enter the Core workspace.
  {
    const s = createScenario({ roles: ['finance_admin'] });
    s.windowListeners.DOMContentLoaded();
    await settle();
    assert.equal(s.calls.workspace, 0);
    assert.equal(s.calls.publisher, 0);
    assert.equal(s.nodes.get('workspacePanel').classList.contains('hidden'), true);
  }

  // Super Admin: selected-project switching refreshes scoped audit and publisher state.
  {
    const s = createScenario({ roles: ['super_admin'], publisherProjectIds: ['388dfff9-e36a-4f69-b178-2995c83e629b'] });
    s.windowListeners.DOMContentLoaded();
    await settle();
    const picker = s.nodes.get('projectPicker');
    assert.equal(picker.value, s.project1.id);
    picker.value = s.project2.id;
    picker.onchange();
    await settle();
    assert.equal(s.nodes.get('projectName').textContent, 'AZMAN FUTURES MAKERS LAB');
    assert.equal(s.nodes.get('updatesState').textContent, 'PUBLISHER ACCESS VERIFIED');
    assert.equal(s.nodes.get('openProjectUpdatesLink').href, 'admin-project-updates.html?project_id=' + s.project2.id);
    assert.equal(s.calls.audit.at(-1), s.project2.id);
    assert.equal(s.nodes.get('openModerationLink').classList.contains('hidden'), false);
    assert.equal(s.nodes.get('auditTrailList').children.length, 1);
  }

  console.log('PASS: Core Admin workspace authorization and render');
  console.log('PASS: publisher grant confirmed only through trusted API');
  console.log('PASS: missing publisher grant is not represented as ready');
  console.log('PASS: publisher API failure is fail-closed');
  console.log('PASS: Super Admin project switching reloads project-scoped panels');
  console.log('PASS: Mainnet-only environment guard rejects Testnet');
  console.log('PASS: unrelated administrator role cannot access Core workspace');
  console.log('PASS: Core Treasury withdrawals remain explicitly not implemented');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
