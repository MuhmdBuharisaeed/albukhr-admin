-- ALBUKHR Mainnet — WP3B.4B.3
-- Migration candidate 01: revocation-reason and lifecycle-event hardening.
-- Additive only. Does not alter admin_role_assignments, admin_users,
-- get_my_admin_context(), Core Team invitation RPCs, or financial controls.

BEGIN;

ALTER TABLE albukhr_security.admin_invitations
  ADD COLUMN IF NOT EXISTS revocation_reason text;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'albukhr_security.admin_invitations'::pg_catalog.regclass
      AND c.conname = 'admin_invitations_revocation_reason_check'
  ) THEN
    ALTER TABLE albukhr_security.admin_invitations
      ADD CONSTRAINT admin_invitations_revocation_reason_check
      CHECK (
        (status = 'revoked' AND revocation_reason IS NOT NULL
          AND pg_catalog.length(pg_catalog.btrim(revocation_reason)) BETWEEN 10 AND 1000)
        OR
        (status <> 'revoked' AND revocation_reason IS NULL)
      ) NOT VALID;
  END IF;
END;
$constraint$;

ALTER TABLE albukhr_security.admin_invitations
  VALIDATE CONSTRAINT admin_invitations_revocation_reason_check;

CREATE OR REPLACE FUNCTION albukhr_security.guard_admin_invitation_registry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_enabled boolean;
  v_current boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Admin invitations cannot be deleted; revoke or expire them instead.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.network <> 'mainnet'
       OR NEW.scope_type <> 'global'
       OR NEW.project_id IS NOT NULL
       OR NEW.status <> 'issued'
       OR NEW.revocation_reason IS NOT NULL
       OR NEW.role_code NOT IN ('registry_admin', 'approval_admin', 'finance_admin') THEN
      RAISE EXCEPTION 'Only eligible global Mainnet Admin invitations may be registered.';
    END IF;

    SELECT c.enabled_for_invitation, c.is_current
      INTO v_enabled, v_current
    FROM albukhr_security.admin_invitation_role_catalogue c
    WHERE c.catalogue_version = NEW.catalogue_version
      AND c.role_code = NEW.role_code;

    IF NOT FOUND OR v_enabled IS DISTINCT FROM true OR v_current IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Invitation role is not enabled in the current Admin role catalogue.';
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.network IS DISTINCT FROM OLD.network
       OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
       OR NEW.invited_email IS DISTINCT FROM OLD.invited_email
       OR NEW.role_code IS DISTINCT FROM OLD.role_code
       OR NEW.scope_type IS DISTINCT FROM OLD.scope_type
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.invitation_reason IS DISTINCT FROM OLD.invitation_reason
       OR NEW.catalogue_version IS DISTINCT FROM OLD.catalogue_version
       OR NEW.issued_by IS DISTINCT FROM OLD.issued_by
       OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
      RAISE EXCEPTION 'Admin invitation identity and scope fields are immutable.';
    END IF;

    IF OLD.status <> 'issued'
       OR NEW.status NOT IN ('accepted', 'revoked', 'expired') THEN
      RAISE EXCEPTION 'Only an issued invitation may transition once to accepted, revoked, or expired.';
    END IF;

    IF NEW.status = 'revoked' THEN
      IF NEW.revocation_reason IS NULL
         OR pg_catalog.length(pg_catalog.btrim(NEW.revocation_reason)) NOT BETWEEN 10 AND 1000 THEN
        RAISE EXCEPTION 'A revocation reason between 10 and 1000 characters is required.';
      END IF;
    ELSE
      IF NEW.revocation_reason IS NOT NULL THEN
        RAISE EXCEPTION 'A revocation reason is permitted only for revoked invitations.';
      END IF;
    END IF;

    IF OLD.revocation_reason IS NOT NULL
       AND NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason THEN
      RAISE EXCEPTION 'Admin invitation revocation reason is immutable once recorded.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION albukhr_security.capture_admin_invitation_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_event_type text;
  v_actor uuid;
  v_target uuid;
  v_event_reason text;
  v_details jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'invitation_issued';
    v_actor := NEW.issued_by;
    v_target := NULL;
    v_event_reason := NEW.invitation_reason;
    v_details := pg_catalog.jsonb_build_object(
      'catalogue_version', NEW.catalogue_version,
      'scope_type', NEW.scope_type,
      'network', NEW.network
    );

  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    CASE NEW.status
      WHEN 'accepted' THEN
        v_event_type := 'invitation_accepted';
        v_actor := NEW.accepted_by;
        v_target := NEW.accepted_by;
        v_event_reason := NEW.invitation_reason;
      WHEN 'revoked' THEN
        v_event_type := 'invitation_revoked';
        v_actor := NEW.revoked_by;
        v_target := NULL;
        v_event_reason := NEW.revocation_reason;
      WHEN 'expired' THEN
        v_event_type := 'invitation_expired';
        v_actor := NULL;
        v_target := NULL;
        v_event_reason := NULL;
      ELSE
        RAISE EXCEPTION 'Unsupported Admin invitation status transition.';
    END CASE;

    v_details := pg_catalog.jsonb_build_object(
      'catalogue_version', NEW.catalogue_version,
      'scope_type', NEW.scope_type,
      'network', NEW.network,
      'revocation_reason', CASE WHEN NEW.status = 'revoked' THEN NEW.revocation_reason ELSE NULL END
    );
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO albukhr_security.admin_appointment_events
    (network, event_type, actor_user_id, target_user_id, role_code,
     scope_type, invitation_id, reason, details)
  VALUES
    (NEW.network, v_event_type, v_actor, v_target, NEW.role_code,
     NEW.scope_type, NEW.id, v_event_reason, v_details);

  RETURN NEW;
END;
$function$;

-- Keep the existing trigger names and timing; only the trigger function
-- behavior is extended to preserve a separate revocation reason.

COMMIT;
