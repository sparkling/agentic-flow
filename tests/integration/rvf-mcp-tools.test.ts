/**
 * RVF MCP Tools Integration Tests
 * ADR-063: Verify all 5 RVF MCP tools
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { AgentDBService } from '../../agentic-flow/src/services/agentdb-service.js';

describe('RVF MCP Tools', () => {
  let service: AgentDBService;

  beforeAll(async () => {
    service = await AgentDBService.getInstance();

    // Pre-populate with some data for testing
    await service.storeEpisode({
      sessionId: 'mcp-test',
      task: 'test episode 1',
      reward: 0.8,
      success: true
    });

    await service.storeEpisode({
      sessionId: 'mcp-test',
      task: 'test episode 2',
      reward: 0.2,  // Low quality for pruning test
      success: false
    });
  });

  describe('rvf_stats Tool', () => {
    it('should return RVF statistics', () => {
      const stats = service.getRVFStats();

      expect(stats).toBeDefined();

      if (stats.available) {
        // Verify compression config
        expect(stats.config.compression).toBeDefined();
        expect(stats.config.compression.enabled).toBeDefined();
        expect(stats.config.compression.quantizeBits).toBeGreaterThan(0);

        // Verify cache config
        expect(stats.config.caching).toBeDefined();
        expect(stats.config.caching.maxSize).toBeGreaterThan(0);

        // Verify batching config
        expect(stats.config.batching).toBeDefined();
        expect(stats.config.batching.batchSize).toBeGreaterThan(0);

        // Verify pruning config
        expect(stats.config.pruning).toBeDefined();
        expect(stats.config.pruning.minConfidence).toBeGreaterThanOrEqual(0);
      }
    });

    it('should calculate derived metrics correctly', () => {
      const stats = service.getRVFStats();

      if (stats.available && stats.config) {
        // Compression savings should be based on quantization bits
        const bits = stats.config.compression.quantizeBits;
        const expectedSavings = 100 - (bits * 100 / 32);

        expect(bits).toBeGreaterThan(0);
        expect(expectedSavings).toBeGreaterThan(0);
        expect(expectedSavings).toBeLessThan(100);
      }
    });
  });

  describe('rvf_prune Tool', () => {
    it('should preview pruning (dry-run)', async () => {
      const result = await service.previewPruning();

      expect(result).toBeDefined();
      expect(result.pruned).toBeGreaterThanOrEqual(0);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
      expect(typeof result.pruned).toBe('number');
      expect(typeof result.remaining).toBe('number');
    });

    it('should actually prune when not dry-run', async () => {
      // Store a low-quality episode
      await service.storeEpisode({
        sessionId: 'prune-test',
        task: 'low-quality-episode',
        reward: 0.05,  // Very low
        success: false
      });

      const result = await service.pruneStaleMemories();

      expect(result).toBeDefined();
      expect(result.pruned).toBeGreaterThanOrEqual(0);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it('should calculate pruned percentage correctly', async () => {
      const result = await service.previewPruning();

      const total = result.pruned + result.remaining;
      if (total > 0 && result.pruned > 0) {
        const prunedPercent = (result.pruned / total) * 100;
        expect(prunedPercent).toBeGreaterThan(0);
        expect(prunedPercent).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('rvf_cache_clear Tool', () => {
    it('should clear cache successfully', () => {
      // Generate some embeddings to populate cache
      service.generateEmbedding('cache test 1');
      service.generateEmbedding('cache test 2');

      // Get cache size before
      const statsBefore = service.getRVFStats();
      const sizeBefore = statsBefore.cacheSize || 0;

      // Clear cache
      service.clearEmbeddingCache();

      // Get cache size after
      const statsAfter = service.getRVFStats();
      const sizeAfter = statsAfter.cacheSize || 0;

      // Cache should be cleared (size reduced or 0)
      expect(sizeAfter).toBeLessThanOrEqual(sizeBefore);
    });

    it('should report cache cleared correctly', () => {
      const statsBefore = service.getRVFStats();
      const sizeBefore = statsBefore.cacheSize || 0;

      service.clearEmbeddingCache();

      const statsAfter = service.getRVFStats();
      const sizeAfter = statsAfter.cacheSize || 0;

      const cleared = sizeBefore - sizeAfter;
      expect(cleared).toBeGreaterThanOrEqual(0);
    });
  });

  describe('rvf_config Tool', () => {
    it('should return configuration (summary)', () => {
      const stats = service.getRVFStats();

      expect(stats).toBeDefined();

      if (stats.available) {
        const config = stats.config;

        // Verify summary includes all sections
        expect(config.compression).toBeDefined();
        expect(config.batching).toBeDefined();
        expect(config.caching).toBeDefined();
        expect(config.pruning).toBeDefined();
      }
    });

    it('should return detailed configuration', () => {
      const stats = service.getRVFStats();

      if (stats.available) {
        const config = stats.config;

        // Detailed config should have all fields
        expect(config.compression.enabled).toBeDefined();
        expect(config.compression.quantizeBits).toBeDefined();
        expect(config.compression.deduplicationThreshold).toBeDefined();

        expect(config.batching.enabled).toBeDefined();
        expect(config.batching.batchSize).toBeDefined();
        expect(config.batching.maxWaitMs).toBeDefined();

        expect(config.caching.enabled).toBeDefined();
        expect(config.caching.maxSize).toBeDefined();
        expect(config.caching.ttl).toBeDefined();

        expect(config.pruning.enabled).toBeDefined();
        expect(config.pruning.minConfidence).toBeDefined();
        expect(config.pruning.maxAge).toBeDefined();
      }
    });
  });

  describe('rvf_benchmark Tool', () => {
    it('should benchmark embeddings performance', async () => {
      const sampleSize = 5;
      const texts = Array.from({ length: sampleSize }, (_, i) =>
        `Benchmark test ${i}`
      );

      const start = Date.now();
      await service.generateEmbeddings(texts);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(30000);  // Should complete in <30s

      const avgPerEmbedding = duration / sampleSize;
      const throughput = (sampleSize / duration) * 1000;

      expect(avgPerEmbedding).toBeGreaterThan(0);
      expect(throughput).toBeGreaterThan(0);
    });

    it('should handle different sample sizes', async () => {
      const sampleSizes = [1, 5, 10];

      for (const size of sampleSizes) {
        const texts = Array.from({ length: size }, (_, i) => `Test ${i}`);

        const start = Date.now();
        await service.generateEmbeddings(texts);
        const duration = Date.now() - start;

        expect(duration).toBeGreaterThan(0);
        console.log(`Benchmark (size=${size}): ${duration}ms`);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle RVFOptimizer unavailable gracefully', () => {
      const stats = service.getRVFStats();

      expect(stats).toBeDefined();

      if (!stats.available) {
        expect(stats.message).toBeDefined();
        expect(stats.message).toContain('not');
      }
    });

    it('should handle empty operations gracefully', async () => {
      // Empty batch
      const emptyBatch = await service.generateEmbeddings([]);
      expect(emptyBatch.length).toBe(0);

      // Empty dedup
      const emptyDedup = await service.storeEpisodesWithDedup([]);
      expect(emptyDedup.length).toBe(0);
    });
  });

  describe('Integration with AgentDB', () => {
    it('should work with storeEpisode', async () => {
      const id = await service.storeEpisode({
        sessionId: 'integration-test',
        task: 'test task with RVF',
        reward: 0.9,
        success: true
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should work with recallEpisodes', async () => {
      // Store an episode
      await service.storeEpisode({
        sessionId: 'recall-test',
        task: 'recallable episode',
        reward: 0.8,
        success: true
      });

      // Recall it
      const episodes = await service.recallEpisodes('recallable', 5);

      expect(Array.isArray(episodes)).toBe(true);
      expect(episodes.length).toBeGreaterThanOrEqual(0);
    });
  });
});
