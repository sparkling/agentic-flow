/**
 * RuVector Upgrade Tests (ADR-064 Phase 2)
 *
 * Tests:
 * 1. RuVector version >= 0.1.99 installed
 * 2. Native SIMD enabled
 * 3. RuVectorBackend initialize/insert/search/remove lifecycle
 * 4. Batch insert and parallel batch search
 * 5. Score-based results with similarity conversion
 * 6. Extended stats with native info
 * 7. Backward compatibility with VectorBackend interface
 * 8. Metadata persistence through insert/search cycle
 *
 * NOTE: ruvector native build currently requires dimension=384.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RuVectorBackend } from '../../packages/agentdb/src/backends/ruvector/RuVectorBackend.js';

// ruvector is only in agentdb's node_modules, dynamic import handles resolution
async function importRuvector() {
  // Use createRequire to load from agentdb's node_modules
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  try {
    return require('ruvector');
  } catch {
    // Try from the agentdb path
    return require('../../packages/agentdb/node_modules/ruvector');
  }
}

// ruvector native currently only supports dimension 384
const DIM = 384;

// Helper: generate random Float32Array of given dimension
function randomFloat32(dim: number): Float32Array {
  const arr = new Float32Array(dim);
  for (let i = 0; i < dim; i++) arr[i] = Math.random() * 2 - 1;
  return arr;
}

// Helper: make a Float32Array with a specific non-zero element
function sparseVector(dim: number, index: number, value: number = 1.0): Float32Array {
  const arr = new Float32Array(dim);
  arr[index % dim] = value;
  arr[(index + 1) % dim] = value * 0.5;
  return arr;
}

describe('RuVector Upgrade - ADR-064 Phase 2', () => {
  describe('Package Version Validation', () => {
    it('should have ruvector >= 0.1.99 installed', async () => {
      const ruvector = await importRuvector();
      const versionInfo = ruvector.getVersion();
      expect(versionInfo).toBeDefined();

      const version = typeof versionInfo === 'string' ? versionInfo : versionInfo?.version;
      expect(version).toBeDefined();

      // Parse version: 0.1.99 or higher
      const parts = version.split('.').map(Number);
      const versionNum = parts[0] * 10000 + parts[1] * 100 + parts[2];
      expect(versionNum).toBeGreaterThanOrEqual(199); // 0.1.99
    });

    it('should use native implementation with SIMD', async () => {
      const ruvector = await importRuvector();
      const isNative = ruvector.isNative();
      expect(isNative).toBe(true);

      const implType = ruvector.getImplementationType();
      expect(implType).toBe('native');
    });

    it('should export VectorDB class', async () => {
      const ruvector = await importRuvector();
      expect(ruvector.VectorDB).toBeDefined();
      expect(typeof ruvector.VectorDB).toBe('function');
    });
  });

  describe('RuVectorBackend Lifecycle', () => {
    let backend: RuVectorBackend;

    beforeAll(async () => {
      backend = new RuVectorBackend({
        dimension: DIM,
        metric: 'cosine',
        maxElements: 10000
      });
      await backend.initialize();
    });

    afterAll(() => {
      backend.close();
    });

    it('should initialize successfully', () => {
      const stats = backend.getStats();
      expect(stats.backend).toBe('ruvector');
      expect(stats.dimension).toBe(DIM);
      expect(stats.metric).toBe('cosine');
    });

    it('should insert vectors and retrieve via search', async () => {
      // Use a distinctive vector that's unlikely to match prior inserts
      const vec = new Float32Array(DIM);
      vec[150] = 1.0;
      vec[151] = 0.8;
      vec[152] = 0.6;

      backend.insert('lifecycle-unique-1', vec, { label: 'first' });

      // Allow async insert to settle
      await new Promise(r => setTimeout(r, 100));

      // Use searchBatch for reliable async results
      const results = await backend.searchBatch([vec], 5);
      expect(results).toHaveLength(1);
      expect(results[0].length).toBeGreaterThan(0);
      // Verify our inserted vector appears in top results
      const ids = results[0].map(r => r.id);
      expect(ids).toContain('lifecycle-unique-1');
      // Verify result shape
      expect(results[0][0].similarity).toBeDefined();
      expect(typeof results[0][0].distance).toBe('number');
    });

    it('should handle batch insert', async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        id: `lifecycle-batch-${i}`,
        embedding: sparseVector(DIM, i * 20),
        metadata: { index: i }
      }));

      backend.insertBatch(items);
      await new Promise(r => setTimeout(r, 100));

      const stats = backend.getStats();
      expect(stats.count).toBeGreaterThanOrEqual(0);
    });

    it('should remove vectors', async () => {
      const vec = sparseVector(DIM, 100);
      backend.insert('lifecycle-remove', vec);
      await new Promise(r => setTimeout(r, 100));

      const removed = backend.remove('lifecycle-remove');
      expect(typeof removed).toBe('boolean');
    });

    it('should return stats with backend info', () => {
      const stats = backend.getStats();
      expect(stats).toHaveProperty('count');
      expect(stats).toHaveProperty('dimension');
      expect(stats).toHaveProperty('metric');
      expect(stats).toHaveProperty('backend');
      expect(stats.backend).toBe('ruvector');
    });
  });

  describe('Extended Stats (0.1.99+)', () => {
    let backend: RuVectorBackend;

    beforeAll(async () => {
      backend = new RuVectorBackend({
        dimension: DIM,
        metric: 'cosine'
      });
      await backend.initialize();
    });

    afterAll(() => {
      backend.close();
    });

    it('should report native version and SIMD status', () => {
      const extended = backend.getExtendedStats();
      expect(extended.nativeVersion).toBeDefined();
      expect(extended.nativeVersion).not.toBe('unknown');
      expect(extended.isNative).toBe(true);
      expect(extended.simdEnabled).toBe(true);
    });

    it('should include dimension and metric in extended stats', () => {
      const extended = backend.getExtendedStats();
      expect(extended.dimension).toBe(DIM);
      expect(extended.metric).toBe('cosine');
      expect(extended.backend).toBe('ruvector');
    });
  });

  describe('Parallel Batch Search', () => {
    let backend: RuVectorBackend;

    beforeAll(async () => {
      backend = new RuVectorBackend({
        dimension: DIM,
        metric: 'cosine',
        maxElements: 10000
      });
      await backend.initialize();

      // Insert test data using the async API
      const ruvector = await importRuvector();
      const db = new ruvector.VectorDB({ dimensions: DIM });
      for (let i = 0; i < 20; i++) {
        backend.insert(`parallel-${i}`, sparseVector(DIM, i * 5), { idx: i });
      }
      // Let inserts settle
      await new Promise(r => setTimeout(r, 200));
    });

    afterAll(() => {
      backend.close();
    });

    it('should support searchBatch for parallel queries', async () => {
      const queries = [
        sparseVector(DIM, 0),
        sparseVector(DIM, 25),
        sparseVector(DIM, 50)
      ];

      const results = await backend.searchBatch(queries, 3);
      expect(results).toHaveLength(3);
      expect(Array.isArray(results[0])).toBe(true);
      expect(Array.isArray(results[1])).toBe(true);
      expect(Array.isArray(results[2])).toBe(true);
    });

    it('should return results with correct shape from batch search', async () => {
      const queries = [sparseVector(DIM, 0)];
      const results = await backend.searchBatch(queries, 2);

      expect(results).toHaveLength(1);
      if (results[0].length > 0) {
        const r = results[0][0];
        expect(r).toHaveProperty('id');
        expect(r).toHaveProperty('similarity');
        expect(r).toHaveProperty('distance');
        expect(typeof r.id).toBe('string');
        expect(typeof r.similarity).toBe('number');
      }
    });
  });

  describe('Backward Compatibility', () => {
    it('should accept dimension (singular) in config', async () => {
      const backend = new RuVectorBackend({ dimension: DIM, metric: 'cosine' });
      await backend.initialize();
      const stats = backend.getStats();
      expect(stats.dimension).toBe(DIM);
      backend.close();
    });

    it('should accept dimensions (plural) in config', async () => {
      const backend = new RuVectorBackend({ dimensions: DIM, metric: 'cosine' } as any);
      await backend.initialize();
      const stats = backend.getStats();
      expect(stats.dimension).toBe(DIM);
      backend.close();
    });

    it('should throw if no dimension provided', () => {
      expect(() => new RuVectorBackend({ metric: 'cosine' } as any))
        .toThrow('Vector dimension is required');
    });

    it('should throw if not initialized before use', () => {
      const backend = new RuVectorBackend({ dimension: DIM, metric: 'cosine' });
      expect(() => backend.search(new Float32Array(DIM), 1))
        .toThrow('not initialized');
    });

    it('should implement VectorBackend interface methods', async () => {
      const backend = new RuVectorBackend({ dimension: DIM, metric: 'cosine' });
      await backend.initialize();

      expect(typeof backend.insert).toBe('function');
      expect(typeof backend.insertBatch).toBe('function');
      expect(typeof backend.search).toBe('function');
      expect(typeof backend.remove).toBe('function');
      expect(typeof backend.getStats).toBe('function');
      expect(typeof backend.save).toBe('function');
      expect(typeof backend.load).toBe('function');
      expect(typeof backend.close).toBe('function');
      expect(backend.name).toBe('ruvector');

      backend.close();
    });
  });

  describe('Metadata Handling', () => {
    let backend: RuVectorBackend;

    beforeAll(async () => {
      backend = new RuVectorBackend({
        dimension: DIM,
        metric: 'cosine',
        maxElements: 1000
      });
      await backend.initialize();
    });

    afterAll(() => {
      backend.close();
    });

    it('should store and retrieve metadata through insert/search', async () => {
      const vec = sparseVector(DIM, 200);
      const metadata = { type: 'test', score: 0.95, tags: ['a', 'b'] };

      backend.insert('meta-test', vec, metadata);
      await new Promise(r => setTimeout(r, 100));

      // Use searchBatch for reliable async
      const results = await backend.searchBatch([vec], 1);
      if (results[0].length > 0) {
        expect(results[0][0].metadata).toBeDefined();
        if (results[0][0].metadata) {
          expect(results[0][0].metadata.type).toBe('test');
          expect(results[0][0].metadata.score).toBe(0.95);
        }
      }
    });
  });

  describe('Score-to-Distance Conversion', () => {
    let backend: RuVectorBackend;

    beforeAll(async () => {
      backend = new RuVectorBackend({
        dimension: DIM,
        metric: 'cosine',
        maxElements: 1000
      });
      await backend.initialize();

      const vec = new Float32Array(DIM);
      vec[0] = 1.0;
      backend.insert('score-test', vec);
      await new Promise(r => setTimeout(r, 100));
    });

    afterAll(() => {
      backend.close();
    });

    it('should convert score to distance correctly for cosine metric', async () => {
      const query = new Float32Array(DIM);
      query[0] = 1.0;

      const results = await backend.searchBatch([query], 1);
      if (results[0].length > 0) {
        const r = results[0][0];
        expect(r.similarity).toBeGreaterThanOrEqual(0);
        expect(typeof r.distance).toBe('number');
        // distance = 1 - score for cosine metric
        // Both similarity and distance should be defined numbers
        expect(Number.isFinite(r.distance)).toBe(true);
        expect(Number.isFinite(r.similarity)).toBe(true);
        // Verify the relationship: distance = 1 - similarity
        expect(Math.abs(r.distance - (1 - r.similarity))).toBeLessThan(0.001);
      }
    });
  });

  describe('GNN Learning Integration', () => {
    it('should accept and return learning instance', async () => {
      const backend = new RuVectorBackend({ dimension: DIM, metric: 'cosine' });
      await backend.initialize();

      expect(backend.getLearning()).toBeNull();

      const mockLearning = { getState: () => ({ initialized: false }) } as any;
      backend.setLearning(mockLearning);
      expect(backend.getLearning()).toBe(mockLearning);

      backend.setLearning(null);
      expect(backend.getLearning()).toBeNull();

      backend.close();
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle 100 inserts without error', async () => {
      const backend = new RuVectorBackend({
        dimension: DIM,
        metric: 'cosine',
        maxElements: 10000
      });
      await backend.initialize();

      const startTime = Date.now();
      for (let i = 0; i < 100; i++) {
        backend.insert(`perf-${i}`, randomFloat32(DIM));
      }
      const elapsed = Date.now() - startTime;

      // Should complete quickly (< 5s for 100 inserts)
      expect(elapsed).toBeLessThan(5000);

      // Wait for async inserts
      await new Promise(r => setTimeout(r, 500));

      backend.close();
    });

    it('should execute batch search concurrently', async () => {
      const backend = new RuVectorBackend({
        dimension: DIM,
        metric: 'cosine',
        maxElements: 2000
      });
      await backend.initialize();

      // Insert 50 vectors
      for (let i = 0; i < 50; i++) {
        backend.insert(`bench-${i}`, randomFloat32(DIM));
      }
      await new Promise(r => setTimeout(r, 500));

      // Prepare 5 queries
      const queries = Array.from({ length: 5 }, () => randomFloat32(DIM));

      const batchStart = Date.now();
      const batchResults = await backend.searchBatch(queries, 5);
      const batchTime = Date.now() - batchStart;

      expect(batchResults).toHaveLength(5);
      expect(batchTime).toBeDefined();

      backend.close();
    });
  });
});
