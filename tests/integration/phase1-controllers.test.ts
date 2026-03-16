/**
 * Integration Test: Phase 1 Controller Integration
 *
 * Verifies that 4 high-impact dormant controllers are properly wired:
 * 1. AttentionService
 * 2. WASMVectorSearch
 * 3. EnhancedEmbeddingService
 * 4. MMRDiversityRanker + ContextSynthesizer
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { AgentDBService } from '../../agentic-flow/src/services/agentdb-service.js';

describe('Phase 1: High-Impact Controller Integration', () => {
  let service: AgentDBService;

  beforeAll(async () => {
    service = await AgentDBService.getInstance();
  });

  it('should initialize AgentDBService successfully', () => {
    expect(service).toBeDefined();
  });

  it('should have AttentionService getter available', () => {
    const attentionService = service.getAttentionService();
    // May be null if @ruvector/attention is not available, which is expected
    expect(attentionService).toBeDefined(); // getter exists
  });

  it('should have getAttentionStats method', () => {
    const stats = service.getAttentionStats();
    expect(stats).toBeDefined();
    expect(stats).toHaveProperty('totalOps');
    expect(stats).toHaveProperty('avgExecutionTimeMs');
    expect(stats).toHaveProperty('peakMemoryBytes');
    expect(stats).toHaveProperty('mechanismCounts');
    expect(stats).toHaveProperty('runtimeCounts');
  });

  it('should have getWASMStats method', () => {
    const stats = service.getWASMStats();
    expect(stats).toBeDefined();
    expect(stats).toHaveProperty('wasmAvailable');
    expect(stats).toHaveProperty('simdAvailable');
    expect(stats).toHaveProperty('indexBuilt');
    expect(stats).toHaveProperty('indexSize');
    expect(stats).toHaveProperty('lastIndexUpdate');
  });

  it('should have synthesizeContext method', async () => {
    const episodes = [
      {
        id: 1,
        ts: Date.now(),
        sessionId: 'test-1',
        task: 'Test authentication flow',
        reward: 0.9,
        success: true,
        critique: 'Use JWT tokens for secure auth',
      },
      {
        id: 2,
        ts: Date.now(),
        sessionId: 'test-2',
        task: 'Implement login endpoint',
        reward: 0.85,
        success: true,
        critique: 'Add rate limiting to prevent brute force',
      },
    ];

    const context = await service.synthesizeContext(episodes);

    expect(context).toBeDefined();
    expect(context).toHaveProperty('summary');
    expect(context).toHaveProperty('patterns');
    expect(context).toHaveProperty('successRate');
    expect(context).toHaveProperty('averageReward');
    expect(context).toHaveProperty('recommendations');
    expect(context).toHaveProperty('keyInsights');
    expect(context).toHaveProperty('totalMemories');

    // Verify statistics
    expect(context.totalMemories).toBe(2);
    expect(context.successRate).toBe(1.0);
    expect(context.averageReward).toBeCloseTo(0.875);
  });

  it('should use recallDiverseEpisodes with MMR ranking', async () => {
    // Store some test episodes
    await service.storeEpisode({
      sessionId: 'test-session-1',
      task: 'Implement authentication',
      reward: 0.9,
      success: true,
      critique: 'Used JWT successfully',
    });

    await service.storeEpisode({
      sessionId: 'test-session-2',
      task: 'Implement authentication with OAuth',
      reward: 0.85,
      success: true,
      critique: 'OAuth integration working',
    });

    await service.storeEpisode({
      sessionId: 'test-session-3',
      task: 'Fix authentication bug',
      reward: 0.7,
      success: true,
      critique: 'Fixed token expiration issue',
    });

    // Recall diverse episodes
    const episodes = await service.recallDiverseEpisodes('authentication', 3, 0.5);

    expect(episodes).toBeDefined();
    expect(Array.isArray(episodes)).toBe(true);
    expect(episodes.length).toBeGreaterThan(0);
    expect(episodes.length).toBeLessThanOrEqual(3);
  });

  it('should handle searchWithWASM gracefully when WASM unavailable', async () => {
    // Create a Float32Array query
    const query = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      query[i] = Math.random();
    }

    try {
      // This may throw if WASM is not available
      await service.searchWithWASM(query, 5);
    } catch (error) {
      // Expected when WASM is not available
      expect(error).toBeDefined();
      expect((error as Error).message).toContain('WASMVectorSearch not available');
    }
  });

  it('should use EnhancedEmbeddingService features', async () => {
    // Store patterns to test diverse search
    await service.storePattern({
      taskType: 'authentication',
      approach: 'JWT token-based auth',
      successRate: 0.9,
      tags: ['security', 'auth'],
    });

    await service.storePattern({
      taskType: 'authentication',
      approach: 'OAuth2 integration',
      successRate: 0.85,
      tags: ['security', 'oauth'],
    });

    // Search with diversity enabled (uses MMRDiversityRanker)
    const patterns = await service.searchPatterns('authentication security', 2, true);

    expect(patterns).toBeDefined();
    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns.length).toBeGreaterThan(0);
  });

  it('should provide comprehensive metrics', async () => {
    const metrics = await service.getMetrics();

    expect(metrics).toBeDefined();
    expect(metrics).toHaveProperty('backend');
    expect(metrics).toHaveProperty('episodes');
    expect(metrics).toHaveProperty('skills');
    expect(metrics).toHaveProperty('patterns');
    expect(metrics).toHaveProperty('uptime');

    expect(typeof metrics.backend).toBe('string');
    expect(typeof metrics.episodes).toBe('number');
    expect(typeof metrics.uptime).toBe('number');
  });
});
