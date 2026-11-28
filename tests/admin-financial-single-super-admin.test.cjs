const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin-security.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'js/admin-security.js'), 'utf8');
const migration = fs.readFileSync(path.resolve(__dirname, '../../albukhr-api/database/migrations/20261128110000_mainnet_financial_control_single_super_admin_fallback_v1.sql'), 'utf8');

test('Admin Security page describes both authorization modes', () => {
  assert.match(html, /single- or dual-Super-Admin authorization/i);
  assert.match(html, /Pending independent approvals/i);
  assert.match(html, /exactly one active Mainnet Super Admin/i);
  assert.match(html, /multiple active Super Admins/i);
});

test('controller consumes live Super Admin mode and count', () => {
  assert.match(js, /active_super_admin_count/);
  assert.match(js, /authorization_mode/);
  assert.match(js, /single_super_admin/);
  assert.match(js, /dual_super_admin/);
  assert.match(js, /\["approved", "pending_second_approval"\]\.includes\(result\.status\)/);
});

test('single-admin flow shows atomic approval and dual flow remains pending', () => {
  assert.match(js, /Role change approved and recorded by the sole active Mainnet Super Admin/);
  assert.match(js, /awaiting a distinct active AAL2 Super Admin/);
  assert.match(js, /result\.authorization_mode === "dual_super_admin"/);
});

test('controller preserves Mainnet, active-admin, AAL2 and no-self-assignment guards', () => {
  assert.match(js, /env\.isMainnet\(\)/);
  assert.match(js, /currentLevel !== "aal2"/);
  assert.match(js, /preliminary\.mfa_required !== true/);
  assert.match(js, /targetUserId === \(workspaceData && workspaceData\.viewer_user_id\)/);
  assert.match(js, /schema\("albukhr_security"\)\.rpc/);
  assert.doesNotMatch(js, /service[_-]?role|SUPABASE_SERVICE_ROLE_KEY/i);
});

test('migration makes mode explicit and keeps distinct second approval for multi-admin state', () => {
  assert.match(migration, /authorization_mode IN \('single_super_admin','dual_super_admin'\)/);
  assert.match(migration, /v_active_super_admin_count = 1/);
  assert.match(migration, /v_authorization_mode := 'dual_super_admin'/);
  assert.match(migration, /approved_by <> requested_by/);
  assert.match(migration, /approved_by <> target_user_id/);
  assert.match(migration, /v_request\.authorization_mode <> 'dual_super_admin'/);
});

test('migration binds the target to active Admin plus mandatory MFA and Mainnet scope', () => {
  assert.match(migration, /au\.status::text = 'active'/);
  assert.match(migration, /au\.mfa_required = true/);
  assert.match(migration, /lower\(btrim\(p\.network\)\) = 'mainnet'/);
  assert.match(migration, /length\(btrim\(coalesce\(p_reason,''\)\)\) < 10/);
});

test('migration maintains SECURITY DEFINER and fixed empty search_path for trusted RPCs', () => {
  const functions = ['request_financial_control_role_change', 'approve_financial_control_role_change', 'reject_financial_control_role_change', 'get_financial_control_role_workspace'];
  for (const name of functions) {
    const start = migration.indexOf(`FUNCTION albukhr_security.${name}`);
    assert.notEqual(start, -1, `${name} definition exists`);
    const section = migration.slice(start, start + 1200);
    assert.match(section, /SECURITY DEFINER/);
    assert.match(section, /SET search_path = ''/);
  }
});
