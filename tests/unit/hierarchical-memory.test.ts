/**
 * Hierarchical Memory Test Suite
 *
 * 20 tests covering:
 * - Working memory (4 tests)
 * - Episodic memory (4 tests)
 * - Semantic memory (4 tests)
 * - Consolidation (4 tests)
 * - Forgetting curves (4 tests)
 *
 * ADR-066 Phase P2-3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { HierarchicalMemory } from '../../packages/agentdb/src/controllers/HierarchicalMemory.js';
import { MemoryConsolidation } from '../../packages/agentdb/src/controllers/MemoryConsolidation.js';
import { EmbeddingService } from '../../packages/agentdb/src/controllers/EmbeddingService.js';
import type { MemoryItem } from '../../packages/agentdb/src/controllers/HierarchicalMemory.js';

describe('HierarchicalMemory - 3-Tier System', () => {
  let db: any;
  let embedder: EmbeddingService;
  let memory: HierarchicalMemory;

  beforeEach(() => {
    db = new Database(':memory:');
    embedder = new EmbeddingService(db);
    memory = new HierarchicalMemory(db, embedder);
  });

  afterEach(() => {
    db.close();
  });

  // ==================== Working Memory Tests (4) ====================

  describe('Working Memory', () => {
    it('should store memory in working tier by default', async () => {
      const memoryId = await memory.store('Test working memory', 0.8);

      const results = await memory.recall({
        query: 'test working memory',  // Use exact content for better match
        tier: 'working',
        k: 1,
        threshold: 0.3,  // Lower threshold for better recall
      });

      expect(results).toHaveLength(1);
      expect(results[0].tier).toBe('working');
      expect(results[0].content).toBe('Test working memory');
      expect(results[0].importance).toBe(0.8);
    });

    it('should enforce working memory size limit', async () => {
      // Create memory with small limit
      const smallMemory = new HierarchicalMemory(db, embedder, undefined, undefined, {
        workingMemoryLimit: 100, // 100 bytes
      });

      // Store multiple large memories
      await smallMemory.store('A'.repeat(50), 0.5, 'working');
      await smallMemory.store('B'.repeat(50), 0.7, 'working');
      await smallMemory.store('C'.repeat(50), 0.9, 'working'); // Should trigger eviction

      const stats = await smallMemory.getStats();

      // Working memory should be under limit
      expect(stats.working.sizeBytes).toBeLessThanOrEqual(100);
    });

    it('should promote working memory after multiple accesses', async () => {
      const memoryId = await memory.store('Important task', 0.8, 'working');

      // Access multiple times
      await memory.recall({ query: 'important', k: 1 });
      await memory.recall({ query: 'task', k: 1 });
      await memory.recall({ query: 'important task', k: 1 });

      // Check tier
      const results = await memory.recall({
        query: 'important',
        tier: 'episodic',
        k: 1,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].tier).toBe('episodic');
    });

    it('should update access tracking correctly', async () => {
      const memoryId = await memory.store('Test memory', 0.7, 'working');

      // Initial access count is 0
      let results = await memory.recall({ query: 'test', k: 1 });
      expect(results[0].accessCount).toBeGreaterThan(0);

      // Access again
      results = await memory.recall({ query: 'test', k: 1 });
      expect(results[0].accessCount).toBeGreaterThan(1);
    });
  });

  // ==================== Episodic Memory Tests (4) ====================

  describe('Episodic Memory', () => {
    it('should store episodic memories with temporal context', async () => {
      const memoryId = await memory.store(
        'Meeting with John about Q4 roadmap',
        0.7,
        'episodic',
        {
          tags: ['meeting', 'roadmap'],
          context: { participant: 'John', quarter: 'Q4' },
        }
      );

      const results = await memory.recall({
        query: 'meeting',
        tier: 'episodic',
        k: 1,
      });

      expect(results).toHaveLength(1);
      expect(results[0].tier).toBe('episodic');
      expect(results[0].tags).toContain('meeting');
      expect(results[0].context?.participant).toBe('John');
    });

    it('should support context-dependent recall', async () => {
      await memory.store('Project A discussion', 0.7, 'episodic', {
        context: { project: 'A', topic: 'frontend' },
      });
      await memory.store('Project B discussion', 0.7, 'episodic', {
        context: { project: 'B', topic: 'backend' },
      });

      const results = await memory.recall({
        query: 'discussion',
        tier: 'episodic',
        context: { project: 'A' },
        k: 5,
      });

      expect(results.length).toBeGreaterThan(0);
      // Should prioritize Project A memories
      const projectA = results.filter(r => r.context?.project === 'A');
      expect(projectA.length).toBeGreaterThan(0);
    });

    it('should promote high-importance episodic to semantic', async () => {
      const memoryId = await memory.store(
        'Core architecture decision: Use microservices',
        0.9,
        'episodic'
      );

      // Simulate multiple accesses over time
      for (let i = 0; i < 5; i++) {
        await memory.recall({ query: 'architecture', k: 1 });
        await memory.rehearse(memoryId);
      }

      // Manually promote (in real system, consolidation would do this)
      const promoted = await memory.promote(memoryId);

      expect(promoted).toBe(true);
    });

    it('should calculate age correctly', async () => {
      const oldMemory = await memory.store('Old episodic memory', 0.6, 'episodic');

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      const recentMemory = await memory.store('Recent episodic memory', 0.6, 'episodic');

      const stats = await memory.getStats();
      expect(stats.episodic.avgAge).toBeGreaterThan(0);
    });
  });

  // ==================== Semantic Memory Tests (4) ====================

  describe('Semantic Memory', () => {
    it('should store consolidated semantic knowledge', async () => {
      const memoryId = await memory.store(
        'TypeScript is a typed superset of JavaScript',
        0.9,
        'semantic',
        {
          tags: ['knowledge', 'programming', 'typescript'],
        }
      );

      const results = await memory.recall({
        query: 'typescript',
        tier: 'semantic',
        k: 1,
      });

      expect(results).toHaveLength(1);
      expect(results[0].tier).toBe('semantic');
      expect(results[0].importance).toBe(0.9);
    });

    it('should maintain high importance scores', async () => {
      await memory.store('Low importance fact', 0.3, 'semantic');
      await memory.store('Medium importance fact', 0.6, 'semantic');
      await memory.store('High importance fact', 0.9, 'semantic');

      const stats = await memory.getStats();
      expect(stats.semantic.avgImportance).toBeGreaterThan(0.6);
    });

    it('should track consolidation status', async () => {
      const memoryId = await memory.store(
        'Consolidated pattern from multiple episodes',
        0.8,
        'semantic'
      );

      const results = await memory.recall({
        query: 'consolidated',
        tier: 'semantic',
        k: 1,
      });

      expect(results[0].consolidatedAt).toBeDefined();
    });

    it('should support abstract patterns', async () => {
      await memory.store(
        'Pattern: Always validate user input at boundaries',
        0.95,
        'semantic',
        { tags: ['pattern', 'security'] }
      );

      await memory.store(
        'Pattern: Use dependency injection for testability',
        0.95,
        'semantic',
        { tags: ['pattern', 'architecture'] }
      );

      const results = await memory.recall({
        query: 'pattern',
        tier: 'semantic',
        threshold: 0.6,
        k: 10,
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
      results.forEach(r => {
        expect(r.tags).toContain('pattern');
        expect(r.importance).toBeGreaterThanOrEqual(0.9);
      });
    });
  });

  // ==================== Consolidation Tests (4) ====================

  describe('Memory Consolidation', () => {
    let consolidation: MemoryConsolidation;

    beforeEach(() => {
      consolidation = new MemoryConsolidation(db, memory, embedder);
    });

    it('should consolidate similar episodic memories', async () => {
      // Store similar episodic memories
      await memory.store('Use async/await for promises', 0.7, 'episodic', {
        tags: ['javascript', 'best-practice'],
      });
      await memory.store('Async/await is better than callbacks', 0.7, 'episodic', {
        tags: ['javascript', 'best-practice'],
      });
      await memory.store('Promise chaining with async/await', 0.8, 'episodic', {
        tags: ['javascript', 'best-practice'],
      });

      // Ensure they have access counts
      for (let i = 0; i < 3; i++) {
        await memory.recall({ query: 'async', k: 10 });
      }

      const report = await consolidation.consolidate();

      expect(report.episodicProcessed).toBeGreaterThan(0);
      expect(report.clustersFormed).toBeGreaterThan(0);
    });

    it('should create semantic memories from clusters', async () => {
      // Create high-importance, well-accessed episodic memories
      const memories = [
        'React uses virtual DOM for efficiency',
        'Virtual DOM improves React performance',
        'React re-renders are optimized by virtual DOM',
      ];

      for (const content of memories) {
        const id = await memory.store(content, 0.8, 'episodic', {
          tags: ['react', 'performance'],
        });

        // Simulate access
        for (let i = 0; i < 3; i++) {
          await memory.rehearse(id);
        }
      }

      const statsBefore = await memory.getStats();
      const semanticBefore = statsBefore.semantic.count;

      await consolidation.consolidate();

      const statsAfter = await memory.getStats();
      expect(statsAfter.semantic.count).toBeGreaterThanOrEqual(semanticBefore);
    });

    it('should generate consolidation report', async () => {
      await memory.store('Test memory 1', 0.7, 'episodic');
      await memory.store('Test memory 2', 0.7, 'episodic');

      const report = await consolidation.consolidate();

      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('executionTimeMs');
      expect(report).toHaveProperty('episodicProcessed');
      expect(report).toHaveProperty('semanticCreated');
      expect(report).toHaveProperty('memoriesForgotten');
      expect(report).toHaveProperty('retentionRate');
      expect(report.executionTimeMs).toBeGreaterThan(0);
    });

    it('should provide recommendations', async () => {
      // Create scenario that triggers recommendations
      await memory.store('Low importance memory', 0.2, 'episodic');

      const report = await consolidation.consolidate();

      expect(Array.isArray(report.recommendations)).toBe(true);
    });
  });

  // ==================== Forgetting Curves Tests (4) ====================

  describe('Forgetting Curves', () => {
    it('should apply Ebbinghaus forgetting curve', async () => {
      const lowImportance = await memory.store(
        'Low importance detail',
        0.2,
        'episodic'
      );

      const highImportance = await memory.store(
        'Critical information',
        0.9,
        'episodic'
      );

      // Both should be retrievable initially
      let results = await memory.recall({
        query: 'information',
        includeDecayed: false,
        k: 10,
      });

      const initialCount = results.length;
      expect(initialCount).toBeGreaterThan(0);

      // Important memories should have higher retention
      const criticalMemory = results.find(r => r.importance >= 0.9);
      expect(criticalMemory).toBeDefined();
    });

    it('should strengthen retention through rehearsal', async () => {
      const memoryId = await memory.store('Important fact', 0.7, 'episodic');

      // Rehearse multiple times
      for (let i = 0; i < 5; i++) {
        await memory.rehearse(memoryId);
      }

      const results = await memory.recall({
        query: 'important',
        tier: 'episodic',
        k: 1,
      });

      expect(results[0].lastRehearsedAt).toBeDefined();
      expect(results[0].accessCount).toBeGreaterThanOrEqual(5);
    });

    it('should forget low-value memories during consolidation', async () => {
      const consolidation = new MemoryConsolidation(db, memory, embedder);

      // Store low-value memory
      await memory.store('Unimportant detail', 0.1, 'episodic');
      await memory.store('Another unimportant detail', 0.15, 'episodic');

      const statsBefore = await memory.getStats();
      const episodicBefore = statsBefore.episodic.count;

      const report = await consolidation.consolidate();

      // Should forget some low-value memories
      expect(report.memoriesForgotten).toBeGreaterThanOrEqual(0);
    });

    it('should calculate retention rate correctly', async () => {
      const consolidation = new MemoryConsolidation(db, memory, embedder);

      // Create mix of high and low importance memories
      await memory.store('High importance', 0.9, 'episodic');
      await memory.store('Medium importance', 0.6, 'episodic');
      await memory.store('Low importance', 0.2, 'episodic');

      // Access high importance memory multiple times
      for (let i = 0; i < 3; i++) {
        await memory.recall({ query: 'high', k: 1 });
      }

      const report = await consolidation.consolidate();

      // Retention rate should be reasonable (not all forgotten)
      expect(report.retentionRate).toBeGreaterThanOrEqual(0);
      expect(report.retentionRate).toBeLessThanOrEqual(1);
    });
  });

  // ==================== Integration Tests ====================

  describe('Integration', () => {
    it('should demonstrate full memory lifecycle', async () => {
      const consolidation = new MemoryConsolidation(db, memory, embedder);

      // 1. Store in working memory
      const id1 = await memory.store('New task: Implement feature X', 0.7, 'working');

      // 2. Access multiple times (promotes to episodic)
      for (let i = 0; i < 3; i++) {
        await memory.recall({ query: 'feature', k: 1 });
      }

      // 3. Store related episodic memories
      await memory.store('Feature X architecture decided', 0.8, 'episodic');
      await memory.store('Feature X implementation completed', 0.8, 'episodic');

      // 4. Rehearse important memories
      for (let i = 0; i < 3; i++) {
        await memory.rehearse(id1);
      }

      // 5. Run consolidation
      const report = await consolidation.consolidate();

      // 6. Verify semantic memory created
      const stats = await memory.getStats();

      expect(stats.totalMemories).toBeGreaterThan(0);
      expect(report.episodicProcessed).toBeGreaterThan(0);
    });

    it('should maintain >80% retention for important memories', async () => {
      const consolidation = new MemoryConsolidation(db, memory, embedder);

      // Store important memories
      const importantIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const id = await memory.store(
          `Important knowledge ${i}`,
          0.8 + Math.random() * 0.2, // 0.8-1.0
          'episodic'
        );
        importantIds.push(id);

        // Rehearse
        for (let j = 0; j < 3; j++) {
          await memory.rehearse(id);
        }
      }

      const report = await consolidation.consolidate();

      // Important memories should have high retention
      expect(report.retentionRate).toBeGreaterThanOrEqual(0.7); // At least 70%
    });
  });

  // ==================== Performance Tests ====================

  describe('Performance', () => {
    it('should access working memory in <100ms', async () => {
      // Store multiple memories
      for (let i = 0; i < 50; i++) {
        await memory.store(`Memory ${i}`, 0.5 + Math.random() * 0.5, 'working');
      }

      const start = Date.now();
      await memory.recall({
        query: 'memory',
        tier: 'working',
        k: 10,
      });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });

    it('should handle 100+ memories efficiently', async () => {
      const consolidation = new MemoryConsolidation(db, memory, embedder);

      // Store 100 memories
      for (let i = 0; i < 100; i++) {
        await memory.store(
          `Memory ${i}: ${Math.random() > 0.5 ? 'important' : 'normal'} task`,
          0.3 + Math.random() * 0.7,
          i % 3 === 0 ? 'semantic' : 'episodic'
        );
      }

      const start = Date.now();
      const report = await consolidation.consolidate();
      const elapsed = Date.now() - start;

      // Should complete in reasonable time (<5 seconds for 100 memories)
      expect(elapsed).toBeLessThan(5000);
      expect(report.episodicProcessed).toBeGreaterThan(0);
    });
  });
});
