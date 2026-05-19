/**
 * Tests for AutopilotLearning (ADR-058 + ADR-072 + ADR-0192 Phase 1)
 *
 * Split out from `autopilot-drift-learning.test.ts` because the parent
 * file's pre-existing imports of `drift-detector.js` and
 * `swarm-completion.js` reference orphaned source paths that don't
 * exist in this fork — vitest aborts the parent file at module-load,
 * making the AutopilotLearning suites unreachable.
 *
 * This file imports ONLY `AutopilotLearning` (which exists post
 * ADR-0192 Phase 1) so vitest can load it and run all 13 it-blocks:
 *
 *   - 8 absent-shape (graceful-unavailable) blocks
 *   - 5 populated-AgentDB blocks (visible-skip when AgentDB not
 *     reachable in the test env)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AutopilotLearning } from '../../agentic-flow/src/coordination/autopilot-learning.js';

// ─── AutopilotLearning — absent-shape (graceful-unavailable) ─────────

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
// in that case the `_skippedReason` sentinel emits a visible warn and
// every `it` block returns early via the sentinel check.

describe('AutopilotLearning — populated AgentDB', () => {
  let learning: AutopilotLearning;
  // ADR-0192 review (Reviewer fix #1): emit an explicit skip marker so CI
  // can distinguish "AgentDB unavailable so we passed-by-default" from
  // "tested and passed for real." Sentinel is checked in every it().
  let _skippedReason: string | null = null;

  beforeEach(async () => {
    _skippedReason = null;
    learning = new AutopilotLearning();
    const ready = await learning.initialize();
    if (!ready) {
      _skippedReason = 'AgentDB unavailable in this test env';
      // Visible in CI log + test runner output; not a silent skip.
      // eslint-disable-next-line no-console
      console.warn(`[autopilot-learning populated suite] SKIP: ${_skippedReason}`);
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

  // ADR-0192 review (Reviewer fix #2): episodes accumulate across test
  // runs because there's no public episode-purge API in Phase 1 (out of
  // scope per ADR-059 — no pruning/retention policies). Assertions use
  // `toBeGreaterThanOrEqual(15)` rather than `toBe(15)` to tolerate the
  // intentional accumulation. A future Phase (or Phase 7 follow-up) can
  // add a purge API and this suite can tighten back to exact counts.

  it('reports populated metrics', async () => {
    if (_skippedReason) return;
    const m = await learning.getMetrics();
    expect(m.available).toBe(true);
    expect(m.episodes).toBeGreaterThanOrEqual(15);
    expect(m.patterns).toBeGreaterThan(0);
  });

  it('discovers patterns from grouped subjects', async () => {
    if (_skippedReason) return;
    const patterns = await learning.discoverSuccessPatterns();
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.every(p => p.frequency >= 2)).toBe(true);
    expect(patterns[0].pattern.length).toBeGreaterThan(3);
  });

  it('recall returns matches by subject substring', async () => {
    if (_skippedReason) return;
    const results = await learning.recallSimilarTasks('authentication', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every(r => r.subject.toLowerCase().includes('authentication')),
    ).toBe(true);
  });

  it('re-engagement context separates failures from successes', async () => {
    if (_skippedReason) return;
    const ctx = await learning.getReEngagementContext([
      { subject: 'fix database migration', status: 'pending' },
    ]);
    expect(ctx.pastSuccesses.length).toBeGreaterThan(0);
    expect(ctx.pastFailures.length).toBeGreaterThan(0);
    expect(ctx.confidence).toBeGreaterThan(0);
  });

  it('confidence scales with episode count', async () => {
    if (_skippedReason) return;
    const ctx = await learning.getReEngagementContext([
      { subject: 'unrelated query', status: 'pending' },
    ]);
    // 15 episodes / 50 floor = 0.3 on the first run; accumulates on subsequent
    // runs up to 1.0 — accept the full range until a purge API exists.
    expect(ctx.confidence).toBeGreaterThan(0.2);
    expect(ctx.confidence).toBeLessThanOrEqual(1.0);
  });
});
