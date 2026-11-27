const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

const managerHtml = read('admin-invitations.html');
const acceptanceHtml = read('admin-invitation-accept.html');
const managerJs = read('js/admin-invitations.js');
const acceptanceJs = read('js/admin-invitation-accept.js');
const validatorEdge = read('supabase/functions/admin-invitation-validator/index.ts');
const dashboardJs = read('js/admin-dashboard.js');
const migration1 = read('sql/01_admin_invitation_revocation_reason_hardening.sql');
const migration2 = read('sql/02_admin_invitation_rpcs_and_context_v2.sql');
const verifySql = read('sql/03_admin_invitation_post_apply_verification.sql');
const edgeFunction = read('supabase/functions/admin-invitation-validator/index.ts');

// Every HTML asset introduced by this package must resolve to a shipped file.
for (const html of [managerHtml, acceptanceHtml]) {
  const refs = [...html.matchAll(/(?:src|href)="(js|css)\/([^\"]+)"/g)].map(m => `${m[1]}/${m[2]}`);
  for (const ref of refs) {
    if (ref.startsWith('js/core/')) continue; // existing shared Admin/Auth core is intentionally reused
    if (ref === 'css/admin-module.css') { assert.ok(exists('REFERENCE_ONLY/css/admin-module.css'), 'Missing reference copy of existing shared CSS'); continue; }
    assert.ok(exists(ref), `Missing HTML asset: ${ref}`);
  }
}

// Preserve the existing Mainnet-only and shared-auth boundaries.
assert.match(managerHtml, /js\/core\/supabase-admin-auth\.js/);
assert.match(acceptanceHtml, /js\/core\/invitation-auth\.js/);
assert.match(managerJs, /requireSuperAdmin/);
assert.match(managerJs, /getAuthenticatorAssuranceLevel/);
// Invitation validity is restricted to 30, 60, or 90 days in both client and SQL.
assert.match(managerHtml, /value="720" selected>30 days/);
assert.match(managerHtml, /value="1440">60 days/);
assert.match(managerHtml, /value="2160">90 days/);
assert.doesNotMatch(managerHtml, /24 hours|72 hours|7 days/);
assert.match(managerJs, /\[720,1440,2160\]\.includes\(hours\)/);
assert.ok(managerJs.includes('$("expiresHours").value="720"'));
assert.match(migration2, /p_expires_in_hours integer DEFAULT 720/);
assert.match(migration2, /p_expires_in_hours NOT IN \(720, 1440, 2160\)/);
assert.match(migration2, /30, 60, or 90 days/);
assert.match(managerJs, /currentLevel[^\n]{0,30}aal2/);
assert.match(acceptanceJs, /validate_admin_invitation_by_id/);
assert.match(acceptanceJs, /functions\.invoke\(\"admin-invitation-validator\"/);
assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(edgeFunction, /SUPABASE_SECRET_KEYS/);
assert.match(edgeFunction, /validate_admin_invitation/);
assert.match(edgeFunction, /https:\/\/admin\.albukhr\.com/);
assert.match(edgeFunction, /Cache-Control/);
// Legacy service_role is JWT-based; new sb_secret is opaque and must be apikey-only.
assert.match(edgeFunction, /if \(legacyServiceRole\)[\s\S]*?\"Authorization\": `Bearer \$\{legacyServiceRole\}`/);
assert.match(edgeFunction, /return secretKey \? \{ \"apikey\": secretKey \} : null/);
assert.doesNotMatch(edgeFunction, /console\.(?:log|error)\([^)]*token/i);
assert.match(migration2, /email_confirmed_at/); // confirmed email is checked in the database
assert.match(acceptanceJs, /getAuthenticatorAssuranceLevel/);
assert.match(acceptanceJs, /accept_admin_invitation/);

// Client code may call only the RPC boundary; it must not read/write private tables.
for (const js of [managerJs, acceptanceJs]) {
  assert.doesNotMatch(js, /localStorage|sessionStorage/);
  assert.doesNotMatch(js, /service_role|sb_secret_|service[_-]?key/i);
  assert.doesNotMatch(js, /\.from\s*\(\s*["']admin_invitations["']/);
}
for (const rpc of [
  'create_admin_invitation', 'list_admin_invitations', 'revoke_admin_invitation',
  'validate_admin_invitation', 'validate_admin_invitation_by_id', 'accept_admin_invitation'
]) assert.ok(migration2.includes(`FUNCTION albukhr_security.${rpc}`), `Missing SQL RPC ${rpc}`);

// Role catalogue must be narrowly allowlisted; no generic super/core/scoped role.
assert.match(managerJs, /registry_admin/);
assert.match(managerJs, /approval_admin/);
assert.match(managerJs, /finance_admin/);
assert.doesNotMatch(managerJs, /super_admin\s*[,\]]|core_admin|internal_admin|external_admin|contributor_admin/);
assert.match(migration2, /v_invitation\.role_code NOT IN \('registry_admin', 'approval_admin', 'finance_admin'\)/);
assert.match(migration2, /financial_control_entitlements_granted', false/);

// Dashboard link is restricted to Super Admin; old pages and auth core are not rewritten.
assert.match(dashboardJs, /\["Admin Invitations"[\s\S]*?\["super_admin"\]/);
assert.match(dashboardJs, /get_my_admin_context|requireAdmin/);
assert.doesNotMatch(migration2, /CREATE OR REPLACE FUNCTION albukhr_security\.get_my_admin_context\(\)/i);
assert.doesNotMatch(migration2, /ALTER TYPE albukhr_security\.admin_role/i);
assert.doesNotMatch(migration2, /CREATE UNIQUE INDEX[^;]*admin_role_assignments/i);
assert.doesNotMatch(migration1 + migration2, /DROP TABLE|TRUNCATE\s+TABLE/i);

// Revocation reason must be captured distinctly, and appointment events remain append-only.
assert.match(migration1, /revocation_reason/);
assert.match(migration1, /v_event_reason := NEW\.revocation_reason/);
assert.match(migration2, /REVOKE ALL ON FUNCTION/);
assert.match(migration2, /GRANT EXECUTE ON FUNCTION albukhr_security\.validate_admin_invitation\(text\) TO service_role/);
assert.doesNotMatch(migration2, /GRANT EXECUTE ON FUNCTION albukhr_security\.validate_admin_invitation\(text\) TO anon/);
assert.match(verifySql, /^--[\s\S]*SELECT|^WITH/m);

assert.match(validatorEdge, /async function readBodyLimited\(request: Request\)/, 'Edge Function must read request bodies incrementally');
assert.match(validatorEdge, /request\.body\.getReader\(\)/, 'Edge Function must use a bounded stream reader');
assert.match(validatorEdge, /totalBytes > MAX_BODY_BYTES/, 'Edge Function must stop reading after the body limit');
assert.match(validatorEdge, /await reader\.cancel\(\)/, 'Edge Function must cancel oversized request streams');
assert.doesNotMatch(validatorEdge, /await request\.text\(\)/, 'Edge Function must not buffer unbounded request bodies');

console.log('PASS: Admin invitation static integration checks.');
console.log('NOTE: These checks do not compile or execute PostgreSQL/PLpgSQL migrations.');
