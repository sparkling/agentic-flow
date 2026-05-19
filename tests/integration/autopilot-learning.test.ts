/**
 * Tests for AutopilotLearning (ADR-058 + ADR-072 + ADR-0192 Phase 1
 * + ADR-0193 Items A+B).
 *
 * Split out from `autopilot-drift-learning.test.ts` because the parent
 * file's pre-existing imports of `drift-detector.js` and
 * `swarm-completion.js` reference orphaned source paths that don't
 * exist in this fork — vitest aborts the parent file at module-load,
 * making the AutopilotLearning suites unreachable.
 *
 * Coverage (post ADR-0193):
 *   - 8 absent-shape (graceful-unavailable) blocks
 *   - 5 populated-AgentDB blocks (visible-skip when AgentDB not
 *     reachable in the test env)
 *   - 1 trajectory-recording block (ADR-0193 Item B)
 *   - 2 embedding-recall blocks (ADR-0193 Item A.2)
 *   - 1 prediction block (ADR-0193 Item A.1)
 *   - 1 reward-shaping block (ADR-0193 Item A.3)
 *   - 1 retention block (ADR-0193 Item A.4)
 *
 * Populated-suite assertions use `toBe(15)` rather than the prior
 * `toBeGreaterThanOrEqual(15)` because ADR-0193 Item A.4 caps the
 * episode count at `AUTOPILOT_EPISODE_CAP=15` for this suite,
 * evicting the oldest entries from any prior test-run accumulation
 * so the count stabilises at exactly the populated set size.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  // ADR-0193 Item A.4: stash + restore the env-var cap so this suite's
  // cap=15 doesn't leak into other test files.
  let _capBackup: string | undefined;

  beforeEach(async () => {
    _skippedReason = null;
    _capBackup = process.env.AUTOPILOT_EPISODE_CAP;
    // ADR-0193 Item A.4: cap at the exact populated count so prior-run
    // accumulation gets evicted on the first new write. With cap=15 and
    // exactly 15 writes per setup, the listing stabilises at 15 even
    // when the DB has 30+ pre-existing rows from previous runs — so
    // `toBe(15)` is now an honest assertion (was `toBeGreaterThanOrEqual`).
    process.env.AUTOPILOT_EPISODE_CAP = '15';
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

  afterEach(() => {
    if (_capBackup === undefined) delete process.env.AUTOPILOT_EPISODE_CAP;
    else process.env.AUTOPILOT_EPISODE_CAP = _capBackup;
  });

  it('reports populated metrics', async () => {
    if (_skippedReason) return;
    const m = await learning.getMetrics();
    expect(m.available).toBe(true);
    // ADR-0193 Item A.4: exact-equality assertion (cap=15 prunes prior
    // accumulation). Was `toBeGreaterThanOrEqual(15)` pre-A.4.
    expect(m.episodes).toBe(15);
    expect(m.patterns).toBeGreaterThan(0);
  });

  it('discovers patterns from grouped subjects', async () => {
    if (_skippedReason) return;
    const patterns = await learning.discoverSuccessPatterns();
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.every(p => p.frequency >= 2)).toBe(true);
    expect(patterns[0].pattern.length).toBeGreaterThan(3);
  });

  it('recall returns embedding-similar episodes', async () => {
    if (_skippedReason) return;
    // ADR-0193 Item A.2: recall now delegates to
    // AgentDBService.recallEpisodes (embedding-based cosine similarity).
    // The substring guarantee from Phase 1 no longer holds because the
    // ranking is semantic — assert match COUNT and EMPTY-result safety
    // instead. Subject-relevance is exercised in the dedicated
    // 'embedding recall ranking' block below using cluster-distinct
    // subject strings.
    const results = await learning.recallSimilarTasks('authentication', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(5);
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
    // ADR-0193 Item A.4: with cap=15 the episode count is now stable
    // at 15, so confidence = 15/50 = 0.3 deterministically.
    expect(ctx.confidence).toBeCloseTo(0.3, 5);
  });
});

// ─── ADR-0193 Item B — trajectory recording ─────────────────────────

describe('AutopilotLearning — trajectory recording (ADR-0193 Item B)', () => {
  let learning: AutopilotLearning;
  let _skippedReason: string | null = null;

  beforeEach(async () => {
    _skippedReason = null;
    learning = new AutopilotLearning();
    const ready = await learning.initialize();
    if (!ready) {
      _skippedReason = 'AgentDB unavailable in this test env';
      // eslint-disable-next-line no-console
      console.warn(`[autopilot-learning trajectory suite] SKIP: ${_skippedReason}`);
    }
  }, 15000);

  it('opens a SonaRvfService trajectory and counts it once', async () => {
    if (_skippedReason) return;
    // beginSwarm → recordIterationStep ×3 → endSwarmTrajectory should
    // produce exactly 1 trajectory in getMetrics(). The trajectory is
    // opened LAZILY on the first recordIterationStep call (per ADR-0193
    // Item B); subsequent calls append steps to the same trajectory.
    const metricsBefore = await learning.getMetrics();
    const baselineTrajectories = metricsBefore.trajectories;
    await learning.recordIterationStep(0.1, []);
    await learning.recordIterationStep(0.5, []);
    await learning.recordIterationStep(0.9, []);
    await learning.endSwarmTrajectory({ status: 'completed' });
    const metricsAfter = await learning.getMetrics();
    expect(metricsAfter.trajectories).toBe(baselineTrajectories + 1);
  }, 15000);

  it('treats endSwarmTrajectory with no active trajectory as a no-op', async () => {
    if (_skippedReason) return;
    // Defensive call when no recordIterationStep was issued must not
    // throw and must not bump the counter.
    const metricsBefore = await learning.getMetrics();
    await learning.endSwarmTrajectory({ status: 'cancelled' });
    const metricsAfter = await learning.getMetrics();
    expect(metricsAfter.trajectories).toBe(metricsBefore.trajectories);
  }, 15000);
});

// ─── ADR-0193 Item A.2 — embedding-based recall ranking ─────────────

describe('AutopilotLearning — embedding recall ranking (ADR-0193 Item A.2)', () => {
  let learning: AutopilotLearning;
  let _skippedReason: string | null = null;
  let _capBackup: string | undefined;

  beforeEach(async () => {
    _skippedReason = null;
    _capBackup = process.env.AUTOPILOT_EPISODE_CAP;
    // Cap at 9 (three distinct clusters × three episodes each) so prior
    // accumulation gets evicted and the cluster-distinct subjects
    // dominate the recall ordering.
    process.env.AUTOPILOT_EPISODE_CAP = '9';
    learning = new AutopilotLearning();
    const ready = await learning.initialize();
    if (!ready) {
      _skippedReason = 'AgentDB unavailable in this test env';
      // eslint-disable-next-line no-console
      console.warn(`[autopilot-learning embedding-recall suite] SKIP: ${_skippedReason}`);
      return;
    }
    // Populate 3 clusters × 3 episodes each, distinct enough that
    // embedding cosine similarity unambiguously separates them.
    const clusters = [
      'react bug fix in component lifecycle',
      'vue refactor of composition api state',
      'css color tweak for dark mode theme',
    ];
    let idx = 0;
    for (const subject of clusters) {
      for (let i = 0; i < 3; i++) {
        await learning.recordTaskCompletion({
          taskId: `t-${idx++}`,
          subject,
          status: 'completed',
          iterations: 2,
          durationMs: 1000,
        });
      }
    }
  }, 30000);

  afterEach(() => {
    if (_capBackup === undefined) delete process.env.AUTOPILOT_EPISODE_CAP;
    else process.env.AUTOPILOT_EPISODE_CAP = _capBackup;
  });

  it('ranks react-related episodes first when querying "react"', async () => {
    if (_skippedReason) return;
    const results = await learning.recallSimilarTasks('react', 3);
    expect(results.length).toBeGreaterThan(0);
    // Top hit should be from the react cluster — embedding cosine
    // similarity between "react" and "react bug fix in component
    // lifecycle" exceeds the vue/css cluster scores.
    expect(results[0].subject.toLowerCase()).toContain('react');
  }, 15000);

  it('does not return vue/css episodes at position 0 for a react query', async () => {
    if (_skippedReason) return;
    const results = await learning.recallSimilarTasks('react', 3);
    expect(results.length).toBeGreaterThan(0);
    const top = results[0].subject.toLowerCase();
    expect(top).not.toContain('vue');
    expect(top).not.toContain('css');
  }, 15000);
});

// ─── ADR-0193 Item A.1 — predictNextAction ──────────────────────────

describe('AutopilotLearning — predictNextAction (ADR-0193 Item A.1)', () => {
  let learning: AutopilotLearning;
  let _skippedReason: string | null = null;
  let _capBackup: string | undefined;

  beforeEach(async () => {
    _skippedReason = null;
    _capBackup = process.env.AUTOPILOT_EPISODE_CAP;
    process.env.AUTOPILOT_EPISODE_CAP = '10';
    learning = new AutopilotLearning();
    const ready = await learning.initialize();
    if (!ready) {
      _skippedReason = 'AgentDB unavailable in this test env';
      // eslint-disable-next-line no-console
      console.warn(`[autopilot-learning predict suite] SKIP: ${_skippedReason}`);
      return;
    }
    // Populate 10 episodes all marked status='completed' for the same
    // subject. The known-distribution prediction is 'completed' with
    // unanimity=1.
    for (let i = 0; i < 10; i++) {
      await learning.recordTaskCompletion({
        taskId: `pred-${i}`,
        subject: 'deploy production hotfix',
        status: 'completed',
        iterations: 4,
        durationMs: 2000,
      });
    }
  }, 30000);

  afterEach(() => {
    if (_capBackup === undefined) delete process.env.AUTOPILOT_EPISODE_CAP;
    else process.env.AUTOPILOT_EPISODE_CAP = _capBackup;
  });

  it('returns the most-frequent action from past episodes with positive confidence', async () => {
    if (_skippedReason) return;
    const prediction = await learning.predictNextAction({
      subject: 'deploy production hotfix',
    });
    // All matched episodes have status='completed' → unanimity=1 →
    // confidence = log(matches+1)/log(11) which saturates near 1.0
    // when matches=10.
    expect(prediction.action).toBe('completed');
    expect(prediction.confidence).toBeGreaterThan(0);
  }, 15000);

  it('returns baseline {action:continue, confidence:0} when state lacks a subject', async () => {
    if (_skippedReason) return;
    const prediction = await learning.predictNextAction({});
    expect(prediction.action).toBe('continue');
    expect(prediction.confidence).toBe(0);
  });
});

// ─── ADR-0193 Item A.3 — reward shaping efficiency signal ───────────

describe('AutopilotLearning — reward shaping (ADR-0193 Item A.3)', () => {
  let learning: AutopilotLearning;
  let _skippedReason: string | null = null;
  let _capBackup: string | undefined;

  beforeEach(async () => {
    _skippedReason = null;
    _capBackup = process.env.AUTOPILOT_EPISODE_CAP;
    // Small cap so prior episodes don't pollute the median calculation
    // for the same subject; cap of 2 keeps only the two rows this test
    // writes.
    process.env.AUTOPILOT_EPISODE_CAP = '2';
    learning = new AutopilotLearning();
    const ready = await learning.initialize();
    if (!ready) {
      _skippedReason = 'AgentDB unavailable in this test env';
      // eslint-disable-next-line no-console
      console.warn(`[autopilot-learning reward suite] SKIP: ${_skippedReason}`);
    }
  }, 15000);

  afterEach(() => {
    if (_capBackup === undefined) delete process.env.AUTOPILOT_EPISODE_CAP;
    else process.env.AUTOPILOT_EPISODE_CAP = _capBackup;
  });

  it('rewards a 3-iteration completion higher than a 15-iteration completion', async () => {
    if (_skippedReason) return;
    // Two episodes with the same subject + duration, differing only
    // in iteration count. The shaped-reward formula gives the
    // 3-iteration episode a higher reward because efficiency =
    // median(iterations)/episodeIterations is larger when episode
    // iterations are smaller.
    const subject = 'reward-shaping-fixture-' + Date.now();
    // First episode: 15 iterations (slow). With no priors, median =
    // own value → efficiency=1 → reward ≈ base*1/1 = 1.
    await learning.recordTaskCompletion({
      taskId: 'slow', subject, status: 'completed',
      iterations: 15, durationMs: 10000,
    });
    // Second episode: 3 iterations (fast). Prior median=15, so
    // efficiency = 15/3 = 5 → clamped to 2; time_penalty stays at 1
    // (same duration as median) → reward = base*2/1 = 2 → clamped.
    await learning.recordTaskCompletion({
      taskId: 'fast', subject, status: 'completed',
      iterations: 3, durationMs: 10000,
    });
    const episodes = await learning.recallSimilarTasks(subject, 10);
    const slow = episodes.find(e => e.taskId === 'slow');
    const fast = episodes.find(e => e.taskId === 'fast');
    expect(slow).toBeDefined();
    expect(fast).toBeDefined();
    expect(fast!.reward).toBeGreaterThan(slow!.reward!);
  }, 15000);
});

// ─── ADR-0193 Item A.4 — episode retention cap ──────────────────────

describe('AutopilotLearning — retention cap (ADR-0193 Item A.4)', () => {
  let learning: AutopilotLearning;
  let _skippedReason: string | null = null;
  let _capBackup: string | undefined;

  beforeEach(async () => {
    _skippedReason = null;
    _capBackup = process.env.AUTOPILOT_EPISODE_CAP;
    // Tiny cap so the test writes a manageable number of rows and
    // still exercises eviction.
    process.env.AUTOPILOT_EPISODE_CAP = '5';
    learning = new AutopilotLearning();
    const ready = await learning.initialize();
    if (!ready) {
      _skippedReason = 'AgentDB unavailable in this test env';
      // eslint-disable-next-line no-console
      console.warn(`[autopilot-learning retention suite] SKIP: ${_skippedReason}`);
    }
  }, 15000);

  afterEach(() => {
    if (_capBackup === undefined) delete process.env.AUTOPILOT_EPISODE_CAP;
    else process.env.AUTOPILOT_EPISODE_CAP = _capBackup;
  });

  it('keeps episode count at or below EPISODE_CAP after cap+10 writes', async () => {
    if (_skippedReason) return;
    // Write 15 episodes (cap=5, so 10 over the cap). After each write,
    // _enforceRetentionCap evicts the oldest until the listing is back
    // under the cap.
    for (let i = 0; i < 15; i++) {
      await learning.recordTaskCompletion({
        taskId: `retain-${i}`,
        subject: `retention-fixture-${i}`,
        status: 'completed',
        iterations: 1,
        durationMs: 100,
      });
    }
    const m = await learning.getMetrics();
    expect(m.episodes).toBeLessThanOrEqual(5);
  }, 30000);
});
