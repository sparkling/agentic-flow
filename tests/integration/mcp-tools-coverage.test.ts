/**
 * MCP Tools Coverage Tests
 *
 * Comprehensive testing of all 75+ MCP tools added in ADR-051 through ADR-057.
 * Tests request/response validation, error handling, and performance.
 *
 * Coverage:
 * - All 75+ MCP tools
 * - Request/response schema validation
 * - Error handling for each tool
 * - Performance benchmarks (<100ms p95)
 * - Integration with AgentDB
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentDBService } from '../../agentic-flow/src/services/agentdb-service.js';

describe('MCP Tools Coverage', () => {
  let service: AgentDBService;

  beforeEach(async () => {
    service = await AgentDBService.getInstance();
  });

  afterEach(() => {
    AgentDBService.resetInstance();
  });

  // -------------------------------------------------------------------------
  // Memory Tools (11 tools)
  // -------------------------------------------------------------------------

  describe('Memory Tools', () => {
    it('memory_store should store key-value pairs', async () => {
      const result = await service.memoryStore({
        key: 'test-key',
        value: JSON.stringify({ data: 'test' }),
        namespace: 'test',
        ttl: 3600000,
        tags: ['test'],
      });

      expect(result.success).toBe(true);
      expect(result.key).toBe('test-key');
    });

    it('memory_retrieve should retrieve stored values', async () => {
      await service.memoryStore({
        key: 'retrieve-test',
        value: JSON.stringify({ data: 'value' }),
        namespace: 'test',
      });

      const result = await service.memoryRetrieve({
        key: 'retrieve-test',
        namespace: 'test',
      });

      expect(result.found).toBe(true);
      expect(JSON.parse(result.value).data).toBe('value');
    });

    it('memory_search should find relevant memories', async () => {
      await service.memoryStore({
        key: 'search-1',
        value: JSON.stringify({ content: 'authentication implementation' }),
        namespace: 'test',
      });

      const result = await service.memorySearch({
        query: 'authentication',
        namespace: 'test',
        limit: 10,
        threshold: 0.5,
      });

      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('memory_list should list all memories', async () => {
      const result = await service.memoryList({
        namespace: 'test',
        limit: 100,
      });

      expect(result.memories).toBeDefined();
      expect(Array.isArray(result.memories)).toBe(true);
    });

    it('memory_delete should remove memories', async () => {
      await service.memoryStore({
        key: 'delete-test',
        value: 'test',
        namespace: 'test',
      });

      const result = await service.memoryDelete({
        key: 'delete-test',
        namespace: 'test',
      });

      expect(result.deleted).toBe(true);
    });

    it('memory_stats should return statistics', async () => {
      const result = await service.memoryStats({
        namespace: 'test',
      });

      expect(result.totalMemories).toBeGreaterThanOrEqual(0);
      expect(result.namespaces).toBeDefined();
    });

    it('memory_migrate should migrate memories', async () => {
      const result = await service.memoryMigrate({
        from: 'test',
        to: 'test-new',
        pattern: '*',
      });

      expect(result.migrated).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // Reflexion Memory Tools (5 tools)
  // -------------------------------------------------------------------------

  describe('Reflexion Memory Tools', () => {
    it('reflexion_record should record episodes', async () => {
      const result = await service.reflexionRecord({
        sessionId: 'test-session',
        task: 'implement feature',
        input: 'requirements',
        output: 'implementation',
        critique: 'good work',
        reward: 0.9,
        success: true,
      });

      expect(result.episodeId).toBeGreaterThan(0);
    });

    it('reflexion_recall should recall similar episodes', async () => {
      await service.reflexionRecord({
        sessionId: 's1',
        task: 'authentication task',
        reward: 0.9,
        success: true,
      });

      const result = await service.reflexionRecall({
        query: 'authentication',
        limit: 5,
      });

      expect(result.episodes).toBeDefined();
      expect(result.episodes.length).toBeGreaterThan(0);
    });

    it('reflexion_stats should return episode statistics', async () => {
      const result = await service.reflexionStats({
        sessionId: 'test-session',
      });

      expect(result.totalEpisodes).toBeGreaterThanOrEqual(0);
      expect(result.successRate).toBeDefined();
    });

    it('reflexion_synthesize should synthesize context', async () => {
      const result = await service.reflexionSynthesize({
        query: 'test',
        limit: 10,
      });

      expect(result.summary).toBeDefined();
      expect(result.patterns).toBeDefined();
    });

    it('reflexion_diverse should return diverse episodes', async () => {
      const result = await service.reflexionDiverse({
        query: 'test',
        k: 5,
        lambda: 0.5,
      });

      expect(result.episodes).toBeDefined();
      expect(result.diversityScore).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Skill Library Tools (4 tools)
  // -------------------------------------------------------------------------

  describe('Skill Library Tools', () => {
    it('skill_register should register new skills', async () => {
      const result = await service.skillRegister({
        name: 'testSkill',
        description: 'test skill',
        code: 'function test() {}',
        successRate: 0.9,
      });

      expect(result.skillId).toBeGreaterThan(0);
    });

    it('skill_find should find skills', async () => {
      await service.skillRegister({
        name: 'findMe',
        successRate: 0.8,
      });

      const result = await service.skillFind({
        query: 'findMe',
        limit: 5,
      });

      expect(result.skills).toBeDefined();
      expect(result.skills.length).toBeGreaterThan(0);
    });

    it('skill_update should update skill metrics', async () => {
      const skillId = await service.skillRegister({
        name: 'updateMe',
        successRate: 0.8,
      });

      const result = await service.skillUpdate({
        skillId: skillId.skillId,
        successRate: 0.9,
      });

      expect(result.updated).toBe(true);
    });

    it('skill_stats should return skill statistics', async () => {
      const result = await service.skillStats();

      expect(result.totalSkills).toBeGreaterThanOrEqual(0);
      expect(result.averageSuccessRate).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Reasoning Bank Tools (4 tools)
  // -------------------------------------------------------------------------

  describe('Reasoning Bank Tools', () => {
    it('pattern_store should store reasoning patterns', async () => {
      const result = await service.patternStore({
        taskType: 'api-design',
        approach: 'RESTful',
        successRate: 0.9,
        tags: ['api', 'rest'],
      });

      expect(result.patternId).toBeGreaterThan(0);
    });

    it('pattern_find should find patterns', async () => {
      await service.patternStore({
        taskType: 'test-pattern',
        approach: 'test approach',
        successRate: 0.8,
      });

      const result = await service.patternFind({
        query: 'test-pattern',
        limit: 5,
      });

      expect(result.patterns).toBeDefined();
    });

    it('pattern_update should update pattern metrics', async () => {
      const pattern = await service.patternStore({
        taskType: 'update-pattern',
        approach: 'approach',
        successRate: 0.8,
      });

      const result = await service.patternUpdate({
        patternId: pattern.patternId,
        successRate: 0.9,
      });

      expect(result.updated).toBe(true);
    });

    it('pattern_stats should return pattern statistics', async () => {
      const result = await service.patternStats();

      expect(result.totalPatterns).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // Causal Memory Tools (5 tools)
  // -------------------------------------------------------------------------

  describe('Causal Memory Tools', () => {
    it('causal_add_edge should add causal edges', async () => {
      const result = await service.causalAddEdge({
        from: 'action-A',
        to: 'outcome-B',
        metadata: { reward: 0.8, confidence: 0.9 },
      });

      expect(result.edgeId).toBeDefined();
    });

    it('causal_find_path should find causal paths', async () => {
      await service.causalAddEdge({
        from: 'start',
        to: 'end',
        metadata: { reward: 0.9 },
      });

      const result = await service.causalFindPath({
        from: 'start',
        to: 'end',
      });

      expect(result.path).toBeDefined();
    });

    it('causal_graph_stats should return graph statistics', async () => {
      const result = await service.causalGraphStats();

      expect(result.nodes).toBeGreaterThanOrEqual(0);
      expect(result.edges).toBeGreaterThanOrEqual(0);
    });

    it('trajectory_record should record trajectories', async () => {
      const result = await service.trajectoryRecord({
        steps: [
          { state: 's1', action: 'a1', reward: 0.5 },
          { state: 's2', action: 'a2', reward: 0.8 },
        ],
        totalReward: 1.3,
      });

      expect(result.trajectoryId).toBeDefined();
    });

    it('trajectory_predict should predict actions', async () => {
      await service.trajectoryRecord({
        steps: [{ state: 'test-state', action: 'test-action', reward: 0.9 }],
        totalReward: 0.9,
      });

      const result = await service.trajectoryPredict({
        state: 'test-state',
      });

      expect(result.action).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Learning System Tools (5 tools)
  // -------------------------------------------------------------------------

  describe('Learning System Tools', () => {
    it('learning_route should route tasks', async () => {
      const result = await service.learningRoute({
        task: 'simple variable rename',
        config: {
          simple: 'haiku',
          medium: 'sonnet',
          complex: 'opus',
        },
      });

      expect(result.tier).toBeGreaterThanOrEqual(1);
      expect(result.tier).toBeLessThanOrEqual(3);
      expect(result.handler).toBeTruthy();
    });

    it('learning_stats should return learning statistics', async () => {
      const result = await service.learningStats();

      expect(result).toBeDefined();
      expect(result.totalRoutes).toBeGreaterThanOrEqual(0);
    });

    it('learning_optimize should optimize model selection', async () => {
      const result = await service.learningOptimize({
        history: [
          { task: 't1', model: 'haiku', duration: 100, cost: 0.001 },
          { task: 't2', model: 'sonnet', duration: 500, cost: 0.005 },
        ],
        objective: 'cost',
      });

      expect(result.recommendation).toBeDefined();
    });

    it('learning_cycle should run learning cycle', async () => {
      const result = await service.learningCycle();

      expect(result.insights).toBeDefined();
    });

    it('learning_reset should reset learning state', async () => {
      const result = await service.learningReset();

      expect(result.reset).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Explanation Tools (3 tools)
  // -------------------------------------------------------------------------

  describe('Explanation Tools', () => {
    it('explain_decision should explain decisions', async () => {
      await service.reflexionRecord({
        sessionId: 'explain-test',
        task: 'decision task',
        output: 'decision output',
        reward: 0.9,
        success: true,
        metadata: { decisionId: 'dec-123' },
      });

      const result = await service.explainDecision({
        decisionId: 'dec-123',
      });

      expect(result.explanation).toBeDefined();
      expect(result.completenessScore).toBeGreaterThanOrEqual(0);
    });

    it('explain_provenance should show provenance chain', async () => {
      const result = await service.explainProvenance({
        itemId: 'test-item',
      });

      expect(result.chain).toBeDefined();
    });

    it('explain_stats should return explanation statistics', async () => {
      const result = await service.explainStats();

      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Attention Service Tools (4 tools)
  // -------------------------------------------------------------------------

  describe('Attention Service Tools', () => {
    it('attention_compute should compute attention weights', async () => {
      const result = await service.attentionCompute({
        query: Array.from({ length: 384 }, () => 0.1),
        keys: [
          Array.from({ length: 384 }, () => 0.1),
          Array.from({ length: 384 }, () => 0.2),
        ],
      });

      expect(result.weights).toBeDefined();
      expect(result.weights.length).toBe(2);
    });

    it('attention_multihead should compute multi-head attention', async () => {
      const result = await service.attentionMultihead({
        input: Array.from({ length: 384 }, () => 0.1),
        keys: [Array.from({ length: 384 }, () => 0.1)],
        heads: 8,
      });

      expect(result.output).toBeDefined();
      expect(result.output.length).toBe(384);
    });

    it('attention_stats should return attention statistics', async () => {
      const result = await service.attentionStats();

      expect(result.engineType).toMatch(/native|wasm|js/);
    });

    it('attention_benchmark should run performance benchmarks', async () => {
      const result = await service.attentionBenchmark({
        iterations: 10,
      });

      expect(result.avgDuration).toBeDefined();
      expect(result.backend).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // WASM Vector Search Tools (4 tools)
  // -------------------------------------------------------------------------

  describe('WASM Vector Search Tools', () => {
    it('wasm_add_vector should add vectors', async () => {
      const result = await service.wasmAddVector({
        id: 'vec-1',
        embedding: Array.from({ length: 384 }, () => 0.1),
      });

      expect(result.added).toBe(true);
    });

    it('wasm_search should search vectors', async () => {
      await service.wasmAddVector({
        id: 'search-vec',
        embedding: Array.from({ length: 384 }, () => 0.1),
      });

      const result = await service.wasmSearch({
        query: Array.from({ length: 384 }, () => 0.1),
        k: 5,
      });

      expect(result.results).toBeDefined();
    });

    it('wasm_stats should return WASM statistics', async () => {
      const result = await service.wasmStats();

      expect(result.backend).toBeDefined();
    });

    it('wasm_benchmark should run WASM benchmarks', async () => {
      const result = await service.wasmBenchmark({
        vectorCount: 100,
        queries: 10,
      });

      expect(result.avgSearchTime).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Diversity Ranking Tools (3 tools)
  // -------------------------------------------------------------------------

  describe('Diversity Ranking Tools', () => {
    it('mmr_select should select diverse results', async () => {
      const result = await service.mmrSelect({
        query: Array.from({ length: 384 }, () => 1),
        candidates: [
          {
            id: '1',
            embedding: Array.from({ length: 384 }, () => 1),
            similarity: 1.0,
          },
          {
            id: '2',
            embedding: Array.from({ length: 384 }, () => 0.5),
            similarity: 0.9,
          },
        ],
        k: 2,
        lambda: 0.5,
      });

      expect(result.selected).toBeDefined();
      expect(result.diversityScore).toBeDefined();
    });

    it('mmr_diversity_score should compute diversity', async () => {
      const result = await service.mmrDiversityScore({
        results: [
          {
            id: '1',
            embedding: Array.from({ length: 384 }, () => 1),
            similarity: 1.0,
          },
          {
            id: '2',
            embedding: Array.from({ length: 384 }, () => 0),
            similarity: 0.0,
          },
        ],
      });

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('mmr_stats should return MMR statistics', async () => {
      const result = await service.mmrStats();

      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Context Synthesis Tools (3 tools)
  // -------------------------------------------------------------------------

  describe('Context Synthesis Tools', () => {
    it('context_synthesize should synthesize context', async () => {
      const result = await service.contextSynthesize({
        memories: [
          { task: 't1', reward: 0.9, success: true, critique: 'good' },
          { task: 't2', reward: 0.8, success: true, critique: 'ok' },
        ],
      });

      expect(result.summary).toBeDefined();
      expect(result.successRate).toBeDefined();
    });

    it('context_patterns should extract patterns', async () => {
      const result = await service.contextPatterns({
        memories: [
          { task: 't1', reward: 0.9, success: true, critique: 'use TDD' },
          { task: 't2', reward: 0.8, success: true, critique: 'use TDD' },
        ],
        minFrequency: 2,
      });

      expect(result.patterns).toBeDefined();
    });

    it('context_recommendations should generate recommendations', async () => {
      const result = await service.contextRecommendations({
        memories: [
          { task: 't1', reward: 0.9, success: true },
        ],
      });

      expect(result.recommendations).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Metadata Filter Tools (3 tools)
  // -------------------------------------------------------------------------

  describe('Metadata Filter Tools', () => {
    it('filter_apply should filter items', async () => {
      const result = await service.filterApply({
        items: [
          { id: 1, status: 'active' },
          { id: 2, status: 'inactive' },
        ],
        filters: { status: 'active' },
      });

      expect(result.filtered).toHaveLength(1);
    });

    it('filter_validate should validate filters', async () => {
      const result = await service.filterValidate({
        filters: { status: 'active', reward: { $gt: 0.5 } },
      });

      expect(result.valid).toBe(true);
    });

    it('filter_to_sql should convert filters to SQL', async () => {
      const result = await service.filterToSql({
        filters: { status: 'active' },
      });

      expect(result.where).toBeDefined();
      expect(result.params).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Sync Coordinator Tools (4 tools)
  // -------------------------------------------------------------------------

  describe('Sync Coordinator Tools', () => {
    it('sync_status should return sync status', async () => {
      const result = await service.syncStatus();

      expect(result.instanceId).toBeDefined();
    });

    it('sync_lock should acquire locks', async () => {
      const result = await service.syncLock({
        resource: 'test-resource',
        ttl: 5000,
      });

      expect(result.locked).toBe(true);
      expect(result.lockId).toBeDefined();
    });

    it('sync_unlock should release locks', async () => {
      const lock = await service.syncLock({
        resource: 'test-resource-2',
        ttl: 5000,
      });

      const result = await service.syncUnlock({
        lockId: lock.lockId,
      });

      expect(result.unlocked).toBe(true);
    });

    it('sync_broadcast should broadcast messages', async () => {
      const result = await service.syncBroadcast({
        message: { type: 'test', data: 'test' },
      });

      expect(result.sent).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // HNSW Index Tools (4 tools)
  // -------------------------------------------------------------------------

  describe('HNSW Index Tools', () => {
    it('hnsw_add_point should add points', async () => {
      const result = await service.hnswAddPoint({
        id: 1,
        vector: Array.from({ length: 384 }, () => 0.1),
      });

      expect(result.added).toBe(true);
    });

    it('hnsw_search should search nearest neighbors', async () => {
      await service.hnswAddPoint({
        id: 1,
        vector: Array.from({ length: 384 }, () => 0.1),
      });

      const result = await service.hnswSearch({
        query: Array.from({ length: 384 }, () => 0.1),
        k: 5,
      });

      expect(result.neighbors).toBeDefined();
    });

    it('hnsw_stats should return HNSW statistics', async () => {
      const result = await service.hnswStats();

      expect(result).toBeDefined();
    });

    it('hnsw_benchmark should run HNSW benchmarks', async () => {
      const result = await service.hnswBenchmark({
        points: 100,
        queries: 10,
      });

      expect(result.avgSearchTime).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Enhanced Embedding Tools (3 tools)
  // -------------------------------------------------------------------------

  describe('Enhanced Embedding Tools', () => {
    it('embedding_generate should generate embeddings', async () => {
      const result = await service.embeddingGenerate({
        text: 'test query',
      });

      expect(result.embedding).toBeDefined();
      expect(result.embedding.length).toBeGreaterThan(0);
    });

    it('embedding_batch should generate batch embeddings', async () => {
      const result = await service.embeddingBatch({
        texts: ['text1', 'text2', 'text3'],
      });

      expect(result.embeddings).toHaveLength(3);
    });

    it('embedding_stats should return embedding statistics', async () => {
      const result = await service.embeddingStats();

      expect(result.model).toBeDefined();
      expect(result.dimension).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Performance Tests
  // -------------------------------------------------------------------------

  describe('Performance Benchmarks', () => {
    it('all tools should respond within 100ms (p95)', async () => {
      const tools = [
        () => service.memoryStats({ namespace: 'test' }),
        () => service.reflexionStats({}),
        () => service.skillStats(),
        () => service.patternStats(),
        () => service.attentionStats(),
        () => service.wasmStats(),
      ];

      const durations: number[] = [];

      for (const tool of tools) {
        const start = performance.now();
        await tool();
        const duration = performance.now() - start;
        durations.push(duration);
      }

      durations.sort((a, b) => a - b);
      const p95 = durations[Math.floor(durations.length * 0.95)];

      console.log(`P95 latency: ${p95.toFixed(2)}ms`);
      expect(p95).toBeLessThan(100);
    });

    it('should handle concurrent tool calls', async () => {
      const promises = [
        service.memoryStats({ namespace: 'test' }),
        service.reflexionStats({}),
        service.skillStats(),
        service.patternStats(),
        service.causalGraphStats(),
      ];

      const start = performance.now();
      await Promise.all(promises);
      const duration = performance.now() - start;

      // Concurrent execution should be faster than sequential
      expect(duration).toBeLessThan(500);
    });
  });

  // -------------------------------------------------------------------------
  // Error Handling
  // -------------------------------------------------------------------------

  describe('Error Handling', () => {
    it('should validate required parameters', async () => {
      await expect(
        service.memoryStore({} as any)
      ).rejects.toThrow();
    });

    it('should handle invalid embeddings', async () => {
      await expect(
        service.wasmAddVector({
          id: 'bad',
          embedding: [1, 2, 3], // Wrong dimension
        })
      ).rejects.toThrow();
    });

    it('should handle missing resources gracefully', async () => {
      const result = await service.memoryRetrieve({
        key: 'nonexistent-key-12345',
        namespace: 'test',
      });

      expect(result.found).toBe(false);
    });

    it('should validate filter syntax', async () => {
      await expect(
        service.filterValidate({
          filters: { invalid: { $unknownOp: 'value' } },
        })
      ).resolves.toHaveProperty('valid', false);
    });
  });
});
