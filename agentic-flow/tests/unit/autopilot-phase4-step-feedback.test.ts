/**
 * Unit tests for ADR-0195 §"Open questions" #3 — trajectory step-level
 * feedback subscriber on AgentDBService.
 *
 * Contract:
 * - With `STEP_LEVEL_FEEDBACK_ENABLED` unset/false, `trajectory:step`
 *   emits MUST NOT trigger `LearningSystem.submitFeedback`.
 * - With `STEP_LEVEL_FEEDBACK_ENABLED=true`, every `trajectory:step`
 *   emit triggers exactly one `submitFeedback` call against a
 *   trajectory-scoped sessionId (`autopilot:${sha1(trajectoryId)}:step`).
 * - Pass-through reward — the `reward` arriving in payload is the
 *   reward passed to `submitFeedback` (no step-level reshaping).
 *
 * Test strategy: import the AgentDBService class, but exercise its
 * `_attachLearningSubscriber` via a minimal harness that sets the env
 * flag, constructs a bare-shell instance with `learningEvents` +
 * `learningSystem` + `_autopilotSessionsBound`, then emits and asserts.
 * We do NOT call `initialize()` (which spins up the real AgentDB
 * backend, opens SQLite, etc. — out of scope for a unit test).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import * as nodeCrypto from 'node:crypto';
import { AgentDBService } from '../../src/services/agentdb-service.js';

/**
 * Build a minimal AgentDBService stand-in by reaching into the class.
 * We can't `new` the real class without paying for the full init path;
 * instead we use `Object.create` + manually install the private fields
 * the subscriber method touches, then invoke `_attachLearningSubscriber`
 * via prototype access.
 */
function buildHarness(opts: {
  stepFlag: boolean;
  customSessionIdSpy?: (sid: string) => void;
}): {
  bus: EventEmitter;
  submitFeedback: ReturnType<typeof vi.fn>;
  startSession: ReturnType<typeof vi.fn>;
  attach: () => void;
} {
  const bus = new EventEmitter();
  const startSession = vi.fn(async (
    _user: string,
    _algo: string,
    cfg: { customSessionId?: string },
  ) => {
    if (opts.customSessionIdSpy && cfg?.customSessionId) {
      opts.customSessionIdSpy(cfg.customSessionId);
    }
    return cfg?.customSessionId ?? 'session-x';
  });
  const submitFeedback = vi.fn(async (_fb: unknown) => undefined);

  const learningSystem = { startSession, submitFeedback };

  // Mint a partial instance carrying just the fields the subscriber method
  // reads from `this`. The prototype gives us the methods.
  const inst = Object.create(AgentDBService.prototype) as unknown as {
    learningEvents: EventEmitter;
    learningSystem: unknown;
    _autopilotSessionsBound: Set<string>;
  };
  inst.learningEvents = bus;
  inst.learningSystem = learningSystem;
  inst._autopilotSessionsBound = new Set<string>();

  const attach = () => {
    const original = process.env.STEP_LEVEL_FEEDBACK_ENABLED;
    process.env.STEP_LEVEL_FEEDBACK_ENABLED = opts.stepFlag ? 'true' : 'false';
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (AgentDBService.prototype as any)._attachLearningSubscriber.call(inst);
    } finally {
      // Restore env so a later test in the suite picks up its own value.
      if (original === undefined) {
        delete process.env.STEP_LEVEL_FEEDBACK_ENABLED;
      } else {
        process.env.STEP_LEVEL_FEEDBACK_ENABLED = original;
      }
    }
  };

  return { bus, submitFeedback, startSession, attach };
}

/**
 * Synchronous emit + flush — `_handleAutopilotStep` is invoked via
 * `setImmediate`, so we await one microtask + one macrotask cycle.
 */
