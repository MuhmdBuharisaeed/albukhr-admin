-- ALBUKHR Mainnet: scoped, read-only Core Project Workspace RPC.
-- Super Admin: all seven Mainnet Core Projects.
-- Core Admin: exactly one valid active Mainnet assignment.
-- No treasury/payment/staking/audit writes are performed.

CREATE OR REPLACE FUNCTION albukhr_security.get_core_project_workspace()
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
    v_core_project_id uuid;
    v_projects jsonb := '[]'::jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'authorized', false, 'network', 'mainnet',
            'projects', '[]'::jsonb, 'message', 'Authenticated session required.'
        );
    END IF;

    IF COALESCE(auth.jwt() ->> 'aal', '') <> 'aal2' THEN
        RETURN pg_catalog.jsonb_build_object(
            'authorized', false, 'network', 'mainnet',
            'projects', '[]'::jsonb, 'message', 'AAL2 MFA assurance is required.'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM albukhr_security.admin_users au
        WHERE au.user_id = v_user_id AND au.status::text = 'active'
    ) THEN
        RETURN pg_catalog.jsonb_build_object(
            'authorized', false, 'network', 'mainnet',
            'projects', '[]'::jsonb,
            'message', 'Active ALBUKHR administrator authorization is required.'
        );
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM albukhr_security.admin_role_assignments ara
        WHERE ara.user_id = v_user_id AND ara.active = true
          AND ara.revoked_at IS NULL AND ara.role::text = 'super_admin'
    ) INTO v_is_super_admin;

    SELECT EXISTS (
        SELECT 1 FROM albukhr_security.admin_role_assignments ara
        WHERE ara.user_id = v_user_id AND ara.active = true
          AND ara.revoked_at IS NULL AND ara.role::text = 'core_admin'
    ) INTO v_is_core_admin;

    IF NOT v_is_super_admin AND NOT v_is_core_admin THEN
        RETURN pg_catalog.jsonb_build_object(
            'authorized', false, 'network', 'mainnet',
            'projects', '[]'::jsonb,
            'message', 'Only an active Core Admin or Super Admin can access this workspace.'
        );
    END IF;

    IF NOT v_is_super_admin THEN
        SELECT pg_catalog.count(*) INTO v_binding_count
        FROM albukhr_security.core_admin_bindings b
        JOIN public.projects p ON p.id = b.core_project_id AND p.core_slot = b.core_slot
        WHERE b.user_id = v_user_id AND b.active = true AND b.revoked_at IS NULL
          AND pg_catalog.lower(pg_catalog.btrim(p.network)) = 'mainnet'
          AND pg_catalog.lower(pg_catalog.btrim(p.project_type)) = 'core'
          AND p.core_slot BETWEEN 1 AND 7;

        IF v_binding_count <> 1 THEN
            RETURN pg_catalog.jsonb_build_object(
                'authorized', false, 'network', 'mainnet',
                'projects', '[]'::jsonb,
                'message', 'A Core Admin must have exactly one valid active Mainnet Core Project assignment.'
            );
        END IF;

        SELECT b.core_project_id INTO v_core_project_id
        FROM albukhr_security.core_admin_bindings b
        JOIN public.projects p ON p.id = b.core_project_id AND p.core_slot = b.core_slot
        WHERE b.user_id = v_user_id AND b.active = true AND b.revoked_at IS NULL
          AND pg_catalog.lower(pg_catalog.btrim(p.network)) = 'mainnet'
          AND pg_catalog.lower(pg_catalog.btrim(p.project_type)) = 'core'
          AND p.core_slot BETWEEN 1 AND 7
        LIMIT 1;
    END IF;

    SELECT COALESCE(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', p.id,
                'project_id', p.id,
                'project_code', p.project_code,
                'slug', p.slug,
                'name', p.name,
                'description', p.description,
                'project_type', p.project_type,
                'status', p.status,
                'core_slot', p.core_slot,
                'network', p.network,
                'logo_url', p.logo_url,
                'created_at', p.created_at,
                'updated_at', p.updated_at,
                'treasury', pg_catalog.jsonb_build_object(
                    'id', t.id,
                    'status', COALESCE(t.status, 'not_configured'),
                    'treasury_wallet', t.treasury_wallet,
                    'required_liquidity', t.required_liquidity,
                    'verified_liquidity', t.verified_liquidity,
                    'liquidity_remaining',
                        CASE WHEN t.id IS NULL THEN NULL
                        ELSE GREATEST(
                            COALESCE(t.required_liquidity, 0) - COALESCE(t.verified_liquidity, 0),
                            0
                        ) END,
                    'liquidity_coverage_percent',
                        CASE
                        WHEN t.id IS NULL OR COALESCE(t.required_liquidity, 0) <= 0 THEN NULL
                        ELSE pg_catalog.round(
                            (COALESCE(t.verified_liquidity, 0) / t.required_liquidity) * 100,
                            2
                        ) END
                ),
                'staking', pg_catalog.jsonb_build_object(
                    'approved_term_count', COALESCE(st.approved_term_count, 0),
                    'published_term_count', COALESCE(st.published_term_count, 0),
                    'total_term_count', COALESCE(st.total_term_count, 0),
                    'active_stake_count', COALESCE(sk.active_stake_count, 0),
                    'total_stake_count', COALESCE(sk.total_stake_count, 0),
                    'active_staked_pi', COALESCE(sk.active_staked_pi, 0),
                    'published_terms', COALESCE(st.published_terms, '[]'::jsonb)
                )
            )
            ORDER BY p.core_slot, p.name
        ),
        '[]'::jsonb
    )
    INTO v_projects
    FROM public.projects p
    LEFT JOIN LATERAL (
        SELECT pt.id, pt.status, pt.treasury_wallet, pt.required_liquidity, pt.verified_liquidity
        FROM public.project_treasury pt
        WHERE pt.project_id = p.id AND pt.network = 'mainnet'
        ORDER BY pt.updated_at DESC NULLS LAST, pt.created_at DESC NULLS LAST
        LIMIT 1
    ) t ON true
    LEFT JOIN LATERAL (
        SELECT
            pg_catalog.count(*) FILTER (WHERE tv.term_status = 'approved') AS approved_term_count,
            pg_catalog.count(*) FILTER (
                WHERE tv.term_status = 'published'
                  AND tv.effective_from <= pg_catalog.now()
                  AND (tv.effective_until IS NULL OR tv.effective_until > pg_catalog.now())
            ) AS published_term_count,
            pg_catalog.count(*) AS total_term_count,
            COALESCE(
                pg_catalog.jsonb_agg(
                    pg_catalog.jsonb_build_object(
                        'id', tv.id, 'term_key', tv.term_key,
                        'version_number', tv.version_number,
                        'duration_days', tv.duration_days,
                        'min_stake', tv.min_stake, 'max_stake', tv.max_stake,
                        'reward_model', tv.reward_model, 'reward_rate', tv.reward_rate,
                        'term_status', tv.term_status,
                        'effective_from', tv.effective_from, 'effective_until', tv.effective_until
                    )
                    ORDER BY tv.duration_days, tv.version_number
                ) FILTER (
                    WHERE tv.term_status = 'published'
                      AND tv.effective_from <= pg_catalog.now()
                      AND (tv.effective_until IS NULL OR tv.effective_until > pg_catalog.now())
                ),
                '[]'::jsonb
            ) AS published_terms
        FROM public.project_staking_term_versions tv
        WHERE tv.project_id = p.id AND tv.network = 'mainnet'
    ) st ON true
    LEFT JOIN LATERAL (
        SELECT
            pg_catalog.count(*) FILTER (WHERE s.status = 'active') AS active_stake_count,
            pg_catalog.count(*) AS total_stake_count,
            COALESCE(pg_catalog.sum(s.amount) FILTER (WHERE s.status = 'active'), 0) AS active_staked_pi
        FROM public.stakes s
        WHERE s.project_id = p.id AND s.network = 'mainnet'
    ) sk ON true
    WHERE pg_catalog.lower(pg_catalog.btrim(p.network)) = 'mainnet'
      AND pg_catalog.lower(pg_catalog.btrim(p.project_type)) = 'core'
      AND p.core_slot BETWEEN 1 AND 7
      AND (v_is_super_admin OR p.id = v_core_project_id);

    RETURN pg_catalog.jsonb_build_object(
        'authorized', true,
        'network', 'mainnet',
        'scope', CASE WHEN v_is_super_admin THEN 'all_core_projects' ELSE 'assigned_core_project' END,
        'projects', COALESCE(v_projects, '[]'::jsonb),
        'message', CASE
            WHEN v_is_super_admin THEN 'Mainnet Core Project workspace loaded successfully.'
            ELSE 'Assigned Mainnet Core Project workspace loaded successfully.'
        END
    );
END;
$function$;

REVOKE ALL ON FUNCTION albukhr_security.get_core_project_workspace() FROM PUBLIC;
REVOKE ALL ON FUNCTION albukhr_security.get_core_project_workspace() FROM anon;
GRANT EXECUTE ON FUNCTION albukhr_security.get_core_project_workspace() TO authenticated;

COMMENT ON FUNCTION albukhr_security.get_core_project_workspace()
IS 'AAL2-protected Mainnet Core Project workspace. Super Admin receives the seven valid Core Projects; Core Admin receives exactly one valid active assigned Core Project. Read-only.';
