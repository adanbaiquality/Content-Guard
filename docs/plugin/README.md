# Content Guard Plugin: How It Works

This document explains how the Storyblok plugin works end-to-end.

## What the plugin does

The plugin helps editors run and review three audit categories for a Storyblok story:

- Accessibility (`a11y`)
- AFM compliance (`afm`)
- Brand/style compliance (`brand`)

It displays findings in a clean panel with:

- Severity badges (`critical`, `serious`, `moderate`, `minor`)
- Rule references
- Message details
- Export to Excel

## High-level architecture

The monorepo has two runtime apps:

- Frontend plugin: `apps/storyblok-plugin` (Next.js)
- Audit API: `apps/api` (Nitro + Workflow SDK)

The plugin UI runs in Storyblok (often via Dev Tunnel), and the API performs audits and stores workflow run outputs.

## Data flow

1. The plugin collects story context (`spaceId`, `storyId`) from URL or Storyblok app bridge messages.
2. The frontend asks the API for the latest run:
   - `GET /api/workflows/latest?id=<storyId>&spaceid=<spaceId>`
3. If no usable run is available, it triggers a new workflow run:
   - `POST /api/webhooks/storyblok/workflow-changed`
4. It polls run output:
   - `GET /api/workflows/<runId>/output`
5. The UI maps workflow results into category cards and renders them.

## Where audit data comes from

### A11y and AFM

- Workflow fetches draft story content from Storyblok.
- Browser-style checks run in workflow steps.
- Findings are returned with impact/severity metadata.

### Brand/style

- Workflow fetches AI branding rules from Storyblok management API (`ai_branding_rules`).
- Content is evaluated against rules using OpenAI-compatible generation.
- Violations include guideline, explanation, excerpt, and severity.
- Minor brand violations are tracked in metadata and can be hidden from blocking output.

## Severity mapping in frontend

The UI consumes normalized severities:

- `critical`
- `serious`
- `moderate`
- `minor`

Brand severity now uses incoming workflow violation severity (with safe normalization/fallback), so cards, tabs, and export order reflect real audit priority.

## API base URL behavior

Frontend uses `NEXT_PUBLIC_API_BASE_URL` through `getApiBaseUrl()`.

- Local default: `http://localhost:8787`
- If running inside a remote iframe/tunnel and target is localhost, helper can fall back to same-origin routes to avoid unreachable localhost from remote host context.

## Main user interactions

- Category tabs show issue count + status dot.
- Each finding card shows severity and explanation.
- Rule chip links to rule source when available.
- "Copy fix-prompt" button copies a structured prompt for editor assistance.
- "Download Report" exports all category findings to XLSX.

## Operational notes

- Run plugin: `pnpm dev:plugin`
- Run API: `pnpm dev:api`
- Trigger webhook manually: `bash scripts/trigger-webhook.sh`
- In tunnel scenarios, keep both plugin and API running locally while hosting the tunnel.

## Why this structure works well

- Clear separation: UI concerns in plugin, audit execution in API/workflow.
- Reproducible run IDs and persisted outputs enable reliable polling and reload behavior.
- Typed mapping layer in frontend keeps rendering stable even when workflow payloads evolve.
