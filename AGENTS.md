# dsh-redteam Repository Guidelines

## Product boundary

This is the public dsh-redteam snapshot, maintained on main independently of the private Prism platform.
The source baseline is c938e605e2182735d69b9e7170a86934328f53a3, package version 1.4.0,
with DSH 0.2.1-rc.2 as the default Docker/Compose runtime. This is not a BATE1.0 release.
Preserve the original license, source provenance and explicit DSH compatibility boundary.
Do not import private platform history, blue-team code, credentials or user-owned data here.

The experimental standalone code is retained as it existed in the source snapshot.
Do not claim that standalone Agent/MCP execution or legacy-session migration is complete.
Keep public documentation consistent with doc/snapshot.md.

## Architecture

- The legacy package exposes one Cordis plugin entry point from `src/index.ts`.
- Standalone plugins have explicit dependencies, action registration, and disposal in `src/server/plugins.ts`.
- Standalone HTTP authorization and resource checks must not depend on DSH.
- `preset/redteam` may compose that one plugin into DSH's native mode UI; it is not a second plugin entry point.
- Pure reusable logic belongs in `src/lib` and must not import Harness runtime packages.
- Cordis integration belongs in `src/plugins`.
- The scope guard must call downstream `next()` whenever it does not deny a call.
- Scope checks supplement but never replace Harness sandbox and approval.
- Evidence and reports must be bounded and redacted; never persist credentials or successful tool result bodies.
- Local `.dsh-redteam`, legacy `.prism`, and all credentials are user-owned and must not be printed, packaged,
  or removed.

## Required checks

Run before handoff:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm pack --dry-run
pnpm build:standalone
```

When changing the Harness version, also install the packed tarball into a temporary DSH profile and inspect
`--dump-config` before widening peer compatibility.
