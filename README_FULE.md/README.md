ALBUKHR Invitation Security Fix
Files and placement
js/project-invitation.js
Replace: js/project-invitation.js
admin-core-team.html
Replace: admin-core-team.html
What changed
project-invitation.js
Preserves canonical #token= invitation architecture.
Does not migrate tokens to ?token=.
Gives a clear message when project-invitation.html is opened without the complete invitation link.
Keeps Supabase RPC names unchanged:
validate_project_invitation
accept_core_project_invitation
Keeps Mainnet-only protection.
Keeps invitation data in memory only.
Removes the raw token from browser history only after successful server-side acceptance.
admin-core-team.html
Corrects stale UI wording from "Invitation Token" to "Invitation Link".
Corrects the copy button wording.
The existing admin-core-team.js already generates the full canonical URL: project-invitation.html#token=<token>
Important
This ZIP intentionally does NOT replace:
js/core/environment-core.js
js/core/supabase-core.js
js/core/supabase-admin-auth.js
js/admin-core-team.js
MFA engine
database RPCs
RLS policies
Those engines are left untouched to avoid breaking previously completed ALBUKHR architecture.
