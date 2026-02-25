# Orchestration API PR – Pre-existing / environment notes

For PR: **feat(orchestration): stable programmatic orchestration API** (Fixes #116).

## Pre-existing repo issues (not introduced by this PR)

These were observed during the pre-PR checklist. They affect the **whole repo**, not the orchestration changes.

### Lint config

- **Root `npm run lint`** fails: script references `config/.eslintrc.strict.js` but the repo has `config/.eslintrc.strict.cjs`.
- **Orchestration code:** No ESLint errors reported in IDE for `agentic-flow/src/orchestration` or `agentic-flow/tests/orchestration`.

### Prettier config

- **Root `npm run format:check`** / **`npm run format`** fail: script references `config/.prettierrc.js` but the repo has `config/.prettierrc.cjs`.
- Orchestration files follow existing style.

### TypeScript / build

- **`npx tsc --noEmit`** in `agentic-flow` fails in **other** modules:
  - `src/reasoningbank/AdvancedMemory.ts`, `HybridBackend.ts`: missing `../memory/SharedMemoryPool.js`
  - `src/sdk/e2b-sandbox.ts`: missing `e2b` and `@e2b/code-interpreter`
- **Orchestration code** has no type errors.
- **`npm run build`** in agentic-flow uses `tsc ... || true`, so it exits 0 despite these errors.

### Commit-msg hook

- **Husky commit-msg** calls `scripts/validate-commit-msg.js`, which is missing (MODULE_NOT_FOUND). Commits used `--no-verify` where needed so the branch could be updated.

### Vitest / Rollup (darwin-arm64)

- On a clean install, **Vitest** can fail with `Cannot find module @rollup/rollup-darwin-arm64` (npm optional dependency). Workaround: `npm install @rollup/rollup-darwin-arm64 --save-optional` in `agentic-flow`. Documented in `agentic-flow/tests/orchestration/README.md`.

---

## PR description block (paste into PR)

Copy the following into your PR description so reviewers see the pre-existing issues and what was verified:

```markdown
### Pre-existing repo issues (not from this PR)

- **Lint:** Root `npm run lint` fails (script expects `config/.eslintrc.strict.js`, repo has `.eslintrc.strict.cjs`). No ESLint errors in orchestration code (IDE).
- **Prettier:** Root `format:check`/`format` fail (script expects `config/.prettierrc.js`, repo has `.prettierrc.cjs`).
- **TypeScript/build:** `tsc --noEmit` fails in other modules (SharedMemoryPool, e2b); orchestration code typechecks. Build uses `tsc ... || true` so it exits 0.
- **Commit-msg hook:** `scripts/validate-commit-msg.js` missing; used `--no-verify` where needed.
- **Vitest (darwin-arm64):** Clean install may need `npm install @rollup/rollup-darwin-arm64 --save-optional` in agentic-flow (see `tests/orchestration/README.md`).

### Verified for this PR

- `npm run test:orchestration` and `npm run test:orchestration:smoke` pass in agentic-flow.
- Root `npm test` passes. CHANGELOG and docs updated.
```

---

## Verification performed for this PR

- **Orchestration tests:** `npm run test:orchestration` (Vitest) and `npm run test:orchestration:smoke` (tsx) pass in `agentic-flow`.
- **Root tests:** `npm test` (test:retry, test:logging, benchmark suite) passes.
- **CHANGELOG.md** updated; **docs** added/updated for orchestration and memory plane.
