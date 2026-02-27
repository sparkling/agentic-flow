/**
 * RVF 4-bit Compression Test Suite
 * ADR-065 Phase P1-4: Comprehensive testing for 4-bit quantization
 *
 * Test Coverage:
 * - 4-bit quantization (4 tests)
 * - Adaptive quantization (3 tests)
 * - Progressive compression (3 tests)
 * - Multi-level caching (3 tests)
 * - Quality degradation measurement (2 tests)
 *
 * Total: 15 tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RVFOptimizer } from '../../packages/agentdb/src/optimizations/RVFOptimizer.js';

describe('RVF 4-bit Compression (ADR-065 P1-4)', () => {
  let optimizer: RVFOptimizer;
  let testEmbedding: number[];

  beforeEach(() => {
    optimizer = new RVFOptimizer({
      compression: {
        enabled: true,
        quantizeBits: 4,
        deduplicationThreshold: 0.98,
        adaptive: true,
        progressive: true,
      },
      caching: {
        enabled: true,
        maxSize: 10000,
        ttl: 3600000,
        multiLevel: true,
      },
      batching: { enabled: false, batchSize: 32, maxWaitMs: 10 },
      pruning: { enabled: false, minConfidence: 0.3, maxAge: 2592000000 },
    });

    // Generate a realistic 384-dimensional test embedding
    testEmbedding = Array.from({ length: 384 }, () => Math.random() * 2 - 1);
  });

  // ============================================================================
  // 4-bit Quantization Tests (4 tests)
  // ============================================================================

  describe('4-bit Quantization', () => {
    it('should achieve 8x compression ratio with 4-bit quantization', () => {
      const { compressed, metrics } = optimizer.quantize4Bit(testEmbedding);

      expect(compressed).toHaveLength(testEmbedding.length);
      expect(metrics.compressionRatio).toBeCloseTo(8, 1);
      expect(metrics.quantizationBits).toBe(4);
      expect(metrics.originalSize).toBe(testEmbedding.length * 4); // float32
      expect(metrics.compressedSize).toBe(testEmbedding.length * 0.5); // 4-bit
    });

    it('should maintain high quality (>95% cosine similarity) after 4-bit compression', () => {
      const { compressed, metrics } = optimizer.quantize4Bit(testEmbedding);

      expect(metrics.qualityScore).toBeGreaterThan(0.95);
      expect(compressed).toHaveLength(testEmbedding.length);
    });

    it('should quantize all values to 16 levels (0-15 range)', () => {
      const { compressed } = optimizer.quantize4Bit(testEmbedding);

      // Find min/max to verify range
      let min = compressed[0];
      let max = compressed[0];
      for (let i = 1; i < compressed.length; i++) {
        if (compressed[i] < min) min = compressed[i];
        if (compressed[i] > max) max = compressed[i];
      }

      // Verify we're using the full range
      expect(max - min).toBeGreaterThan(0);

      // Count unique quantization levels (should be ~16 or fewer)
      const uniqueValues = new Set(compressed.map(v => {
        const range = max - min;
        return Math.round(((v - min) / range) * 15);
      }));
      expect(uniqueValues.size).toBeLessThanOrEqual(16);
      expect(uniqueValues.size).toBeGreaterThan(10); // Should use most levels
    });

    it('should handle edge cases (uniform embeddings, zero vectors)', () => {
      const uniformEmbedding = Array(384).fill(0.5);
      const zeroEmbedding = Array(384).fill(0);

      const { compressed: uniform, metrics: uniformMetrics } = optimizer.quantize4Bit(uniformEmbedding);
      const { compressed: zero, metrics: zeroMetrics } = optimizer.quantize4Bit(zeroEmbedding);

      expect(uniform).toHaveLength(384);
      expect(zero).toHaveLength(384);
      expect(uniformMetrics.compressionRatio).toBeCloseTo(8, 1);
      expect(zeroMetrics.compressionRatio).toBeCloseTo(8, 1);
    });
  });

  // ============================================================================
  // Adaptive Quantization Tests (3 tests)
  // ============================================================================

  describe('Adaptive Quantization', () => {
    it('should use 16-bit for high-importance embeddings (>0.8)', () => {
      const { compressed, metrics } = optimizer.adaptiveQuantize(testEmbedding, 0.9);

      expect(metrics.quantizationBits).toBe(16);
      expect(metrics.compressionRatio).toBeCloseTo(2, 1);
      expect(metrics.adaptiveBoost).toBe(0.9);
      expect(metrics.qualityScore).toBeGreaterThan(0.98); // Higher quality
    });

    it('should use 8-bit for medium-importance embeddings (0.5-0.8)', () => {
      const { compressed, metrics } = optimizer.adaptiveQuantize(testEmbedding, 0.6);

      expect(metrics.quantizationBits).toBe(8);
      expect(metrics.compressionRatio).toBeCloseTo(4, 1);
      expect(metrics.adaptiveBoost).toBe(0.6);
      expect(metrics.qualityScore).toBeGreaterThan(0.95);
    });

    it('should use 4-bit for low-importance embeddings (<0.5)', () => {
      const { compressed, metrics } = optimizer.adaptiveQuantize(testEmbedding, 0.3);

      expect(metrics.quantizationBits).toBe(4);
      expect(metrics.compressionRatio).toBeCloseTo(8, 1);
      expect(metrics.adaptiveBoost).toBe(0.3);
      expect(metrics.qualityScore).toBeGreaterThan(0.90); // Acceptable quality
    });
  });

  // ============================================================================
  // Progressive Compression Tests (3 tests)
  // ============================================================================

  describe('Progressive Compression', () => {
    it('should place hot embeddings (10+ accesses) in L1 cache with 4-bit', () => {
      const { compressed, cacheLevel, metrics } = optimizer.progressiveCompress(
        'hot-embedding',
        testEmbedding,
        15
      );

      expect(cacheLevel).toBe('L1');
      expect(metrics.quantizationBits).toBe(4);
      expect(metrics.compressionRatio).toBeCloseTo(8, 1);
    });

    it('should place warm embeddings (3-9 accesses) in L2 cache with 8-bit', () => {
      const { compressed, cacheLevel, metrics } = optimizer.progressiveCompress(
        'warm-embedding',
        testEmbedding,
        5
      );

      expect(cacheLevel).toBe('L2');
      expect(metrics.quantizationBits).toBe(8);
      expect(metrics.compressionRatio).toBeCloseTo(4, 1);
    });

    it('should place cold embeddings (<3 accesses) in L3 cache with 16-bit', () => {
      const { compressed, cacheLevel, metrics } = optimizer.progressiveCompress(
        'cold-embedding',
        testEmbedding,
        1
      );

      expect(cacheLevel).toBe('L3');
      expect(metrics.quantizationBits).toBe(16);
      expect(metrics.compressionRatio).toBeCloseTo(2, 1);
    });
  });

  // ============================================================================
  // Multi-level Caching Tests (3 tests)
  // ============================================================================

  describe('Multi-level Caching', () => {
    it('should report three cache levels (L1, L2, L3) with different characteristics', () => {
      const levels = optimizer.getCacheLevels();

      expect(levels).toHaveLength(3);
      expect(levels[0].name).toBe('L1');
      expect(levels[0].quantizeBits).toBe(4);
      expect(levels[0].maxSize).toBe(1000);

      expect(levels[1].name).toBe('L2');
      expect(levels[1].quantizeBits).toBe(8);
      expect(levels[1].maxSize).toBe(5000);

      expect(levels[2].name).toBe('L3');
      expect(levels[2].quantizeBits).toBe(16);
      expect(levels[2].maxSize).toBe(10000);
    });

    it('should track cache hit rates per level', () => {
      const levels = optimizer.getCacheLevels();

      levels.forEach(level => {
        expect(level.hitRate).toBeGreaterThanOrEqual(0);
        expect(level.hitRate).toBeLessThanOrEqual(1);
        expect(level.entries).toBeGreaterThanOrEqual(0);
      });
    });

    it('should include multi-level cache stats in getStats()', () => {
      const stats = optimizer.getStats();

      expect(stats.config.caching.multiLevel).toBe(true);
      expect(stats.multiLevelCache).toBeDefined();
      expect(stats.multiLevelCache?.l1).toBeDefined();
      expect(stats.multiLevelCache?.l2).toBeDefined();
      expect(stats.multiLevelCache?.l3).toBeDefined();

      expect(stats.multiLevelCache?.l1.size).toBeGreaterThanOrEqual(0);
      expect(stats.multiLevelCache?.l1.hitRate).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Quality Degradation Measurement Tests (2 tests)
  // ============================================================================

  describe('Quality Degradation Measurement', () => {
    it('should measure quality with cosine similarity, MSE, and max error', () => {
      const { compressed } = optimizer.quantize4Bit(testEmbedding);
      const quality = optimizer.measureQuality(testEmbedding, compressed);

      expect(quality.cosineSimilarity).toBeGreaterThan(0.90);
      expect(quality.cosineSimilarity).toBeLessThanOrEqual(1.0);
      expect(quality.mse).toBeGreaterThanOrEqual(0);
      expect(quality.maxError).toBeGreaterThanOrEqual(0);
    });

    it('should maintain <5% quality degradation for 4-bit compression', () => {
      const { compressed } = optimizer.quantize4Bit(testEmbedding);
      const quality = optimizer.measureQuality(testEmbedding, compressed);

      // <5% degradation means >95% quality
      const qualityDegradation = 1 - quality.cosineSimilarity;
      expect(qualityDegradation).toBeLessThan(0.05);
      expect(quality.cosineSimilarity).toBeGreaterThan(0.95);
    });
  });

  // ============================================================================
  // Zero-copy Compression Tests (Bonus)
  // ============================================================================

  describe('Zero-copy Compression', () => {
    it('should use Int8Array for efficient zero-copy compression', () => {
      const float32Embedding = new Float32Array(testEmbedding);
      const compressed = optimizer.zeroCopyCompress4Bit(float32Embedding);

      expect(compressed).toBeInstanceOf(Int8Array);
      expect(compressed.length).toBe(Math.ceil(testEmbedding.length / 2));
    });

    it('should pack two 4-bit values into each byte', () => {
      const float32Embedding = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      const compressed = optimizer.zeroCopyCompress4Bit(float32Embedding);

      // 4 values = 2 bytes (each byte holds 2 nibbles)
      expect(compressed.length).toBe(2);
      expect(compressed).toBeInstanceOf(Int8Array);
    });
  });
});
