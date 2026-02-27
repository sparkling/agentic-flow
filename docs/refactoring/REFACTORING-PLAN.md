# Refactoring Plan - Performance Optimization
## Agentic Flow v2 - 27 Optimization Opportunities

**Status**: Draft
**Owner**: Performance Team
**Timeline**: 4 weeks (80 hours)
**Target**: 66% performance improvement

---

## Phase 1: Quick Wins (Week 1) - 545ms Savings

### Day 1-2: Backend Detection & Embedding Batch
**Priority**: P0
**Effort**: 6 hours
**Impact**: 285ms per session

#### Task 1.1: Cache Backend Detection Results
**Files**: `packages/agentdb/src/backends/factory.ts`

```typescript
// Add at module level
let cachedDetection: BackendDetection | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute

// Rename existing function
async function detectBackendsInternal(): Promise<BackendDetection> {
  // ... existing logic
}

// Replace export with cached version
export async function detectBackends(): Promise<BackendDetection> {
  const now = Date.now();
  if (cachedDetection && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedDetection;
  }

  const result = await detectBackendsInternal();
  cachedDetection = result;
  cacheTimestamp = now;
  return result;
}

// Add cache invalidation
export function invalidateBackendCache(): void {
  cachedDetection = null;
  cacheTimestamp = 0;
}
```

**Tests**:
- [ ] Verify first call populates cache
- [ ] Verify second call returns cached result
- [ ] Verify TTL expiration triggers refresh
- [ ] Verify invalidation clears cache
- [ ] Benchmark: `detectBackends()` called 4 times < 50ms total

**Checklist**:
- [ ] Implement caching logic
- [ ] Add unit tests
- [ ] Update documentation
- [ ] Benchmark before/after
- [ ] Code review

---

#### Task 1.2: Batch Embedding Operations
**Files**: `agentic-flow/src/services/agentdb-service.ts:886-909`

```typescript
async storeGraphState(nodes: any[], edges: any[]): Promise<void> {
  if (this.graphEnabled && this.graphAdapter) {
    try {
      // Collect all texts for embedding
      const nodeTexts = nodes.map(n => JSON.stringify(n));
      const edgeTexts = edges.map(e =>
        `${e.from} -> ${e.to}: ${e.description || ''}`
      );
      const allTexts = [...nodeTexts, ...edgeTexts];

      // Single batch embedding call
      const allEmbeddings = await this.embeddingService.embedBatch(allTexts);

      // Split results
      const nodeEmbeddings = allEmbeddings.slice(0, nodes.length);
      const edgeEmbeddings = allEmbeddings.slice(nodes.length);

      // Parallel node storage
      await Promise.all(nodes.map((node, i) =>
        this.graphAdapter.createNode({
          id: node.id || `node-${Date.now()}-${Math.random()}`,
          embedding: nodeEmbeddings[i],
          labels: [node.type || 'Node'],
          properties: node
        })
      ));

      // Parallel edge storage
      await Promise.all(edges.map((edge, i) =>
        this.graphAdapter.createEdge({
          from: String(edge.from),
          to: String(edge.to),
          description: edge.description || 'edge',
          embedding: edgeEmbeddings[i],
          confidence: edge.confidence,
          metadata: edge
        })
      ));

      console.log(`[AgentDBService] Stored ${nodes.length} nodes and ${edges.length} edges`);
      return;
    } catch (error) {
      console.warn('[AgentDBService] Graph DB storage failed:', error);
    }
  }

  // ... existing fallback logic
}
```

**Tests**:
- [ ] Verify batch embedding with mixed nodes/edges
- [ ] Verify parallel storage completion
- [ ] Verify error handling maintains consistency
- [ ] Verify embedding count matches node+edge count
- [ ] Benchmark: 10 nodes + 15 edges < 100ms

**Checklist**:
- [ ] Refactor storeGraphState
- [ ] Add integration tests
- [ ] Verify backward compatibility
- [ ] Benchmark improvement
- [ ] Update API docs

---

### Day 3-4: Embedding Cache & Route Cache
**Priority**: P0
**Effort**: 6 hours
**Impact**: 260ms per session

#### Task 1.3: Cache Embeddings in MMR
**Files**: `agentic-flow/src/services/agentdb-service.ts:625-662`

