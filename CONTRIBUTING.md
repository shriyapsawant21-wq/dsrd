# Contributing

Start with [index.md](index.md), [architecture.md](architecture.md), and
[progress.md](progress.md). Read `AGENTS.md` before changing code.

Use a separate branch/worktree, keep commits small, and preserve other
contributors’ edits. Public contract changes require checking scheduler,
runtime, proof, API, and UI consumers. Add a failing test first for behavior
changes; run focused tests and workspace typecheck before committing.

Do not treat setup failures, generic logs, or a timeout as race evidence.
Never run broad Docker cleanup. Only clean resources that the current attempt
owns, and report what remains.

Run `npm test` from a primary checkout. Vitest excludes nested worktrees; do
not bypass that isolation when adding test commands.
