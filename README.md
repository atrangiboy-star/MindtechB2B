# MindTechB2B Workspace

MindTechB2B's internal project and workflow workspace. The UI is a React, TypeScript and Vite application inspired by familiar work management patterns. It uses Supabase Auth, PostgreSQL, row-level security and Realtime. The login flow requires a company email, password, and TOTP authenticator code. No sample records are shown to signed-out users.

## Current implementation

- Company branded sign-in with the supplied MindTechB2B logo.
- Exact `@mindtechb2b.com` domain validation in the client and an Auth database trigger. RLS also checks the verified company domain.
- Mandatory second factor enforced in app state and database policies through Supabase Authenticator Assurance Level 2 (AAL2). First sign-in guides the employee through authenticator enrollment; later sign-ins request the current 6-digit TOTP code.
- `amaan.d@mindtechb2b.com` is bootstrapped as the sole `Administrator` / superadmin in the database. Other existing company accounts default to `Team Member`. The superadmin has exclusive task deletion and administration access under current policies.
- Persistent task create/edit/status updates, master tracker, CSV export, overview metrics, department summaries, Kanban, deadline list, global search, theme setting, and Realtime refresh.
- Database foundation for departments, workspaces, boards, custom typed columns, assignees, subtasks, dependencies, cross-board links, comments, activity history, saved views, and configurable automation rules.
- GitHub Actions builds and deploys the Vite application to GitHub Pages.

The current UI is a first secure workflow release, not a complete Monday.com replacement. Admin screens for user/role management, department and board editors, custom-column CRUD, cross-department connections, comments/attachments, advanced timeline/Gantt/workload views, and an automation runner still need implementation. Do not represent those foundation tables as completed user-facing features.

## Supabase setup

1. Use the Supabase project with URL `https://lbudusorkjkktspgsexf.supabase.co`, or update `VITE_SUPABASE_URL` for the correct project.
2. In the Supabase SQL Editor, run the complete `supabase/schema.sql` script. It creates and secures the workspace schema, profiles, domain enforcement, superadmin bootstrap and AAL2-gated policies. Back up any existing project data before applying schema changes.
3. In Supabase Authentication settings, enable email/password sign-in and TOTP MFA. Set the minimum assurance level to **aal2** if available. The database policies independently require `aal2` for app data.
4. Create/confirm the user `amaan.d@mindtechb2b.com` in Supabase Auth before signing in. The SQL trigger assigns Administrator; it does not create or set a password for this account.
5. Add the GitHub Pages URL as the site URL and an allowed redirect URL in Supabase Auth.
6. Verify SMTP delivery if email confirmation is enabled for new company accounts. This repository does not expose public registration; provision employee identities through the trusted Supabase admin workflow.

The frontend uses only Supabase's public anon/publishable key. Never put a service-role or secret API key in GitHub Actions build variables.

## Local development

Requires Node.js 22 or later.

```sh
npm install
npm run dev
npm run build
npm run preview
```

For local development, create `.env.local` (do not commit it):

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
```

## GitHub Pages deployment

1. In repository Settings → Secrets and variables → Actions, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (public key only).
2. In Settings → Pages, choose **GitHub Actions** as the source.
3. Push to `main`; the workflow requires both Supabase secrets and deploys to the repository's GitHub Pages URL.
4. Confirm the Actions deployment succeeds, then verify password login, first-user TOTP enrollment, subsequent OTP login, task writes, and cross-browser sync.

The `mindtechb2b.com` domain is enforced as the employee email domain. No custom website DNS is changed by this repository.
Expected Pages address: `https://atrangiboy-star.github.io/MindtechB2B/`.

GitHub repository: https://github.com/atrangiboy-star/MindtechB2B

## Important limitations

Supabase project ownership, Auth configuration, Auth user/password provisioning, GitHub Actions secrets, GitHub Pages configuration, and a live end-to-end production session require access to their respective account settings. A successful local build does not prove those services are configured. Supabase free-tier quotas and GitHub Pages availability are subject to their current provider limits.

