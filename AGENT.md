# Codex Agent Guidelines (community-kitchen)

These rules mirror the Cursor dev rules in `.cursor/rules/dev_rules.mdc` and apply to all work in this repo.

## Release and bundle

- The shipped bundle lives at `dist/Code.js`; it is compiled JS.
- Content inside `src/WebFormTemplate.ts`/`formHtml` must not reference TypeScript (final bundle is pure JS).

## New features

- Add diagnostic logs at the web form level and feature-specific logs; logs should surface at the top of the web form (visible in DevTools).
- Update `SetupInstructions.md`, `config_schema.yaml` (schema/LLM guidance), and `README.md` to cover new features.
- Run unit tests; fix failures and extend coverage for new features.
- Run `npm run build` to ensure the app compiles.

## Architecture / separation of concerns

- Keep clear boundaries: UI (React components), state (hooks/store), domain logic (pure TS), infrastructure (API/IO).
- React components should focus on rendering + wiring; push business logic into `hooks/` and `services/`/`domain/`.
- Domain logic should be pure/testable—no direct DOM, network, or global mutable state.
- Use a single abstraction layer for external services (`src/services/*`); centralize retries, error mapping, telemetry.
- Prefer dependency injection over hard-coded environment details.
- Favor composition over inheritance; split files that grow beyond ~200–300 lines.
- Avoid circular deps; imports should flow UI → hooks/store → domain → services.
- Centralize config/constants (e.g., `src/config/`, `src/constants/`); avoid scattered magic strings.
- Design features under `src/features/<feature>/` for extensibility (components, hooks, services, tests).
- Reuse via shared utilities/hooks; extract repeated code instead of copy/paste.
- Use explicit, typed interfaces at boundaries; validate untrusted inputs at the edges.
- Keep state local by default; lift only when multiple siblings need it. Avoid global state for transient UI concerns.
- Each new module should have a clear owner and a doc comment describing responsibility and boundaries.

## Testing

- Prioritize unit tests for domain logic; integration tests for service layers; UI tests for user flows.
- Treat security (Snyk) as first-class; do not skip security-related checks.