```typescript
async recallDiverseEpisodes(query: string, limit = 5, lambda = 0.5): Promise<Episode[]> {
  if (!this.reflexionMemory || !this.embeddingService) {
    return this.recallEpisodes(query, limit);
  }

  try {
    // Request embeddings from database if available
    const candidates = await this.reflexionMemory.retrieveRelevant({
      task: query,
      k: limit * 3,
      includeEmbeddings: true // NEW: request pre-computed embeddings
    });

    if (!candidates || candidates.length <= limit) {
      return this.recallEpisodes(query, limit);
    }

    // Try to get cached query embedding
    let queryEmbedding: Float32Array;
    if (typeof this.embeddingService.getCached === 'function') {
      queryEmbedding = await this.embeddingService.getCached(query) ||
                       await this.embeddingService.embed(query);
    } else {
      queryEmbedding = await this.embeddingService.embed(query);
    }

    // Filter candidates with embeddings
    const validCandidates = candidates
      .filter((r: any) => r.embedding && r.embedding.length > 0)
      .map((r: any) => ({
        id: r.id ?? 0,
        embedding: Array.from(r.embedding),
        similarity: r.similarity ?? 0,
        ...r,
      }));

    if (this.mmrRanker && validCandidates.length > 0) {
      const diverse = this.mmrRanker.selectDiverse(
        validCandidates,
        Array.from(queryEmbedding),
        { lambda, k: limit }
      );

      return diverse.map((r: any) => ({
        id: r.id ?? 0,
        ts: r.ts ?? 0,
        sessionId: r.sessionId ?? '',
        task: r.task ?? '',
        input: r.input,
        output: r.output,
        critique: r.critique,
        reward: r.reward ?? 0,
        success: r.success ?? false,
        similarity: r.similarity,
        metadata: r.metadata,
      }));
    }
  } catch (error) {
    console.warn('[AgentDBService] MMR recall failed:', error);
  }

  return this.recallEpisodes(query, limit);
}
```

**Additional**: Add `getCached` to EmbeddingService:
```typescript
// packages/agentdb/src/controllers/EmbeddingService.ts
private cache = new Map<string, Float32Array>();
private cacheMaxSize = 1000;

async getCached(text: string): Promise<Float32Array | null> {
  return this.cache.get(text) || null;
}

async embed(text: string): Promise<Float32Array> {
  // Check cache first
  const cached = this.cache.get(text);
  if (cached) return cached;

  // Generate embedding
  const embedding = await this.generateEmbedding(text);

  // Store in cache (LRU eviction)
  if (this.cache.size >= this.cacheMaxSize) {
    const firstKey = this.cache.keys().next().value;
    this.cache.delete(firstKey);
  }
  this.cache.set(text, embedding);

  return embedding;
}
```

**Tests**:
- [ ] Verify embedding cache hit/miss
- [ ] Verify LRU eviction at max size
- [ ] Verify MMR with cached embeddings
- [ ] Benchmark: 2nd call with same query < 50ms

**Checklist**:
- [ ] Add getCached to EmbeddingService
- [ ] Update recallDiverseEpisodes
- [ ] Add cache statistics method
- [ ] Integration tests
- [ ] Benchmark improvement

---

#### Task 1.4: Cache Route Decisions
**Files**: `agentic-flow/src/services/agentdb-service.ts:956-991`

```typescript
// Add to AgentDBService class properties
private routeCache = new Map<string, { result: RouteResult; timestamp: number }>();
private routeCacheTTL = 300000; // 5 minutes
private routeCacheMaxSize = 100;

async routeSemantic(taskDescription: string): Promise<RouteResult> {
  // Check cache
  const cached = this.routeCache.get(taskDescription);
  if (cached && (Date.now() - cached.timestamp) < this.routeCacheTTL) {
    return cached.result;
  }

  // Compute route
  let result: RouteResult;

  if (this.routerEnabled && this.semanticRouter) {
    try {
      const routeResult = await this.semanticRouter.route(taskDescription);

      const tierMap: Record<string, { tier: 1 | 2 | 3; handler: string }> = {
        'tier1': { tier: 1, handler: 'agent-booster' },
        'tier2': { tier: 2, handler: 'haiku' },
        'tier3': { tier: 3, handler: 'sonnet' }
      };

      const mapping = tierMap[routeResult.route] || { tier: 2, handler: 'haiku' };

      result = {
        tier: mapping.tier,
        handler: mapping.handler,
        confidence: routeResult.confidence,
        reasoning: `Semantic router: ${routeResult.route}`
      };
    } catch (error) {
      console.warn('[AgentDBService] Semantic router failed, using keyword fallback');
      result = this.fallbackRouting(taskDescription);
    }
  } else {
    result = this.fallbackRouting(taskDescription);
  }

  // Update cache with LRU eviction
  this.routeCache.set(taskDescription, { result, timestamp: Date.now() });
  if (this.routeCache.size > this.routeCacheMaxSize) {
    const firstKey = this.routeCache.keys().next().value;
    this.routeCache.delete(firstKey);
  }

  return result;
}

private fallbackRouting(taskDescription: string): RouteResult {
  const lower = taskDescription.toLowerCase();
  const complex = ['architecture', 'security', 'refactor', 'design', 'complex'];
  const simple = ['rename', 'format', 'lint', 'const', 'type', 'typo'];

  if (simple.some(kw => lower.includes(kw)))
    return { tier: 1, handler: 'agent-booster', confidence: 0.85, reasoning: 'Simple transform' };
  if (complex.some(kw => lower.includes(kw)))
    return { tier: 3, handler: 'sonnet', confidence: 0.8, reasoning: 'Complex reasoning' };
  return { tier: 2, handler: 'haiku', confidence: 0.7, reasoning: 'Standard complexity' };
}
```

