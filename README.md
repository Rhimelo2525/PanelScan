# PanelScan

AR-powered e-commerce and installation-project-management system for **Disenyo Interior
Solution** — customers browse and buy interior panel products, book installation
services, take AR measurements to estimate how many panels a job needs, track
projects, chat with staff, and leave feedback. Staff (OWNER and MODERATOR) run the
operational and business side through the same API with different permissions.

## Repository layout

```
PanelScan/
├── backend/     # Express + TypeScript + Prisma API (CockroachDB) — see backend/README.md
├── frontend/    # Expo + React Native + TypeScript mobile app — see frontend/README.md
└── .github/     # GitHub Actions CI
```

## Team  Development

New to this repository? Start here, in order:

1. **[TEAM_ONBOARDING.md](TEAM_ONBOARDING.md)** — Clone the repo, install both
   projects, configure your environment, and make your first commit. Start here.
2. **[FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md)** — The API contract: authentication
   flow, roles, response/error format, Postman collections.
3. **[DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)** — Backend architecture, the module
   pattern, Git/CI workflow, testing philosophy, Definition of Done.
4. **[DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)** — Current status, what's built,
   what's deliberately deferred, and priorities.
5. **[backend/README.md](backend/README.md)** — The full backend API reference.
6. **[frontend/README.md](frontend/README.md)** — The frontend project's stack, folder
   structure, and how to add a feature.

---

*This file is intentionally a short index — see [TEAM_ONBOARDING.md](TEAM_ONBOARDING.md)
for the full setup and workflow guide.*
