ALBUKHR ADMIN — PHASE 2 ARCHITECTURE AUDIT
Repository audited: MuhmdBuharisaeed/albukhr-admin
Exact files verified
The repository currently contains:
admin-login.html
admin-mfa.html
admin-dashboard.html
admin-reset-password.html
js/admin-login.js
js/admin-mfa.js
js/admin-dashboard.js
js/core/environment-core.js
js/core/albukhr-environment.js
js/core/supabase-core.js
js/core/supabase-admin-auth.js
js/core/albukhr-mfa.js
js/core/project-logo-validator.js
Critical findings
1. Environment engine split
The hardened file: js/core/albukhr-environment.js
was not the file loaded by the Admin pages.
The actual HTML pages load: js/core/environment-core.js
That file accepted both:
admin.albukhr.com
www.admin.albukhr.com
This created two competing environment engines.
FIX: Phase 2 hardens the actual loaded compatibility path: js/core/environment-core.js
Canonical approved host: https://admin.albukhr.com
2. MFA engine split
The repository had:
js/admin-mfa.js
js/core/albukhr-mfa.js
The MFA HTML loaded js/admin-mfa.js.
The core engine was therefore not the active page engine.
FIX: admin-mfa.html now loads: js/core/albukhr-mfa.js
The old js/admin-mfa.js is NOT deleted in this phase. This prevents unnecessary breakage for any unseen dependency.
3. Unnecessary QR dependency
admin-mfa.html loaded qrcodejs even though Supabase returns QR SVG data and the MFA engine renders it without qrcodejs.
FIX: qrcodejs was removed from the canonical MFA page load chain.
4. Duplicate MFA verification lifecycle
The legacy page MFA engine independently handled:
challenge
verify
AAL check
admin context refresh
The shared Admin Auth engine already owns challenge/verify/session/context lifecycle.
FIX: The canonical MFA core delegates verification to: AlbukhrSupabaseAdminAuth.verifyMfa()
This reduces drift between two security implementations.
5. Login page stored an unused MFA factor ID
js/admin-login.js wrote: albukhr_admin_mfa_factor
to sessionStorage, but the MFA page did not require that value.
FIX: The Phase 2 login engine removes this unnecessary browser state. The server/Supabase MFA factor list remains authoritative.
Files changed by this package
js/core/environment-core.js
admin-mfa.html
js/core/albukhr-mfa.js
js/admin-login.js
Files deliberately NOT replaced
js/core/supabase-admin-auth.js
js/core/supabase-core.js
js/admin-mfa.js
js/admin-dashboard.js
admin-dashboard.html
admin-reset-password.html
Reason: They were audited for architecture interaction, but Phase 2 does not replace them unless a necessary backward-compatible fix is identified.
Required load order
Admin Login:
Supabase JS SDK
js/core/environment-core.js
js/core/supabase-core.js
js/core/supabase-admin-auth.js
js/admin-login.js
Admin MFA:
Supabase JS SDK
js/core/environment-core.js
js/core/supabase-core.js
js/core/supabase-admin-auth.js
js/core/albukhr-mfa.js
Backward-compatibility rule
Do not delete legacy js/admin-mfa.js in this phase.
First migrate every confirmed caller to the canonical core MFA engine. Only after repository-wide caller verification should legacy files be removed.
