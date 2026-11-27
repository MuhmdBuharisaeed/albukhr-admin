-- ALBUKHR Mainnet — WP3B.4B.3
-- Migration candidate 02: generic Admin invitation RPCs and additive context v2.
-- Does not replace get_my_admin_context() and does not grant financial controls.

BEGIN;

CREATE OR REPLACE FUNCTION albukhr_security._assert_single_active_super_admin_aal2()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_active_super_admin_count bigint;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authenticated Super Admin session required.';
  END IF;

  IF COALESCE(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN
    RAISE EXCEPTION 'AAL2 multi-factor authentication is required.';
  END IF;

  -- Lock the caller's authoritative Admin and Super Admin assignment rows.
  PERFORM 1
  FROM albukhr_security.admin_users au
  JOIN albukhr_security.admin_role_assignments ara
    ON ara.user_id = au.user_id
  WHERE au.user_id = v_actor
    AND au.status::text = 'active'
    AND ara.role = 'super_admin'::albukhr_security.admin_role
    AND ara.active = true
    AND ara.revoked_at IS NULL
  FOR UPDATE OF au, ara;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the active Super Admin may manage generic Admin invitations.';
  END IF;

  SELECT pg_catalog.count(DISTINCT ara.user_id)
    INTO v_active_super_admin_count
  FROM albukhr_security.admin_users au
  JOIN albukhr_security.admin_role_assignments ara
    ON ara.user_id = au.user_id
  WHERE au.status::text = 'active'
    AND ara.role = 'super_admin'::albukhr_security.admin_role
    AND ara.active = true
    AND ara.revoked_at IS NULL;

  IF v_active_super_admin_count <> 1 THEN
    RAISE EXCEPTION 'Generic Admin appointment is locked unless exactly one active Super Admin exists.';
  END IF;

  RETURN v_actor;
END;
$function$;

CREATE OR REPLACE FUNCTION albukhr_security.create_admin_invitation(
  p_invited_email text,
  p_role_code text,
  p_invitation_reason text,
  p_expires_in_hours integer DEFAULT 168
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_email text;
  v_role text;
  v_reason text;
  v_catalogue_version text;
  v_token text;
  v_token_hash text;
  v_invitation_id uuid;
  v_expires_at timestamptz;
BEGIN
  v_actor := albukhr_security._assert_single_active_super_admin_aal2();

  v_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_invited_email, '')));
  v_role := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_role_code, '')));
  v_reason := pg_catalog.btrim(COALESCE(p_invitation_reason, ''));

  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'authorized', true, 'message', 'A valid invited email is required.');
  END IF;

  IF v_role NOT IN ('registry_admin', 'approval_admin', 'finance_admin') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'authorized', true, 'message', 'This role is not eligible for generic Admin invitation.');
  END IF;

  IF pg_catalog.length(v_reason) NOT BETWEEN 10 AND 1000 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'authorized', true, 'message', 'Invitation reason must contain between 10 and 1000 characters.');
  END IF;

  IF p_expires_in_hours IS NULL OR p_expires_in_hours NOT IN (24, 72, 168, 720) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'authorized', true, 'message', 'Invitation expiry must be 24, 72, 168, or 720 hours.');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('albukhr-admin-invite:' || v_email || ':' || v_role, 0)
  );

  SELECT c.catalogue_version
    INTO v_catalogue_version
  FROM albukhr_security.admin_invitation_role_catalogue c
  WHERE c.role_code = v_role
    AND c.enabled_for_invitation = true
    AND c.eligibility_state = 'eligible'
    AND c.appointment_flow = 'global'
    AND c.scope_type = 'global'
    AND c.is_current = true
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF v_catalogue_version IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'authorized', true, 'message', 'The selected role is not enabled in the current invitation catalogue.');
  END IF;

  -- Expire overdue invitations for this email/role before checking for an
  -- outstanding invitation. The existing event trigger records the transition.
  UPDATE albukhr_security.admin_invitations i
  SET status = 'expired'
  WHERE i.invited_email = v_email
    AND i.role_code = v_role
    AND i.status = 'issued'
    AND i.expires_at <= pg_catalog.now();

  IF EXISTS (
    SELECT 1
    FROM albukhr_security.admin_invitations i
    WHERE i.invited_email = v_email
      AND i.role_code = v_role
      AND i.status = 'issued'
      AND i.expires_at > pg_catalog.now()
  ) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'authorized', true, 'message', 'An active invitation already exists for this email and role. Revoke it or wait for expiry before issuing another.');
  END IF;

  v_token := 'albukhr_admin_' || pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');
  v_expires_at := pg_catalog.now() + pg_catalog.make_interval(hours => p_expires_in_hours);

  INSERT INTO albukhr_security.admin_invitations
    (network, token_hash, invited_email, role_code, scope_type, project_id,
     invitation_reason, catalogue_version, status, issued_by, issued_at, expires_at)
  VALUES
    ('mainnet', v_token_hash, v_email, v_role, 'global', NULL,
     v_reason, v_catalogue_version, 'issued', v_actor, pg_catalog.now(), v_expires_at)
  RETURNING id, expires_at INTO v_invitation_id, v_expires_at;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'authorized', true,
    'invitation_id', v_invitation_id,
    'invitation_token', v_token,
    'invited_email', v_email,
    'role_code', v_role,
    'expires_at', v_expires_at,
    'message', 'Admin invitation created. Copy and securely deliver the one-time invitation link; the raw token will not be returned again.'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION albukhr_security.list_admin_invitations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_records jsonb;
