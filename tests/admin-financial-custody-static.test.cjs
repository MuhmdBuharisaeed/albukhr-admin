const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('admin-financial-custody.html');
const js = read('js/admin-financial-custody.js');
const css = read('css/admin-financial-custody.css');
const dashboard = read('admin-dashboard.html');
const securityPage = read('admin-security.html');
const migration = fs.readFileSync(path.resolve(root, '../albukhr-api/database/migrations/20261128192737_mainnet_global_custody_project_admin_workspace_v1.sql'), 'utf8');
const indexMigration = fs.readFileSync(path.resolve(root, '../albukhr-api/database/migrations/20261128193434_mainnet_financial_control_foreign_key_indexes_v1.sql'), 'utf8');

// Required shared Mainnet security components and page navigation.
assert.match(html, /js\/core\/environment-core\.js/);
assert.match(html, /js\/core\/supabase-core\.js/);
assert.match(html, /js\/core\/supabase-admin-auth\.js/);
assert.match(html, /admin-financial-custody\.js/);
assert.match(html, /admin-financial-custody\.css/);
assert.match(dashboard, /admin-financial-custody\.html/);
assert.match(securityPage, /admin-financial-custody\.html/);

// All static DOM IDs referenced in JS must exist in the page.
const staticIds = [...js.matchAll(/\$\("([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]);
for (const id of new Set(staticIds)) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Missing static page element #${id}`);
}

// Mainnet/AAL2 only, with no local table, browser storage, or secret-key access.
assert.match(js, /isMainnet\(\)/);
assert.match(js, /currentLevel !== "aal2"/);
assert.match(js, /schema\("albukhr_security"\)\.rpc/);
assert.doesNotMatch(js, /localStorage|sessionStorage/);
assert.doesNotMatch(js, /\.from\s*\(/);
assert.doesNotMatch(js, /service_role|sb_secret_|service[_-]?key/i);
assert.doesNotMatch(js, /createPayment|sendPayment|A2U/i);

// The browser only calls the approved RPC boundary.
for (const name of [
  'get_financial_custody_project_directory',
  'get_financial_custody_project_workspace',
  'submit_financial_custody_account',
  'submit_financial_custody_evidence',
  'record_financial_custody_balance_snapshot',
  'review_financial_custody_evidence',
  'review_financial_custody_balance_snapshot',
  'verify_financial_custody_account',
  'link_external_project_custody_account_by_finance'
]) {
  assert.ok(js.includes(`"${name}"`) || js.includes(`: "${name}"`), `Missing UI RPC ${name}`);
}

// Database read access is project-filtered and authenticated via AAL2.
assert.match(migration, /CREATE OR REPLACE FUNCTION albukhr_security\.get_financial_custody_project_directory/);
assert.match(migration, /CREATE OR REPLACE FUNCTION albukhr_security\.get_financial_custody_project_workspace/);
assert.match(migration, /auth\.jwt\(\)->>'aal'.*aal2/s);
assert.match(migration, /lower\(pg_catalog\.btrim\(p\.network\)\) = 'mainnet'/);
assert.match(migration, /p\.id = p_project_id/);
assert.match(migration, /financial_custody_account_is_verified/);
assert.match(migration, /latest_snapshot/);
assert.match(migration, /external_project_global_custody_readiness/);

// Project Finance role linking is re-authorized against the exact converted project binding.
assert.match(migration, /link_external_project_custody_account_by_finance/);
assert.match(migration, /external_project_custody_profile_project_binding\(v_profile\.id\)/);
assert.match(migration, /require_financial_custody_role\(\s*'finance_treasury',v_profile\.project_id/s);
assert.match(migration, /financial_custody_account_is_verified\(\s*v_account\.id,v_profile\.project_id/s);
assert.match(migration, /external_application_log/);

// No direct grants to the protected custody tables; new RPCs are authenticated-only.
assert.match(migration, /REVOKE ALL ON FUNCTION albukhr_security\.get_financial_custody_project_directory\(\) FROM PUBLIC, anon, service_role/);
assert.match(migration, /REVOKE ALL ON FUNCTION albukhr_security\.get_financial_custody_project_workspace\(uuid\) FROM PUBLIC, anon, service_role/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION albukhr_security\.get_financial_custody_project_workspace\(uuid\) TO authenticated/);
assert.doesNotMatch(migration, /GRANT .* ON TABLE albukhr_security\.financial_custody_/i);

// Interface describes the custody evidence workflow without enabling PI movement.
for (const phrase of ['Register a custody account', 'Evidence register', 'balance snapshot', 'Final Governance verification', 'External Project custody linking', 'does not move PI']) {
  assert.ok(html.includes(phrase) || js.includes(phrase), `Missing workflow phrase: ${phrase}`);
}
assert.ok(css.length > 3000, 'Custody workspace styling should be complete.');


// Financial-control FK indexes were added after the project-wide performance review.
for (const name of [
  'financial_control_events_actor_fk_idx',
  'financial_control_requests_target_grant_fk_idx',
  'financial_control_requests_approved_by_fk_idx',
  'financial_control_requests_project_fk_idx',
  'financial_control_requests_rejected_by_fk_idx',
  'financial_control_requests_requested_by_fk_idx',
  'financial_control_requests_role_code_fk_idx',
  'financial_control_grants_approved_by_fk_idx',
  'financial_control_grants_project_fk_idx',
  'financial_control_grants_requested_by_fk_idx',
  'financial_control_grants_role_code_fk_idx',
  'financial_control_revocations_approved_by_fk_idx',
  'financial_control_revocations_project_fk_idx',
  'financial_control_revocations_requested_by_fk_idx',
  'financial_control_revocations_role_code_fk_idx',
  'financial_control_revocations_target_fk_idx'
]) assert.ok(indexMigration.includes(name), `Missing FK index ${name}`);

console.log('PASS: Global Custody Admin Workspace static integration checks.');
console.log('NOTE: These checks do not exercise authenticated browser sessions or perform live custody writes.');
