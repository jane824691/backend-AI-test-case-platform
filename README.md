# AI Test Case Platform

Phase 1 MVP scaffold for an AI-assisted test management platform.

## Workspaces

- `backend`: NestJS REST API, session/authentication stub, permissions, and module boundaries.
- `frontend`: Next.js application shell and Phase 1 page routes.
- `db`: MySQL 8 schema.

## Run locally

Install dependencies from each workspace, then start the API before the web app.

```powershell
cd backend
npm.cmd install
npm.cmd run start:dev
```

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

The frontend expects the API at `http://localhost:3001/api/v1` by default. Use the role selector in the frontend header to create a development-only session cookie.

## Phase 1 scaffold boundary

The current source intentionally contains no MySQL repository implementation, Redis client, AI provider, upload parser, or full CRUD. Those concerns have explicit interfaces and module boundaries ready for the next implementation increment.

