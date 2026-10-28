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

## Data and production readiness

This initial hosted version is a **front-end preview**. Task changes are saved in the current browser's local storage and are not yet shared between team members or devices. The preview uses example tasks; replace these with real organization data only after a shared backend is configured.

For multi-user production use, connect a Supabase project, apply a reviewed database migration with Row Level Security, and integrate authenticated reads/writes in the application. The public Supabase URL and anon/publishable key may be used by a browser client; never expose a Supabase service-role key in frontend code. Do not put secrets in this repository. The current preview does not claim to provide production authentication or shared persistence.

## Security and validation

- Do not store confidential client/prospect data in preview mode.
- Review database access policies before connecting company data.
- Validate deployment status and test create/update/export flows after each release.
