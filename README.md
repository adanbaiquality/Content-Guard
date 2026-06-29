# Content Guard Monorepo (Next.js + Nitro)

This repository is now a **pnpm monorepo** with:

- `@content-guard/storyblok-plugin` (`apps/storyblok-plugin`): Storyblok plugin Next.js frontend (Pages Router)
- `@content-guard/api` (`apps/api`): Nitro backend with Workflow SDK

## Workspace layout

- `package.json`: workspace orchestrator scripts
- `pnpm-workspace.yaml`: workspace package selection
- `apps/storyblok-plugin`: Storyblok plugin app
- `apps/api`: Nitro API service

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
- `WORKFLOW_TARGET_WORLD` (optional, defaults to local world during development)
- `WORKFLOW_POSTGRES_URL` (required when `WORKFLOW_TARGET_WORLD=@workflow/world-postgres`)

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

- The `Example` frontend component now calls the API using `NEXT_PUBLIC_API_BASE_URL`.
- The Storyblok plugin Next.js API routes now live under `apps/storyblok-plugin/src/pages/api`.
- Nitro endpoints currently available:
  - `GET /api/health`
  - `POST /api/webhooks/storyblok/workflow-changed`

### Storyblok workflow webhook behavior

- The webhook endpoint accepts Storyblok workflow change payloads.
- If the incoming state is `reviewing`, the API triggers a Workflow SDK workflow to run one or more audits.
- If the state is anything else, the endpoint acknowledges the request and performs no audits.
