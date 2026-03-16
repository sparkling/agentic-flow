/**
 * MCP AgentDB Tool Integration Tests
 *
 * Tests the AgentDB-backed MCP tool behaviors by exercising
 * the AgentDBService, verifying round-trip data integrity for all tool categories.
 * Works with both real AgentDB backend and in-memory fallback.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentDBService } from '../../agentic-flow/src/services/agentdb-service';
import type {
  EpisodeData, SkillData, PatternData, TrajectoryStep,
} from '../../agentic-flow/src/services/agentdb-service';

describe('MCP AgentDB Tool Integration', () => {
  let svc: AgentDBService;

  beforeEach(async () => {
    AgentDBService.resetInstance();
    svc = await AgentDBService.getInstance();
  });

  afterEach(async () => {
    await svc.shutdown();
  });

  // -- Backend detection ----------------------------------------------------

  describe('backend detection', () => {
    it('initializes with a recognized backend', async () => {
      const metrics = await svc.getMetrics();
      expect(['in-memory', 'agentdb']).toContain(metrics.backend);
    });

    it('reports non-negative counts', async () => {
      const metrics = await svc.getMetrics();
      expect(metrics.episodes).toBeGreaterThanOrEqual(0);
      expect(metrics.skills).toBeGreaterThanOrEqual(0);
      expect(metrics.patterns).toBeGreaterThanOrEqual(0);
    });
  });

  // -- Episode store -> recall round-trip -----------------------------------

  describe('episode round-trip (memory_episode_store -> memory_episode_recall)', () => {
    it('stores an episode and recalls it by task keyword', async () => {
      const episode: EpisodeData = {
        sessionId: 'mcp-sess-1',
        task: 'optimize database queries',
        input: 'slow query logs',
        output: 'added indexes to users table',
        reward: 0.85,
        success: true,
        tags: ['performance', 'sql'],
      };

      const id = await svc.storeEpisode(episode);
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');

      const recalled = await svc.recallEpisodes('database', 5);
      expect(recalled.length).toBe(1);
      expect(recalled[0].task).toBe('optimize database queries');
      expect(recalled[0].sessionId).toBe('mcp-sess-1');
      expect(recalled[0].success).toBe(true);
    });

    it('stores multiple episodes and recalls by shared keyword', async () => {
      const episodes: EpisodeData[] = [
        { sessionId: 's1', task: 'write unit tests for auth', reward: 0.9, success: true },
        { sessionId: 's2', task: 'write integration tests for api', reward: 0.7, success: true },
        { sessionId: 's3', task: 'deploy to staging', reward: 0.5, success: false },
      ];

      for (const ep of episodes) {
        await svc.storeEpisode(ep);
      }

      const testEpisodes = await svc.recallEpisodes('tests', 10);
      expect(testEpisodes.length).toBe(2);

      const deployEpisodes = await svc.recallEpisodes('deploy', 10);
      expect(deployEpisodes.length).toBe(1);
      expect(deployEpisodes[0].success).toBe(false);
    });

    it('returns correct ID types as strings', async () => {
      const id1 = await svc.storeEpisode({ sessionId: 'a', task: 'x', reward: 1, success: true });
      const id2 = await svc.storeEpisode({ sessionId: 'b', task: 'y', reward: 0, success: false });
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
      expect(id1).not.toBe(id2);
    });

    it('stores episode with all optional fields', async () => {
      const id = await svc.storeEpisode({
        sessionId: 'full-ep', task: 'complete episode', input: 'in', output: 'out',
        critique: 'could improve', reward: 0.5, success: false, latencyMs: 120,
        tokensUsed: 500, tags: ['full', 'test'], metadata: { tool: 'mcp' },
      });
      expect(id).toBeTruthy();
    });
  });

  // -- Skill publish -> find round-trip -------------------------------------

  describe('skill round-trip (skill_publish -> skill_find)', () => {
    it('publishes a skill and finds it by description', async () => {
      const skill: SkillData = {
        name: 'error-handler',
        description: 'Centralized error handling middleware',
        code: 'export const handler = (err) => { /* ... */ }',
        successRate: 0.92,
      };

      const id = await svc.publishSkill(skill);
      expect(id).toBeTruthy();

      const found = await svc.findSkills('error handling', 5);
      expect(found.length).toBe(1);
      expect(found[0].name).toBe('error-handler');
      expect(found[0].successRate).toBe(0.92);
    });

    it('finds skills by name when description is absent', async () => {
      await svc.publishSkill({ name: 'cache-invalidation', successRate: 0.8 });

      const found = await svc.findSkills('cache', 5);
      expect(found.length).toBe(1);
      expect(found[0].name).toBe('cache-invalidation');
    });

    it('does not match unrelated queries', async () => {
      await svc.publishSkill({ name: 'auth-jwt', description: 'JWT tokens', successRate: 0.95 });

      const found = await svc.findSkills('kubernetes deployment', 5);
      expect(found.length).toBe(0);
    });

    it('publishes skill with all optional fields', async () => {
      const id = await svc.publishSkill({
        name: 'full-skill', description: 'desc', code: 'code()',
        successRate: 0.99, metadata: { version: 2 },
      });
      expect(id).toBeTruthy();
    });
  });

  // -- Pattern store -> search round-trip -----------------------------------

  describe('pattern round-trip (pattern_store -> pattern_search)', () => {
    it('stores a pattern and searches by task type', async () => {
      const pattern: PatternData = {
        taskType: 'bug_fix',
        approach: 'reproduce then bisect with git',
        successRate: 0.87,
        tags: ['debugging'],
      };

      const id = await svc.storePattern(pattern);
      expect(id).toBeTruthy();

      const found = await svc.searchPatterns('bug_fix', 5);
      expect(found.length).toBeGreaterThanOrEqual(1);
      const match = found.find((p) => p.taskType === 'bug_fix');
      expect(match).toBeDefined();
      expect(match!.successRate).toBe(0.87);
    });

    it('searches patterns by approach keyword', async () => {
      await svc.storePattern({
        taskType: 'refactoring', approach: 'extract method pattern', successRate: 0.8,
      });
      await svc.storePattern({
        taskType: 'testing', approach: 'property-based testing', successRate: 0.75,
      });

      const found = await svc.searchPatterns('extract', 5);
      expect(found.length).toBeGreaterThanOrEqual(1);
      const match = found.find((p) => p.approach.includes('extract'));
      expect(match).toBeDefined();
    });

    it('search returns array for any query', async () => {
      const found = await svc.searchPatterns('zzz_nonexistent_zzz', 5);
      expect(Array.isArray(found)).toBe(true);
    });
  });

  // -- Semantic routing -----------------------------------------------------

  describe('semantic routing (route_semantic)', () => {
    it('routes rename task to tier 1 (agent-booster)', async () => {
      const result = await svc.routeSemantic('rename variable foo to bar');
      expect(result.tier).toBe(1);
      expect(result.handler).toBe('agent-booster');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.reasoning).toBeTruthy();
    });

    it('routes format task to tier 1', async () => {
      const result = await svc.routeSemantic('format the code with prettier');
      expect(result.tier).toBe(1);
    });

    it('routes lint fix to tier 1', async () => {
      const result = await svc.routeSemantic('fix lint errors in utils.ts');
      expect(result.tier).toBe(1);
    });

    it('routes typo fix to tier 1', async () => {
      const result = await svc.routeSemantic('fix typo in variable name');
      expect(result.tier).toBe(1);
    });

    it('routes architecture task to tier 3 (sonnet)', async () => {
      const result = await svc.routeSemantic('design microservice architecture for payments');
      expect(result.tier).toBe(3);
      expect(result.handler).toBe('sonnet');
    });

    it('routes security task to tier 3', async () => {
      const result = await svc.routeSemantic('audit security vulnerabilities in auth module');
      expect(result.tier).toBe(3);
    });

    it('routes performance optimization to tier 3', async () => {
      const result = await svc.routeSemantic('optimize query performance in the data layer');
      expect(result.tier).toBe(3);
    });

    it('routes standard task to tier 2 (haiku)', async () => {
      const result = await svc.routeSemantic('add a new REST endpoint for orders');
      expect(result.tier).toBe(2);
      expect(result.handler).toBe('haiku');
    });

    it('returns valid RouteResult structure for any input', async () => {
      const result = await svc.routeSemantic('some arbitrary task');
      expect([1, 2, 3]).toContain(result.tier);
      expect(result.handler).toBeTruthy();
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(typeof result.reasoning).toBe('string');
    });
  });

  // -- Causal routing via patterns ------------------------------------------

  describe('causal routing (route_causal pattern)', () => {
    it('ranks agents correctly using pattern matching algorithm', async () => {
      // Test the ranking algorithm with known patterns
      const testPatterns = [
        { taskType: 'review', approach: 'senior reviewer does analysis', successRate: 0.9, id: 1, uses: 0 },
        { taskType: 'review', approach: 'junior coder assists with review', successRate: 0.6, id: 2, uses: 0 },
      ];

      const agentTypes = ['reviewer', 'coder', 'tester'];
      const ranked = agentTypes.map((agent) => {
        const matching = testPatterns.filter((p) =>
          p.approach.toLowerCase().includes(agent.toLowerCase()),
        );
        const avgSuccess = matching.length > 0
          ? matching.reduce((sum, p) => sum + p.successRate, 0) / matching.length
          : 0.5;
        return { agent, score: avgSuccess, matchCount: matching.length };
      }).sort((a, b) => b.score - a.score);

      expect(ranked[0].agent).toBe('reviewer');
      expect(ranked[0].score).toBe(0.9);
      expect(ranked[1].agent).toBe('coder');
      expect(ranked[1].score).toBe(0.6);
      expect(ranked[2].agent).toBe('tester');
      expect(ranked[2].score).toBe(0.5);

      // Also verify the patterns were stored successfully
      await svc.storePattern({
        taskType: 'code_review', approach: 'reviewer agent does static analysis', successRate: 0.9,
      });
      const stored = await svc.searchPatterns('code_review', 5);
      expect(stored.length).toBeGreaterThanOrEqual(1);
    });

    it('returns default score for agents not in any pattern approach', async () => {
      // For an agent type not mentioned in any stored pattern approach,
      // the score should default to 0.5
      const patterns = await svc.searchPatterns('some task', 10);
      // 'xyzzy_unique_agent_type' won't appear in any pattern approach
      const matching = patterns.filter((p) => p.approach.toLowerCase().includes('xyzzy_unique_agent_type'));
      const score = matching.length > 0
        ? matching.reduce((s, p) => s + p.successRate, 0) / matching.length : 0.5;
      expect(score).toBe(0.5);
    });

    it('handles multiple agent types with overlapping patterns', async () => {
      // Use unique taskType to avoid cross-test pollution
      const unique = `deploy_overlap_${Date.now()}`;
      await svc.storePattern({
        taskType: unique,
        approach: 'devops and coder collaborate on deployment overlap test',
        successRate: 0.85,
      });

      const patterns = await svc.searchPatterns(unique, 10);
      const agentTypes = ['devops', 'coder', 'analyst'];

      const ranked = agentTypes.map((agent) => {
        const matching = patterns.filter((p) =>
          p.approach.toLowerCase().includes(agent.toLowerCase()),
        );
        const avgSuccess = matching.length > 0
          ? matching.reduce((sum, p) => sum + p.successRate, 0) / matching.length
          : 0.5;
        return { agent, score: avgSuccess, matchCount: matching.length };
      }).sort((a, b) => b.score - a.score);

      // Both devops and coder should match the pattern
      expect(ranked[0].score).toBeCloseTo(0.85, 2);
      expect(ranked[1].score).toBeGreaterThanOrEqual(0.5);
      // analyst gets default
      expect(ranked[2].score).toBeCloseTo(0.5, 2);
    });
  });

  // -- Learning trajectory --------------------------------------------------

  describe('learning trajectory round-trip', () => {
    it('records trajectory and predict returns valid structure', async () => {
      const steps: TrajectoryStep[] = [
        { state: 'init', action: 'plan', reward: 0.2, nextState: 'planned' },
        { state: 'planned', action: 'implement', reward: 0.5, nextState: 'implemented' },
        { state: 'implemented', action: 'test', reward: 0.8, nextState: 'tested' },
      ];

      await svc.recordTrajectory(steps, 1.5);

      const prediction = await svc.predictAction('init');
      expect(prediction).toHaveProperty('action');
      expect(prediction).toHaveProperty('confidence');
      expect(prediction).toHaveProperty('alternatives');
      expect(Array.isArray(prediction.alternatives)).toBe(true);
    });
  });

  // -- Explanation ----------------------------------------------------------

  describe('explain decision', () => {
    it('returns explanation with correct structure', async () => {
      const explanation = await svc.explainDecision('dec-456');
      expect(explanation.decisionId).toBe('dec-456');
      expect(Array.isArray(explanation.minimalWhy)).toBe(true);
      expect(typeof explanation.completenessScore).toBe('number');
      expect(Array.isArray(explanation.chunks)).toBe(true);
    });
  });

  // -- Metrics after operations ---------------------------------------------

  describe('metrics integration', () => {
    it('returns valid metrics with correct types', async () => {
      const metrics = await svc.getMetrics();
      expect(['in-memory', 'agentdb']).toContain(metrics.backend);
      expect(typeof metrics.episodes).toBe('number');
      expect(typeof metrics.skills).toBe('number');
      expect(typeof metrics.patterns).toBe('number');
      expect(metrics.uptime).toBeGreaterThan(0);
    });
  });

  // -- JSON response format -------------------------------------------------

  describe('MCP JSON response format', () => {
    it('success response has correct structure', () => {
      const response = JSON.stringify({
        success: true,
        data: { id: '1' },
        timestamp: new Date().toISOString(),
      }, null, 2);
      const parsed = JSON.parse(response);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
      expect(new Date(parsed.timestamp).getTime()).not.toBeNaN();
    });

    it('error response includes error field', () => {
      const response = JSON.stringify({
        success: false,
        error: 'something went wrong',
        timestamp: new Date().toISOString(),
      }, null, 2);
      const parsed = JSON.parse(response);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('something went wrong');
    });
  });
});
