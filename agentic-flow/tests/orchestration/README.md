# Orchestration API tests

## Run tests

**Vitest (full unit tests):**
```bash
npm run test:orchestration
```

**Smoke tests (tsx, no Vitest):**
```bash
npm run test:orchestration:smoke
```

**If Vitest fails with `Cannot find module @rollup/rollup-darwin-arm64`** (npm optional dependency bug on darwin-arm64):
```bash
npm install @rollup/rollup-darwin-arm64 --save-optional
npm run test:orchestration
```

## Example

```bash
npx tsx examples/orchestration-memory-example.ts
```
