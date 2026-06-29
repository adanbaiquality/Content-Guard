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
