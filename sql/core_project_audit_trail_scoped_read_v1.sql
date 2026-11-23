-- ALBUKHR Mainnet — Core Project audit history (read-only, project scoped)
-- Migration name: core_project_audit_trail_scoped_read_v1
-- Applied directly to Mainnet Supabase during the Phase A completion work.
-- This function does not write to the audit table or any project/financial table.

CREATE OR REPLACE FUNCTION albukhr_security.get_core_project_audit_trail(
  p_project_id uuid,
  p_limit integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_super_admin boolean := false;
  v_is_core_admin boolean := false;
  v_binding_count integer := 0;
  v_project_ids uuid[] := ARRAY[]::uuid[];
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_events jsonb := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'authorized', false, 'network', 'mainnet',
      'events', '[]'::jsonb, 'message', 'Authenticated session required.'
    );
  END IF;

  IF COALESCE(auth.jwt() ->> 'aal', '') <> 'aal2' THEN
    RETURN pg_catalog.jsonb_build_object(
      'authorized', false, 'network', 'mainnet',
      'events', '[]'::jsonb, 'message', 'AAL2 MFA assurance is required.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM albukhr_security.admin_users au
    WHERE au.user_id = v_user_id
      AND au.status::text = 'active'
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'authorized', false, 'network', 'mainnet',
      'events', '[]'::jsonb, 'message', 'Active ALBUKHR administrator authorization is required.'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM albukhr_security.admin_role_assignments ara
    WHERE ara.user_id = v_user_id
      AND ara.active = true
      AND ara.revoked_at IS NULL
      AND ara.role::text = 'super_admin'
  ) INTO v_is_super_admin;

  SELECT EXISTS (
    SELECT 1
    FROM albukhr_security.admin_role_assignments ara
    WHERE ara.user_id = v_user_id
      AND ara.active = true
      AND ara.revoked_at IS NULL
      AND ara.role::text = 'core_admin'
  ) INTO v_is_core_admin;

  IF NOT v_is_super_admin AND NOT v_is_core_admin THEN
    RETURN pg_catalog.jsonb_build_object(
      'authorized', false, 'network', 'mainnet',
      'events', '[]'::jsonb, 'message', 'Core Project audit access is denied.'
    );
  END IF;

  IF v_is_super_admin THEN
    SELECT COALESCE(
      pg_catalog.array_agg(p.id ORDER BY p.core_slot),
      ARRAY[]::uuid[]
    )
    INTO v_project_ids
    FROM public.projects p
    WHERE pg_catalog.lower(pg_catalog.btrim(p.network)) = 'mainnet'
      AND pg_catalog.lower(pg_catalog.btrim(p.project_type)) = 'core'
      AND p.core_slot BETWEEN 1 AND 7;

    IF pg_catalog.cardinality(v_project_ids) <> 7 THEN
      RETURN pg_catalog.jsonb_build_object(
        'authorized', false, 'network', 'mainnet',
        'events', '[]'::jsonb,
        'message', 'The seven-project Mainnet Core registry is incomplete.'
      );
    END IF;
  ELSE
    SELECT
      pg_catalog.count(*)::integer,
      COALESCE(
        pg_catalog.array_agg(b.core_project_id ORDER BY b.core_slot),
        ARRAY[]::uuid[]
      )
    INTO v_binding_count, v_project_ids
    FROM albukhr_security.core_admin_bindings b
    JOIN public.projects p
      ON p.id = b.core_project_id
     AND p.core_slot = b.core_slot
    WHERE b.user_id = v_user_id
      AND b.active = true
      AND b.revoked_at IS NULL
      AND pg_catalog.lower(pg_catalog.btrim(p.network)) = 'mainnet'
      AND pg_catalog.lower(pg_catalog.btrim(p.project_type)) = 'core'
      AND p.core_slot BETWEEN 1 AND 7;

    IF v_binding_count <> 1 OR pg_catalog.cardinality(v_project_ids) <> 1 THEN
      RETURN pg_catalog.jsonb_build_object(
        'authorized', false, 'network', 'mainnet',
        'events', '[]'::jsonb,
        'message', 'A Core Admin must have exactly one valid active Mainnet Core Project assignment.'
      );
    END IF;
  END IF;

  IF p_project_id IS NULL OR NOT (p_project_id = ANY(v_project_ids)) THEN
    RETURN pg_catalog.jsonb_build_object(
      'authorized', false, 'network', 'mainnet',
      'events', '[]'::jsonb,
      'message', 'The selected project is outside this administrator audit scope.'
    );
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(q.event_data ORDER BY q.created_at DESC, q.audit_id DESC),
    '[]'::jsonb
  )
  INTO v_events
  FROM (
    SELECT
      l.id AS audit_id,
      l.created_at,
      pg_catalog.jsonb_build_object(
        'id', l.id,
        'action', l.action,
        'target_table', l.target_table,
        'target_id', l.target_id,
        'actor_id', l.actor_user_id,
        'role', l.role::text,
        'success', l.success,
        'request_id', l.request_id,
        'created_at', l.created_at,
        'details', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'project_id', l.details -> 'project_id',
          'core_project_id', l.details -> 'core_project_id',
          'project_code', l.details -> 'project_code',
          'project_name', l.details -> 'project_name',
          'project_type', l.details -> 'project_type',
          'core_slot', l.details -> 'core_slot',
          'network', l.details -> 'network',
          'status', l.details -> 'status',
          'previous_status', l.details -> 'previous_status',
          'new_status', l.details -> 'new_status',
          'reason', l.details -> 'reason',
          'decision', l.details -> 'decision',
          'readiness_passed', l.details -> 'readiness_passed',
          'blockers', l.details -> 'blockers',
          'checks', l.details -> 'checks',
          'settlement_written', l.details -> 'settlement_written',
          'payment_approval_called', l.details -> 'payment_approval_called',
          'payment_completion_called', l.details -> 'payment_completion_called',
          'production_payment_eligible', l.details -> 'production_payment_eligible',
          'logo_path', l.details -> 'logo_path',
          'logo_width', l.details -> 'logo_width',
          'logo_height', l.details -> 'logo_height',
          'logo_format', l.details -> 'logo_format',
          'logo_size_bytes', l.details -> 'logo_size_bytes'
        ))
      ) AS event_data
    FROM albukhr_security.admin_audit_log l
    WHERE (
      (l.target_table = 'public.projects' AND l.target_id = p_project_id::text)
      OR l.details ->> 'project_id' = p_project_id::text
      OR l.details ->> 'core_project_id' = p_project_id::text
    )
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT v_limit
  ) q;

  RETURN pg_catalog.jsonb_build_object(
    'authorized', true,
    'network', 'mainnet',
    'project_id', p_project_id,
    'limit', v_limit,
    'events', v_events,
    'message', 'Mainnet Core Project audit history loaded successfully.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION albukhr_security.get_core_project_audit_trail(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION albukhr_security.get_core_project_audit_trail(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION albukhr_security.get_core_project_audit_trail(uuid, integer) FROM service_role;
GRANT EXECUTE ON FUNCTION albukhr_security.get_core_project_audit_trail(uuid, integer) TO authenticated;