async function emitAndFlush(
  bus: EventEmitter,
  event: string,
  payload: unknown,
): Promise<void> {
  bus.emit(event, payload);
  // Drain setImmediate (subscriber's outer wrapper).
  await new Promise<void>((resolve) => setImmediate(resolve));
  // Drain the awaited submitFeedback inside the handler.
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('AgentDBService Phase 4 step-level subscriber (ADR-0195 OQ#3)', () => {
  beforeEach(() => {
    // Make sure no stray env leaks between tests.
    delete process.env.STEP_LEVEL_FEEDBACK_ENABLED;
  });
  afterEach(() => {
    delete process.env.STEP_LEVEL_FEEDBACK_ENABLED;
  });

  it('flag OFF: trajectory:step does NOT trigger submitFeedback', async () => {
    const h = buildHarness({ stepFlag: false });
    h.attach();

    await emitAndFlush(h.bus, 'trajectory:step', {
      trajectoryId: 42,
      state: 'iter:0',
      action: 'step',
      reward: 1,
    });

    expect(h.submitFeedback).not.toHaveBeenCalled();
    expect(h.startSession).not.toHaveBeenCalled();
  });

  it('flag ON: each trajectory:step triggers exactly one submitFeedback', async () => {
    const h = buildHarness({ stepFlag: true });
    h.attach();

    await emitAndFlush(h.bus, 'trajectory:step', {
      trajectoryId: 7,
      state: 'iter:0',
      action: 'step',
      reward: 0.5,
    });

    expect(h.submitFeedback).toHaveBeenCalledTimes(1);
    const call = h.submitFeedback.mock.calls[0][0] as {
      sessionId: string;
      state: string;
      action: string;
      reward: number;
    };
    const expectedSid = `autopilot:${nodeCrypto
      .createHash('sha1')
      .update('7')
      .digest('hex')}:step`;
    expect(call.sessionId).toBe(expectedSid);
    expect(call.state).toBe('iter:0');
    expect(call.action).toBe('step');
    expect(call.reward).toBe(0.5);
  });

  it('flag ON: multiple steps share one sessionId (per-trajectory binding)', async () => {
    const h = buildHarness({ stepFlag: true });
    h.attach();

    for (let i = 0; i < 3; i++) {
      await emitAndFlush(h.bus, 'trajectory:step', {
        trajectoryId: 11,
        state: `iter:${i}`,
        action: 'step',
        reward: i,
      });
    }

    expect(h.submitFeedback).toHaveBeenCalledTimes(3);
    // startSession runs once (lazy bind), even though 3 steps emitted.
    expect(h.startSession).toHaveBeenCalledTimes(1);
    const sids = h.submitFeedback.mock.calls.map(
      (c) => (c[0] as { sessionId: string }).sessionId,
    );
    expect(new Set(sids).size).toBe(1);
  });

  it('flag ON: distinct trajectoryIds bind distinct sessions', async () => {
    const h = buildHarness({ stepFlag: true });
    h.attach();

    await emitAndFlush(h.bus, 'trajectory:step', {
      trajectoryId: 100,
      state: 'iter:0',
      action: 'step',
      reward: 1,
    });
    await emitAndFlush(h.bus, 'trajectory:step', {
      trajectoryId: 200,
      state: 'iter:0',
      action: 'step',
      reward: 1,
    });

    expect(h.startSession).toHaveBeenCalledTimes(2);
    expect(h.submitFeedback).toHaveBeenCalledTimes(2);
    const sids = h.submitFeedback.mock.calls.map(
      (c) => (c[0] as { sessionId: string }).sessionId,
    );
    expect(new Set(sids).size).toBe(2);
  });

  it('flag ON: reward passes through unchanged (no step-level reshaping)', async () => {
    const h = buildHarness({ stepFlag: true });
    h.attach();

    const rewards = [-1, 0, 0.25, 1, 2.5];
    for (let i = 0; i < rewards.length; i++) {
      await emitAndFlush(h.bus, 'trajectory:step', {
        trajectoryId: 999,
        state: `iter:${i}`,
        action: 'step',
        reward: rewards[i],
      });
    }

    const captured = h.submitFeedback.mock.calls.map(
      (c) => (c[0] as { reward: number }).reward,
    );
    expect(captured).toEqual(rewards);
  });
});
