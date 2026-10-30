# MindTechB2B Workspace

A browser-only project and workflow tracker hosted on GitHub Pages. It requires no backend, API key, database, or account. Task data, department names, reminder preferences, and theme settings are saved in the current browser's local storage. The supplied MindTechB2B logo appears in the shared workspace navigation and header.

## Working features

- Create, edit, search, filter, and delete tasks with a department, owner, status, priority, deadline, progress, and description.
- Overview, master tracker, Kanban, deadline calendar, department summaries, and CSV reports.
- Add departments, switch light/dark themes, and enable local due-date reminders. Reminders run while the workspace is open and never change task status.
- Export or restore a JSON workspace backup from Settings.
- Responsive layout and browser-side persistence across refreshes on the same device/browser.

## Limits of browser-only mode

This is a single-browser workspace. It does not sync between employees or devices, and browser storage can be cleared by the user or browser. Export backups regularly. There is no secure login, password, OTP, role enforcement, shared database, server-side audit log, uploads, or background notifications without a backend. The `@mindtechb2b.com` domain and superadmin address cannot be securely enforced in a static site.

## GitHub Pages

The deployed page is `https://atrangiboy-star.github.io/MindtechB2B/`. GitHub Actions runs `npm ci`, type-checks and builds with `npm run build`, then deploys `dist` on pushes to `main`. No repository secrets are required.

## Local development

Requires Node.js 22 or later.

```sh
npm ci
npm run dev
npm run build
npm run preview
```

Repository: https://github.com/atrangiboy-star/MindtechB2B

