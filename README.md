# MindTechB2B Operations Workspace

A React + TypeScript + Vite workspace for internal task tracking across Operations, Data, QA, Campaign Management, Sales, Marketing and Management. The frontend is designed for GitHub Pages; Supabase provides authentication, PostgreSQL task storage and Realtime refresh.

## Current implementation

- Responsive dashboard, master task tracker, Kanban board, deadlines/calendar list, and department workload summaries.
- Task create/edit/delete, status changes, priority, owner, department, due date, progress, descriptions, global search, department/status filters and CSV export.
- Light/dark theme and mobile-friendly layout.
- Supabase email/password sign-in and sign-up UI restricted in the client to `@mindtechb2b.com`; database RLS restricts task access to authenticated users on that domain.
- Local browser preview mode when Supabase configuration is not available. Preview records are **not** shared or cloud-persisted.
- GitHub Actions build/type-check/deployment workflow.

## Repository

https://github.com/atrangiboy-star/MindtechB2B

## Local development

Requires Node.js 20 or later.

```sh
npm install
npm run dev
npm run build
npm run preview
```

Create a local `.env.local` file (never commit secrets):

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
```

The anon/publishable key is intended for browser use with correctly configured RLS. **Never use a service-role/secret key in the frontend.**

## Supabase setup

1. Open the MindTechB2B Supabase project.
2. In SQL Editor, run the complete script in `supabase/schema.sql`.
3. In Project Settings → API, copy the project URL and the public anon/publishable key.
4. In Authentication → URL Configuration, add the deployed GitHub Pages URL to allowed redirect URLs.
5. Configure a Supabase **Before User Created** hook (or equivalent server-side auth restriction) to reject email addresses not ending in `@mindtechb2b.com`. The client-side check is not a security boundary. RLS protects access to task records.
6. Confirm Realtime is enabled for `public.workspace_tasks` if live cross-client refresh is required.

## GitHub Pages deployment

1. In repository Settings → Secrets and variables → Actions, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (public anon/publishable key only)
2. In Settings → Pages, select **GitHub Actions** as the build source.
3. Push to `main`; the workflow runs `npm install`, TypeScript checks, Vite build and deploys `dist`.
4. Confirm the latest workflow succeeds in the Actions tab.

Expected project URL: https://atrangiboy-star.github.io/MindtechB2B/

Custom domain target: https://mindtechb2b.co.in (works only after the domain is registered, DNS records are set at its authoritative DNS provider, and Pages certificate/domain validation succeeds). Do not remove existing mail-related DNS records.

## Current scope and limitations

This is the first React/TypeScript core implementation, not yet the complete Monday.com-style specification. Workspaces, projects/boards/groups, configurable custom columns, roles and department-level authorization, subtasks/dependencies, comments/mentions, file uploads, audit history, advanced views (timeline/Gantt/workload), Excel exports, and configurable automation rules still need implementation. The present schema is a shared task table and domain-level RLS; it does not yet provide per-department isolation or full RBAC.

The supplied company logo was not available as an attachment in the context used to update this repository, so the current interface uses a simple text mark. Replace it with the actual approved logo once supplied.

## Verification status

The GitHub repository has been updated with the React/Vite foundation and deployment workflow. A successful production build, Supabase database setup, authentication/RLS test, GitHub Pages deployment, and custom-domain DNS have **not yet been verified** from this session. Do not treat demo/preview data as production data.
