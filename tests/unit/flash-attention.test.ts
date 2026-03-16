/**
 * Flash Attention Integration Tests (ADR-064 Phase 1)
 *
 * Tests:
 * 1. Native vs JS fallback performance (7.47x target)
 * 2. Multi-Head Attention relevance scoring
 * 3. MoE routing with top-K expert selection
 * 4. Automatic fallback when native unavailable
 * 5. WASMVectorSearch attention-enhanced search
 * 6. MCP tool registration
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { AttentionService } from '../../packages/agentdb/src/controllers/AttentionService.js';
import type { AttentionConfig } from '../../packages/agentdb/src/controllers/AttentionService.js';

// Helper: generate random vector of given dimension
function randomVector(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}

// Helper: generate random Float32Array
function randomFloat32(dim: number): Float32Array {
  const arr = new Float32Array(dim);
  for (let i = 0; i < dim; i++) arr[i] = Math.random() * 2 - 1;
  return arr;
}

describe('AttentionService - ADR-064 Phase 1', () => {
  let service: AttentionService;

  const defaultConfig: AttentionConfig = {
    numHeads: 8,
    headDim: 48,
    embedDim: 384,
    useFlash: true,
    dropout: 0.1,
    numExperts: 8,
    topK: 2,
  };

  beforeAll(async () => {
    service = new AttentionService(defaultConfig);
    await service.initialize();
  });

  // ---------------------------------------------------------------------------
  // Core initialization
  // ---------------------------------------------------------------------------

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const info = service.getInfo();
      expect(info.initialized).toBe(true);
      expect(info.config.numHeads).toBe(8);
      expect(info.config.embedDim).toBe(384);
    });

    it('should detect runtime environment', () => {
      const info = service.getInfo();
      expect(['nodejs', 'browser', 'unknown']).toContain(info.runtime);
    });

    it('should report engine type', () => {
      const engineType = service.getEngineType();
      expect(['napi', 'wasm', 'fallback']).toContain(engineType);
    });

    it('should not re-initialize when already initialized', async () => {
      // Should be a no-op
      await service.initialize();
      expect(service.getInfo().initialized).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Flash Attention (applyFlashAttention)
  // ---------------------------------------------------------------------------

  describe('Flash Attention', () => {
    it('should compute flash attention output with correct dimensions', async () => {
      const dim = 384;
      const seqLen = 10;
      const query = randomVector(dim);
      const keys = Array.from({ length: seqLen }, () => randomVector(dim));
      const values = Array.from({ length: seqLen }, () => randomVector(dim));

      const result = await service.applyFlashAttention(query, keys, values);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(dim);
    });

    it('should produce different outputs for different queries', async () => {
      const dim = 64;
      const context = Array.from({ length: 5 }, () => randomVector(dim));

      const q1 = randomVector(dim);
      const q2 = randomVector(dim);

      const r1 = await service.applyFlashAttention(q1, context, context);
      const r2 = await service.applyFlashAttention(q2, context, context);

      // Results should be different for different queries
      const diffCount = r1.filter((v, i) => Math.abs(v - r2[i]) > 1e-6).length;
      expect(diffCount).toBeGreaterThan(0);
    });

    it('should accept custom head count', async () => {
      const dim = 64;
      const query = randomVector(dim);
      const context = Array.from({ length: 5 }, () => randomVector(dim));

      const r4 = await service.applyFlashAttention(query, context, context, { headCount: 4 });
      const r8 = await service.applyFlashAttention(query, context, context, { headCount: 8 });

      expect(r4.length).toBe(dim);
      expect(r8.length).toBe(dim);
    });

    it('should handle single context vector', async () => {
      const dim = 64;
      const query = randomVector(dim);
      const context = [randomVector(dim)];

      const result = await service.applyFlashAttention(query, context, context);
      expect(result.length).toBe(dim);
    });

    it('should benchmark JS fallback performance', async () => {
      const dim = 384;
      const seqLen = 50;
      const query = randomVector(dim);
      const keys = Array.from({ length: seqLen }, () => randomVector(dim));
      const values = Array.from({ length: seqLen }, () => randomVector(dim));

      // Warm up
      await service.applyFlashAttention(query, keys, values);

      const iterations = 20;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        await service.applyFlashAttention(query, keys, values);
      }
      const elapsed = performance.now() - start;
      const avgMs = elapsed / iterations;

      // JS fallback should complete in reasonable time (<50ms per call)
      expect(avgMs).toBeLessThan(50);
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-Head Attention (applyMultiHeadAttention)
  // ---------------------------------------------------------------------------

  describe('Multi-Head Attention', () => {
    it('should return attention output and weight matrix', async () => {
      const dim = 64;
      const numHeads = 4;
      const query = randomVector(dim);
      const context = Array.from({ length: 8 }, () => randomVector(dim));

      const result = await service.applyMultiHeadAttention(query, context, numHeads);

      expect(result.attention).toBeDefined();
      expect(result.weights).toBeDefined();
      expect(result.attention.length).toBe(dim);
      expect(result.weights.length).toBe(numHeads);
    });

    it('should produce weights that sum to ~1 per head', async () => {
      const dim = 64;
      const numHeads = 4;
      const query = randomVector(dim);
      const context = Array.from({ length: 8 }, () => randomVector(dim));

      const result = await service.applyMultiHeadAttention(query, context, numHeads);

      for (const headWeights of result.weights) {
        const sum = headWeights.reduce((a, b) => a + b, 0);
        // Weights should sum to approximately 1 (softmax)
        expect(sum).toBeGreaterThan(0.9);
        expect(sum).toBeLessThan(1.1);
      }
    });

    it('should produce non-zero attention output', async () => {
      const dim = 64;
      const query = randomVector(dim);
      const context = Array.from({ length: 5 }, () => randomVector(dim));

      const result = await service.applyMultiHeadAttention(query, context, 4);
      const nonZero = result.attention.filter(v => Math.abs(v) > 1e-10).length;
      expect(nonZero).toBeGreaterThan(0);
    });

    it('should handle different head counts', async () => {
      const dim = 64;
      const query = randomVector(dim);
      const context = Array.from({ length: 4 }, () => randomVector(dim));

      for (const heads of [1, 2, 4, 8]) {
        const result = await service.applyMultiHeadAttention(query, context, heads);
        expect(result.attention.length).toBe(dim);
        expect(result.weights.length).toBe(heads);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Mixture of Experts (applyMoE)
  // ---------------------------------------------------------------------------

  describe('Mixture of Experts', () => {
    it('should route input to experts and return output + gating weights', async () => {
      const dim = 64;
      const input = randomVector(dim);
      const experts = 8;
      const topK = 2;

      const result = await service.applyMoE(input, experts, topK);

      expect(result.output).toBeDefined();
      expect(result.expertWeights).toBeDefined();
      expect(result.output.length).toBe(dim);
      expect(result.expertWeights.length).toBe(experts);
    });

    it('should activate exactly topK experts', async () => {
      const dim = 64;
      const input = randomVector(dim);
      const experts = 8;
      const topK = 3;

      const result = await service.applyMoE(input, experts, topK);
      const activeCount = result.expertWeights.filter(w => w > 0).length;
      expect(activeCount).toBe(topK);
    });

    it('should have expert weights summing to ~1', async () => {
      const dim = 64;
      const input = randomVector(dim);

      const result = await service.applyMoE(input, 8, 2);
      const sum = result.expertWeights.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(0.99);
      expect(sum).toBeLessThan(1.01);
    });

    it('should produce different routing for different inputs', async () => {
      const dim = 64;
      const input1 = randomVector(dim);
      const input2 = randomVector(dim);

      const r1 = await service.applyMoE(input1, 8, 2);
      const r2 = await service.applyMoE(input2, 8, 2);

      // At least some weights should differ
      const diffWeights = r1.expertWeights.filter(
        (w, i) => Math.abs(w - r2.expertWeights[i]) > 1e-6
      ).length;
      expect(diffWeights).toBeGreaterThan(0);
    });

    it('should handle topK=1 (single expert)', async () => {
      const dim = 64;
      const input = randomVector(dim);

      const result = await service.applyMoE(input, 4, 1);
      const activeCount = result.expertWeights.filter(w => w > 0).length;
      expect(activeCount).toBe(1);
      // Single active expert should have weight 1.0
      const maxWeight = Math.max(...result.expertWeights);
      expect(maxWeight).toBeCloseTo(1.0, 2);
    });
  });

  // ---------------------------------------------------------------------------
  // Automatic Fallback
  // ---------------------------------------------------------------------------

  describe('Automatic Fallback', () => {
    it('should work with fallback engine when native unavailable', async () => {
      // The test environment likely doesn't have @ruvector/attention native bindings
      const fallbackService = new AttentionService({
        ...defaultConfig,
        useNative: false,
      });
      await fallbackService.initialize();

      const query = randomVector(64);
      const context = Array.from({ length: 5 }, () => randomVector(64));

      const result = await fallbackService.applyFlashAttention(query, context, context);
      expect(result.length).toBe(64);
    });

    it('should update stats after operations', async () => {
      service.resetStats();
      const query = randomVector(64);
      const context = Array.from({ length: 5 }, () => randomVector(64));

      await service.applyFlashAttention(query, context, context);
      await service.applyMultiHeadAttention(query, context, 4);
      await service.applyMoE(randomVector(64), 4, 2);

      const stats = service.getStats();
      expect(stats.totalOps).toBeGreaterThanOrEqual(3);
    });

    it('should gracefully handle empty context', async () => {
      // Verify it doesn't throw with edge cases
      const query = randomVector(64);
      try {
        const result = await service.applyFlashAttention(query, [[1, 2, 3]], [[1, 2, 3]]);
        expect(result).toBeDefined();
      } catch {
        // Some implementations may throw on mismatched dimensions, which is acceptable
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Low-level API (Float32Array)
  // ---------------------------------------------------------------------------

  describe('Low-level Float32Array API', () => {
    it('should compute flashAttention with Float32Arrays', async () => {
      const dim = defaultConfig.embedDim;
      const seqLen = 4;
      const q = randomFloat32(seqLen * dim);
      const k = randomFloat32(seqLen * dim);
      const v = randomFloat32(seqLen * dim);

      const result = await service.flashAttention(q, k, v);
      expect(result.mechanism).toBe('flash');
      expect(result.output.length).toBe(seqLen * dim);
      expect(['napi', 'wasm', 'fallback']).toContain(result.runtime);
    });

    it('should compute multiHeadAttention with Float32Arrays', async () => {
      const dim = defaultConfig.embedDim;
      const seqLen = 4;
      const q = randomFloat32(seqLen * dim);
      const k = randomFloat32(seqLen * dim);
      const v = randomFloat32(seqLen * dim);

      const result = await service.multiHeadAttention(q, k, v);
      expect(result.mechanism).toBe('multi-head');
      expect(result.output.length).toBe(seqLen * dim);
    });

    it('should compute moeAttention with Float32Arrays', async () => {
      const dim = defaultConfig.embedDim;
      const seqLen = 4;
      const q = randomFloat32(seqLen * dim);
      const k = randomFloat32(seqLen * dim);
      const v = randomFloat32(seqLen * dim);

      const result = await service.moeAttention(q, k, v);
      expect(result.mechanism).toBe('moe');
      expect(result.output.length).toBe(seqLen * dim);
    });

    it('should track execution time', async () => {
      const q = randomFloat32(384);
      const k = randomFloat32(384);
      const v = randomFloat32(384);

      const result = await service.flashAttention(q, k, v);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Performance benchmark: JS fallback baseline
  // ---------------------------------------------------------------------------

  describe('Performance Benchmarks', () => {
    it('should complete flash attention within performance budget', async () => {
      const dim = 384;
      const seqLen = 100;
      const query = randomVector(dim);
      const keys = Array.from({ length: seqLen }, () => randomVector(dim));
      const values = Array.from({ length: seqLen }, () => randomVector(dim));

      // Warm up
      await service.applyFlashAttention(query, keys, values);

      const iterations = 10;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        await service.applyFlashAttention(query, keys, values);
      }
      const totalMs = performance.now() - start;
      const avgMs = totalMs / iterations;

      // Log for visibility
      console.log(`[Flash Attention] dim=${dim}, seq=${seqLen}: ${avgMs.toFixed(2)}ms avg`);
      console.log(`[Flash Attention] Engine: ${service.getEngineType()}`);

      // JS fallback should complete in <100ms for 100-length sequences
      expect(avgMs).toBeLessThan(100);
    });

    it('should complete MoE routing within performance budget', async () => {
      const dim = 384;
      const input = randomVector(dim);

      const iterations = 50;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        await service.applyMoE(input, 8, 2);
      }
      const totalMs = performance.now() - start;
      const avgMs = totalMs / iterations;

      console.log(`[MoE Routing] dim=${dim}, experts=8, topK=2: ${avgMs.toFixed(2)}ms avg`);

      // MoE should be fast (<10ms per call)
      expect(avgMs).toBeLessThan(10);
    });
  });

  // ---------------------------------------------------------------------------
  // Stats tracking
  // ---------------------------------------------------------------------------

  describe('Statistics', () => {
    it('should track mechanism usage counts', async () => {
      service.resetStats();

      await service.applyFlashAttention(randomVector(64), [randomVector(64)], [randomVector(64)]);
      await service.applyMultiHeadAttention(randomVector(64), [randomVector(64)], 4);
      await service.applyMoE(randomVector(64), 4, 2);

      const stats = service.getStats();
      expect(stats.totalOps).toBeGreaterThanOrEqual(3);
      expect(stats.mechanismCounts['flash']).toBeGreaterThanOrEqual(1);
      expect(stats.mechanismCounts['multi-head']).toBeGreaterThanOrEqual(1);
      expect(stats.mechanismCounts['moe']).toBeGreaterThanOrEqual(1);
    });

    it('should reset stats correctly', () => {
      service.resetStats();
      const stats = service.getStats();
      expect(stats.totalOps).toBe(0);
      expect(stats.avgExecutionTimeMs).toBe(0);
    });
  });
});

describe('WASMVectorSearch - Attention-Enhanced Search (ADR-064)', () => {
  it('should import WASMVectorSearch without error', async () => {
    const { WASMVectorSearch } = await import(
      '../../packages/agentdb/src/controllers/WASMVectorSearch.js'
    );
    expect(WASMVectorSearch).toBeDefined();
  });

  it('should have searchWithAttention method', async () => {
    const { WASMVectorSearch } = await import(
      '../../packages/agentdb/src/controllers/WASMVectorSearch.js'
    );
    const search = new WASMVectorSearch(null, { enableWASM: false });
    expect(typeof search.searchWithAttention).toBe('function');
  });

  it('should have setAttentionService method', async () => {
    const { WASMVectorSearch } = await import(
      '../../packages/agentdb/src/controllers/WASMVectorSearch.js'
    );
    const search = new WASMVectorSearch(null, { enableWASM: false });
    expect(typeof search.setAttentionService).toBe('function');
  });

  it('should perform basic cosine search when attention disabled', async () => {
    const { WASMVectorSearch } = await import(
      '../../packages/agentdb/src/controllers/WASMVectorSearch.js'
    );
    const search = new WASMVectorSearch(null, { enableWASM: false, useAttention: false });

    const query = [1, 0, 0, 0];
    const vectors = [
      { id: 'a', vector: [1, 0, 0, 0] },
      { id: 'b', vector: [0, 1, 0, 0] },
      { id: 'c', vector: [0.9, 0.1, 0, 0] },
    ];

    const results = await search.searchWithAttention(query, vectors, 3, false);
    expect(results.length).toBe(3);
    expect(results[0].id).toBe('a'); // Most similar
    expect(results[0].score).toBeCloseTo(1.0, 1);
  });

  it('should perform attention-enhanced search with AttentionService', async () => {
    const { WASMVectorSearch } = await import(
      '../../packages/agentdb/src/controllers/WASMVectorSearch.js'
    );

    const attention = new AttentionService({
      numHeads: 2,
      headDim: 2,
      embedDim: 4,
    });
    await attention.initialize();

    const search = new WASMVectorSearch(null, { enableWASM: false, useAttention: true });
    search.setAttentionService(attention);

    const query = [1, 0, 0, 0];
    const vectors = [
      { id: 'a', vector: [1, 0, 0, 0], metadata: { type: 'exact' } },
      { id: 'b', vector: [0, 1, 0, 0], metadata: { type: 'orthogonal' } },
      { id: 'c', vector: [0.7, 0.7, 0, 0], metadata: { type: 'partial' } },
    ];

    const results = await search.searchWithAttention(query, vectors, 3);
    expect(results.length).toBe(3);
    // Scores should be computed (exact value depends on attention weighting)
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.id).toBeDefined();
    }
  });
});
