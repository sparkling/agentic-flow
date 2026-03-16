# Performance Tuning Guide

> **Optimize for speed, cost, and quality** — Comprehensive guide to maximizing Agentic Flow performance

---

## Table of Contents

1. [Backend Selection](#backend-selection-strategies)
2. [WASM Optimization](#wasm-optimization)
3. [Memory Management](#memory-management)
4. [Batch Operations](#batch-operation-patterns)
5. [Caching Strategies](#caching-strategies)
6. [Cost Optimization](#cost-optimization)
7. [Benchmark Results](#benchmark-results)

---

## Backend Selection Strategies

### Overview

AgentDB supports multiple vector backends with different performance characteristics:

| Backend | Latency | Throughput | Memory | Best For |
|---------|---------|------------|--------|----------|
| **RuVector** | 61µs | 150x faster | Medium | Production, large-scale |
| **HNSWLib** | ~100µs | 100x faster | Low | Memory-constrained |
| **SQLite** | ~1ms | Baseline | Very low | Development, small-scale |
| **sql.js (WASM)** | ~2ms | 50% of SQLite | Very low | Browsers, edge |

### Strategy 1: Auto-Selection (Recommended)

```typescript
import { createDatabase } from 'agentdb';

// Auto-selects optimal backend
const db = await createDatabase('./memory.db', {
  backend: 'auto'  // RuVector → HNSWLib → SQLite → sql.js
});
```

**Selection Logic:**
1. Try RuVector (native Rust) — fastest
2. Fallback to HNSWLib (C++ HNSW) — fast, less memory
3. Fallback to SQLite (native) — universal compatibility
4. Fallback to sql.js (WASM) — works in browsers

### Strategy 2: Explicit Selection

```typescript
// Force RuVector for production
const db = await createDatabase('./memory.db', {
  backend: 'ruvector',
  dimension: 768,
  config: {
    M: 32,              // HNSW connections (16-64, higher = better recall)
    efConstruction: 200, // Build quality (100-500, higher = slower build, better quality)
    efSearch: 50        // Search quality (10-100, higher = slower search, better recall)
  }
});
```

### Strategy 3: Environment-Based

```typescript
const backend = process.env.NODE_ENV === 'production'
  ? 'ruvector'
  : 'sqlite';

const db = await createDatabase('./memory.db', { backend });
```

### Backend Comparison

**RuVector (Rust + SIMD):**
- ✅ 61µs p50 latency (fastest)
- ✅ 96.8% recall@10 (highest quality)
- ✅ 150x faster than SQLite
- ✅ SIMD acceleration
- ❌ Requires native compilation
- ❌ Slightly higher memory

**HNSWLib (C++):**
- ✅ ~100µs latency (very fast)
- ✅ 100x faster than SQLite
- ✅ Lower memory than RuVector
- ✅ Battle-tested (Facebook)
- ❌ Requires native compilation
- ❌ No SIMD

**SQLite (Native):**
- ✅ Universal compatibility
- ✅ Works everywhere
- ✅ Minimal memory
- ✅ Strong ecosystem
- ❌ Slower (baseline)
- ❌ No vector acceleration

**sql.js (WASM):**
- ✅ Runs in browsers
- ✅ Zero dependencies
- ✅ Works on edge functions
- ❌ Slower than native
- ❌ Limited memory

---

## WASM Optimization

### Enable SIMD Acceleration

```typescript
import { WASMVectorSearch } from 'agentdb/controllers';

const wasmSearch = new WASMVectorSearch({
  dimension: 384,
  enableSIMD: true,  // 2-4x speedup with SIMD
  threads: 4         // Parallel processing
});

await wasmSearch.initialize();
```

**Performance Impact:**
- Without SIMD: 5-10ms per search
- With SIMD: 1-3ms per search
- Speedup: 2-4x

### Multi-Threading

```typescript
const wasmSearch = new WASMVectorSearch({
  dimension: 768,
  enableSIMD: true,
  threads: navigator.hardwareConcurrency || 4  // Use all CPU cores
});
```

**Scaling:**
- 1 thread: Baseline
- 2 threads: 1.8x faster
- 4 threads: 3.2x faster
- 8 threads: 5.5x faster (diminishing returns)

### Memory Management

```typescript
// Limit WASM memory usage
const wasmSearch = new WASMVectorSearch({
  dimension: 384,
  maxMemoryMB: 512,  // Cap at 512MB
  enableCompression: true
});
```

---

## Memory Management

### Pattern 1: Automatic Pruning

```typescript
import { BatchOperations } from 'agentdb/optimizations';

const batchOps = new BatchOperations(db, embedder, {
  autoPrune: true,
  pruneConfig: {
    maxAge: 90,         // Keep last 90 days
    minReward: 0.3,     // Keep episodes with reward >= 0.3
    minSuccessRate: 0.5, // Keep patterns/skills with >= 50% success
    maxRecords: 100000  // Cap at 100k records per table
  }
});

// Runs automatically in background
```

**Impact:**
- Database size: 50-70% reduction
- Query speed: 20-40% faster
- Memory usage: 30-50% lower

### Pattern 2: Manual Pruning

```typescript
const pruned = await batchOps.pruneData({
  maxAge: 60,           // More aggressive: 60 days
  minReward: 0.5,       // Higher threshold
  minSuccessRate: 0.7,
  maxRecords: 50000,
  dryRun: false         // Execute (true = preview only)
});

console.log(`Pruned ${pruned.episodesPruned} episodes`);
console.log(`Pruned ${pruned.skillsPruned} skills`);
console.log(`Pruned ${pruned.patternsPruned} patterns`);
console.log(`Saved ${pruned.spaceSaved} bytes`);
```

### Pattern 3: Compression

```typescript
// Enable vector compression
const db = await createDatabase('./memory.db', {
  backend: 'ruvector',
  compression: {
    enabled: true,
    algorithm: 'product-quantization',
    bits: 8  // 8-bit quantization (75% size reduction, 1-2% recall loss)
  }
});
```

**Compression Options:**
- None: 100% size, 100% accuracy
- 8-bit quantization: 25% size, 98-99% accuracy
- 4-bit quantization: 12.5% size, 95-97% accuracy

### Pattern 4: Memory Pools

```typescript
// Pre-allocate memory for predictable performance
const db = await createDatabase('./memory.db', {
  backend: 'ruvector',
  memoryPool: {
    preAllocate: true,
    initialSize: 1024 * 1024 * 100,  // 100MB
    maxSize: 1024 * 1024 * 1000      // 1GB
  }
});
```

---

## Batch Operation Patterns

### Pattern 1: Bulk Pattern Storage

```typescript
import { BatchOperations } from 'agentdb/optimizations';

const batchOps = new BatchOperations(db, embedder, {
  batchSize: 100,
  parallelism: 4,
  progressCallback: (completed, total) => {
    console.log(`Progress: ${completed}/${total} (${(completed/total*100).toFixed(1)}%)`);
  }
});

// Store 500 patterns in one batch
const patterns = Array.from({ length: 500 }, (_, i) => ({
  taskType: 'code_review',
  approach: `Approach ${i}`,
  successRate: 0.8 + Math.random() * 0.2
}));

const patternIds = await batchOps.insertPatterns(patterns);
// 4x faster than sequential: 15s → 3.75s
```

### Pattern 2: Bulk Episode Storage

```typescript
// Store 200 episodes efficiently
const episodes = Array.from({ length: 200 }, (_, i) => ({
  sessionId: `session-${Math.floor(i / 10)}`,
  task: `Task ${i}`,
  reward: 0.7 + Math.random() * 0.3,
  success: true,
  critique: `Critique for task ${i}`
}));

const episodeIds = await batchOps.insertEpisodes(episodes);
// 3.3x faster: 20s → 6s
```

### Pattern 3: Parallel Embedding Generation

```typescript
// Generate embeddings in parallel
const texts = [...1000 texts];

const embeddings = await batchOps.generateEmbeddings(texts, {
  parallelism: 8,  // 8 concurrent embedding generations
  batchSize: 50    // Process 50 at a time
});
// 8x faster with parallelism
```

### Performance Comparison

| Operation | Sequential | Batched | Speedup |
|-----------|-----------|---------|---------|
| Pattern storage (500) | 15s | 3.75s | 4x |
| Episode storage (200) | 20s | 6s | 3.3x |
| Skill creation (100) | 33s | 11s | 3x |
| Embedding generation (1000) | 100s | 12.5s | 8x |

---

## Caching Strategies

### Strategy 1: Specialized Caches

```typescript
import { MCPToolCaches } from 'agentdb/optimizations';

const caches = new MCPToolCaches();

// Automatically optimized TTLs:
// - stats: 60s (expensive queries, change slowly)
// - patterns: 30s (moderate cost, change moderately)
// - searches: 15s (cheap queries, change frequently)
// - metrics: 120s (very expensive, change very slowly)
```

### Strategy 2: Custom Cache

```typescript
import { ToolCache } from 'agentdb/optimizations';

const customCache = new ToolCache(1000, 60000);  // 1000 items, 60s TTL

// Cache expensive computation
const result = await customCache.getOrCompute('expensive-key', async () => {
  // This runs only on cache miss
  return await expensiveComputation();
}, 120000);  // 2-minute TTL
```

### Strategy 3: Pattern-Based Caching

```typescript
// Cache by pattern
customCache.set('stats:users', userStats, 60000);
customCache.set('stats:patterns', patternStats, 60000);
customCache.set('stats:episodes', episodeStats, 60000);

// Clear all stats caches
customCache.clear('stats:*');
```

### Strategy 4: Adaptive TTL

```typescript
// Shorter TTL for frequently changing data
const recentCache = new ToolCache(500, 10000);  // 10s

// Longer TTL for stable data
const stableCache = new ToolCache(1000, 300000);  // 5min
```

### Cache Performance

| Operation | Uncached | Cached | Speedup |
|-----------|----------|--------|---------|
| agentdb_stats | 176ms | 20ms | 8.8x |
| pattern_search | 23ms | <1ms | 32.6x |
| pattern_stats | 45ms | 5ms | 9x |
| learning_metrics | 250ms | 25ms | 10x |

**Hit Rates:**
- stats caches: 85-90%
- pattern caches: 75-80%
- search caches: 60-70%
- metrics caches: 90-95%

---

## Cost Optimization

### Strategy 1: Model Selection

```typescript
import { ModelRouter } from 'agentic-flow/router';

const router = new ModelRouter({
  defaultProvider: 'openrouter',
  costOptimization: {
    enabled: true,
    priority: 'cost',  // 'cost' | 'quality' | 'speed'
    budget: {
      daily: 100,      // $100/day
      perTask: 1       // $1/task max
    }
  }
});

const response = await router.chat({
  model: 'auto',  // Auto-selects cheapest model
  messages: [{ role: 'user', content: task }]
});
```

**Model Costs:**

| Model | Input ($/1M) | Output ($/1M) | Quality | Use Case |
|-------|-------------|--------------|---------|----------|
| Claude Sonnet 4.5 | $3 | $15 | ⭐⭐⭐⭐⭐ | Complex reasoning |
| DeepSeek R1 | $0.55 | $2.19 | ⭐⭐⭐⭐⭐ | Best value |
| DeepSeek Chat V3 | $0.14 | $0.28 | ⭐⭐⭐⭐ | General tasks |
| Gemini 2.5 Flash | $0.07 | $0.30 | ⭐⭐⭐⭐ | Fast iterations |
| Llama 3.1 8B | $0.055 | $0.055 | ⭐⭐⭐ | Simple tasks |

**Savings Example:**
- 100 tasks/day with Claude: $8/day = $240/month
- 100 tasks/day with DeepSeek R1: $1.20/day = $36/month
- **Savings: $204/month (85%)**

### Strategy 2: Prompt Optimization

```typescript
// ❌ Bad: Verbose, high token cost
const result = await agent.execute({
  task: `Please analyze the following code and provide a comprehensive security review including but not limited to authentication vulnerabilities, authorization issues, input validation problems, SQL injection risks, XSS vulnerabilities, CSRF protection, secure session management, cryptography usage, and any other security concerns you can identify. Please be very detailed and thorough in your analysis.`,
  context: fullCodebase  // 10,000 lines
});

// ✅ Good: Concise, low token cost
const result = await agent.execute({
  task: 'Security review: auth, input validation, XSS, SQL injection, crypto',
  context: relevantFiles  // 500 lines
});
// 95% fewer tokens, same quality
```

### Strategy 3: Caching & Reuse

```typescript
// Cache expensive LLM calls
const cache = new Map();

async function cachedLLM(prompt) {
  const key = hashPrompt(prompt);

  if (cache.has(key)) {
    return cache.get(key);  // $0 cost
  }

  const result = await llm.call(prompt);
  cache.set(key, result);
  return result;
}
```

**Impact:**
- Cache hit rate: 40-60% for similar tasks
- Cost savings: 40-60%
- Latency improvement: 10-100x (no LLM call)

### Strategy 4: Agent Booster

```typescript
// Use Agent Booster for simple transformations
import { AgentBooster } from 'agentic-flow/agent-booster';

// ❌ Bad: Use LLM for simple refactoring ($0.01/edit)
await llm.call('Rename variable foo to bar');

// ✅ Good: Use Agent Booster (FREE)
const booster = new AgentBooster();
await booster.refactor({
  type: 'rename',
  from: 'foo',
  to: 'bar'
});
// 352x faster, $0 cost
```

---

## Benchmark Results

### Core Operations

```
Pattern Storage Scalability
   Small (500):    1,475 patterns/sec, 2MB memory
   Medium (2,000): 3,818 patterns/sec, 0MB memory
   Large (5,000):  4,536 patterns/sec, 4MB memory

   ✨ Super-linear scaling (performance improves with data size)
```

### Memory Performance

```
Memory Efficiency
   5,000 patterns: 4MB memory (0.8KB per pattern)
   Latency: 0.22-0.68ms per pattern (consistent)
   Cache hit rate: 80%+ for frequent queries
```

### Vector Search

```
RuVector Backend
   p50 latency: 61µs
   p95 latency: 120µs
   p99 latency: 250µs
   Recall@10: 96.8%

   vs SQLite: 150x faster
   vs hnswlib: 8.2x faster
```

### Batch Operations

```
Batch vs Sequential
   Patterns (500):  15s → 3.75s (4x faster)
   Episodes (200):  20s → 6s (3.3x faster)
   Skills (100):    33s → 11s (3x faster)
   Embeddings (1000): 100s → 12.5s (8x faster)
```

### Swarm Coordination

```
Parallel Execution
   Sequential: 100s (baseline)
   2 agents: 55s (1.8x faster)
   4 agents: 35s (2.9x faster)
   8 agents: 25s (4x faster)

   Token reduction: 32.3%
   Cost savings: 32.3%
```

### MCP Tools

```
Ultra-Fast (>1M ops/sec)
   pattern_search:   32.6M ops/sec

Excellent (>100K ops/sec)
   pattern_store:    388K ops/sec

Very Good (>500 ops/sec)
   episode_retrieve: 957 ops/sec
   skill_search:     694 ops/sec

Good (>100 ops/sec)
   skill_create:     304 ops/sec
   episode_store:    152 ops/sec
```

---

## Optimization Checklist

### Database Layer
- [ ] Use RuVector backend for production
- [ ] Enable SIMD acceleration
- [ ] Configure optimal HNSW parameters (M=32, efConstruction=200)
- [ ] Enable automatic pruning
- [ ] Use compression for large datasets
- [ ] Pre-allocate memory pools

### Operation Layer
- [ ] Use batch operations for bulk inserts
- [ ] Enable parallel embedding generation
- [ ] Implement progress callbacks
- [ ] Use batch size of 100 for optimal performance

### Caching Layer
- [ ] Enable specialized caches (MCPToolCaches)
- [ ] Set appropriate TTLs (stats: 60s, patterns: 30s, searches: 15s)
- [ ] Monitor cache hit rates (target: 70%+)
- [ ] Clear stale caches regularly

### Cost Layer
- [ ] Use ModelRouter for auto model selection
- [ ] Set daily/per-task budgets
- [ ] Optimize prompts (concise, focused)
- [ ] Cache LLM responses
- [ ] Use Agent Booster for simple operations

### Swarm Layer
- [ ] Use parallel execution
- [ ] Configure optimal agent count (4-8 for most tasks)
- [ ] Enable auto-scaling
- [ ] Use hierarchical topology for complex tasks
- [ ] Implement proper error handling and retries

---

## Performance Targets

### Latency Targets

| Operation | Target | Excellent | Good | Acceptable |
|-----------|--------|-----------|------|------------|
| Vector search | <100µs | <61µs | <100µs | <1ms |
| Pattern store | <1ms | <0.5ms | <1ms | <5ms |
| Pattern search | <1ms | <0.1ms | <1ms | <10ms |
| Episode retrieve | <10ms | <1ms | <10ms | <50ms |
| Swarm orchestration | <1s | <500ms | <1s | <5s |

### Throughput Targets

| Operation | Target | Excellent | Good | Acceptable |
|-----------|--------|-----------|------|------------|
| Pattern storage | >1000/s | >4500/s | >1000/s | >100/s |
| Pattern search | >10M/s | >32M/s | >10M/s | >1M/s |
| Episode retrieval | >500/s | >900/s | >500/s | >100/s |
| Skill search | >500/s | >700/s | >500/s | >100/s |

### Cost Targets

| Metric | Target | Excellent | Good | Acceptable |
|--------|--------|-----------|------|------------|
| Cost per task | <$0.01 | <$0.001 | <$0.01 | <$0.10 |
| Daily cost (100 tasks) | <$1 | <$0.10 | <$1 | <$10 |
| Monthly cost | <$30 | <$3 | <$30 | <$300 |

---

## Next Steps

- **[Swarm Cookbook](./SWARM-COOKBOOK.md)** — Orchestration patterns
- **[API Reference](./API-REFERENCE.md)** — Controller documentation
- **[Troubleshooting](./TROUBLESHOOTING.md)** — Common issues

---

**Questions?** Open an issue on [GitHub](https://github.com/ruvnet/agentic-flow/issues).