BEGIN
  v_actor := albukhr_security._assert_single_active_super_admin_aal2();

  -- Materialize overdue terminal transitions so the existing event trigger
  -- records invitation_expired before the list is returned.
  UPDATE albukhr_security.admin_invitations
  SET status = 'expired'
  WHERE status = 'issued'
    AND expires_at <= pg_catalog.now();

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', i.id,
        'invited_email', i.invited_email,
        'role_code', i.role_code,
        'network', i.network,
        'scope_type', i.scope_type,
        'invitation_reason', i.invitation_reason,
        'catalogue_version', i.catalogue_version,
        'status', CASE WHEN i.status = 'issued' AND i.expires_at <= pg_catalog.now() THEN 'expired' ELSE i.status END,
        'issued_by', i.issued_by,
        'issued_at', i.issued_at,
        'expires_at', i.expires_at,
        'accepted_by', i.accepted_by,
        'accepted_at', i.accepted_at,
        'revoked_by', i.revoked_by,
        'revoked_at', i.revoked_at,
        'revocation_reason', i.revocation_reason
      ) ORDER BY i.issued_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_records
  FROM (
    SELECT *
    FROM albukhr_security.admin_invitations
    ORDER BY issued_at DESC
    LIMIT 250
  ) i;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'authorized', true,
    'records', v_records,
    'count', pg_catalog.jsonb_array_length(v_records),
    'message', 'Admin invitations loaded.'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION albukhr_security.revoke_admin_invitation(
  p_invitation_id uuid,
  p_revocation_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_reason text;
  v_invitation albukhr_security.admin_invitations%ROWTYPE;
BEGIN
  v_actor := albukhr_security._assert_single_active_super_admin_aal2();
  v_reason := pg_catalog.btrim(COALESCE(p_revocation_reason, ''));

  IF p_invitation_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'authorized', true, 'message', 'Invitation ID is required.');
  END IF;

  IF pg_catalog.length(v_reason) NOT BETWEEN 10 AND 1000 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'authorized', true, 'message', 'Revocation reason must contain between 10 and 1000 characters.');
  END IF;

  SELECT * INTO v_invitation
  FROM albukhr_security.admin_invitations i
  WHERE i.id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'authorized', true, 'message', 'Invitation is unavailable.');
  END IF;

  IF v_invitation.status <> 'issued' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'authorized', true, 'status', v_invitation.status, 'message', 'Only an unused issued invitation can be revoked.');
  END IF;

  IF v_invitation.expires_at <= pg_catalog.now() THEN
    UPDATE albukhr_security.admin_invitations
    SET status = 'expired'
    WHERE id = v_invitation.id;

    RETURN pg_catalog.jsonb_build_object('success', false, 'authorized', true, 'status', 'expired', 'message', 'This invitation had already expired and has been recorded as expired.');
  END IF;

  UPDATE albukhr_security.admin_invitations
  SET status = 'revoked',
      revoked_by = v_actor,
      revoked_at = pg_catalog.now(),
      revocation_reason = v_reason
  WHERE id = v_invitation.id;

  RETURN pg_catalog.jsonb_build_object('success', true, 'authorized', true, 'invitation_id', v_invitation.id, 'status', 'revoked', 'message', 'Admin invitation revoked. The record and revocation reason remain in the audit ledger.');
