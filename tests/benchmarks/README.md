# Performance Benchmarks

Comprehensive performance benchmarking suite for agentic-flow v2 integration layers.

## Overview

This benchmark suite measures performance across 5 critical categories:

1. **Controller Operations** - AgentDB controller performance (insert, search, retrieval)
2. **MCP Tool Latency** - Latency of 75+ MCP tools (p50, p95, p99)
3. **WASM Load Time** - Module loading and compilation performance
4. **Attention Mechanisms** - Speedup comparison vs JS fallback (5 mechanisms)
5. **Memory Usage** - Memory profiling at 10K, 100K, 1M vectors

## Quick Start

### Run All Benchmarks

```bash
npm run benchmark
```

This runs the complete suite and generates reports in 3 formats:
- `reports/performance-report.json` - Machine-readable
- `reports/performance-report.md` - Human-readable
- `reports/performance-report.html` - Visual dashboard

### Run Individual Benchmarks

```bash
# Controller operations
npm run benchmark:controller

# MCP tool latency
npm run benchmark:mcp

# WASM load time
npm run benchmark:wasm

# Attention mechanisms
npm run benchmark:attention

# Memory usage (requires --expose-gc)
npm run benchmark:memory
```

## Performance Targets

### Controller Operations

| Operation | Target p95 | Description |
|-----------|-----------|-------------|
| Vector Insert | <10ms | Insert with HNSW indexing |
| HNSW Search (1K) | <5ms | k=10 similarity search |
| HNSW Search (10K) | <10ms | k=10 similarity search |
| Episode Retrieval | <20ms | ReflexionMemory.getEpisode |
| Skill Search | <20ms | SkillLibrary similarity search |
| Pattern Retrieval | <20ms | ReasoningBank.getPattern |

### MCP Tool Latency

| Metric | Target |
|--------|--------|
| p95 | <100ms |
| p99 | <200ms |
| Error Rate | <1% |

### WASM Load Time

| Module | Target |
|--------|--------|
| ReasoningBank WASM | <100ms |
| QUIC WASM | <50ms |
| Lazy Loading Improvement | >30% |
| Caching Speedup | >5x |

### Attention Mechanisms

| Mechanism | Target Speedup |
|-----------|----------------|
| Flash Attention | 50-100x vs JS |
| Linear Attention | 10-20x vs JS |
| Hyperbolic Attention | 5-10x vs JS |

### Memory Usage

| Vector Count | Target Memory |
|--------------|---------------|
| 10K vectors | <500MB |
| 100K vectors | <5GB |
| Memory Leak | None (growth <50%) |

## Benchmark Architecture

```
tests/benchmarks/
├── controller-operations-bench.ts
│   └── Tests: Insert, Search, Retrieval, WASM vs JS
│
├── mcp-tool-latency-bench.ts
│   └── Tests: 75+ MCP tools (AgentDB, Core, Session, Neural, GitHub)
│
├── wasm-load-time-bench.ts
│   └── Tests: Module loading, caching, lazy loading
│
├── attention-mechanisms-bench.ts
│   └── Tests: Flash, Linear, Hyperbolic, Dot-Product, Cross Attention
│
├── memory-usage-bench.ts
│   └── Tests: 10K/100K vectors, leak detection, sustained load
│
├── benchmark-runner.ts
│   └── Master runner: Orchestrates all benchmarks, generates reports
│
└── reports/
    ├── performance-report.json
    ├── performance-report.md
    └── performance-report.html
```

## Report Formats

### JSON Report

Machine-readable format for:
- CI/CD integration
- Historical tracking
- Automated analysis
- Regression detection

### Markdown Report

Human-readable format with:
- Executive summary
- Per-category results tables
- Recommendations
- Target compliance

### HTML Dashboard

Visual dashboard with:
- Summary metrics cards
- Interactive tables
- Color-coded status indicators
- Recommendations panel

## Optimization Strategies

### 1. HNSW Index Tuning

```typescript
// Tune parameters based on workload
const hnsw = new HNSWIndex({
  efConstruction: 200,  // Higher = better quality, slower build
  M: 16,                // Higher = better quality, more memory
  metric: 'cosine'      // cosine, l2, dot
});
```