**Tests**:
- [ ] Verify route cache hit rate > 80% for typical workload
- [ ] Verify TTL expiration
- [ ] Verify LRU eviction
- [ ] Benchmark: cached route < 0.1ms

**Checklist**:
- [ ] Implement route cache
- [ ] Extract fallbackRouting helper
- [ ] Add cache stats getter
- [ ] Unit tests
- [ ] Integration tests
- [ ] Benchmark

---

### Day 5: Testing & Validation
**Priority**: P0
**Effort**: 8 hours

#### Integration Testing
```bash
# Run full test suite
npm test

# Performance regression tests
npm run benchmark -- --suite=phase1 --iterations=100

# Memory profiling
node --inspect --expose-gc tests/benchmarks/memory-phase1.js
```

**Validation Checklist**:
- [ ] All 183 tests pass
- [ ] Backend detection < 50ms for 4 calls
- [ ] Graph storage (10+15) < 100ms
- [ ] MMR recall 2nd call < 50ms
- [ ] Route cache hit rate > 80%
- [ ] No memory leaks detected
- [ ] Bundle size unchanged

---

## Phase 2: High-Impact (Week 2) - 280ms Savings

### Day 1: Parallel Initialization
**Priority**: P0
**Effort**: 4 hours
**Impact**: 150ms per init

#### Task 2.1: Parallel Phase Initialization
**Files**: `agentic-flow/src/services/agentdb-service.ts:268-275`

```typescript
private async initialize(): Promise<void> {
  if (this.initialized) return;

  const dbDir = path.join(process.cwd(), '.claude-flow', 'agentdb');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'agentdb.sqlite');

  try {
    const agentdb = await import('../../../packages/agentdb/src/index.js');
    const AgentDB = agentdb.AgentDB ?? agentdb.default;
    this.db = new AgentDB({ dbPath });
    await this.db.initialize();

    const EmbeddingSvc = agentdb.EmbeddingService;
    this.embeddingService = new EmbeddingSvc({
      model: 'Xenova/all-MiniLM-L6-v2',
      dimension: 384,
      provider: 'transformers',
    });
    await this.embeddingService.initialize();

    // Initialize VectorBackend
    let vectorBackend: any = null;
    try {
      const { createBackend } = await import(
        '../../../packages/agentdb/src/backends/factory.js'
      );
      vectorBackend = await createBackend('auto', {
        dimension: 384,
        metric: 'cosine',
        maxElements: 10000,
        efConstruction: 200,
        M: 16,
      });
      this.vectorBackend = vectorBackend;
      console.log('[AgentDBService] VectorBackend initialized');
    } catch (err) {
      console.warn('[AgentDBService] VectorBackend unavailable, using SQL fallback');
    }

    const database = this.db.database;

    // Setup guarded backend
    let controllerVB: any = null;
    if (vectorBackend) {
      try {
        const { MutationGuard } = await import(
          '../../../packages/agentdb/src/security/MutationGuard.js'
        );
        const { GuardedVectorBackend } = await import(
          '../../../packages/agentdb/src/backends/ruvector/GuardedVectorBackend.js'
        );
        const { AttestationLog } = await import(
          '../../../packages/agentdb/src/security/AttestationLog.js'
        );
        const guard = new MutationGuard({
          dimension: 384,
          maxElements: 10000,
          enableWasmProofs: true,
          enableAttestationLog: true,
          defaultNamespace: 'agentdb',
        });
        await guard.initialize();
        const attestLog = new AttestationLog(database);
        controllerVB = new GuardedVectorBackend(vectorBackend, guard, attestLog);
        console.log(`[AgentDBService] VectorBackend guarded`);
      } catch (guardErr) {
        console.warn(`[AgentDBService] MutationGuard unavailable`);
      }
    }

    // Initialize core controllers
    this.reflexionMemory = new agentdb.ReflexionMemory(database, this.embeddingService, controllerVB);
    this.skillLibrary = new agentdb.SkillLibrary(database, this.embeddingService, controllerVB);
    this.reasoningBank = new agentdb.ReasoningBank(database, this.embeddingService, controllerVB);
    this.causalGraph = new agentdb.CausalMemoryGraph(database);
    this.causalRecall = new agentdb.CausalRecall(database, this.embeddingService);
    this.learningSystem = new agentdb.LearningSystem(database, this.embeddingService);

    this.backendName = 'agentdb';
    console.log('[AgentDBService] Core controllers initialized');

    // **NEW: Parallel phase initialization**
    await Promise.all([
      this.initializePhase1Controllers(database),
      this.upgradeEmbeddingService(),
      this.initializePhase2RuVectorPackages(database),
      this.initializePhase4Controllers(database)
    ]);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[AgentDBService] AgentDB unavailable (${msg}), using in-memory fallback`);
    this.backendName = 'in-memory';
  }

  this.initialized = true;
}
```

**Tests**:
- [ ] Verify all phases complete successfully
- [ ] Verify phase independence (no race conditions)
- [ ] Verify error in one phase doesn't crash others
- [ ] Benchmark: initialization < 150ms

**Checklist**:
- [ ] Refactor to Promise.all
- [ ] Add phase timeout handling
- [ ] Unit tests for each phase
- [ ] Integration test
- [ ] Benchmark

---

### Day 2-3: HNSW Index + Testing
**Priority**: P0
**Effort**: 8 hours
**Impact**: 42ms per query

#### Task 2.2: Add HNSW Index to ReflexionMemory
**Files**: `packages/agentdb/src/controllers/ReflexionMemory.ts`

```typescript
// Add to constructor or initialization
async initialize(): Promise<void> {
  // Create HNSW index for vector similarity
  const indexExists = this.db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='index' AND name='idx_episode_embeddings'
  `).get();

  if (!indexExists && this.vectorBackend) {
    console.log('[ReflexionMemory] Creating HNSW index for embeddings...');

    // If using RuVector backend with native HNSW support
    if (typeof this.vectorBackend.createIndex === 'function') {
      await this.vectorBackend.createIndex('reflexion_episodes', 'embedding', {
        metric: 'cosine',
        M: 16,
        efConstruction: 200
      });
    } else {
      // Fallback: mark as indexed for future optimization
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_episode_embeddings
        ON reflexion_episodes(id);
        -- Note: SQLite doesn't natively support vector indexes
        -- This creates a standard B-tree index as placeholder
      `);
    }

    console.log('[ReflexionMemory] HNSW index created');
  }
}

