# Content Guard Monorepo (Next.js + Hono)

This repository is now a **pnpm monorepo** with:

- `@content-guard/storyblok-plugin` (`apps/storyblok-plugin`): Storyblok plugin Next.js frontend (Pages Router)
- `@content-guard/api` (`apps/api`): Hono backend

## Workspace layout

- `package.json`: workspace orchestrator scripts
- `pnpm-workspace.yaml`: workspace package selection
- `apps/storyblok-plugin`: Storyblok plugin app
- `apps/api`: Hono API service

## Environment setup

1. Copy `apps/storyblok-plugin/.env.local.example` to `apps/storyblok-plugin/.env.local` for Next.js local env.
2. Copy values into `.env` as needed for backend/runtime.

Important variables:

- `NEXT_PUBLIC_API_BASE_URL` (default: `http://localhost:8787`)
- `CLIENT_ID`
- `CLIENT_SECRET`
- `BASE_URL`
- `WEB_ORIGIN` (default: `http://localhost:3000`)
- `API_PORT` (default: `8787`)
- `STORYBLOK_MANAGEMENT_TOKEN` (optional, for `/api/user_info` in Hono)

## Run locally

Install dependencies:

```shell
pnpm install
```

Start web + api together:

```shell
pnpm dev
```

Useful alternatives:

```shell
pnpm dev:plugin
pnpm dev:api
pnpm build
```

## Current API routing notes

- The `Example` frontend component now calls the Hono backend using `NEXT_PUBLIC_API_BASE_URL`.
- The Storyblok plugin Next.js API routes now live under `apps/storyblok-plugin/src/pages/api`.
- Hono endpoints currently available:
  - `GET /api/health`
  - `GET /api/example`
  - `GET /api/user_info`
  - `POST /api/_app_bridge`
  - `POST /api/_oauth`
  - `ALL /api/connect/*` (placeholder response)
