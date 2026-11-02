# DSH Red Team 1.3.2

This public repository preserves the DSH-only plugin version requested by the user.
The source baseline is 8654865791cc239c5ff1f6c0e761976c61c26ac2 (v1.3.2).
Pin DeepSeek Harness compatibility to 0.1.2-alpha.5, as in that snapshot.
There is no separate Prism login page, account database or standalone application here.
Use DSH's existing authentication, sessions, models, sandbox, approvals and MCP runtime.
Do not reintroduce the superseded 1.4.0 login or experimental standalone code.
Keep the private Prism platform's history, blue-team code, memory and secrets out of this repository.

## Architecture

- `src/index.ts` exposes one Cordis plugin from `src/plugins/redteam.ts`.
- `src/client/` integrates the red-team dashboard into DSH.
- `src/lib/` contains reusable assessment logic and must not depend on the host runtime.
- `tools/src/plugins/` contains individual MCP tool adapters.
- Scope checks supplement DSH authorization and must not bypass sandbox or approval.
- Preserve MIT licensing, source provenance and user-owned runtime data.

## Validation

Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm test:coverage`, `pnpm build`, and `pnpm pack --dry-run` before handoff.
When changing the DSH version, install the packed plugin into an isolated matching DSH
profile and inspect `--dump-config`; do not claim model/tool execution was tested by that check.
Do not run standalone build or deployment commands: they do not exist in this version.