END;
$function$;

CREATE OR REPLACE FUNCTION albukhr_security.validate_admin_invitation(
  p_invitation_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_token text;
  v_hash text;
  v_invitation albukhr_security.admin_invitations%ROWTYPE;
  v_catalogue_current boolean;
BEGIN
  v_token := pg_catalog.btrim(COALESCE(p_invitation_token, ''));

  IF v_token !~ '^albukhr_admin_[0-9a-f]{64}$' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'valid', false, 'message', 'Invalid invitation token.');
  END IF;

  v_hash := pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex');

  SELECT * INTO v_invitation
  FROM albukhr_security.admin_invitations i
  WHERE i.token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'valid', false, 'message', 'Invitation is invalid or unavailable.');
  END IF;

  IF v_invitation.status <> 'issued' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'valid', false, 'message', 'Invitation is no longer available.');
  END IF;

  IF v_invitation.expires_at <= pg_catalog.now() THEN
    UPDATE albukhr_security.admin_invitations
    SET status = 'expired'
    WHERE id = v_invitation.id;

    RETURN pg_catalog.jsonb_build_object('success', false, 'valid', false, 'message', 'Invitation has expired.');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM albukhr_security.admin_invitation_role_catalogue c
    WHERE c.catalogue_version = v_invitation.catalogue_version
      AND c.role_code = v_invitation.role_code
      AND c.enabled_for_invitation = true
      AND c.is_current = true
      AND c.appointment_flow = 'global'
      AND c.scope_type = 'global'
  ) INTO v_catalogue_current;

  IF NOT v_catalogue_current THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'valid', false, 'message', 'This invitation role is no longer eligible.');
  END IF;

  -- The bearer token reveals only the invitation ID, role and expiry.
  -- Invitee email and all Admin authority remain hidden until verified sign-in.
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'valid', true,
    'invitation_id', v_invitation.id,
    'role_code', v_invitation.role_code,
    'expires_at', v_invitation.expires_at,
    'message', 'Invitation token is valid. Sign in or create an account using the invited email address.'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION albukhr_security.validate_admin_invitation_by_id(
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_email_confirmed_at timestamptz;
  v_invitation albukhr_security.admin_invitations%ROWTYPE;
  v_catalogue_current boolean;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'valid', false, 'authorized', false, 'message', 'Authenticated session required.');
  END IF;

  SELECT pg_catalog.lower(pg_catalog.btrim(u.email)), u.email_confirmed_at
    INTO v_user_email, v_email_confirmed_at
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_user_email IS NULL OR v_email_confirmed_at IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'valid', false, 'authorized', false, 'message', 'A confirmed email address is required.');
  END IF;

  IF p_invitation_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'valid', false, 'message', 'Invitation ID is required.');
  END IF;

  SELECT * INTO v_invitation
  FROM albukhr_security.admin_invitations i
  WHERE i.id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND OR v_invitation.status <> 'issued' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'valid', false, 'message', 'Invitation is invalid or unavailable.');
  END IF;

  IF v_invitation.expires_at <= pg_catalog.now() THEN
    UPDATE albukhr_security.admin_invitations
    SET status = 'expired'
    WHERE id = v_invitation.id;

    RETURN pg_catalog.jsonb_build_object('success', false, 'valid', false, 'message', 'Invitation has expired.');
  END IF;

  IF v_invitation.invited_email <> v_user_email THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'valid', false, 'message', 'The confirmed account email does not match this invitation.');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM albukhr_security.admin_invitation_role_catalogue c
    WHERE c.catalogue_version = v_invitation.catalogue_version
      AND c.role_code = v_invitation.role_code
      AND c.enabled_for_invitation = true
      AND c.is_current = true
      AND c.appointment_flow = 'global'
      AND c.scope_type = 'global'
  ) INTO v_catalogue_current;

  IF NOT v_catalogue_current THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'valid', false, 'message', 'This invitation role is no longer eligible.');
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'valid', true,
    'authorized', true,
    'invitation_id', v_invitation.id,
    'invited_email', v_invitation.invited_email,
    'role_code', v_invitation.role_code,
    'expires_at', v_invitation.expires_at,
    'requires_mfa', true,
    'message', 'Verified email matches the invitation. Complete AAL2 MFA before accepting the Admin appointment.'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION albukhr_security.accept_admin_invitation(
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_email_confirmed_at timestamptz;
  v_invitation albukhr_security.admin_invitations%ROWTYPE;
  v_catalogue_current boolean;
  v_issuer_active_super_admin boolean;
  v_active_super_admin_count bigint;
  v_existing_admin_status text;
  v_assignment_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'accepted', false, 'authorized', false, 'message', 'Authenticated session required.');
  END IF;

  IF COALESCE(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'accepted', false, 'authorized', false, 'requires_mfa', true, 'message', 'Complete MFA verification to AAL2 before accepting an Admin appointment.');
  END IF;

  SELECT pg_catalog.lower(pg_catalog.btrim(u.email)), u.email_confirmed_at
    INTO v_user_email, v_email_confirmed_at
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_user_email IS NULL OR v_email_confirmed_at IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'accepted', false, 'authorized', false, 'message', 'A confirmed email address is required.');
  END IF;

  IF p_invitation_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'accepted', false, 'message', 'Invitation ID is required.');
  END IF;

  SELECT * INTO v_invitation
  FROM albukhr_security.admin_invitations i
  WHERE i.id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND OR v_invitation.status <> 'issued' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'accepted', false, 'message', 'Invitation is invalid, revoked, expired or already used.');
  END IF;

  IF v_invitation.expires_at <= pg_catalog.now() THEN
    UPDATE albukhr_security.admin_invitations
    SET status = 'expired'
    WHERE id = v_invitation.id;

    RETURN pg_catalog.jsonb_build_object('success', false, 'accepted', false, 'message', 'Invitation has expired.');
  END IF;

  IF v_invitation.invited_email <> v_user_email THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'accepted', false, 'message', 'The confirmed account email does not match this invitation.');
  END IF;

  IF v_invitation.issued_by = v_user_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'accepted', false, 'message', 'Self-appointment is prohibited.');
  END IF;

  IF v_invitation.role_code NOT IN ('registry_admin', 'approval_admin', 'finance_admin')
     OR v_invitation.network <> 'mainnet'
     OR v_invitation.scope_type <> 'global'
     OR v_invitation.project_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'accepted', false, 'message', 'Invitation scope or role is not eligible for generic Admin appointment.');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM albukhr_security.admin_invitation_role_catalogue c
    WHERE c.catalogue_version = v_invitation.catalogue_version
      AND c.role_code = v_invitation.role_code
      AND c.enabled_for_invitation = true
      AND c.is_current = true
      AND c.appointment_flow = 'global'
      AND c.scope_type = 'global'
  ) INTO v_catalogue_current;

  IF NOT v_catalogue_current THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'accepted', false, 'message', 'This invitation role is no longer eligible in the current catalogue.');
  END IF;

  -- Lock the issuing Super Admin's authoritative rows so a concurrent
  -- governance revocation cannot race invitation acceptance.
  PERFORM 1
  FROM albukhr_security.admin_users au
  JOIN albukhr_security.admin_role_assignments ara
    ON ara.user_id = au.user_id
  WHERE au.user_id = v_invitation.issued_by
    AND au.status::text = 'active'
    AND ara.role = 'super_admin'::albukhr_security.admin_role
    AND ara.active = true
    AND ara.revoked_at IS NULL
  FOR UPDATE OF au, ara;
  v_issuer_active_super_admin := FOUND;

  SELECT pg_catalog.count(DISTINCT ara.user_id)
    INTO v_active_super_admin_count
  FROM albukhr_security.admin_users au
  JOIN albukhr_security.admin_role_assignments ara
    ON ara.user_id = au.user_id
  WHERE au.status::text = 'active'
    AND ara.role = 'super_admin'::albukhr_security.admin_role
    AND ara.active = true
    AND ara.revoked_at IS NULL;

  IF NOT v_issuer_active_super_admin OR v_active_super_admin_count <> 1 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'accepted', false, 'message', 'The issuing Super Admin appointment is no longer valid. Contact ALBUKHR governance.');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('albukhr-admin-appointment:' || v_user_id::text || ':' || v_invitation.role_code, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM albukhr_security.admin_role_assignments ara
    WHERE ara.user_id = v_user_id
      AND ara.role = v_invitation.role_code::albukhr_security.admin_role
      AND ara.active = true
      AND ara.revoked_at IS NULL
  ) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'accepted', false, 'message', 'This account already has an active assignment for the invited Admin role.');
  END IF;

  SELECT au.status::text
    INTO v_existing_admin_status
  FROM albukhr_security.admin_users au
  WHERE au.user_id = v_user_id
  FOR UPDATE;

  IF FOUND AND v_existing_admin_status IN ('suspended', 'revoked') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'accepted', false, 'message', 'This Admin account is suspended or revoked and cannot accept another appointment.');
  END IF;

  INSERT INTO albukhr_security.admin_users
    (user_id, email_snapshot, status, mfa_required, created_at, updated_at)
  VALUES
    (v_user_id, v_user_email, 'active', true, pg_catalog.now(), pg_catalog.now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    email_snapshot = EXCLUDED.email_snapshot,
    status = CASE
      WHEN albukhr_security.admin_users.status::text = 'pending'
        THEN 'active'::albukhr_security.admin_status
      ELSE albukhr_security.admin_users.status
    END,
    mfa_required = true,
    updated_at = pg_catalog.now();

  INSERT INTO albukhr_security.admin_role_assignments
    (user_id, role, granted_by, granted_at, active, metadata)
  VALUES
    (v_user_id,
     v_invitation.role_code::albukhr_security.admin_role,
     v_invitation.issued_by,
     pg_catalog.now(),
     true,
     pg_catalog.jsonb_build_object(
       'source', 'generic_admin_invitation',
       'invitation_id', v_invitation.id,
       'catalogue_version', v_invitation.catalogue_version,
       'network', 'mainnet',
       'scope_type', 'global'
     ))
  RETURNING id INTO v_assignment_id;

  -- This records only the ordinary Admin role appointment. It deliberately
  -- does not touch financial_control_role_grants or any dual-approval tables.
  INSERT INTO albukhr_security.admin_appointment_events
    (network, event_type, actor_user_id, target_user_id, role_code,
     scope_type, invitation_id, role_assignment_id, reason, details)
  VALUES
    ('mainnet', 'admin_role_granted', v_invitation.issued_by, v_user_id,
     v_invitation.role_code, 'global', v_invitation.id, v_assignment_id,
     v_invitation.invitation_reason,
     pg_catalog.jsonb_build_object(
       'catalogue_version', v_invitation.catalogue_version,
       'appointment_source', 'generic_admin_invitation',
       'mfa_required', true,
       'financial_control_entitlements_granted', false
     ));

  UPDATE albukhr_security.admin_invitations
  SET status = 'accepted',
      accepted_by = v_user_id,
      accepted_at = pg_catalog.now()
  WHERE id = v_invitation.id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'accepted', true,
    'authorized', true,
    'invitation_id', v_invitation.id,
    'role_assignment_id', v_assignment_id,
    'role_code', v_invitation.role_code,
    'status', 'active',
    'mfa_required', true,
    'financial_control_entitlements_granted', false,
    'message', 'Admin invitation accepted and ordinary Admin role appointment completed.'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION albukhr_security.get_my_admin_context_v2()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_aal text;
  v_status text;
  v_mfa_required boolean;
  v_email_snapshot text;
  v_roles jsonb;
  v_core_projects jsonb;
  v_scoped_projects jsonb;
  v_testnet_access boolean;
  v_is_admin boolean;
  v_mfa_verified boolean;
  v_has_active_role boolean;
BEGIN
  v_user_id := auth.uid();
  v_aal := COALESCE(auth.jwt() ->> 'aal', 'aal1');

  IF v_user_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'schema_version', 2,
      'network', 'mainnet',
      'is_admin', false,
      'user_id', NULL,
      'email_snapshot', NULL,
      'status', 'inactive',
      'aal', v_aal,
      'mfa_required', true,
      'mfa_verified', false,
      'roles', '[]'::jsonb,
      'core_projects', '[]'::jsonb,
      'scoped_projects', '[]'::jsonb,
      'testnet_access', false,
      'has_active_role', false
    );
  END IF;

  SELECT au.status::text, au.mfa_required, au.email_snapshot
    INTO v_status, v_mfa_required, v_email_snapshot
  FROM albukhr_security.admin_users au
  WHERE au.user_id = v_user_id
    AND au.status::text = 'active';

  v_is_admin := FOUND;
  IF NOT v_is_admin THEN
    v_status := 'inactive';
    v_mfa_required := true;
    v_email_snapshot := NULL;
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(DISTINCT ara.role::text)
      FILTER (WHERE ara.active = true AND ara.revoked_at IS NULL),
    '[]'::jsonb
  ) INTO v_roles
  FROM albukhr_security.admin_role_assignments ara
  WHERE ara.user_id = v_user_id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(DISTINCT pg_catalog.jsonb_build_object(
      'id', cab.core_project_id,
      'core_slot', cab.core_slot,
      'active', cab.active
    )) FILTER (WHERE cab.active = true),
    '[]'::jsonb
  ) INTO v_core_projects
  FROM albukhr_security.core_admin_bindings cab
  WHERE cab.user_id = v_user_id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(DISTINCT pg_catalog.jsonb_build_object(
      'role', sab.role::text,
      'project_id', sab.project_id,
      'active', sab.active
    )) FILTER (WHERE sab.active = true),
    '[]'::jsonb
  ) INTO v_scoped_projects
  FROM albukhr_security.scoped_admin_bindings sab
  WHERE sab.user_id = v_user_id;

  SELECT EXISTS (
    SELECT 1
    FROM albukhr_security.testnet_access_grants tag
    WHERE tag.user_id = v_user_id
      AND tag.active = true
      AND tag.starts_at <= pg_catalog.now()
      AND (tag.expires_at IS NULL OR tag.expires_at > pg_catalog.now())
      AND tag.revoked_at IS NULL
  ) INTO v_testnet_access;

  SELECT EXISTS (
    SELECT 1
    FROM albukhr_security.admin_role_assignments ara
    WHERE ara.user_id = v_user_id
      AND ara.active = true
      AND ara.revoked_at IS NULL
  ) INTO v_has_active_role;

  v_mfa_verified := CASE
    WHEN NOT v_is_admin THEN false
    WHEN COALESCE(v_mfa_required, true) = false THEN true
    WHEN v_aal = 'aal2' THEN true
    ELSE false
  END;

  RETURN pg_catalog.jsonb_build_object(
    'schema_version', 2,
    'network', 'mainnet',
    'is_admin', v_is_admin,
    'user_id', v_user_id,
    'email_snapshot', v_email_snapshot,
    'status', COALESCE(v_status, 'inactive'),
    'aal', v_aal,
    'mfa_required', COALESCE(v_mfa_required, true),
    'mfa_verified', v_mfa_verified,
    'roles', COALESCE(v_roles, '[]'::jsonb),
    'core_projects', COALESCE(v_core_projects, '[]'::jsonb),
    'scoped_projects', COALESCE(v_scoped_projects, '[]'::jsonb),
    'testnet_access', COALESCE(v_testnet_access, false),
    'has_active_role', COALESCE(v_has_active_role, false)
  );
