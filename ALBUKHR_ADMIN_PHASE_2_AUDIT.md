ALBUKHR ADMIN PHASE 2 — INSTALLATION
Extract the ZIP.
Copy files to these exact repository locations:
js/core/environment-core.js → albukhr-admin/js/core/environment-core.js
admin-mfa.html → albukhr-admin/admin-mfa.html
js/core/albukhr-mfa.js → albukhr-admin/js/core/albukhr-mfa.js
js/admin-login.js → albukhr-admin/js/admin-login.js
docs/ALBUKHR_ADMIN_PHASE_2_AUDIT.md → documentation/reference only
Do not delete
Do NOT delete:
js/admin-mfa.js
js/core/albukhr-environment.js
They remain during compatibility migration.
Recommended verification after deployment
Open https://admin.albukhr.com/admin-login.html
Verify unknown hosts are rejected by environment core.
Sign in as an authorized admin.
Confirm MFA route opens when AAL2 is not established.
Confirm QR is rendered without qrcodejs.
Enter a valid 6-digit TOTP.
Confirm AAL2 is established.
Confirm Admin Control Center opens.
Sign out.
Confirm protected dashboard cannot remain accessible after sign-out.
Rollback
Keep the previous Git commit before replacing files.
