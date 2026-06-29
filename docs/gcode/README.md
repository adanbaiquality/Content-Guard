# Why This Codebase Looks Good (GCode Guide)

This README explains why the plugin/API code is clean, readable, and maintainable, and what standards we should keep following.

## 1. Strong separation of concerns

The project splits responsibilities clearly:

- `apps/storyblok-plugin`: presentation, interaction, and data mapping for UI.
- `apps/api`: workflow orchestration, integrations, and audit execution.

This prevents UI files from becoming backend-heavy and keeps API logic independent from rendering concerns.

## 2. Predictable typed contracts

TypeScript types are used for:

- Audit categories and severities
- Workflow output payloads
- UI mapping structures

Benefits:

- Fewer runtime surprises
- Better autocomplete and safer refactors
- Easier onboarding for new contributors

## 3. Explicit mapping boundaries

The frontend does not render raw API payloads directly. It maps them through dedicated functions (for `a11y`, `afm`, and `brand`).

This is good-looking code because:

- Transformation logic is visible and testable
- Fallback behavior is explicit
- UI components receive clean, normalized data

## 4. Consistent severity model

Using one severity vocabulary (`critical`, `serious`, `moderate`, `minor`) across UI sorting, status tabs, export ranking, and badges makes behavior coherent and understandable.

Consistency is one of the biggest contributors to code quality and visual polish.

## 5. Readable UI component composition

Cards, tabs, and summaries are broken into focused components with clear names and small responsibilities.

Good signs already present:

- Reusable primitives (`Badge`, `Tabs`, `Skeleton`)
- State and effects localized to panel-level logic
- Presentation classes grouped with related markup

## 6. Defensive UX handling

The code includes resilient behavior for real-world usage:

- Polling with terminal states (`completed`, `failed`, `cancelled`)
- Retry/fallback for stale run IDs
- Story context retrieval from URL + app bridge
- Copy-to-clipboard fallback logic

This kind of defensive coding improves perceived quality for users.

## 7. Operational clarity

README and scripts make common workflows straightforward:

- Start plugin and API quickly
- Trigger webhook runs manually
- Use Dev Tunnel for Storyblok iframe access

Projects feel "good" when development and debugging are easy.

## 8. Visual quality through code

The UI stays polished because styles are systematic:

- Severity-aware borders/backgrounds/dots
- Controlled typography scale and spacing
- Overflow/wrapping handling for long explanation/source text

This keeps interfaces robust with real, messy content.

## GCode standards to keep

Use these as ongoing code quality rules:

1. Keep mapping logic separate from rendering.
2. Never bypass typed audit models with `any` unless unavoidable.
3. Add explicit fallbacks for external payload fields.
4. Keep component responsibilities narrow.
5. Ensure long content wraps safely on mobile and desktop.
6. Keep sorting and severity ranking logic centralized.
7. Prefer clear function names over clever one-liners.

## Definition of "good-looking code" for this repo

Good-looking code here means:

- Easy to scan in 30-60 seconds
- Clear data flow from API -> mapping -> UI
- Minimal hidden behavior
- Stable behavior with malformed or partial input
- UI that remains readable with long text and edge cases

If we preserve these principles, both the code and the plugin output stay high quality.