END;
$function$;

-- No client receives direct table privileges. All access remains through the
-- narrow SECURITY DEFINER RPC contracts below.
REVOKE ALL ON FUNCTION albukhr_security._assert_single_active_super_admin_aal2() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION albukhr_security.create_admin_invitation(text, text, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION albukhr_security.list_admin_invitations() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION albukhr_security.revoke_admin_invitation(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION albukhr_security.validate_admin_invitation(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION albukhr_security.validate_admin_invitation_by_id(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION albukhr_security.accept_admin_invitation(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION albukhr_security.get_my_admin_context_v2() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION albukhr_security.create_admin_invitation(text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION albukhr_security.list_admin_invitations() TO authenticated;
GRANT EXECUTE ON FUNCTION albukhr_security.revoke_admin_invitation(uuid, text) TO authenticated;
-- Bearer-token validation is called only by the server-side Edge Function.
-- Do not grant anon or authenticated direct execution; this avoids adding a
-- new client-executable SECURITY DEFINER Advisor warning.
GRANT EXECUTE ON FUNCTION albukhr_security.validate_admin_invitation(text) TO service_role;
GRANT EXECUTE ON FUNCTION albukhr_security.validate_admin_invitation_by_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION albukhr_security.accept_admin_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION albukhr_security.get_my_admin_context_v2() TO authenticated;

COMMIT;