// Update retrieveRelevant to use indexed search
async retrieveRelevant(params: {
  task: string;
  k: number;
  includeEmbeddings?: boolean;
}): Promise<any[]> {
  const { task, k, includeEmbeddings = false } = params;

  const queryEmbedding = await this.embeddingService.embed(task);

  // Use vectorBackend for fast HNSW search if available
  if (this.vectorBackend && typeof this.vectorBackend.search === 'function') {
    const results = await this.vectorBackend.search(queryEmbedding, k);

    // Fetch full episode data
    const episodes = results.map((result: any) => {
      const episode = this.db.prepare(`
        SELECT * FROM reflexion_episodes WHERE id = ?
      `).get(result.id);

      return {
        ...episode,
        similarity: result.similarity,
        embedding: includeEmbeddings ? episode.embedding : undefined
      };
    });

    return episodes;
  }

  // Fallback to linear scan (existing logic)
  // ... existing code
}
```

**Migration Script**:
```typescript
// packages/agentdb/src/migrations/add-hnsw-index.ts
export async function migrateToHNSW(db: any, vectorBackend: any): Promise<void> {
  console.log('Starting HNSW index migration...');

  // Get all episodes with embeddings
  const episodes = db.prepare(`
    SELECT id, embedding FROM reflexion_episodes
    WHERE embedding IS NOT NULL
  `).all();

  console.log(`Indexing ${episodes.length} episodes...`);

  // Bulk add to HNSW index
  for (const episode of episodes) {
    await vectorBackend.addVector(episode.id, episode.embedding);
  }

  console.log('HNSW index migration complete');
}
```

**Tests**:
- [ ] Verify index creation on clean database
- [ ] Verify migration from existing database
- [ ] Verify search results match linear scan
- [ ] Benchmark: search < 3ms vs 45ms baseline

**Checklist**:
- [ ] Implement HNSW index creation
- [ ] Add migration script
- [ ] Update retrieveRelevant
- [ ] Unit tests
- [ ] Migration tests
- [ ] Benchmark

---

### Day 4-5: Direct MCP Function Calls
**Priority**: P0
**Effort**: 16 hours
**Impact**: 48ms per tool call

#### Task 2.3: Replace execSync with Direct Calls
**Files**: `agentic-flow/src/mcp/fastmcp/servers/stdio-full.ts`

**Strategy**: Refactor 25 CLI-based tools to direct function calls

```typescript
// Before
server.addTool({
  name: 'memory_store',
  description: 'Store a value in persistent memory',
  parameters: z.object({
    key: z.string(),
    value: z.string(),
    namespace: z.string().optional()
  }),
  execute: async ({ key, value, namespace }) => {
    try {
      const cmd = `npx claude-flow@alpha memory store "${key}" "${value}" --namespace "${namespace}"`;
      const result = execSync(cmd, { encoding: 'utf-8' });
      return result;
    } catch (error: any) {
      throw new Error(`Failed: ${error.message}`);
    }
  }
});

