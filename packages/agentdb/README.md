# AgentDB v3

> **Proof-gated graph intelligence for AI agents — every mutation requires cryptographic proof**

[![npm version](https://img.shields.io/npm/v/agentdb.svg?style=flat-square)](https://www.npmjs.com/package/agentdb)
[![npm downloads](https://img.shields.io/npm/dm/agentdb.svg?style=flat-square)](https://www.npmjs.com/package/agentdb)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-green?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

AgentDB v3 is the first memory system built specifically for autonomous AI agents with **proof-gated mutations** — every state-changing operation requires a cryptographic proof before execution. Powered by `@ruvector/graph-transformer` with 8 verified graph modules, native Rust performance via NAPI-RS, and 82-byte attestations.

## What's New in v3

- **Proof-Gated Mutations** — MutationGuard validates every insert, search, remove, save, and load with structural hashes and attestation tokens
- **8 Graph-Transformer Modules** — Sublinear attention, verified training, causal attention, Granger extraction, Hamiltonian dynamics, spiking attention, game-theoretic equilibrium, product manifold distance
- **AttestationLog** — Append-only audit trail with cryptographic proofs for compliance and debugging
- **GuardedVectorBackend** — Drop-in wrapper that enforces proof gates on any vector backend
- **21 Active Controllers** — All cognitive memory patterns are production-ready with proof validation
- **Zero-Native Regression** — Package size reduced from 50.1MB to 1.4MB by removing unused binaries
- **Browser Support** — Runs in Node.js, browsers, edge functions, and MCP tools via WASM fallback

## Quick Start

```bash
# Install v3 Alpha
npm install agentdb@v3

# Or use stable v2
npm install agentdb@latest
```

## Basic Usage

```typescript
import { AgentDB } from 'agentdb';

// Initialize with proof-gated vectorBackend
const db = new AgentDB({
  dbPath: './agent-memory.db',
  dimension: 384,
  vectorBackend: 'ruvector',
  enableProofGate: true  // Default: true in v3
});

await db.initialize();

// Access controllers
const reflexion = db.getController('reflexion');
const reasoning = db.getController('reasoning');
const causalGraph = db.getController('causalGraph');

// Check proof engine status
const guard = db.getMutationGuard();
console.log(guard?.getStats());
// Output: { engineType: 'native', proofsGenerated: 42, denials: 0 }

// Store episode with automatic proof generation
await reflexion.storeEpisode({
  sessionId: 'session-1',
  task: 'Debug authentication bug',
  reward: 0.95,
  success: true,
  critique: 'OAuth2 PKCE flow was more secure than basic flow',
  input: 'Users cannot log in',
  output: 'Working OAuth2 implementation'
});

// Search patterns (proof-validated)
const patterns = await reasoning.searchPatterns({
  task: 'authentication security',
  k: 10,
  threshold: 0.7
});
```

## Architecture

AgentDB v3 introduces a 3-layer architecture:

```
┌─────────────────────────────────────────────────────┐
│                  Application Layer                  │
│  (ReasoningBank, ReflexionMemory, SkillLibrary)     │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│               Proof Validation Layer                │
│  MutationGuard → AttestationLog → GuardedBackend    │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│                  Backend Layer                      │
│     RuVector (native) → WASM → JavaScript           │
└─────────────────────────────────────────────────────┘
```

Every mutation flows through the proof validation layer:

1. **Application** calls `storeEpisode()` or `searchPatterns()`
2. **MutationGuard** generates a proof (structural hash + attestation token)
3. **AttestationLog** records the proof attempt
4. **GuardedBackend** validates proof before executing native operation
5. **Result** returns to application with proof certificate

## Key Features

### 1. Proof-Gated Mutations (ADR-060)

Every state mutation requires a cryptographic proof:

```typescript
import { MutationGuard } from 'agentdb/security';

const guard = new MutationGuard({
  strictMode: true,
  enableNative: true  // Prefer native proofs
});

// Insert requires proof
const proof = guard.generateProof({
  operation: 'insert',
  vectorId: 'vec-123',
  embedding: [0.1, 0.2, ...],
  metadata: { source: 'reflexion' }
});

// Proof includes:
// - structuralHash: SHA-256 of operation + data
// - attestationToken: 82-byte cryptographic token
// - timestamp: ISO8601 timestamp
// - nonce: Random 16-byte nonce

// Backend validates before execution
if (guard.validateProof(proof)) {
  backend.insert(proof.vectorId, proof.embedding, proof.metadata);
}
```

### 2. Eight Graph-Transformer Modules

Native Rust implementations via `@ruvector/graph-transformer`:

- **Sublinear Attention** — O(n log n) replacing O(n²) JavaScript fallback
- **Verified Training** — SGD with cryptographic proof of each gradient step
- **Causal Attention** — Temporal-decay weighted attention for CausalRecall
- **Granger Extract** — Time-series causal discovery for memory graphs
- **Hamiltonian Step** — Physics-informed trajectory modeling
- **Spiking Attention** — Biological integrate-and-fire for episodic memory
- **Game-Theoretic Attention** — Nash equilibrium for multi-agent routing
- **Product Manifold Distance** — Curved-space similarity for reasoning patterns

```typescript
import { GraphTransformerService } from 'agentdb';

const transformer = new GraphTransformerService({
  enableNative: true,
  modules: ['sublinear', 'causal', 'verified']
});

await transformer.initialize();

// Use sublinear attention (O(n log n))
const attended = await transformer.sublinearAttention(
  queryVector,
  keyMatrix,
  valueMatrix
);

// Verify training step
const trainingProof = await transformer.verifiedTraining(
  weights,
  gradients,
  learningRate
);
```

### 3. Twenty-One Active Controllers

All cognitive memory patterns are production-ready:

- **ReflexionMemory** — Self-critique and episodic replay
- **SkillLibrary** — Lifelong learning with skill consolidation
- **ReasoningBank** — Pattern learning and adaptive memory
- **CausalMemoryGraph** — Intervention-based causality tracking
- **CausalRecall** — Utility-based retrieval with uplift scoring
- **ExplainableRecall** — Provenance certificates with Merkle proofs
- **NightlyLearner** — Automated pattern discovery
- **LearningSystem** — 9 RL algorithms (Q-Learning, DQN, PPO, MCTS, etc.)
- **EmbeddingService** — Multi-provider embeddings (Transformers.js, OpenAI)
- **WASMVectorSearch** — Browser-compatible vector search
- **HNSWIndex** — HNSW graph indexing for approximate nearest neighbor
- **AttentionService** — 5 attention mechanisms (causal, spiking, game-theoretic)
- **And 9 more** — See [docs/CONTROLLERS.md](./docs/CONTROLLERS.md)

## Installation

```bash
# v3 Alpha (proof-gated mutations)
npm install agentdb@v3

# Stable v2 (production-ready)
npm install agentdb@latest

# With optional native addons for 150x performance
npm install agentdb@v3 ruvector@latest

# For browser environments (WASM only)
npm install agentdb@v3
# Native addons will be skipped automatically
```

## API Overview

### Core Class

```typescript
import { AgentDB } from 'agentdb';

const db = new AgentDB({
  dbPath: './memory.db',
  dimension: 384,
  vectorBackend: 'ruvector',  // or 'hnswlib' | 'sqlite'
  enableProofGate: true,
  strictMode: true
});

await db.initialize();
```

### Controller Access

```typescript
// Get controllers by name
const reflexion = db.getController('reflexion');
const reasoning = db.getController('reasoning');
const skills = db.getController('skills');
const causalGraph = db.getController('causalGraph');

// Access proof engine
const guard = db.getMutationGuard();
const stats = guard?.getStats();
```

### Security Primitives

```typescript
import { MutationGuard, AttestationLog } from 'agentdb/security';

// Create guard
const guard = new MutationGuard({
  strictMode: true,
  enableNative: true,
  logPath: './attestations.log'
});

// Generate proof
const proof = guard.generateProof({
  operation: 'insert',
  vectorId: 'vec-123',
  embedding: embedding,
  metadata: { source: 'test' }
});

// Access attestation log
const log = guard.getAttestationLog();
const recentProofs = await log.query({ limit: 10 });
```

### Backend Integration

```typescript
import { GuardedVectorBackend } from 'agentdb/backends';

// Wrap any backend with proof validation
const guardedBackend = new GuardedVectorBackend(rawBackend, guard);

// All operations require proof
await guardedBackend.insert(proof);
await guardedBackend.search(query, k, proof);
```

## Performance

**Proof Generation:**
- Native (NAPI-RS): ~50μs per proof
- WASM: ~200μs per proof
- JavaScript: ~500μs per proof

**Vector Operations (with RuVector):**
- Insert: 150x faster than JavaScript
- Search: 61μs p50 latency (96.8% recall@10)
- Pattern search: 32.6M ops/sec with caching

**Package Size:**
- v2: 50.1MB (with unused native binaries)
- v3: 1.4MB (zero-native regression fixed)

## Documentation

- **[ADR-060: Proof-Gated Mutations](./docs/adr/ADR-060-agentdb-v3-proof-gated-graph-intelligence.md)** — Architecture decision record
- **[Controllers Guide](./docs/CONTROLLERS.md)** — All 21 controllers documented
- **[MCP Tools Reference](./docs/MCP_TOOLS.md)** — 32 MCP tools for Claude Code
- **[Migration Guide](./MIGRATION_v3.0.0.md)** — Upgrade from v2 to v3
- **[Security Model](./docs/SECURITY.md)** — Proof validation and attestation

## MCP Integration (Claude Code)

Zero-code integration with AI coding assistants:

```bash
# One-command setup
claude mcp add agentdb npx agentdb@v3 mcp start

# Now Claude Code can:
# - Store reasoning patterns with proof validation
# - Search 32.6M patterns/sec for relevant approaches
# - Learn from successful task completions
# - Build reusable skills with attestation logs
```

## License

AgentDB supports real-time bidirectional sync between instances using QUIC transport and a high-level `SyncCoordinator`.

### QUIC Transport

QUIC provides multiplexed streams over a single connection with zero head-of-line blocking, connection migration between networks, and 0-RTT session resumption:

```typescript
import { QUICServer } from "agentdb/controllers/QUICServer";

const server = new QUICServer({
  port: 4433,
  maxConnections: 100,
  rateLimit: {
    requestsPerMin: 1000,
    bytesPerMin: 10_000_000,
  },
  authToken: "secret", // optional token validation
});

// Stale connections auto-cleaned after 5 minutes idle
// Sync types: 'episodes' | 'skills' | 'edges' | 'full'
// Incremental sync via `since` parameter and cursor-based pagination
```

### Sync Coordinator

High-level bidirectional sync with conflict resolution, progress tracking, and auto-sync:

```typescript
import { SyncCoordinator } from "agentdb/controllers/SyncCoordinator";

const sync = new SyncCoordinator({
  conflictStrategy: "latest-wins", // 'local-wins' | 'remote-wins' | 'latest-wins' | 'merge'
  batchSize: 100,
  autoSyncInterval: 60000, // Auto-sync every 60 seconds
});

// Push local changes, pull remote changes, resolve conflicts
const report = await sync.sync();
console.log(report);
// {
//   success: true,
//   durationMs: 342,
//   itemsPushed: 15,
//   itemsPulled: 8,
//   conflictsResolved: 2,
//   bytesTransferred: 48200,
//   errors: [],
// }

// Progress tracking through 5 phases:
// detecting → pushing → pulling → resolving → applying

// Sync state persists across restarts
await sync.saveSyncState();
// Tracks: lastSyncAt, lastEpisodeSync, lastSkillSync, lastEdgeSync,
//         totalItemsSynced, totalBytesSynced, syncCount
```

### Conflict Resolution

| Strategy      | Behavior                                |
| ------------- | --------------------------------------- |
| `local-wins`  | Local version always kept               |
| `remote-wins` | Remote version always accepted          |
| `latest-wins` | Most recent timestamp wins              |
| `merge`       | Quality-weighted merge of both versions |

</details>

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Acknowledgments

AgentDB v3 builds on research from:
- **RuVector** — Native Rust vector database (150x faster)
- **Reflexion** (Shinn et al., 2023) — Self-critique and episodic replay
- **Causal Inference** (Pearl, Judea) — Intervention-based causality
- **HNSW** (Malkov & Yashunin, 2018) — Approximate nearest neighbor search
- **Graph Neural Networks** — Attention mechanisms for memory navigation

---

**Built with ❤️ for the agentic era**

[Documentation](./docs/) | [GitHub](https://github.com/ruvnet/agentic-flow/tree/main/packages/agentdb) | [npm](https://www.npmjs.com/package/agentdb)
