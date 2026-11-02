# MindTechB2B Workspace

MindTechB2B is an online-only project and operations workspace deployed at https://atrangiboy-star.github.io/MindtechB2B/.

## Online services

- GitHub Pages hosts the React application.
- Supabase provides company sign-up, password sign-in, authenticator OTP (TOTP), PostgreSQL data, row-level security, and realtime task updates.
- The Supabase URL and publishable client key are public browser configuration. Database access is controlled by the SQL policies in `supabase/schema.sql`. Never put a Supabase `service_role` key in this repository or the browser app.

## Database setup

Apply the SQL files in this order in the Supabase SQL Editor for the MindTechB2B project:

1. `supabase/schema.sql` (workspace, profiles, departments, boards, tasks, and RLS)
2. `supabase/board-access-migration.sql` (board membership and scoped board/task access)
3. `supabase/member-photos-migration.sql` (private organization profile photos)
4. `supabase/role-departments-comments-logs-migration.sql` (Super Admin/Administrator roles, department grants, per-cell comments, scoped activity logs, and admin-only master tracker access)

The final migration updates existing row-level security policies. Do not omit it if you want the role, comment, department-access, and activity-log features to work.

In Supabase Authentication URL settings, set the site URL and an allowed redirect URL to:

`https://atrangiboy-star.github.io/MindtechB2B/`

Keep email confirmation enabled. Team members sign up with a company email and password, confirm through their inbox, then set up an authenticator app at first sign-in. The `amaan.d@mindtechb2b.com` account is the bootstrap Super Admin. Other company accounts receive Team Member access until the Super Admin assigns a role or department from Settings.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Run `npm install`.
3. Run `npm run dev`.

`npm run build` type-checks and builds the static site. GitHub Actions injects the public Supabase client configuration during deployment; no repository secrets are required for the publishable key.