**Expected Impact:** 20-30% latency reduction

### 2. Embedding Batch Operations

```typescript
// Use batch operations for bulk inserts
const embeddings = await embeddingService.embedBatch(texts, {
  batchSize: 100,        // Tune based on memory
  parallel: true         // Parallel batch processing
});
```

**Expected Impact:** 5-10x throughput improvement

### 3. MCP Tool Pooling

```typescript
// Connection pooling for database operations
const pool = new ConnectionPool({
  maxConnections: 10,
  idleTimeout: 30000
});
```

**Expected Impact:** 30-50% latency reduction

### 4. WASM Module Caching

```typescript
// Cache compiled WASM modules
const moduleCache = new Map<string, WebAssembly.Module>();

async function loadModule(name: string) {
  if (moduleCache.has(name)) {
    return moduleCache.get(name);
  }
  const module = await WebAssembly.compile(wasmBytes);
  moduleCache.set(name, module);
  return module;
}
```

**Expected Impact:** 5-10x faster cached loads

## CI Integration

### GitHub Actions

```yaml
name: Performance Benchmarks

on:
  push:
    branches: [main, feature/*]
  pull_request:

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run benchmark
      - uses: actions/upload-artifact@v3
        with:
          name: performance-reports
          path: tests/benchmarks/reports/
```

## Interpreting Results

### Pass/Fail Criteria

- ✅ **Pass**: Metric meets or exceeds target
- ❌ **Fail**: Metric below target
- ⚠️  **Warning**: Metric close to target (within 10%)

### Recommendations

The benchmark suite generates actionable recommendations based on results:

1. **High Priority** - Performance targets missed significantly
2. **Medium Priority** - Optimization opportunities identified
3. **Low Priority** - Fine-tuning suggestions

### Example Output

```
🚀 Agentic Flow Integration Performance Benchmark Suite

✅ Controller Operations: 8/8 passed
✅ MCP Tool Latency: 15/15 passed
⚠️  WASM Load Time: 4/5 passed (ReasoningBank: 105ms vs 100ms target)
✅ Attention Mechanisms: 5/5 passed
❌ Memory Usage: 1/2 passed (100K vectors: 5.2GB vs 5GB target)

Recommendations:
⚠️  ReasoningBank WASM exceeds 100ms target. Implement lazy loading.
⚠️  100K vectors exceed 5GB memory target. Enable 8-bit quantization.

Pass Rate: 91.7% (33/36 benchmarks)
```

## Troubleshooting

### Out of Memory Errors

For memory benchmarks, increase Node.js heap size:

```bash
node --expose-gc --max-old-space-size=8192 -r tsx/register tests/benchmarks/memory-usage-bench.ts
```

### Slow Benchmark Execution

Full suite takes 5-10 minutes. To speed up:

1. Run individual benchmarks
2. Reduce sample sizes (edit benchmark files)
3. Use faster hardware

### Import Errors

Ensure all dependencies are installed:

```bash
npm ci
cd agentic-flow && npm ci
cd packages/agentdb && npm ci
```

## Development

### Adding New Benchmarks

1. Create benchmark file in `tests/benchmarks/`
2. Export async function that returns `BenchmarkResult[]`
3. Add to `benchmark-runner.ts`
4. Add npm script to `package.json`

Example:

```typescript
// my-new-bench.ts
export async function runMyBenchmarks(): Promise<BenchmarkResult[]> {
  // Implement benchmarks
  return results;
}

// benchmark-runner.ts
import { runMyBenchmarks } from './my-new-bench';

const myResults = await runMyBenchmarks();
```

### Modifying Targets

Update targets in:
- Individual benchmark files
- `ADR-061-performance-benchmarks-optimization.md`
- This README

## References

- [ADR-061: Performance Benchmarks](../../docs/adr/ADR-061-performance-benchmarks-optimization.md)
- [AgentDB Documentation](../../packages/agentdb/README.md)
- [MCP Tools Reference](../../agentic-flow/src/mcp/README.md)

## Support

For issues or questions:
- GitHub Issues: https://github.com/ruvnet/agentic-flow/issues
- Documentation: https://github.com/ruvnet/agentic-flow
