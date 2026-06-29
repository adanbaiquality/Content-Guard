# Content Guard Monorepo (Next.js + Nitro)

This repository is now a **pnpm monorepo** with:

- `@content-guard/storyblok-plugin` (`apps/storyblok-plugin`): Storyblok plugin Next.js frontend (Pages Router)
- `@content-guard/api` (`apps/api`): Nitro backend with Workflow SDK

## Workspace layout

- `package.json`: workspace orchestrator scripts
- `pnpm-workspace.yaml`: workspace package selection
- `apps/storyblok-plugin`: Storyblok plugin app
- `apps/api`: Nitro API service

## Production URLs

- Frontend (Storyblok plugin): https://cute-torrone-36f67a.netlify.app/
- API (Nitro backend): https://playful-fenglisu-c02423.netlify.app/

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
- `CONTENT_GUARD_DB_PATH` (optional, defaults to `.workflow-data/content-guard.db` for local cache/output persistence)
- `OPENAI_API_KEY` (required for the style-guide audit)
- `OPENAI_MODEL` (optional, default: `gpt-4o-mini`)
- `OPENAI_BASE_URL` (optional, for OpenAI-compatible endpoints)
- `OPENAI_API_VERSION` (optional, useful for Azure-hosted OpenAI-compatible endpoints)
- `OPENAI_API_KEY_HEADER` (optional, default: `Authorization`; use `api-key` for Azure-style auth)

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

## Expose local port 3000 with Dev Tunnel

If you want to share your local plugin UI (`http://localhost:3000`) with Storyblok webhooks or teammates, you can create your own Dev Tunnel.

1. Install and sign in to the Dev Tunnel CLI (if needed), then confirm it works:

```shell
devtunnel --version
```

2. Create a new tunnel and keep the generated tunnel ID:

```shell
devtunnel create
```

3. Add port `3000` to that tunnel:

```shell
devtunnel port create <your-tunnel-id> -p 3000 --protocol http
```

4. Start hosting so requests are forwarded to your local app:

```shell
devtunnel host <your-tunnel-id>
```

5. Copy one of the printed public URLs (for example, `https://<name>-3000.euw.devtunnels.ms`) and use it where needed.

Notes:

- Keep the hosting terminal running; stopping it closes the tunnel.
- You can inspect traffic via the `-inspect` URL shown in host output.
- Official command reference: https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/cli-commands

### Known working tunnel commands used in this repo

These are the exact commands that were used successfully in this project session.

1. Verify tunnel metadata and mapped port URL:

```shell
devtunnel show majestic-lake-8cz1g5j.euw --json
```

2. Start hosting the existing tunnel ID (port 3000 was already configured):

```shell
devtunnel host majestic-lake-8cz1g5j.euw
```

3. The host output exposed these working plugin URLs:

```text
https://rmjmlk6v.euw.devtunnels.ms:3000
https://rmjmlk6v-3000.euw.devtunnels.ms
```

4. Keep this host command running while `pnpm dev:plugin` and `pnpm dev:api` are running.

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
