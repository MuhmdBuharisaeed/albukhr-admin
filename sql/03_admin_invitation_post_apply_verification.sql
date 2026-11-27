-- ALBUKHR Mainnet — WP3B.4B.3
-- Read-only post-apply verification. This file contains SELECT statements only.
-- Run only after both candidate migrations have been applied in an approved
-- isolated validation database, then repeat after separately approved Mainnet release.

WITH expected_functions AS (
  SELECT * FROM (VALUES
    ('albukhr_security._assert_single_active_super_admin_aal2()'::regprocedure, false, false, false),
    ('albukhr_security.create_admin_invitation(text,text,text,integer)'::regprocedure, true,  false, false),
    ('albukhr_security.list_admin_invitations()'::regprocedure,                   true,  false, false),
    ('albukhr_security.revoke_admin_invitation(uuid,text)'::regprocedure,         true,  false, false),
    ('albukhr_security.validate_admin_invitation(text)'::regprocedure,            false, false, true),
    ('albukhr_security.validate_admin_invitation_by_id(uuid)'::regprocedure,     true,  false, false),
    ('albukhr_security.accept_admin_invitation(uuid)'::regprocedure,              true,  false, false),
    ('albukhr_security.get_my_admin_context_v2()'::regprocedure,                  true,  false, false)
  ) AS x(signature, authenticated_expected, anon_expected, service_role_expected)
),
function_audit AS (
  SELECT
    e.signature::text AS function_name,
    p.prosecdef AS security_definer,
    p.proconfig AS function_config,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
    e.authenticated_expected,
    e.anon_expected,
    e.service_role_expected
  FROM expected_functions e
  JOIN pg_catalog.pg_proc p ON p.oid = e.signature
),
private_table_audit AS (
  SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS force_rls,
    has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
    has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
    has_table_privilege('anon', c.oid, 'UPDATE') AS anon_update,
    has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
    has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
    has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert,
    has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update,
    has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_delete,
    has_table_privilege('service_role', c.oid, 'SELECT') AS service_role_select,
    has_table_privilege('service_role', c.oid, 'INSERT') AS service_role_insert,
    has_table_privilege('service_role', c.oid, 'UPDATE') AS service_role_update,
    has_table_privilege('service_role', c.oid, 'DELETE') AS service_role_delete
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'albukhr_security'
    AND c.relname IN (
      'admin_invitations',
      'admin_invitation_role_catalogue',
      'admin_appointment_events'
    )
),
role_counts AS (
  SELECT role::text AS role_code, count(*) AS active_count
  FROM albukhr_security.admin_role_assignments
  WHERE active = true AND revoked_at IS NULL
  GROUP BY role
),
core_compatibility AS (
  SELECT
    md5(pg_catalog.pg_get_functiondef('albukhr_security.get_my_admin_context()'::regprocedure)) AS old_context_md5,
    md5(pg_catalog.pg_get_functiondef('albukhr_security.accept_core_project_invitation(text)'::regprocedure)) AS core_accept_token_md5,
    md5(pg_catalog.pg_get_functiondef('albukhr_security.accept_core_project_invitation_by_id(uuid)'::regprocedure)) AS core_accept_id_md5
)
SELECT pg_catalog.jsonb_build_object(
  'functions', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) ORDER BY f.function_name), '[]'::jsonb) FROM function_audit f),
  'functions_pass', (
    SELECT COALESCE(bool_and(
      f.security_definer = true
      AND f.authenticated_execute = f.authenticated_expected
      AND f.anon_execute = f.anon_expected
      AND f.service_role_execute = f.service_role_expected
      AND f.function_config @> ARRAY['search_path=""']::text[]
    ), false) FROM function_audit f
  ),
  'private_tables', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY t.table_name), '[]'::jsonb) FROM private_table_audit t),
  'private_tables_pass', (
    SELECT count(*) = 3 AND bool_and(
      rls_enabled AND force_rls
      AND NOT anon_select AND NOT anon_insert AND NOT anon_update AND NOT anon_delete
      AND NOT authenticated_select AND NOT authenticated_insert AND NOT authenticated_update AND NOT authenticated_delete
      AND NOT service_role_select AND NOT service_role_insert AND NOT service_role_update AND NOT service_role_delete
    )
    FROM private_table_audit
  ),
  'invitation_counts', pg_catalog.jsonb_build_object(
    'issued', (SELECT count(*) FROM albukhr_security.admin_invitations WHERE status = 'issued'),
    'accepted', (SELECT count(*) FROM albukhr_security.admin_invitations WHERE status = 'accepted'),
    'revoked', (SELECT count(*) FROM albukhr_security.admin_invitations WHERE status = 'revoked'),
    'expired', (SELECT count(*) FROM albukhr_security.admin_invitations WHERE status = 'expired'),
    'appointment_events', (SELECT count(*) FROM albukhr_security.admin_appointment_events)
  ),
  'active_role_distribution', (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.role_code), '[]'::jsonb) FROM role_counts r),
  'active_super_admin_count', (
    SELECT count(DISTINCT ara.user_id)
    FROM albukhr_security.admin_role_assignments ara
    JOIN albukhr_security.admin_users au ON au.user_id = ara.user_id
    WHERE au.status::text = 'active'
      AND ara.role = 'super_admin'::albukhr_security.admin_role
      AND ara.active AND ara.revoked_at IS NULL
  ),
  'legacy_context_and_core_workflow_md5', (SELECT pg_catalog.to_jsonb(c) FROM core_compatibility c),
  'legacy_functions_unchanged', (
    SELECT old_context_md5 = '05ecf43c7432606f439fe14a1b12a093'
       AND core_accept_token_md5 = 'cc5e0874497cfc582cc7dadad61cc249'
       AND core_accept_id_md5 = '8f9cf0b75b70c0fdb5a4a5eb00ee36dd'
    FROM core_compatibility
  ),
  'exactly_one_active_super_admin', (
    SELECT count(DISTINCT ara.user_id) = 1
    FROM albukhr_security.admin_role_assignments ara
    JOIN albukhr_security.admin_users au ON au.user_id = ara.user_id
    WHERE au.status::text = 'active'
      AND ara.role = 'super_admin'::albukhr_security.admin_role
      AND ara.active AND ara.revoked_at IS NULL
  ),
  'duplicate_active_user_role_pairs', (
    SELECT count(*)
    FROM (
      SELECT user_id, role
      FROM albukhr_security.admin_role_assignments
      WHERE active AND revoked_at IS NULL
      GROUP BY user_id, role
      HAVING count(*) > 1
    ) duplicates
  ),
  'appointment_event_append_only_trigger', (
    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='albukhr_security'
        AND c.relname='admin_appointment_events'
        AND t.tgname='trg_admin_appointment_events_append_only'
        AND NOT t.tgisinternal
    )
  )
) AS wp3b4b3_post_apply_audit;
