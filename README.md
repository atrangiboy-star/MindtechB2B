# MindTechB2B Workspace

MindTechB2B is an online-only project and operations workspace deployed at https://atrangiboy-star.github.io/MindtechB2B/.

## Online services

- GitHub Pages hosts the React application.
- Supabase provides company sign-up, password sign-in, authenticator OTP (TOTP), PostgreSQL data, row-level security, and realtime task updates.
- The Supabase URL and publishable client key are public browser configuration. Database access is controlled by the SQL policies in `supabase/schema.sql`. Never put a Supabase `service_role` key in this repository or the browser app.

## Database setup

Before using the hosted site, run `supabase/schema.sql` once in the Supabase SQL Editor for the MindTechB2B project. It creates the workspace/profile/department/board/task tables, records task history, restricts accounts to `@mindtechb2b.com`, assigns Administrator to `amaan.d@mindtechb2b.com`, and protects records with RLS. It also adds workspace tasks to Supabase Realtime.

In Supabase Authentication URL settings, set the site URL and an allowed redirect URL to:

`https://atrangiboy-star.github.io/MindtechB2B/`

Keep email confirmation enabled. Team members sign up with a company email and password, confirm through their inbox, then set up an authenticator app at first sign-in. The exact superadmin email receives the Administrator role through the database trigger; other company accounts receive Team Member access.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Run `npm install`.
3. Run `npm run dev`.

`npm run build` type-checks and builds the static site. GitHub Actions injects the public Supabase client configuration during deployment; no repository secrets are required for the publishable key.

