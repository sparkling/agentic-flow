# ADR-060: AgentDB v3 — Proof-Gated Graph Intelligence

## Status

**Implemented** (2026-02-25)

## Context

AgentDB v2 (2.0.0-alpha.2.11) had 21 controllers, 12,943 lines of TypeScript, and a clean backend abstraction — but only 33% of controllers were actively used. The vectorBackend was **disabled** (`controllerVB = null` in agentdb-service.ts) because ruvector 0.1.24's native addon throws unhandled rejections ("Missing field `k`", "Dimension mismatch: expected 384, got 0") that escape try/catch via native callbacks. All vector searches fell back to brute-force SQL.

Additionally, 5 npm packaging issues needed fixing:
1. Missing dist-tags for alpha/v3
2. No ESM/CJS dual exports
3. Incomplete controllers barrel (6 controllers missing)
4. Outdated README on npm
5. Empty default export returning undefined

## Decision

Ship AgentDB 3.0.0-alpha.1 with:
1. **Proof-gated mutations** via MutationGuard with `@ruvector/graph-transformer` proof backend
2. **Re-enabled vectorBackend** — proofs validate inputs before they reach the native addon
3. **8 graph-transformer modules** wired via GraphTransformerService
4. **All 5 npm packaging issues fixed**
5. **All 21 controllers activated** through proper wiring in AgentDB core class

## Implementation

### Files Created (3)

| File | Lines | Purpose |
|------|-------|---------|
| `packages/agentdb/src/services/GraphTransformerService.ts` | ~300 | Wraps @ruvector/graph-transformer for controller use with JS fallback |
| `tests/integration/agentdb-v3-proof-gated.test.ts` | ~250 | 25 integration tests for v3 proof-gated features |
| `docs/adr/ADR-060-agentdb-v3-proof-gated-graph-intelligence.md` | This file |

### Files Modified (7)

| File | Changes |
|------|---------|
| `packages/agentdb/package.json` | Version 3.0.0-alpha.1, @ruvector/graph-transformer dep, dual exports, keywords |
| `packages/agentdb/src/index.ts` | Removed empty default export, added GraphTransformerService export |
| `packages/agentdb/src/controllers/index.ts` | Added 6 missing controller + type exports |
| `packages/agentdb/src/core/AgentDB.ts` | Wired all 21 controllers + MutationGuard + GraphTransformerService |
| `packages/agentdb/src/security/MutationGuard.ts` | Multi-tier proof engine: native -> wasm -> legacy-wasm -> js |
| `packages/agentdb/src/backends/factory.ts` | Added graphTransformer detection to BackendDetection |
| `agentic-flow/src/services/agentdb-service.ts` | Re-enabled vectorBackend unconditionally with GuardedBackend |
| `packages/agentdb/README.md` | Updated to v3 with proof-gated documentation |

### MutationGuard Proof Engine Tiers

| Tier | Engine | Latency | Source |
|------|--------|---------|--------|
| 1 | `@ruvector/graph-transformer` (native NAPI-RS) | <1ms | 82-byte attestations |
| 2 | `ruvector-graph-transformer-wasm` | ~5ms | Browser environments |
| 3 | `@ruvnet/ruvector-verified-wasm` (legacy) | ~5ms | Backward compat |
| 4 | Pure JS validation | <1ms | Always available, no attestations |

### GraphTransformerService Modules

| # | Module | Controller | Fallback |
|---|--------|-----------|----------|
| 1 | sublinearAttention | AttentionService | Cosine similarity ranking |
| 2 | verifiedStep | LearningSystem | Simple SGD |
| 3 | causalAttention | CausalRecall | Similarity with temporal decay |
| 4 | grangerExtract | CausalMemoryGraph | Correlation-based edges |
| 5 | hamiltonianStep | Agent trajectory | Leapfrog integrator |
| 6 | spikingAttention | ReflexionMemory | Integrate-and-fire |
| 7 | gameTheoreticAttention | Multi-agent routing | Softmax equilibrium |
| 8 | productManifoldDistance | ReasoningBank | Weighted Euclidean |

## Verification

```
Test Files: 3 passed (3)
Tests:      106 passed (106)

- agentdb-v3-proof-gated.test.ts:  25/25 pass
- proof-gated-mutation.test.ts:    40/40 pass
- adr059-phase1.test.ts:           41/41 pass
```

## Consequences

- All state mutations now require MutationProof before backend execution
- Controllers receive vectorBackend for HNSW-accelerated search
- Native addon dimension mismatch errors are prevented at the proof layer
- GraphTransformerService provides 8 graph attention modules with JS fallback
- npm package has complete barrel exports for all controllers and security primitives
