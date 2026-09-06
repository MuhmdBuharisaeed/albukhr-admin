ALBUKHR ADMIN CORE — PHASE 1 INSTALLATION
Copy the files exactly as follows:
albukhr-environment.js → albukhr-admin/js/core/albukhr-environment.js
supabase-core.js → albukhr-admin/js/core/supabase-core.js
albukhr-mfa.js → albukhr-admin/js/core/albukhr-mfa.js
docs/ALBUKHR_ADMIN_CORE_PHASE_1_AUDIT.md → documentation only; do not load it in HTML.
Before replacing files, keep a GitHub commit/backup.
Load order:
albukhr-environment.js
Supabase JS SDK
supabase-core.js
albukhr-supabase-admin-auth.js
albukhr-mfa.js
The MFA page depends on AlbukhrSupabaseAdminAuth.verifyMfa().