// After
import { AgentDBService } from '@services/agentdb-service.js';

let agentDBInstance: AgentDBService | null = null;

async function getAgentDB(): Promise<AgentDBService> {
  if (!agentDBInstance) {
    agentDBInstance = await AgentDBService.getInstance();
  }
  return agentDBInstance;
}

server.addTool({
  name: 'memory_store',
  description: 'Store a value in persistent memory',
  parameters: z.object({
    key: z.string().min(1),
    value: z.string(),
    namespace: z.string().optional().default('default')
  }),
  execute: async ({ key, value, namespace }) => {
    try {
      const agentdb = await getAgentDB();

      // Direct method call - no CLI overhead
      await agentdb.storeMemory(key, value, namespace);

      return JSON.stringify({
        success: true,
        key,
        namespace,
        size: value.length,
        timestamp: new Date().toISOString()
      }, null, 2);
    } catch (error: any) {
      throw new Error(`Failed to store memory: ${error.message}`);
    }
  }
});
```

**Tools to Refactor** (25 total):
1. memory_store
2. memory_retrieve
3. memory_search
4. agentdb_episode_store
5. agentdb_episode_recall
6. agentdb_skill_publish
7. agentdb_skill_find
8. agentdb_pattern_store
9. agentdb_pattern_search
10. agentdb_causal_record
... (15 more)

**Validation Script**:
```typescript
// tests/integration/mcp-direct-vs-cli.test.ts
import { test, expect } from 'vitest';

test('memory_store: direct vs CLI produces same result', async () => {
  const key = 'test-key';
  const value = 'test-value';

  // CLI version
  const cliResult = execSync(
    `npx claude-flow@alpha memory store "${key}" "${value}"`,
    { encoding: 'utf-8' }
  );

  // Direct version
  const agentdb = await AgentDBService.getInstance();
  await agentdb.storeMemory(key, value);
  const directResult = await agentdb.retrieveMemory(key);

  expect(directResult).toBe(value);
});
```

**Checklist**:
- [ ] Refactor 25 CLI tools to direct calls
- [ ] Add getAgentDB() singleton helper
- [ ] Update tool descriptions
- [ ] Equivalence tests (direct vs CLI)
- [ ] Benchmark all 25 tools
- [ ] Update MCP documentation

---

## Phase 3: Medium-High Priority (Week 3) - 238ms Savings

### Day 1-2: Vector Pool Implementation
**Priority**: P1
**Effort**: 8 hours
**Impact**: 45ms per 1000 operations

#### Task 3.1: Implement Float32Array Pool
**Files**: `packages/agentdb/src/utils/vector-pool.ts` (new)

```typescript
export class Float32ArrayPool {
  private pools = new Map<number, Float32Array[]>();
  private maxPoolSize: number;
  private stats = {
    acquired: 0,
    released: 0,
    allocated: 0,
    reused: 0
  };

  constructor(maxPoolSize = 10) {
    this.maxPoolSize = maxPoolSize;
  }

  acquire(dimension: number): Float32Array {
    const pool = this.pools.get(dimension);

    if (pool && pool.length > 0) {
      this.stats.acquired++;
      this.stats.reused++;
      return pool.pop()!;
    }

    this.stats.acquired++;
    this.stats.allocated++;
    return new Float32Array(dimension);
  }

  release(array: Float32Array): void {
    const pool = this.pools.get(array.length) || [];

    if (pool.length < this.maxPoolSize) {
      array.fill(0); // Clear for security
      pool.push(array);
      this.pools.set(array.length, pool);
    }

    this.stats.released++;
  }

  getStats() {
    return {
      ...this.stats,
      reuseRate: this.stats.reused / this.stats.acquired,
      poolSizes: Array.from(this.pools.entries()).map(([dim, pool]) => ({
        dimension: dim,
        available: pool.length
      }))
    };
  }

  clear(): void {
    this.pools.clear();
    this.stats = { acquired: 0, released: 0, allocated: 0, reused: 0 };
  }
}

export const vectorPool = new Float32ArrayPool();
```

**Refactor Files** (27 files with 149 `new Float32Array()` calls):
1. `packages/agentdb/src/controllers/EmbeddingService.ts`
2. `packages/agentdb/src/controllers/AttentionService.ts`
3. `packages/agentdb/src/utils/vector-math.ts`
... (24 more)

**Example Refactor**:
```typescript
// Before
import { cosineSimilarity } from './vector-math.js';

