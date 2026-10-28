# MindTechB2B

A responsive operations workspace for task tracking across Operations, Data, QA, Campaign Management, Sales and Management teams.

## Current application

- Overview dashboard with task counts, overdue work and department workload.
- Create tasks with owner, department, priority, status, due date and description.
- Search and filter tasks, update task status, delete tasks and export visible tasks as CSV.
- Campaign pacing, department workload, reports and monthly calendar views.
- Light/dark theme and responsive mobile navigation.
- GitHub Pages deployment workflow.

## Deployment

The site is configured to deploy from the `main` branch through GitHub Actions. In GitHub, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions** if it is not already selected. Then open **Actions** and confirm the “Deploy MindTechB2B to GitHub Pages” workflow completes.

Expected URL: https://atrangiboy-star.github.io/MindtechB2B/

## Supabase shared workspace setup

The frontend now includes a Supabase auth/sync client (`backend.js`) and the shared table migration at `supabase/schema.sql`. The configured project URL is `https://lbudusorkjkktspgsexf.supabase.co`.

Before shared team mode works:
1. In the matching Supabase project, open **SQL Editor** and run `supabase/schema.sql`.
2. In **Project Settings → API**, copy the public anon/publishable key into `config.js` as `supabaseAnonKey`. Never use a `service_role` or secret key in browser code.
3. In Supabase Auth settings, set the site URL to the deployed GitHub Pages URL and add the final custom domain to allowed redirect URLs.
4. Enable email/password sign-in and configure email confirmation as required by company policy.
5. Verify that only `@mindtechb2b.com` users can authenticate and access rows. The migration enforces the domain at row level.

When the public key is not configured, the app intentionally stays in local preview mode. In shared mode, authenticated users read and update the common `workspace_tasks` table and receive Realtime refreshes. Do not store sensitive customer/prospect data until the access policies and authentication flow have been tested by an administrator.

## Current scope and remaining launch requirements

The task board currently supports creating tasks, changing status, deleting tasks, search/filter, CSV export, dashboard metrics, department workload, calendar and reports. The current implementation does not yet provide arbitrary custom columns, multi-workspace permissions, file attachments, or a full audit log. The custom domain must be registered and DNS must point to GitHub Pages before it can be served there.

## Security and validation

- Do not store confidential client/prospect data in preview mode.
- Review database access policies before connecting company data.
- Validate deployment status and test create/update/export flows after each release.
