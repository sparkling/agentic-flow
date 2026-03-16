/**
 * Neural Tools Integration Tests
 *
 * Tests the AgentDBService neural capabilities: trajectory recording,
 * action prediction, metrics reporting, decision explanation, and episode storage.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentDBService } from '../../agentic-flow/src/services/agentdb-service';

describe('Neural Tools Integration', () => {
  let svc: AgentDBService;

  beforeEach(async () => {
    AgentDBService.resetInstance();
    svc = await AgentDBService.getInstance();
  });

  afterEach(async () => {
    await svc.shutdown();
  });

  describe('neural_train (recordTrajectory)', () => {
    it('records a trajectory with multiple steps', async () => {
      await expect(svc.recordTrajectory([
        { state: 'init', action: 'analyze', reward: 0.5, nextState: 'analyzed' },
        { state: 'analyzed', action: 'implement', reward: 0.8, nextState: 'done' },
      ], 1.3)).resolves.not.toThrow();
    });

    it('records a single-step trajectory', async () => {
      await expect(svc.recordTrajectory([
        { state: 'start', action: 'complete', reward: 1.0 },
      ], 1.0)).resolves.not.toThrow();
    });
  });

  describe('neural_predict (predictAction)', () => {
    it('returns a prediction object with action and confidence', async () => {
      const pred = await svc.predictAction('code review needed');
      expect(pred).toHaveProperty('action');
      expect(pred).toHaveProperty('confidence');
      expect(pred).toHaveProperty('alternatives');
      expect(typeof pred.action).toBe('string');
      expect(typeof pred.confidence).toBe('number');
      expect(Array.isArray(pred.alternatives)).toBe(true);
    });

    it('returns noop for unknown state in fallback mode', async () => {
      const pred = await svc.predictAction('completely-unknown-state-xyz');
      expect(pred.action).toBe('noop');
    });
  });

  describe('neural_status (getMetrics)', () => {
    it('returns metrics with expected fields', async () => {
      const metrics = await svc.getMetrics();
      expect(metrics).toHaveProperty('backend');
      expect(metrics).toHaveProperty('episodes');
      expect(metrics).toHaveProperty('skills');
      expect(metrics).toHaveProperty('patterns');
      expect(metrics).toHaveProperty('uptime');
      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('neural_explain (explainDecision)', () => {
    it('returns explanation structure', async () => {
      const explanation = await svc.explainDecision('test-decision-1');
      expect(explanation).toHaveProperty('decisionId', 'test-decision-1');
      expect(explanation).toHaveProperty('chunks');
      expect(explanation).toHaveProperty('minimalWhy');
      expect(explanation).toHaveProperty('completenessScore');
      expect(Array.isArray(explanation.chunks)).toBe(true);
    });
  });

  describe('neural_trajectory_record (combined store)', () => {
    it('records trajectory and stores episode together', async () => {
      await svc.recordTrajectory([
        { state: 'bug-found', action: 'debug', reward: 0.3 },
        { state: 'debugged', action: 'fix', reward: 0.9 },
      ], 1.2);

      const id = await svc.storeEpisode({
        sessionId: 'neural-sess',
        task: 'trajectory-2-steps',
        reward: 1.2,
        success: true,
        tags: ['trajectory', 'neural'],
      });
      expect(id).toBeTruthy();
    });
  });

  describe('neural_reset', () => {
    it('resets instance and reinitializes', async () => {
      AgentDBService.resetInstance();
      const fresh = await AgentDBService.getInstance();
      const metrics = await fresh.getMetrics();
      expect(metrics.episodes).toBe(0);
      expect(metrics.skills).toBe(0);
      await fresh.shutdown();
    });
  });
});