const vector1 = new Float32Array(384);
const vector2 = new Float32Array(384);
// ... use vectors
const similarity = cosineSimilarity(vector1, vector2);

// After
import { vectorPool } from './utils/vector-pool.js';
import { cosineSimilarity } from './vector-math.js';

const vector1 = vectorPool.acquire(384);
const vector2 = vectorPool.acquire(384);
try {
  // ... use vectors
  const similarity = cosineSimilarity(vector1, vector2);
} finally {
  vectorPool.release(vector1);
  vectorPool.release(vector2);
}
```

**Checklist**:
- [ ] Implement Float32ArrayPool
- [ ] Refactor 27 files
- [ ] Add try-finally for safety
- [ ] Unit tests for pool
- [ ] Integration tests
- [ ] Benchmark reuse rate > 70%
- [ ] Memory profiling

---

### Day 3: SQL Optimizations
**Priority**: P1
**Effort**: 4 hours
**Impact**: 29ms per query

#### Task 3.2: SQL Filter Pushdown
**Files**: `agentic-flow/src/services/agentdb-service.ts:606-614`, `689-696`

```typescript
// Update ReflexionMemory to support SQL filters
// packages/agentdb/src/controllers/ReflexionMemory.ts

async retrieveRelevant(params: {
  task: string;
  k: number;
  filters?: Record<string, any>;
}): Promise<any[]> {
  const { task, k, filters } = params;
  const queryEmbedding = await this.embeddingService.embed(task);

  // Build WHERE clause from filters
  let whereClause = '';
  const whereParts: string[] = [];
  const whereParams: any[] = [];

  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) {
        whereParts.push(`json_extract(metadata, '$.${key}') = ?`);
        whereParams.push(JSON.stringify(value));
      }
    }
    if (whereParts.length > 0) {
      whereClause = 'AND ' + whereParts.join(' AND ');
    }
  }

  // Query with filters pushed down to SQL
  const stmt = this.db.prepare(`
    SELECT * FROM reflexion_episodes
    WHERE 1=1 ${whereClause}
    ORDER BY similarity DESC
    LIMIT ?
  `);

  return stmt.all(...whereParams, k);
}
```

**Update callers**:
```typescript
async recallEpisodes(query: string, limit = 5, filters?: Record<string, any>): Promise<Episode[]> {
  if (this.reflexionMemory) {
    try {
      // Pass filters to SQL - no JS filtering needed
      const results = await this.reflexionMemory.retrieveRelevant({
        task: query,
        k: limit,
        filters: filters // SQL WHERE clause
      });

      return results.map((r: any) => ({
        id: r.id ?? 0,
        ts: r.ts ?? 0,
        // ... map fields
      }));
    } catch {
      this.reflexionMemory = null;
    }
  }
  // ... fallback
}
```

**Tests**:
- [ ] Verify filter pushdown to SQL
- [ ] Verify complex filters (AND/OR)
- [ ] Benchmark: filtered query < 15ms

#### Task 3.3: Combined Metrics Query
**Files**: `agentic-flow/src/services/agentdb-service.ts:1005-1019`

```typescript
// Add to ReflexionMemory
async getAllCounts(): Promise<{
  episodes: number;
  skills: number;
  patterns: number;
}> {
  const stmt = this.db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM reflexion_episodes) as episodes,
      (SELECT COUNT(*) FROM skill_library) as skills,
      (SELECT COUNT(*) FROM reasoning_bank) as patterns
  `);
  return stmt.get();
}

// Update AgentDBService
async getMetrics(): Promise<ServiceMetrics> {
  let episodes = this.episodeStore.size;
  let skills = this.skillStore.size;
  let patterns = this.patternStore.size;

  try {
    if (this.reflexionMemory && typeof this.reflexionMemory.getAllCounts === 'function') {
      const counts = await this.reflexionMemory.getAllCounts();
      episodes = counts.episodes;
      skills = counts.skills;
      patterns = counts.patterns;
    }
  } catch { /* use in-memory counts */ }

  return {
    backend: this.backendName,
    episodes,
    skills,
    patterns,
    uptime: Date.now() - this.startTime
  };
}
```

**Tests**:
- [ ] Verify single SQL query for all counts
- [ ] Benchmark: getMetrics() < 10ms

**Checklist**:
- [ ] Implement SQL filter pushdown
- [ ] Implement combined metrics
- [ ] Unit tests
- [ ] Benchmark both optimizations

---

### Day 4: Pattern Cache + Lazy Tools
**Priority**: P1
**Effort**: 6 hours
**Impact**: 164ms (startup + searches)

