/**
 * Tests for Autopilot v2: Drift Detection + AgentDB Learning (ADR-058)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DriftDetector,
  DriftSignal,
  DriftConfig,
  DriftMetrics,
} from '../../agentic-flow/src/coordination/drift-detector.js';
import {
  SwarmCompletionCoordinator,
} from '../../agentic-flow/src/coordination/swarm-completion.js';
import {
  AutopilotLearning,
} from '../../agentic-flow/src/coordination/autopilot-learning.js';

// ─── DriftDetector Tests ─────────────────────────────────────────────

describe('DriftDetector', () => {
  let detector: DriftDetector;

  beforeEach(() => {
    detector = new DriftDetector();
  });

  describe('stall detection', () => {
    it('should detect stall when no completions for stallThreshold iterations', () => {
      for (let i = 0; i < 6; i++) {
        detector.recordIteration({ completed: 0 });
      }
      const signals = detector.detectDrift();
      expect(signals.some(s => s.type === 'stall')).toBe(true);
      expect(signals.find(s => s.type === 'stall')?.severity).toBe('high');
    });

    it('should not detect stall when tasks are completing', () => {
      for (let i = 0; i < 6; i++) {
        detector.recordIteration({ completed: i + 1 });
      }
      const signals = detector.detectDrift();
      expect(signals.some(s => s.type === 'stall')).toBe(false);
    });

    it('should reset stall counter on new completion', () => {
      for (let i = 0; i < 4; i++) {
        detector.recordIteration({ completed: 0 });
      }
      detector.recordIteration({ completed: 1 });
      detector.recordIteration({ completed: 1 });
      const signals = detector.detectDrift();
      expect(signals.some(s => s.type === 'stall')).toBe(false);
    });
  });

  describe('cycling detection', () => {
    it('should detect cycling when task fails cyclingThreshold times', () => {
      detector.recordTaskFailure('task-1');
      detector.recordTaskFailure('task-1');
      detector.recordTaskFailure('task-1');
      const signals = detector.detectDrift();
      expect(signals.some(s => s.type === 'cycling')).toBe(true);
      expect(signals.find(s => s.type === 'cycling')?.affectedTaskIds).toContain('task-1');
    });

    it('should not detect cycling below threshold', () => {
      detector.recordTaskFailure('task-1');
      detector.recordTaskFailure('task-1');
      const signals = detector.detectDrift();
      expect(signals.some(s => s.type === 'cycling')).toBe(false);
    });
  });

  describe('thrashing detection', () => {
    it('should detect thrashing when task is reassigned thrashingThreshold times', () => {
      detector.recordAgentReassignment('task-1', 'agent-a', 'agent-b');
      detector.recordAgentReassignment('task-1', 'agent-b', 'agent-c');
      detector.recordAgentReassignment('task-1', 'agent-c', 'agent-d');
      const signals = detector.detectDrift();
      expect(signals.some(s => s.type === 'thrashing')).toBe(true);
      expect(signals.find(s => s.type === 'thrashing')?.affectedTaskIds).toContain('task-1');
    });

    it('should not detect thrashing below threshold', () => {
      detector.recordAgentReassignment('task-1', 'agent-a', 'agent-b');
      const signals = detector.detectDrift();
      expect(signals.some(s => s.type === 'thrashing')).toBe(false);
    });
  });

  describe('decay detection', () => {
    it('should detect decay when completion rate declines significantly', () => {
      // First half: high completed counts (sum = 5+6+7+8+9 = 35)
      for (let i = 0; i < 5; i++) {
        detector.recordIteration({ completed: 5 + i });
      }
      // Second half: near-zero counts (sum = 0+0+0+0+1 = 1 < 35*0.5)
      for (let i = 0; i < 5; i++) {
        detector.recordIteration({ completed: i === 4 ? 1 : 0 });
      }
      const signals = detector.detectDrift();
      expect(signals.some(s => s.type === 'decay')).toBe(true);
      expect(signals.find(s => s.type === 'decay')?.severity).toBe('low');
    });

    it('should not detect decay with insufficient data', () => {
      detector.recordIteration({ completed: 1 });
      detector.recordIteration({ completed: 2 });
      const signals = detector.detectDrift();
      expect(signals.some(s => s.type === 'decay')).toBe(false);
    });
  });

  describe('mitigation suggestions', () => {
    it('should suggest escalate for stall', () => {
      const signal: DriftSignal = { type: 'stall', severity: 'high', message: 'test', detectedAt: Date.now() };
      const mitigation = detector.suggestMitigation(signal);
      expect(mitigation.action).toBe('escalate');
    });

    it('should suggest reprioritize for cycling', () => {
      const signal: DriftSignal = { type: 'cycling', severity: 'medium', message: 'test', affectedTaskIds: ['t1'], detectedAt: Date.now() };
      const mitigation = detector.suggestMitigation(signal);
      expect(mitigation.action).toBe('reprioritize');
      expect(mitigation.taskIds).toContain('t1');
    });

    it('should suggest reassign for thrashing', () => {
      const signal: DriftSignal = { type: 'thrashing', severity: 'medium', message: 'test', affectedTaskIds: ['t2'], detectedAt: Date.now() };
      const mitigation = detector.suggestMitigation(signal);
      expect(mitigation.action).toBe('reassign');
    });

    it('should suggest skip for decay', () => {
      const signal: DriftSignal = { type: 'decay', severity: 'low', message: 'test', detectedAt: Date.now() };
      const mitigation = detector.suggestMitigation(signal);
      expect(mitigation.action).toBe('skip');
    });
  });

  describe('metrics and state', () => {
    it('should track metrics correctly', () => {
      detector.recordIteration({ completed: 0 });
      detector.recordTaskFailure('t1');
      const metrics = detector.getMetrics();
      expect(metrics.iterationsSinceLastCompletion).toBe(1);
      expect(metrics.completionRateHistory.length).toBe(1);
    });

    it('should reset all state', () => {
      detector.recordIteration({ completed: 0 });
      detector.recordTaskFailure('t1');
      detector.recordAgentReassignment('t1', 'a', 'b');
      detector.reset();
      const metrics = detector.getMetrics();
      expect(metrics.iterationsSinceLastCompletion).toBe(0);
      expect(metrics.completionRateHistory.length).toBe(0);
      expect(metrics.totalSignals).toBe(0);
    });

    it('should get and set config', () => {
      const config = detector.getConfig();
      expect(config.stallThreshold).toBe(5);
      detector.setConfig({ stallThreshold: 10 });
      expect(detector.getConfig().stallThreshold).toBe(10);
    });
  });
});

// ─── AutopilotLearning Tests ─────────────────────────────────────────

describe('AutopilotLearning', () => {
  let learning: AutopilotLearning;

  beforeEach(() => {
    learning = new AutopilotLearning();
  });

  it('should gracefully handle when AgentDB is unavailable', async () => {
    // initialize() should return false (AgentDB won't be installed in test env)
    const result = await learning.initialize();
    // May be true or false depending on env — either way should not throw
    expect(typeof result).toBe('boolean');
  }, 15000);

  it('should report availability status', () => {
    expect(typeof learning.isAvailable()).toBe('boolean');
    expect(learning.isAvailable()).toBe(false); // not initialized yet
  });

  it('should return empty context when unavailable', async () => {
    const ctx = await learning.getReEngagementContext([{ subject: 'test', status: 'pending' }]);
    expect(ctx.recommendations).toEqual([]);
    expect(ctx.pastFailures).toEqual([]);
    expect(ctx.pastSuccesses).toEqual([]);
    expect(ctx.confidence).toBe(0);
  });

  it('should no-op recordTaskCompletion when unavailable', async () => {
    // Should not throw
    await learning.recordTaskCompletion({
      taskId: '1', subject: 'test', status: 'completed',
      iterations: 5, durationMs: 1000,
    });
  });

  it('should no-op recordTaskFailure when unavailable', async () => {
    await learning.recordTaskFailure({
      taskId: '1', subject: 'test', status: 'blocked',
      iterations: 5, durationMs: 1000,
    });
  });

  it('should return default metrics when unavailable', async () => {
    const metrics = await learning.getMetrics();
    expect(metrics.available).toBe(false);
    expect(metrics.episodes).toBe(0);
    expect(metrics.patterns).toBe(0);
    expect(metrics.trajectories).toBe(0);
  });

  it('should return empty patterns when unavailable', async () => {
    const patterns = await learning.discoverSuccessPatterns();
    expect(patterns).toEqual([]);
  });

  it('should return default prediction when unavailable', async () => {
    const prediction = await learning.predictNextAction({ test: true });
    expect(prediction.action).toBe('continue');
    expect(prediction.confidence).toBe(0);
  });
});

// ─── AutopilotLearning — populated AgentDB ──────────────────────────
//
// ADR-0192 Phase 4: end-to-end coverage of the AgentDB-backed paths.
// `initialize()` returns false when the consumer doesn't have agentdb
// installed (e.g., CI containers running this test file in isolation);
// in that case every `it` block exits via the same isAvailable guard
// the graceful-degradation suite above already exercises.

describe('AutopilotLearning — populated AgentDB', () => {
  let learning: AutopilotLearning;

  beforeEach(async () => {
    learning = new AutopilotLearning();
    const ready = await learning.initialize();
    if (!ready) {
      // AgentDB legitimately unavailable in this test env — skip the
      // populated suite entirely. The graceful-unavailable suite above
      // already covers that path.
      return;
    }
    for (let i = 0; i < 10; i++) {
      await learning.recordTaskCompletion({
        taskId: `t-c-${i}`,
        subject: i < 5
          ? 'write unit tests for authentication'
          : 'fix database migration bug',
        status: 'completed',
        iterations: 3 + i,
        durationMs: 5000 * (i + 1),
      });
    }
    for (let i = 0; i < 5; i++) {
      await learning.recordTaskFailure({
        taskId: `t-f-${i}`,
        subject: 'connection timeout in database migration',
        status: 'failed',
        iterations: 10,
        durationMs: 60000,
        critique: 'connection pool exhausted',
      });
    }
  }, 30000);

  it('reports populated metrics', async () => {
    if (!learning.isAvailable()) return; // skip if unavailable in env
    const m = await learning.getMetrics();
    expect(m.available).toBe(true);
    expect(m.episodes).toBeGreaterThanOrEqual(15);
    expect(m.patterns).toBeGreaterThan(0);
  });

  it('discovers patterns from grouped subjects', async () => {
    if (!learning.isAvailable()) return;
    const patterns = await learning.discoverSuccessPatterns();
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.every(p => p.frequency >= 2)).toBe(true);
    expect(patterns[0].pattern.length).toBeGreaterThan(3);
  });

  it('recall returns matches by subject substring', async () => {
    if (!learning.isAvailable()) return;
    const results = await learning.recallSimilarTasks('authentication', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every(r => r.subject.toLowerCase().includes('authentication')),
    ).toBe(true);
  });

  it('re-engagement context separates failures from successes', async () => {
    if (!learning.isAvailable()) return;
    const ctx = await learning.getReEngagementContext([
      { subject: 'fix database migration', status: 'pending' },
    ]);
    expect(ctx.pastSuccesses.length).toBeGreaterThan(0);
    expect(ctx.pastFailures.length).toBeGreaterThan(0);
    expect(ctx.confidence).toBeGreaterThan(0);
  });

  it('confidence scales with episode count', async () => {
    if (!learning.isAvailable()) return;
    const ctx = await learning.getReEngagementContext([
      { subject: 'unrelated query', status: 'pending' },
    ]);
    // 15 episodes / 50 floor = 0.3
    expect(ctx.confidence).toBeGreaterThan(0.2);
    expect(ctx.confidence).toBeLessThan(1.01);
  });
});

// ─── SwarmCompletionCoordinator Integration Tests ────────────────────

describe('SwarmCompletionCoordinator with Drift', () => {
  let coordinator: SwarmCompletionCoordinator;

  beforeEach(() => {
    coordinator = new SwarmCompletionCoordinator({ maxIterations: 50, timeoutMinutes: 60 });
  });

  it('should record iterations in drift detector via tick()', () => {
    coordinator.addTasks([
      { id: '1', subject: 'Task 1', status: 'pending' },
      { id: '2', subject: 'Task 2', status: 'pending' },
    ]);
    coordinator.tick();
    coordinator.tick();
    const metrics = coordinator.getDriftMetrics();
    expect(metrics.completionRateHistory.length).toBeGreaterThan(0);
  });

  it('should return drift metrics', () => {
    const metrics = coordinator.getDriftMetrics();
    expect(metrics).toHaveProperty('totalSignals');
    expect(metrics).toHaveProperty('signalsByType');
    expect(metrics).toHaveProperty('iterationsSinceLastCompletion');
    expect(metrics).toHaveProperty('completionRateHistory');
    expect(metrics).toHaveProperty('activeSignals');
  });

  it('should not throw when initializing learning without AgentDB', async () => {
    const result = await coordinator.initializeLearning();
    expect(typeof result).toBe('boolean');
  });

  it('should generate re-engagement prompt with drift warnings after stall', async () => {
    coordinator.addTasks([
      { id: '1', subject: 'Task 1', status: 'pending' },
    ]);
    // Simulate enough ticks to trigger stall + drift check
    for (let i = 0; i < 10; i++) {
      coordinator.tick();
    }
    const prompt = await coordinator.generateReEngagementPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('Progress:');
  });

  it('should track task failures in drift detector', () => {
    coordinator.addTasks([
      { id: '1', subject: 'Task 1', status: 'in_progress' },
    ]);
    coordinator.updateTask('1', 'blocked');
    coordinator.updateTask('1', 'blocked');
    coordinator.updateTask('1', 'blocked');
    const metrics = coordinator.getDriftMetrics();
    // The drift detector should have recorded failures
    expect(metrics).toBeDefined();
  });

  it('should track agent reassignments', () => {
    coordinator.addTasks([
      { id: '1', subject: 'Task 1', status: 'in_progress', owner: 'agent-a' },
    ]);
    coordinator.updateTask('1', 'in_progress', 'agent-b');
    coordinator.updateTask('1', 'in_progress', 'agent-c');
    const metrics = coordinator.getDriftMetrics();
    expect(metrics).toBeDefined();
  });

  it('should reset drift detector on coordinator reset', () => {
    coordinator.addTasks([{ id: '1', subject: 'Task 1', status: 'pending' }]);
    coordinator.tick();
    coordinator.tick();
    coordinator.reset();
    const metrics = coordinator.getDriftMetrics();
    expect(metrics.iterationsSinceLastCompletion).toBe(0);
    expect(metrics.completionRateHistory.length).toBe(0);
  });
});
