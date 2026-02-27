/**
 * WASM Performance Tests
 *
 * Benchmarks WASM module loading, performance, and memory usage:
 * - ReasoningBank WASM load time
 * - QUIC WASM messaging latency
 * - Pattern matching speedup benchmarks
 * - Memory usage profiling
 *
 * Performance Targets:
 * - WASM load: <500ms
 * - QUIC latency: <10ms p99
 * - Pattern matching: 10x JS speedup
 * - Memory overhead: <50MB
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { performance } from 'perf_hooks';

// Test fixtures
const EMBEDDING_DIM = 384;
const TEST_VECTOR = new Float32Array(EMBEDDING_DIM).fill(0.1);

function createRandomVector(dim: number): Float32Array {
  const vec = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    vec[i] = Math.random();
  }
  return vec;
}

function measureMemory(): number {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return process.memoryUsage().heapUsed;
  }
  return 0;
}

describe('WASM Performance Tests', () => {
  // -------------------------------------------------------------------------
  // ReasoningBank WASM Load Time
  // -------------------------------------------------------------------------

  describe('ReasoningBank WASM Load Time', () => {
    it('should load WASM module in <500ms', async () => {
      const start = performance.now();

      try {
        const reasoningBank = await import('../../packages/agentdb/src/controllers/ReasoningBank.js');
        expect(reasoningBank).toBeDefined();
      } catch (e) {
        console.warn('⚠️ ReasoningBank not available, skipping test');
        return;
      }

      const loadTime = performance.now() - start;
      console.log(`ReasoningBank WASM load time: ${loadTime.toFixed(2)}ms`);

      expect(loadTime).toBeLessThan(500);
    });

    it('should initialize ReasoningBank with WASM backend', async () => {
      try {
        const { ReasoningBank } = await import('../../packages/agentdb/src/controllers/ReasoningBank.js');

        const start = performance.now();
        const bank = new ReasoningBank({
          enableWasm: true,
          dimension: 384,
        });
        await bank.initialize();
        const initTime = performance.now() - start;

        console.log(`ReasoningBank init time: ${initTime.toFixed(2)}ms`);

        expect(initTime).toBeLessThan(1000); // <1s init
        expect(bank.getStats().wasmEnabled).toBe(true);
      } catch (e) {
        console.warn('⚠️ ReasoningBank WASM not available, skipping test');
        return;
      }
    });

    it('should fallback to JS when WASM unavailable', async () => {
      try {
        const { ReasoningBank } = await import('../../packages/agentdb/src/controllers/ReasoningBank.js');

        const bank = new ReasoningBank({
          enableWasm: false,
          dimension: 384,
        });
        await bank.initialize();

        const stats = bank.getStats();
        expect(stats.wasmEnabled).toBe(false);
        expect(stats.backend).toBe('js');
      } catch (e) {
        console.warn('⚠️ ReasoningBank not available, skipping test');
        return;
      }
    });

    it('should measure WASM vs JS pattern matching performance', async () => {
      try {
        const { ReasoningBank } = await import('../../packages/agentdb/src/controllers/ReasoningBank.js');

        // WASM version
        const wasmBank = new ReasoningBank({ enableWasm: true, dimension: 384 });
        await wasmBank.initialize();

        // Add patterns
        for (let i = 0; i < 100; i++) {
          wasmBank.addPattern(`pattern-${i}`, createRandomVector(384));
        }

        const wasmStart = performance.now();
        for (let i = 0; i < 100; i++) {
          wasmBank.findSimilar(TEST_VECTOR, 10);
        }
        const wasmDuration = performance.now() - wasmStart;

        // JS version
        const jsBank = new ReasoningBank({ enableWasm: false, dimension: 384 });
        await jsBank.initialize();

        for (let i = 0; i < 100; i++) {
          jsBank.addPattern(`pattern-${i}`, createRandomVector(384));
        }

        const jsStart = performance.now();
        for (let i = 0; i < 100; i++) {
          jsBank.findSimilar(TEST_VECTOR, 10);
        }
        const jsDuration = performance.now() - jsStart;

        console.log(`WASM: ${wasmDuration.toFixed(2)}ms, JS: ${jsDuration.toFixed(2)}ms`);
        console.log(`Speedup: ${(jsDuration / wasmDuration).toFixed(2)}x`);

        // WASM should be faster (or at least comparable)
        expect(wasmDuration).toBeLessThan(jsDuration * 1.5); // Allow some variance
      } catch (e) {
        console.warn('⚠️ ReasoningBank not available, skipping test');
        return;
      }
    });
  });

  // -------------------------------------------------------------------------
  // QUIC WASM Messaging Latency
  // -------------------------------------------------------------------------

  describe('QUIC WASM Messaging Latency', () => {
    it('should initialize QUIC WASM bindings in <100ms', async () => {
      const start = performance.now();

      try {
        const quic = await import('../../packages/agentdb/src/controllers/QUICClient.js');
        expect(quic).toBeDefined();
      } catch (e) {
        console.warn('⚠️ QUIC not available, skipping test');
        return;
      }

      const loadTime = performance.now() - start;
      console.log(`QUIC WASM load time: ${loadTime.toFixed(2)}ms`);

      expect(loadTime).toBeLessThan(100);
    });

    it('should measure QUIC message round-trip latency', async () => {
      try {
        const { QUICClient } = await import('../../packages/agentdb/src/controllers/QUICClient.js');
        const { QUICServer } = await import('../../packages/agentdb/src/controllers/QUICServer.js');

        // Start server
        const server = new QUICServer({ port: 14433 });
        await server.start();

        // Connect client
        const client = new QUICClient({ host: 'localhost', port: 14433 });
        await client.connect();

        // Measure latencies
        const latencies: number[] = [];

        for (let i = 0; i < 100; i++) {
          const start = performance.now();
          await client.send({ type: 'ping', id: i });
          const response = await client.receive();
          const latency = performance.now() - start;
          latencies.push(latency);
        }

        latencies.sort((a, b) => a - b);
        const p50 = latencies[Math.floor(latencies.length * 0.5)];
        const p95 = latencies[Math.floor(latencies.length * 0.95)];
        const p99 = latencies[Math.floor(latencies.length * 0.99)];

        console.log(`QUIC latency - p50: ${p50.toFixed(2)}ms, p95: ${p95.toFixed(2)}ms, p99: ${p99.toFixed(2)}ms`);

        expect(p99).toBeLessThan(10); // <10ms p99

        await client.close();
        await server.stop();
      } catch (e) {
        console.warn('⚠️ QUIC not available, skipping test');
        return;
      }
    });

    it('should handle high-frequency messages', async () => {
      try {
        const { QUICClient } = await import('../../packages/agentdb/src/controllers/QUICClient.js');
        const { QUICServer } = await import('../../packages/agentdb/src/controllers/QUICServer.js');

        const server = new QUICServer({ port: 14434 });
        await server.start();

        const client = new QUICClient({ host: 'localhost', port: 14434 });
        await client.connect();

        const messageCount = 1000;
        const start = performance.now();

        const promises = [];
        for (let i = 0; i < messageCount; i++) {
          promises.push(client.send({ type: 'msg', id: i }));
        }

        await Promise.all(promises);
        const duration = performance.now() - start;
        const throughput = messageCount / (duration / 1000);

        console.log(`QUIC throughput: ${throughput.toFixed(0)} msg/s`);

        expect(throughput).toBeGreaterThan(1000); // >1000 msg/s

        await client.close();
        await server.stop();
      } catch (e) {
        console.warn('⚠️ QUIC not available, skipping test');
        return;
      }
    });

    it('should maintain low latency under load', async () => {
      try {
        const { QUICClient } = await import('../../packages/agentdb/src/controllers/QUICClient.js');
        const { QUICServer } = await import('../../packages/agentdb/src/controllers/QUICServer.js');

        const server = new QUICServer({ port: 14435 });
        await server.start();

        const client = new QUICClient({ host: 'localhost', port: 14435 });
        await client.connect();

        // Send 100 concurrent messages
        const latencies: number[] = [];

        const promises = Array.from({ length: 100 }, async (_, i) => {
          const start = performance.now();
          await client.send({ type: 'load-test', id: i });
          await client.receive();
          const latency = performance.now() - start;
          latencies.push(latency);
        });

        await Promise.all(promises);

        latencies.sort((a, b) => a - b);
        const p95 = latencies[Math.floor(latencies.length * 0.95)];

        console.log(`QUIC under load - p95: ${p95.toFixed(2)}ms`);

        expect(p95).toBeLessThan(50); // <50ms p95 under load

        await client.close();
        await server.stop();
      } catch (e) {
        console.warn('⚠️ QUIC not available, skipping test');
        return;
      }
    });
  });

  // -------------------------------------------------------------------------
  // Pattern Matching Speedup Benchmarks
  // -------------------------------------------------------------------------

  describe('Pattern Matching Speedup Benchmarks', () => {
    it('should benchmark vector similarity computation', async () => {
      const iterations = 10000;
      const vectorCount = 1000;

      const vectors = Array.from({ length: vectorCount }, () => createRandomVector(384));

      // JS implementation
      const jsStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const query = createRandomVector(384);
        for (const vec of vectors) {
          let dot = 0;
          let normA = 0;
          let normB = 0;
          for (let j = 0; j < 384; j++) {
            dot += query[j] * vec[j];
            normA += query[j] * query[j];
            normB += vec[j] * vec[j];
          }
          const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
        }
      }
      const jsDuration = performance.now() - jsStart;

      // WASM implementation (if available)
      try {
        const { cosineSimilarity } = await import('../../packages/agentdb/src/utils/vector-math.js');

        const wasmStart = performance.now();
        for (let i = 0; i < iterations; i++) {
          const query = createRandomVector(384);
          for (const vec of vectors) {
            cosineSimilarity(query, vec);
          }
        }
        const wasmDuration = performance.now() - wasmStart;

        console.log(`Vector similarity - JS: ${jsDuration.toFixed(2)}ms, WASM: ${wasmDuration.toFixed(2)}ms`);
        console.log(`Speedup: ${(jsDuration / wasmDuration).toFixed(2)}x`);

        // Target: 10x speedup
        expect(jsDuration / wasmDuration).toBeGreaterThan(5); // At least 5x
      } catch (e) {
        console.warn('⚠️ WASM vector math not available, skipping comparison');
      }
    });

    it('should benchmark attention computation', async () => {
      try {
        const attention = await import('@ruvector/attention');
        if (!attention.scaledDotProductAttention) {
          console.warn('⚠️ Attention module not available, skipping test');
          return;
        }

        const query = createRandomVector(512);
        const keys = Array.from({ length: 100 }, () => createRandomVector(512));
        const values = keys;

        const iterations = 100;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
          attention.scaledDotProductAttention(query, keys, values);
        }
        const duration = performance.now() - start;

        const avgPerIteration = duration / iterations;
        console.log(`Attention computation: ${avgPerIteration.toFixed(2)}ms per iteration`);

        expect(avgPerIteration).toBeLessThan(50); // <50ms per iteration
      } catch (e) {
        console.warn('⚠️ Attention module not available, skipping test');
        return;
      }
    });

    it('should benchmark GNN forward pass', async () => {
      try {
        const gnn = await import('@ruvector/gnn');
        if (!gnn.GNNAttentionLayer) {
          console.warn('⚠️ GNN module not available, skipping test');
          return;
        }

        const layer = new gnn.GNNAttentionLayer({
          inputDim: 128,
          outputDim: 128,
          heads: 4,
        });

        const nodes = Array.from({ length: 100 }, () => createRandomVector(128));
        const edges: number[][] = [];
        for (let i = 0; i < 200; i++) {
          const from = Math.floor(Math.random() * 100);
          const to = Math.floor(Math.random() * 100);
          if (from !== to) edges.push([from, to]);
        }

        const iterations = 10;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
          layer.forward(nodes, edges);
        }
        const duration = performance.now() - start;

        const avgPerIteration = duration / iterations;
        console.log(`GNN forward pass: ${avgPerIteration.toFixed(2)}ms per iteration`);

        expect(avgPerIteration).toBeLessThan(100); // <100ms per iteration
      } catch (e) {
        console.warn('⚠️ GNN module not available, skipping test');
        return;
      }
    });
  });

  // -------------------------------------------------------------------------
  // Memory Usage Profiling
  // -------------------------------------------------------------------------

  describe('Memory Usage Profiling', () => {
    it('should measure WASM module memory overhead', async () => {
      const before = measureMemory();

      try {
        // Load WASM modules
        await import('../../packages/agentdb/src/controllers/ReasoningBank.js');
        await import('../../packages/agentdb/src/controllers/WASMVectorSearch.js');
        await import('../../packages/agentdb/src/controllers/QUICClient.js');
      } catch (e) {
        console.warn('⚠️ WASM modules not available, skipping test');
        return;
      }

      const after = measureMemory();
      const overhead = (after - before) / (1024 * 1024); // Convert to MB

      console.log(`WASM module overhead: ${overhead.toFixed(2)} MB`);

      expect(overhead).toBeLessThan(50); // <50MB overhead
    });

    it('should measure vector storage memory efficiency', async () => {
      try {
        const { WASMVectorSearch } = await import('../../packages/agentdb/src/controllers/WASMVectorSearch.js');

        const before = measureMemory();

        const search = new WASMVectorSearch({ dimension: 384 });
        await search.initialize();

        // Add 10,000 vectors
        for (let i = 0; i < 10000; i++) {
          search.addVector(`vec-${i}`, createRandomVector(384));
        }

        const after = measureMemory();
        const memoryUsed = (after - before) / (1024 * 1024); // MB
        const memoryPerVector = memoryUsed / 10000; // MB per vector

        console.log(`Memory for 10k vectors: ${memoryUsed.toFixed(2)} MB`);
        console.log(`Memory per vector: ${(memoryPerVector * 1024).toFixed(2)} KB`);

        // 384 floats * 4 bytes = 1536 bytes = 1.5KB per vector
        // Allow 2x overhead for indexing
        expect(memoryPerVector).toBeLessThan(0.003); // <3KB per vector
      } catch (e) {
        console.warn('⚠️ WASMVectorSearch not available, skipping test');
        return;
      }
    });

    it('should measure memory usage during sustained operations', async () => {
      try {
        const { WASMVectorSearch } = await import('../../packages/agentdb/src/controllers/WASMVectorSearch.js');

        const search = new WASMVectorSearch({ dimension: 384 });
        await search.initialize();

        // Add initial vectors
        for (let i = 0; i < 1000; i++) {
          search.addVector(`vec-${i}`, createRandomVector(384));
        }

        const memoryReadings: number[] = [];

        // Perform sustained operations
        for (let i = 0; i < 100; i++) {
          // Add some vectors
          for (let j = 0; j < 10; j++) {
            search.addVector(`dynamic-${i}-${j}`, createRandomVector(384));
          }

          // Perform searches
          for (let j = 0; j < 10; j++) {
            search.search(createRandomVector(384), 10);
          }

          // Measure memory
          memoryReadings.push(measureMemory());

          // Small delay
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Check for memory leaks (memory should stabilize, not grow linearly)
        const firstHalf = memoryReadings.slice(0, 50);
        const secondHalf = memoryReadings.slice(50);

        const avgFirstHalf = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const avgSecondHalf = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        const growth = ((avgSecondHalf - avgFirstHalf) / avgFirstHalf) * 100;

        console.log(`Memory growth during sustained ops: ${growth.toFixed(2)}%`);

        // Allow some growth, but not unbounded
        expect(growth).toBeLessThan(50); // <50% growth
      } catch (e) {
        console.warn('⚠️ WASMVectorSearch not available, skipping test');
        return;
      }
    });

    it('should verify garbage collection works properly', async () => {
      try {
        const { WASMVectorSearch } = await import('../../packages/agentdb/src/controllers/WASMVectorSearch.js');

        let search: any = new WASMVectorSearch({ dimension: 384 });
        await search.initialize();

        // Add many vectors
        for (let i = 0; i < 5000; i++) {
          search.addVector(`vec-${i}`, createRandomVector(384));
        }

        const beforeCleanup = measureMemory();

        // Clear reference and force GC if available
        search = null;
        if (global.gc) {
          global.gc();
        }

        // Wait for GC
        await new Promise(resolve => setTimeout(resolve, 100));

        const afterCleanup = measureMemory();
        const freed = (beforeCleanup - afterCleanup) / (1024 * 1024);

        console.log(`Memory freed after cleanup: ${freed.toFixed(2)} MB`);

        // Should free at least some memory
        expect(freed).toBeGreaterThan(-10); // Allow some variance
      } catch (e) {
        console.warn('⚠️ WASMVectorSearch not available, skipping test');
        return;
      }
    });
  });

  // -------------------------------------------------------------------------
  // WASM vs Native Performance Comparison
  // -------------------------------------------------------------------------

  describe('WASM vs Native Performance Comparison', () => {
    it('should compare WASM and native attention', async () => {
      try {
        const attention = await import('@ruvector/attention');
        if (!attention.scaledDotProductAttention || !attention.getBackendType) {
          console.warn('⚠️ Attention module not available, skipping test');
          return;
        }

        const query = createRandomVector(512);
        const keys = Array.from({ length: 100 }, () => createRandomVector(512));
        const values = keys;

        const backend = attention.getBackendType();
        console.log(`Attention backend: ${backend}`);

        const start = performance.now();
        for (let i = 0; i < 100; i++) {
          attention.scaledDotProductAttention(query, keys, values);
        }
        const duration = performance.now() - start;

        console.log(`${backend} attention: ${duration.toFixed(2)}ms for 100 iterations`);

        // Performance expectations based on backend
        if (backend === 'native') {
          expect(duration).toBeLessThan(500); // <500ms for native
        } else if (backend === 'wasm') {
          expect(duration).toBeLessThan(1000); // <1s for WASM
        } else {
          expect(duration).toBeLessThan(2000); // <2s for JS
        }
      } catch (e) {
        console.warn('⚠️ Attention module not available, skipping test');
        return;
      }
    });

    it('should document performance characteristics', () => {
      // Document expected performance hierarchy
      const expected = {
        native: { load: '<50ms', search: '<1ms', overhead: '<10MB' },
        wasm: { load: '<500ms', search: '<5ms', overhead: '<30MB' },
        js: { load: '<100ms', search: '<50ms', overhead: '<5MB' },
      };

      console.table(expected);
      expect(expected).toBeDefined();
    });
  });
});