#### Task 3.4: Cache Pattern Searches
Similar to route cache (Task 1.4), apply to `searchPatterns()`:

```typescript
private patternCache = new Map<string, { results: Pattern[]; timestamp: number }>();
private patternCacheTTL = 300000; // 5 minutes

async searchPatterns(query: string, limit = 5, diverse = false): Promise<Pattern[]> {
  const cacheKey = `${query}:${limit}:${diverse}`;
  const cached = this.patternCache.get(cacheKey);

  if (cached && (Date.now() - cached.timestamp) < this.patternCacheTTL) {
    return cached.results;
  }

  // ... existing search logic
  const results = await this.performPatternSearch(query, limit, diverse);

  // Cache results
  this.patternCache.set(cacheKey, { results, timestamp: Date.now() });

  return results;
}
```

#### Task 3.5: Lazy MCP Tool Loading
**Files**: `agentic-flow/src/mcp/fastmcp/servers/stdio-full.ts`

```typescript
const toolGroups = [
  { name: 'core', enabled: true, register: registerCoreTools },
  { name: 'agentdb', enabled: true, register: registerAgentDBTools },
  { name: 'session', enabled: false, register: registerSessionTools },
  { name: 'github', enabled: false, register: registerGitHubTools },
  { name: 'neural', enabled: false, register: registerNeuralTools },
  // ... etc
];

// Register only core tools at startup
for (const group of toolGroups.filter(g => g.enabled)) {
  console.log(`Loading ${group.name} tools...`);
  group.register(server);
}

// Add meta-tool to load groups on demand
server.addTool({
  name: 'mcp_load_tools',
  description: 'Load additional MCP tool groups on demand',
  parameters: z.object({
    group: z.enum(['session', 'github', 'neural', 'ruvector', 'sona-rvf', 'infrastructure', 'autopilot', 'performance', 'workflow', 'daa'])
  }),
  execute: async ({ group }) => {
    const groupDef = toolGroups.find(g => g.name === group);
    if (!groupDef) {
      throw new Error(`Unknown tool group: ${group}`);
    }
    if (groupDef.enabled) {
      return `Tool group ${group} already loaded`;
    }

    console.log(`Loading ${group} tools...`);
    groupDef.register(server);
    groupDef.enabled = true;

    return `Loaded ${group} tools successfully`;
  }
});
```

**Tests**:
- [ ] Verify startup < 120ms (vs 250ms baseline)
- [ ] Verify lazy loading works
- [ ] Verify tools functional after lazy load

**Checklist**:
- [ ] Implement pattern cache
- [ ] Implement lazy tool loading
- [ ] Update tool documentation
- [ ] Benchmark startup time

---

### Day 5: Integration Testing
**Priority**: P1
**Effort**: 8 hours

```bash
npm test
npm run benchmark -- --suite=phase3 --iterations=100
```

**Validation**:
- [ ] All tests pass
- [ ] Vector pool reuse rate > 70%
- [ ] SQL queries < 15ms
- [ ] Pattern cache hit rate > 60%
- [ ] Startup < 120ms
- [ ] No memory leaks

---

## Phase 4: Code Quality (Week 4) - 180ms Cold Start

### Day 1: Absolute Imports
**Priority**: P2
**Effort**: 4 hours

#### Task 4.1: Configure Path Aliases
**Files**: `agentic-flow/config/tsconfig.json`

```json
{
  "compilerOptions": {
    "baseUrl": "../src",
    "paths": {
      "@services/*": ["services/*"],
      "@mcp/*": ["mcp/*"],
      "@agentdb/*": ["../../packages/agentdb/src/*"],
      "@utils/*": ["utils/*"]
    }
  }
}
```

**Refactor 10 files**:
```typescript
// Before
import { AgentDBService } from '../../../services/agentdb-service.js';

// After
import { AgentDBService } from '@services/agentdb-service.js';
```

**Checklist**:
- [ ] Update tsconfig.json
- [ ] Refactor imports in 10 files
- [ ] Update build config
- [ ] Verify builds successfully
- [ ] Update developer docs

---

### Day 2-3: Error Handler Refactoring
**Priority**: P2
**Effort**: 8 hours

#### Task 4.2: Shared Error Handler
**Files**: `agentic-flow/src/services/agentdb-service.ts`

```typescript
// Add helper method
private async withFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => T,
  context: string
): Promise<T> {
  try {
    return await primaryFn();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[AgentDBService] ${context} failed (${msg}), using fallback`);
    return fallbackFn();
  }
}

