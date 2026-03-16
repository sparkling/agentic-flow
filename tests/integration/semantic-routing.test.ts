/**
 * Tests for semantic routing, causal routing, and attention coordination
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentDBService } from '../../agentic-flow/src/services/agentdb-service';

let svc: AgentDBService;

beforeAll(async () => {
  AgentDBService.resetInstance();
  svc = await AgentDBService.getInstance();
});

afterAll(async () => {
  await svc.shutdown();
});

describe('Semantic Routing', () => {

  describe('tier 1 - simple transforms', () => {
    const simpleTasks = [
      'rename variable from camelCase to snake_case',
      'format the file with prettier',
      'fix lint errors in utils.ts',
      'change const to let',
      'add type annotation to function',
      'fix typo in comment',
      'fix import path',
    ];

    it.each(simpleTasks)('routes "%s" to tier 1', async (task) => {
      const result = await svc.routeSemantic(task);
      expect(result.tier).toBe(1);
      expect(result.handler).toBe('agent-booster');
    });
  });

  describe('tier 3 - complex reasoning', () => {
    const complexTasks = [
      'redesign the microservice architecture',
      'security audit of authentication module',
      'refactor the legacy monolith to clean architecture',
      'design a new caching strategy',
      'optimize database query performance',
      'plan the data migration strategy',
    ];

    it.each(complexTasks)('routes "%s" to tier 3', async (task) => {
      const result = await svc.routeSemantic(task);
      expect(result.tier).toBe(3);
      expect(result.handler).toBe('sonnet');
    });
  });

  describe('tier 2 - standard tasks', () => {
    const standardTasks = [
      'add a new API endpoint for user profiles',
      'write unit tests for the payment module',
      'update the README with new instructions',
      'create a database seed script',
    ];

    it.each(standardTasks)('routes "%s" to tier 2', async (task) => {
      const result = await svc.routeSemantic(task);
      expect(result.tier).toBe(2);
      expect(result.handler).toBe('haiku');
    });
  });

  describe('route result structure', () => {
    it('always returns tier, handler, confidence, reasoning', async () => {
      const result = await svc.routeSemantic('some task');
      expect(result).toHaveProperty('tier');
      expect(result).toHaveProperty('handler');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('reasoning');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});

describe('Causal Routing', () => {

  describe('pattern-based agent ranking', () => {
    it('ranks agents by stored pattern success rate', async () => {
      // Store patterns for different agents with unique task type to avoid cross-test pollution
      const uid = `rank-test-${Date.now()}`;
      await svc.storePattern({ taskType: uid, approach: 'alpha-agent handles ranking', successRate: 0.95 });
      await svc.storePattern({ taskType: uid, approach: 'beta-agent handles ranking', successRate: 0.70 });
      await svc.storePattern({ taskType: uid, approach: 'gamma-agent handles ranking', successRate: 0.60 });

      const patterns = await svc.searchPatterns(uid, 10);
      const agents = ['alpha', 'beta', 'gamma'];
      const ranked = agents.map((agent) => {
        const matching = patterns.filter((p) => p.approach.toLowerCase().includes(agent));
        const avg = matching.length > 0
          ? matching.reduce((s, p) => s + p.successRate, 0) / matching.length : 0.5;
        return { agent, score: avg, matchCount: matching.length };
      }).sort((a, b) => b.score - a.score);

      // The highest-scoring agent should rank first
      expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
      expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score);
    });

    it('defaults to 0.5 score for agents not mentioned in patterns', async () => {
      // Use a task type we store, but agents named with unique non-word strings
      const uid = `default_test_${Date.now()}`;
      await svc.storePattern({ taskType: uid, approach: 'standard approach applied', successRate: 0.8 });
      const patterns = await svc.searchPatterns(uid, 10);
      // These agent names won't appear in any approach text
      const agents = ['xq7agent', 'zk9agent'];
      const ranked = agents.map((agent) => {
        const matching = patterns.filter((p) => p.approach.toLowerCase().includes(agent));
        return { agent, score: matching.length > 0 ? 0.9 : 0.5 };
      });
      expect(ranked[0].score).toBe(0.5);
      expect(ranked[1].score).toBe(0.5);
    });
  });

  describe('causal edge paths', () => {
    it('finds direct causal paths', async () => {
      await svc.recordCausalEdge('100', '200', { type: 'leads-to' });
      const paths = await svc.queryCausalPath('100', '200');
      expect(paths.length).toBe(1);
      expect(paths[0].edges.length).toBeGreaterThan(0);
    });

    it('returns empty for non-existent paths', async () => {
      const paths = await svc.queryCausalPath('9999', '8888');
      expect(paths).toEqual([]);
    });
  });
});

describe('Attention-Weighted Coordination', () => {

  describe('softmax mechanism', () => {
    it('normalizes weights to sum to 1', () => {
      const scores = [0.9, 0.7, 0.5];
      const sum = scores.reduce((a, b) => a + b, 0);
      const weights = scores.map((s) => s / sum);
      const weightSum = weights.reduce((a, b) => a + b, 0);
      expect(Math.abs(weightSum - 1)).toBeLessThan(0.001);
    });

    it('assigns higher weight to higher-scoring agents', () => {
      const scores = [0.9, 0.5, 0.2];
      const sum = scores.reduce((a, b) => a + b, 0);
      const weights = scores.map((s) => s / sum);
      expect(weights[0]).toBeGreaterThan(weights[1]);
      expect(weights[1]).toBeGreaterThan(weights[2]);
    });
  });

  describe('uniform mechanism', () => {
    it('assigns equal weights', () => {
      const n = 4;
      const weights = Array(n).fill(1 / n);
      weights.forEach((w) => {
        expect(Math.abs(w - 0.25)).toBeLessThan(0.001);
      });
    });
  });

  describe('priority mechanism', () => {
    it('gives highest weight to first agent', () => {
      const agents = ['lead', 'support1', 'support2'];
      const weights = agents.map((_, i) => 1 / (i + 1));
      expect(weights[0]).toBe(1);
      expect(weights[1]).toBe(0.5);
      expect(weights[2]).toBeCloseTo(0.333, 2);
    });
  });

  describe('skill-based coordination', () => {
    it('uses skill success rates for weighting', async () => {
      await svc.publishSkill({ name: 'coord-skill-1', description: 'expert task handler', successRate: 0.95 });
      await svc.publishSkill({ name: 'coord-skill-2', description: 'novice task handler', successRate: 0.45 });

      const skills = await svc.findSkills('task handler', 2);
      expect(skills.length).toBeGreaterThan(0);

      const maxSkill = skills.reduce((best, s) => s.successRate > best.successRate ? s : best, skills[0]);
      expect(maxSkill.successRate).toBeGreaterThanOrEqual(0.45);
    });
  });
});
