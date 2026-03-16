# API Reference — Complete Controller Documentation

> **Comprehensive API guide** for all 21 AgentDB controllers with examples, parameters, and performance characteristics

---

## Table of Contents

1. [Core Controllers](#core-controllers)
2. [Memory Controllers](#memory-controllers)
3. [Learning Controllers](#learning-controllers)
4. [Vector Search Controllers](#vector-search-controllers)
5. [Coordination Controllers](#coordination-controllers)
6. [Security Controllers](#security-controllers)

---

## Core Controllers

### AgentDB

The main database interface providing unified access to all controllers.

#### Constructor

```typescript
import { AgentDB } from 'agentdb';

const db = new AgentDB({
  dbPath: './agent-memory.db',
  dimension: 384,  // Embedding dimension
  backend: 'auto',  // 'auto' | 'ruvector' | 'hnswlib' | 'sqlite'
  enableProofGating: true  // v3.0 proof-gated mutations
});
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `dbPath` | string | Required | Path to SQLite database file |
| `dimension` | number | 384 | Embedding vector dimension |
| `backend` | string | 'auto' | Vector backend selection |
| `enableProofGating` | boolean | true | Enable mutation proofs (v3.0) |

#### Methods

**`initialize()`**
```typescript
await db.initialize();
```
Initializes database schema and vector backend. Must be called before use.

**`getController(name)`**
```typescript
const reflexion = db.getController('reflexion');
const reasoning = db.getController('reasoning');
const skills = db.getController('skills');
```
Returns a specific controller instance by name.

**Available Controllers:**
- `reflexion` — ReflexionMemory
- `reasoning` — ReasoningBank
- `skills` — SkillLibrary
- `causal` — CausalMemoryGraph
- `recall` — CausalRecall
- `explainable` — ExplainableRecall
- `learner` — NightlyLearner
- `learning` — LearningSystem

**`getMutationGuard()`**
```typescript
const guard = db.getMutationGuard();
const stats = guard.getStats();
console.log(`Proof engine: ${stats.engineType}`);  // 'native' | 'wasm' | 'js'
```
Returns mutation guard for proof-gated operations (v3.0).

**`getGraphTransformer()`**
```typescript
const transformer = db.getGraphTransformer();
const results = await transformer.sublinearAttention(vectors);
```
Returns graph transformer service for advanced operations.

---

## Memory Controllers

### ReasoningBank

Stores and retrieves successful reasoning patterns with semantic search.

#### Constructor

```typescript
import { ReasoningBank } from 'agentdb/controllers';

const reasoningBank = new ReasoningBank(db, embedder);
```

#### Methods

**`storePattern(pattern)`**

```typescript
const patternId = await reasoningBank.storePattern({
  taskType: 'code_review',
  approach: 'Security scan → Type safety → Code quality → Performance',
  successRate: 0.94,
  tags: ['security', 'typescript', 'best-practices'],
  metadata: {
    avgTimeMs: 15000,
    tokensUsed: 2500,
    complexity: 'high'
  }
});
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `taskType` | string | Yes | Category of task |
| `approach` | string | Yes | Description of approach |
| `successRate` | number | Yes | 0.0-1.0 success rate |
| `tags` | string[] | No | Searchable tags |
| `metadata` | object | No | Additional data |

**Performance:** 388K ops/sec

**`searchPatterns(query)`**

```typescript
const patterns = await reasoningBank.searchPatterns({
  task: 'security code review',
  k: 10,
  threshold: 0.7,
  filters: { taskType: 'code_review' }
});
```

**Parameters:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `task` | string | Required | Search query |
| `k` | number | 10 | Number of results |
| `threshold` | number | 0.7 | Minimum similarity |
| `filters` | object | {} | Metadata filters |

**Returns:** Array of patterns with similarity scores

**Performance:** 32.6M ops/sec (ultra-fast with caching)

**`getPatternStats()`**

```typescript
const stats = reasoningBank.getPatternStats();
// { totalPatterns: 5000, avgSuccessRate: 0.87, topTags: [...] }
```

Returns aggregate statistics about stored patterns.

---

### ReflexionMemory

Stores complete task episodes with self-critique for experience replay.

#### Constructor

```typescript
import { ReflexionMemory } from 'agentdb/controllers';

const reflexion = new ReflexionMemory(db, embedder);
```

#### Methods

**`storeEpisode(episode)`**

```typescript
const episodeId = await reflexion.storeEpisode({
  sessionId: 'session-123',
  task: 'Fix authentication bug',
  reward: 0.95,
  success: true,
  critique: 'OAuth2 PKCE flow was more secure than basic flow. Always check token expiration.',
  input: 'Users cannot log in after password reset',
  output: 'Working OAuth2 implementation with refresh tokens',
  latencyMs: 1200,
  tokensUsed: 500
});
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | Yes | Session identifier |
| `task` | string | Yes | Task description |
| `reward` | number | Yes | 0.0-1.0 reward score |
| `success` | boolean | Yes | Task outcome |
| `critique` | string | Yes | Self-generated critique |
| `input` | string | No | Task input |
| `output` | string | No | Task output |
| `latencyMs` | number | No | Execution time |
| `tokensUsed` | number | No | LLM tokens consumed |

**Performance:** 152 ops/sec (500 ops/sec with batch)

**`retrieveRelevant(query)`**

```typescript
const episodes = await reflexion.retrieveRelevant({
  task: 'authentication issues',
  k: 10,
  onlySuccesses: true,
  minReward: 0.7
});
```

**Parameters:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `task` | string | Required | Search query |
| `k` | number | 10 | Number of results |
| `onlySuccesses` | boolean | false | Filter to successes |
| `minReward` | number | 0.0 | Minimum reward |

**Performance:** 957 ops/sec

**`getTaskStats(sessionId)`**

```typescript
const stats = await reflexion.getTaskStats('session-123');
// { successRate: 0.85, avgReward: 0.82, totalEpisodes: 50 }
```

Returns statistics for a specific session.

---

### SkillLibrary

Manages reusable, composable skills learned from successful episodes.

#### Constructor

```typescript
import { SkillLibrary } from 'agentdb/controllers';

const skills = new SkillLibrary(db, embedder);
```

#### Methods

**`createSkill(skill)`**

```typescript
const skillId = await skills.createSkill({
  name: 'jwt_authentication',
  description: 'Generate and validate JWT tokens with refresh flow',
  signature: {
    inputs: { userId: 'string', permissions: 'array' },
    outputs: { accessToken: 'string', refreshToken: 'string' }
  },
  code: `
    const jwt = require('jsonwebtoken');
    const accessToken = jwt.sign({ userId, permissions }, SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ userId }, REFRESH_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
  `,
  successRate: 0.92,
  uses: 0,
  avgReward: 0.0,
  avgLatencyMs: 0.0
});
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Skill identifier |
| `description` | string | Yes | What the skill does |
| `signature` | object | Yes | Input/output types |
| `code` | string | Yes | Implementation code |
| `successRate` | number | Yes | Historical success rate |
| `uses` | number | No | Usage count |
| `avgReward` | number | No | Average reward |
| `avgLatencyMs` | number | No | Average latency |

**Performance:** 304 ops/sec (900 ops/sec with batch)

**`searchSkills(query)`**

```typescript
const applicable = await skills.searchSkills({
  task: 'user authentication with tokens',
  k: 5,
  minSuccessRate: 0.7
});
```

**Parameters:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `task` | string | Required | Search query |
| `k` | number | 10 | Number of results |
| `minSuccessRate` | number | 0.0 | Minimum success rate |

**Performance:** 694 ops/sec

**`consolidateFromEpisodes(options)`**

```typescript
const consolidated = await skills.consolidateFromEpisodes({
  minAttempts: 3,       // Need 3+ successful executions
  minSuccessRate: 0.7,  // With 70%+ success rate
  lookbackDays: 7       // In the last 7 days
});

console.log(`Created ${consolidated.length} new skills`);
```

Automatically extracts reusable skills from successful episodes.

**`updateSkillStats(skillId, update)`**

```typescript
await skills.updateSkillStats(skillId, {
  uses: 1,
  successRate: 0.95,
  success: true,
  latencyMs: 1200
});
```

Updates skill performance metrics after usage.

---

### CausalMemoryGraph

Tracks causal relationships between memories using intervention-based causality.

#### Constructor

```typescript
import { CausalMemoryGraph } from 'agentdb/controllers';

const causalGraph = new CausalMemoryGraph(db);
```

#### Methods

**`createExperiment(experiment)`**

```typescript
const experimentId = causalGraph.createExperiment({
  name: 'test_error_handling_approach',
  hypothesis: 'Try-catch reduces crash rate',
  treatmentId: 123,      // Episode with error handling
  treatmentType: 'episode',
  controlId: 124,        // Episode without
  startTime: Date.now(),
  sampleSize: 0,
  status: 'running'
});
```

Creates a causal experiment (A/B test) to measure intervention effects.

**`recordObservation(observation)`**

```typescript
causalGraph.recordObservation({
  experimentId,
  episodeId: 123,
  isTreatment: true,
  outcomeValue: 0.95,    // Success rate
  outcomeType: 'success'
});
```

Records an observation for causal analysis.

**`calculateUplift(experimentId)`**

```typescript
const { uplift, pValue, confidenceInterval } =
  causalGraph.calculateUplift(experimentId);

console.log(`Causal uplift: ${uplift.toFixed(3)}`);
console.log(`p-value: ${pValue.toFixed(4)}`);
console.log(`95% CI: [${confidenceInterval[0].toFixed(3)}, ${confidenceInterval[1].toFixed(3)}]`);
```

Calculates causal effect with statistical significance.

**`addCausalEdge(edge)`**

```typescript
const edgeId = causalGraph.addCausalEdge({
  fromMemoryId: 123,
  fromMemoryType: 'episode',
  toMemoryId: 125,
  toMemoryType: 'episode',
  similarity: 0.85,
  uplift: 0.15,           // 15% improvement
  confidence: 0.95,
  sampleSize: 50
});
```

Adds a proven causal relationship to the graph.

**`queryCausalEffects(query)`**

```typescript
const effects = causalGraph.queryCausalEffects({
  interventionMemoryId: 123,
  interventionMemoryType: 'episode',
  minConfidence: 0.8,
  minUplift: 0.1
});
```

Queries causal effects of an intervention.

---

### CausalRecall

Utility-based retrieval that ranks by actual effectiveness, not just similarity.

#### Constructor

```typescript
import { CausalRecall } from 'agentdb/controllers';

const causalRecall = new CausalRecall(db, embedder, vectorBackend, {
  alpha: 0.7,  // Similarity weight
  beta: 0.2,   // Causal uplift weight
  gamma: 0.1   // Latency penalty
});
```

#### Methods

**`recall(queryId, queryText, k, requirements, accessLevel)`**

```typescript
const result = await causalRecall.recall(
  'query-123',
  'How to optimize API response time',
  12,  // k results
  ['performance', 'optimization'],  // requirements
  'internal'  // access level
);

console.log(`Retrieved ${result.candidates.length} results`);
console.log(`Certificate ID: ${result.certificate.id}`);
console.log(`Completeness: ${result.certificate.completenessScore}`);
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|---------|-------------|
| `queryId` | string | Yes | Query identifier |
| `queryText` | string | Yes | Search query |
| `k` | number | Yes | Number of results |
| `requirements` | string[] | No | Required tags |
| `accessLevel` | string | No | Access control level |

**Returns:** Candidates ranked by utility score + provenance certificate

**Utility Formula:** `U = α·similarity + β·uplift − γ·latency`

---

### ExplainableRecall

Retrieval with cryptographic proofs explaining why memories were selected.

#### Constructor

```typescript
import { ExplainableRecall } from 'agentdb/controllers';

const explainableRecall = new ExplainableRecall(db, embedder, vectorBackend);
```

#### Methods

**`recallWithCertificate(queryId, queryText, k, requirements)`**

```typescript
const result = await explainableRecall.recallWithCertificate(
  'query-456',
  'Optimize database query performance',
  10,
  ['database', 'performance']
);

// Certificate includes:
const cert = result.certificate;
console.log(`Query: ${cert.queryText}`);
console.log(`Retrieved: ${cert.chunks.length} chunks`);
console.log(`Completeness: ${cert.completenessScore}`);
console.log(`Redundancy: ${cert.redundancyRatio}`);
console.log(`Merkle root: ${cert.merkleRoot}`);
console.log(`Access level: ${cert.accessLevel}`);
```

**Returns:** Candidates + provenance certificate with Merkle proof

**Certificate Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Certificate ID |
| `queryId` | string | Query identifier |
| `queryText` | string | Original query |
| `chunks` | array | Retrieved chunks with relevance scores |
| `completenessScore` | number | % of requirements met |
| `redundancyRatio` | number | Duplicate coverage |
| `merkleRoot` | string | Cryptographic proof hash |
| `accessLevel` | string | Access control level |
| `timestamp` | number | Retrieval timestamp |

---

### NightlyLearner

Background process for automated pattern discovery and skill consolidation.

#### Constructor

```typescript
import { NightlyLearner } from 'agentdb/controllers';

const learner = new NightlyLearner(db, embedder);
```

#### Methods

**`discover(options)`**

```typescript
// Dry-run to preview
const preview = await learner.discover({
  minAttempts: 3,
  minSuccessRate: 0.6,
  minConfidence: 0.7,
  dryRun: true
});

console.log(`Would create ${preview.length} causal edges`);

// Run for real
const created = await learner.discover({
  minAttempts: 3,
  minSuccessRate: 0.6,
  minConfidence: 0.7,
  dryRun: false
});

console.log(`Created ${created.length} causal edges`);
```

**Parameters:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `minAttempts` | number | 3 | Minimum attempts to detect pattern |
| `minSuccessRate` | number | 0.6 | Minimum success rate |
| `minConfidence` | number | 0.7 | Statistical confidence |
| `dryRun` | boolean | false | Preview without saving |

Discovers causal edges and consolidates successful patterns into skills.

**`pruneEdges(options)`**

```typescript
const pruned = await learner.pruneEdges({
  minConfidence: 0.5,
  minUplift: 0.05,
  maxAgeDays: 90
});

console.log(`Pruned ${pruned} low-quality edges`);
```

Removes low-quality or outdated causal edges.

---

## Learning Controllers

### LearningSystem

Reinforcement learning system supporting 9 RL algorithms.

#### Constructor

```typescript
import { LearningSystem } from 'agentdb/controllers';

const learning = new LearningSystem(db, {
  algorithm: 'ppo',  // 'q-learning', 'sarsa', 'dqn', 'policy-gradient', 'actor-critic', 'ppo', 'decision-transformer', 'mcts', 'model-based'
  learningRate: 0.001,
  discountFactor: 0.99,
  explorationRate: 0.1
});
```

#### Methods

**`startSession(sessionId, config)`**

```typescript
await learning.startSession('session-123', {
  algorithm: 'ppo',
  learningRate: 0.001,
  explorationStrategy: 'epsilon-greedy'
});
```

Starts a new learning session.

**`predict(sessionId, state)`**

```typescript
const prediction = await learning.predict('session-123', {
  context: 'debugging authentication',
  previousActions: ['check_logs', 'inspect_tokens'],
  metrics: { latency: 500, errorRate: 0.1 }
});

console.log(`Recommended action: ${prediction.action}`);
console.log(`Confidence: ${prediction.confidence}`);
```

Gets AI-recommended action based on learned policy.

**`feedback(sessionId, actionId, reward, metadata)`**

```typescript
await learning.feedback('session-123', 'action-456', 0.95, {
  success: true,
  latencyMs: 1200,
  outcome: 'bug_fixed'
});
```

Provides feedback on action outcome to update policy.

**`train(sessionId, options)`**

```typescript
const result = await learning.train('session-123', {
  epochs: 10,
  batchSize: 32,
  validationSplit: 0.2
});

console.log(`Training loss: ${result.loss}`);
console.log(`Validation accuracy: ${result.accuracy}`);
```

Trains policy using collected experience.

**`getMetrics(sessionId)`**

```typescript
const metrics = await learning.getMetrics('session-123');
// { totalReward: 45.2, avgReward: 0.85, successRate: 0.9, explorationRate: 0.05 }
```

Returns learning performance metrics.

**`transfer(sourceSessionId, targetSessionId)`**

```typescript
await learning.transfer('expert-session', 'new-session');
```

Transfers learned policy between sessions.

**`explain(sessionId, actionId)`**

```typescript
const explanation = await learning.explain('session-123', 'action-456');
console.log(`Reasoning: ${explanation.reasoning}`);
console.log(`Top features: ${explanation.features.join(', ')}`);
```

Provides explainable AI reasoning for action recommendation.

---

## Vector Search Controllers

### EmbeddingService

Generates embeddings using local Transformers.js models (no API key needed).

#### Constructor

```typescript
import { EmbeddingService } from 'agentdb/controllers';

const embedder = new EmbeddingService({
  model: 'Xenova/all-MiniLM-L6-v2',  // Default 384-dim
  dimension: 384,
  provider: 'transformers'  // Local, no API required
});
```

#### Methods

**`initialize()`**

```typescript
await embedder.initialize();
```

Loads model. Must be called before use.

**`embed(text)`**

```typescript
const embedding = await embedder.embed('Hello world');
// Float32Array(384) [0.123, -0.456, ...]
```

Generates embedding for single text.

**`embedBatch(texts)`**

```typescript
const embeddings = await embedder.embedBatch([
  'Text 1',
  'Text 2',
  'Text 3'
]);
// Array of Float32Arrays
```

Generates embeddings for multiple texts (more efficient).

**Supported Models:**

| Model | Dimension | Quality | Speed | Best For |
|-------|-----------|---------|-------|----------|
| `Xenova/all-MiniLM-L6-v2` | 384 | ⭐⭐⭐⭐ | ⚡⚡⚡⚡⚡ | Default, fast |
| `Xenova/bge-small-en-v1.5` | 384 | ⭐⭐⭐⭐⭐ | ⚡⚡⚡⚡ | Best 384-dim |
| `Xenova/bge-base-en-v1.5` | 768 | ⭐⭐⭐⭐⭐ | ⚡⚡⚡ | Production |
| `all-mpnet-base-v2` | 768 | ⭐⭐⭐⭐⭐ | ⚡⚡⚡ | All-around |
| `e5-base-v2` | 768 | ⭐⭐⭐⭐⭐ | ⚡⚡⚡ | Multilingual |

---

### WASMVectorSearch

Ultra-fast WASM-accelerated vector search.

#### Constructor

```typescript
import { WASMVectorSearch } from 'agentdb/controllers';

const wasmSearch = new WASMVectorSearch({
  dimension: 384,
  enableSIMD: true,
  threads: 4
});
```

#### Methods

**`initialize()`**

```typescript
await wasmSearch.initialize();
```

Initializes WASM module.

**`add(id, vector)`**

```typescript
wasmSearch.add('vec-123', embedding);
```

Adds vector to index.

**`search(vector, k)`**

```typescript
const results = await wasmSearch.search(queryEmbedding, 10);
// [{ id: 'vec-123', distance: 0.15 }, ...]
```

Searches for k nearest neighbors.

**Performance:** 352x faster than traditional implementations

---

### HNSWIndex

High-performance HNSW (Hierarchical Navigable Small World) index.

#### Constructor

```typescript
import { HNSWIndex } from 'agentdb/controllers';

const hnsw = new HNSWIndex({
  dimension: 384,
  M: 16,              // Number of connections per layer
  efConstruction: 200, // Construction quality
  efSearch: 50        // Search quality
});
```

#### Methods

**`initialize()`**

```typescript
await hnsw.initialize();
```

Initializes HNSW index.

**`addPoint(id, vector)`**

```typescript
hnsw.addPoint('point-123', embedding);
```

Adds point to index.

**`searchKnn(vector, k)`**

```typescript
const results = hnsw.searchKnn(queryEmbedding, 10);
// [{ id: 'point-123', distance: 0.15 }, ...]
```

k-NN search with HNSW algorithm.

**`getStats()`**

```typescript
const stats = hnsw.getStats();
// { totalPoints: 10000, layers: 3, avgDegree: 15.2 }
```

Returns index statistics.

**Performance:** 61µs p50 latency, 96.8% recall@10 (8.2x faster than hnswlib)

---

## Coordination Controllers

### QUICServer

Ultra-low latency QUIC server for agent coordination.

#### Constructor

```typescript
import { QUICServer } from 'agentdb/controllers';

const server = new QUICServer({
  port: 4433,
  cert: './certs/cert.pem',
  key: './certs/key.pem',
  maxConcurrentStreams: 100
});
```

#### Methods

**`start()`**

```typescript
await server.start();
console.log('QUIC server listening on port 4433');
```

Starts QUIC server.

**`stop()`**

```typescript
await server.stop();
```

Gracefully stops server.

**Performance:** 50-70% lower latency than TCP, 0-RTT reconnection

---

### QUICClient

QUIC client for ultra-fast agent communication.

#### Constructor

```typescript
import { QUICClient } from 'agentdb/controllers';

const client = new QUICClient({
  host: 'localhost',
  port: 4433,
  maxConcurrentStreams: 100
});
```

#### Methods

**`connect()`**

```typescript
await client.connect();
```

Connects to QUIC server (0-RTT if resuming).

**`send(data)`**

```typescript
await client.send({
  type: 'task',
  agent: 'coder',
  data: { action: 'refactor', files: [...] }
});
```

Sends data with minimal latency.

**`close()`**

```typescript
await client.close();
```

Gracefully closes connection.

---

### SyncCoordinator

Coordinates state synchronization across distributed agents.

#### Constructor

```typescript
import { SyncCoordinator } from 'agentdb/controllers';

const coordinator = new SyncCoordinator({
  syncInterval: 5000,  // 5s
  conflictResolution: 'last-write-wins'
});
```

#### Methods

**`startSync()`**

```typescript
await coordinator.startSync();
```

Starts background synchronization.

**`stopSync()`**

```typescript
await coordinator.stopSync();
```

Stops synchronization.

**`getState()`**

```typescript
const state = coordinator.getState();
// { agents: [...], tasks: [...], memory: {...} }
```

Returns current synchronized state.

---

## Security Controllers

### MutationGuard

Proof-gated mutation system (v3.0) ensuring every state change is cryptographically verified.

#### Constructor

```typescript
import { MutationGuard } from 'agentdb/security';

const guard = new MutationGuard({
  engineType: 'native',  // 'native' | 'wasm' | 'js'
  enableAttestation: true,
  logPath: './logs/attestation.log'
});
```

#### Methods

**`generateProof(operation, data)`**

```typescript
const proof = await guard.generateProof('insert', {
  id: 'vec-123',
  vector: embedding,
  metadata: { type: 'pattern' }
});

// proof = { hash: '0x...', token: 'attest_...' }
```

Generates cryptographic proof for mutation.

**`validateProof(proof, operation, data)`**

```typescript
const valid = await guard.validateProof(proof, 'insert', data);

if (!valid) {
  throw new Error('Invalid mutation proof');
}
```

Validates proof before allowing mutation.

**`getStats()`**

```typescript
const stats = guard.getStats();
// { engineType: 'native', totalProofs: 10000, totalDenials: 5, avgLatencyMs: 0.5 }
```

Returns guard statistics.

---

### AttestationLog

Append-only audit log for all proofs and denials.

#### Constructor

```typescript
import { AttestationLog } from 'agentdb/security';

const log = new AttestationLog('./logs/attestation.log');
```

#### Methods

**`append(entry)`**

```typescript
await log.append({
  timestamp: Date.now(),
  operation: 'insert',
  proofHash: '0x...',
  result: 'approved',
  metadata: { agent: 'coder-1' }
});
```

Appends entry to log (cannot be modified).

**`query(filters)`**

```typescript
const entries = await log.query({
  operation: 'insert',
  result: 'denied',
  since: Date.now() - 86400000  // Last 24h
});
```

Queries audit log.

---

## Performance Characteristics

### Summary Table

| Controller | Operation | Performance | Caching |
|------------|-----------|-------------|---------|
| ReasoningBank | Pattern search | 32.6M ops/sec | Yes (60s TTL) |
| ReasoningBank | Pattern store | 388K ops/sec | N/A |
| ReflexionMemory | Episode retrieve | 957 ops/sec | Yes (15s TTL) |
| ReflexionMemory | Episode store | 152 ops/sec | N/A |
| SkillLibrary | Skill search | 694 ops/sec | Yes (30s TTL) |
| SkillLibrary | Skill create | 304 ops/sec | N/A |
| HNSWIndex | k-NN search | 61µs p50 | No |
| WASMVectorSearch | Vector search | 352x faster | No |
| MutationGuard | Proof generation | <1ms | No |
| LearningSystem | Prediction | <10ms | Yes (120s TTL) |

---

## Next Steps

- **[MCP Tools Reference](./MCP-TOOLS-REFERENCE.md)** — All 85+ MCP tools
- **[Swarm Cookbook](./SWARM-COOKBOOK.md)** — Orchestration patterns
- **[Performance Tuning](./PERFORMANCE-TUNING.md)** — Optimization guide

---

**Questions?** See [GitHub Issues](https://github.com/ruvnet/agentic-flow/issues).