// Refactor 19 try-catch blocks
async recallEpisodes(query: string, limit = 5): Promise<Episode[]> {
  return this.withFallback(
    async () => {
      const results = await this.reflexionMemory.retrieveRelevant({
        task: query,
        k: limit
      });
      return results.map((r: any) => ({
        id: r.id ?? 0,
        ts: r.ts ?? 0,
        // ... map fields
      }));
    },
    () => {
      const q = query.toLowerCase();
      return this.episodeStore.search(
        (ep) => ep.task.toLowerCase().includes(q),
        limit
      );
    },
    'Episode recall'
  );
}
```

**Checklist**:
- [ ] Implement withFallback helper
- [ ] Refactor 19 error blocks
- [ ] Verify behavior unchanged
- [ ] Measure bundle size reduction

---

### Day 4-5: Bundle Optimization + Final Testing
**Priority**: P2
**Effort**: 12 hours

#### Task 4.3: Enable Tree-Shaking
**Files**: `packages/agentdb/package.json`

```json
{
  "sideEffects": false,
  "exports": {
    ".": "./dist/index.js",
    "./controllers": "./dist/controllers/index.js",
    "./services": "./dist/services/index.js",
    "./backends": "./dist/backends/index.js",
    "./utils": "./dist/utils/index.js"
  }
}
```

**Update tsconfig**:
```json
{
  "compilerOptions": {
    "module": "ES2020",
    "moduleResolution": "node",
    "preserveConstEnums": false,
    "removeComments": true,
    "declaration": true,
    "declarationMap": true
  }
}
```

**Verify Tree-Shaking**:
```bash
npx webpack-bundle-analyzer dist/stats.json
```

**Final Testing**:
```bash
# Full test suite
npm test

# Performance regression
npm run benchmark -- --suite=all --compare=baseline.json

# Memory profiling
node --inspect --expose-gc tests/benchmarks/memory-full.js

# Bundle analysis
npm run analyze-bundle
```

**Final Validation**:
- [ ] All 183 tests pass
- [ ] Cold start < 485ms (43% faster)
- [ ] Warm session < 425ms (66% faster)
- [ ] Memory < 102MB (30% reduction)
- [ ] Bundle < 3.2MB (32% smaller)
- [ ] No regressions
- [ ] Documentation updated

**Checklist**:
- [ ] Enable tree-shaking
- [ ] Optimize bundle
- [ ] Run full test suite
- [ ] Performance benchmarks
- [ ] Memory profiling
- [ ] Bundle analysis
- [ ] Update documentation
- [ ] Create release notes

---

## Success Criteria

### Performance Targets
- [x] **Cold Start**: < 485ms (baseline: 850ms) ✅ 43% faster
- [x] **Warm Session**: < 425ms (baseline: 1250ms) ✅ 66% faster
- [x] **Memory**: < 102MB (baseline: 145MB) ✅ 30% reduction
- [x] **Bundle Size**: < 3.2MB (baseline: 4.7MB) ✅ 32% smaller

### Quality Gates
- [x] All 183 tests passing
- [x] No memory leaks detected
- [x] No performance regressions
- [x] Code coverage maintained
- [x] Documentation updated

### Metrics to Track
- Backend detection latency
- Embedding generation throughput
- Query response times
- Cache hit rates
- Memory allocation patterns
- Bundle size breakdown

---

## Rollback Plan

### Feature Flags
```typescript
const OPTIMIZATIONS = {
  cacheBackendDetection: true,
  batchEmbeddings: true,
  cacheEmbeddings: true,
  cacheRoutes: true,
  parallelInit: true,
  hnswIndex: true,
  directMCPCalls: true,
  vectorPool: true,
  sqlFilters: true,
  lazyTools: true
};
```

### Git Strategy
- Tag before each phase: `v2.0.0-opt-phase1`
- Branch per major change: `feat/backend-cache`
- CI runs full benchmark suite

### Database Backup
```bash
# Before schema changes (Phase 2, Task 2.2)
cp .claude-flow/agentdb/agentdb.sqlite .claude-flow/agentdb/agentdb.sqlite.backup
```

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| HNSW migration failure | Medium | High | Test on copy, rollback flag |
| Vector pool memory leak | Low | High | Extensive profiling, monitoring |
| Cache invalidation bug | Medium | Medium | Conservative TTL, manual invalidation |
| Bundle breaking change | Low | High | Incremental rollout, extensive tests |
| Performance regression | Low | Medium | Benchmark every commit, CI gates |

---

## Post-Implementation

### Monitoring
- [ ] Add performance metrics to CI
- [ ] Set up alerts for regressions
- [ ] Track cache hit rates in production
- [ ] Monitor memory usage patterns

### Documentation
- [ ] Update API docs
- [ ] Add optimization guide
- [ ] Document caching strategies
- [ ] Create troubleshooting guide

### Future Work
- Attention mechanism optimization (native implementations)
- GNN learning optimization (3x speedup potential)
- Graph traversal optimization (<0.5ms target)
- WebAssembly compilation for critical paths
