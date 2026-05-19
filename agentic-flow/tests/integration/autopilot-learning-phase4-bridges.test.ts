/**
 * Integration tests for AutopilotLearning Phase 4 (ADR-0195) bridges.
 *
 * Phase 4 wires AutopilotLearning ↔ LearningSystem via a shared event
 * bus on AgentDBService (per ADR-0195 §Decision Outcome: Option 1).
 * AutopilotLearning emits `episode:recorded` / `trajectory:opened` /
 * `trajectory:step` / `trajectory:closed`; LearningSystem subscribes
 * and translates `episode:recorded` into a `submitFeedback()` call.
 *
 * Per ADR-0197 Finding 1 (already shipped): `learningSystem.predictAction`
 * is a method that NEVER existed on `LearningSystem` — it was an
 * optional-chain against a typo. The actual surface is
 * `LearningSystem.predict(sessionId, state)`. Phase 4 cannot revive
 * `predictAction`; this test asserts the negative.
 *
 * Location: inner package (per ADR-0198 Finding 1).
 *
 * Current state (2026-05-19): Phase 4 event bus is NOT yet wired in
 * AgentDBService (no `learningEvents` field, no `getLearningEvents()`).
 * Tests that depend on the bus are marked with `.skip` and a TODO
 * comment so the assertion shape is preserved as a binding spec the
 * implementer can flip back on. The ADR-0197 negative-assertion test
 * (no predictAction anywhere) is unconditional and runs today.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { AutopilotLearning } from '../../src/coordination/autopilot-learning.js';

// ─── Test doubles ────────────────────────────────────────────────────

interface StoredEpisode {
  id: number;
  sessionId: string;
  task: string;
  reward: number;
  success: boolean;
  critique?: string;
  metadata?: Record<string, unknown>;
  ts: number;
}

/**
 * Bus-aware AgentDBService double: exposes `learningEvents`,
 * `getLearningEvents()`, `getLearningSystem()` per the ADR-0195
 * contract. AutopilotLearning emits via `_resolveEventBus(caller)`
 * (Phase 4 P4.1 — not yet implemented in source).
 */
class BusAwareAgentDB {
  private nextId = 1;
  public episodes: StoredEpisode[] = [];
  public learningEvents = new EventEmitter();
  public learningSystemFeedbackCalls: Array<{
    sessionId: string;
    state: string;
    action: string;
    reward: number;
  }> = [];

  /** Mock LearningSystem with the contract surface ADR-0195 binds to. */
  public learningSystem = {
    startSession: vi.fn(async (
      _userId: string,
      _type: string,
      _config: Record<string, unknown>,
    ): Promise<string> => `session-${Date.now()}`),
    submitFeedback: vi.fn(async (feedback: {
      sessionId: string;
      state: string;
      action: string;
      reward: number;
    }): Promise<void> => {
      this.learningSystemFeedbackCalls.push(feedback);
    }),
    predict: vi.fn(async (
      _sessionId: string,
      _state: string,
    ): Promise<{ action: string; confidence: number }> => ({
      action: 'continue',
      confidence: 0.5,
    })),
    // ADR-0197 Finding 1: predictAction NEVER existed on LearningSystem.
    // We intentionally do NOT declare it here — the assertion below
    // verifies that nothing in the bridge probes for it.
  };

  async storeEpisode(ep: {
    sessionId: string;
    task: string;
    reward: number;
    success: boolean;
    critique?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const stored: StoredEpisode = {
      id: this.nextId++,
      sessionId: ep.sessionId,
      task: ep.task,
      reward: ep.reward,
      success: ep.success,
      critique: ep.critique,
      metadata: ep.metadata,
      ts: Date.now(),
    };
    this.episodes.push(stored);
    return String(stored.id);
  }

  async recallEpisodes(
    _query: string,
    limit?: number,
    filters?: Record<string, unknown>,
  ): Promise<StoredEpisode[]> {
    let rows = this.episodes;
    if (filters?.sessionId) {
      rows = rows.filter(r => r.sessionId === filters.sessionId);
    }
    return rows.slice(0, limit ?? 1000);
  }

  async deleteEpisode(id: number | string): Promise<boolean> {
    const before = this.episodes.length;
    const idNum = typeof id === 'string' ? parseInt(id, 10) : id;
    this.episodes = this.episodes.filter(e => e.id !== idNum);
    return this.episodes.length < before;
  }

  async getSonaService(): Promise<{
    beginTrajectory(): { id: string };
    addStep(id: string, step: { state: string; action: string; reward: number }): unknown;
    endTrajectory(id: string): unknown;
    getStats(): { totalTrajectories: number; totalSteps: number };
  }> {
    return {
      beginTrajectory: () => ({ id: `traj-${Date.now()}` }),
      addStep: () => undefined,
      endTrajectory: () => undefined,
      getStats: () => ({ totalTrajectories: 0, totalSteps: 0 }),
    };
  }

  getFallbackStatus(): { degraded: boolean; backend: string; initError: string | null } {
    return { degraded: false, backend: 'in-memory', initError: null };
  }

  getLearningEvents(): EventEmitter {
    return this.learningEvents;
  }

  getLearningSystem(): unknown {
    return this.learningSystem;
  }
}

function attachDouble(learning: AutopilotLearning, db: BusAwareAgentDB): void {
  const internals = learning as unknown as { _available: boolean; _agentdb: unknown };
  internals._agentdb = db;
  internals._available = true;
}

// ─── Capability probes ───────────────────────────────────────────────

function tryConstruct(): { learning: AutopilotLearning | null; err: string | null } {
  try {
    return { learning: new AutopilotLearning(), err: null };
  } catch (err) {
    return {
      learning: null,
      err: err instanceof Error ? err.message : String(err),
    };
  }
}

const ctorProbe = tryConstruct();
const canConstruct = ctorProbe.learning !== null;

// ─── Phase 4 — event bus contract (currently NOT IMPLEMENTED in source) ──

describe('AutopilotLearning Phase 4 (ADR-0195) — event bus bridge', () => {
  let learning: AutopilotLearning;
  let db: BusAwareAgentDB;

  beforeEach(() => {
    if (!canConstruct) return;
    learning = new AutopilotLearning();
    db = new BusAwareAgentDB();
    attachDouble(learning, db);
  });

  // TODO: Phase 4 P4.1 — flip from .skip to .it once `_resolveEventBus`
  // + the four emit points (episode:recorded, trajectory:opened,
  // trajectory:step, trajectory:closed) land in autopilot-learning.ts.
  // Contract gap recorded in test report.
  it.skip('emits episode:recorded after recordTaskCompletion', async () => {
    const handler = vi.fn();
    db.learningEvents.on('episode:recorded', handler);

    await learning.recordTaskCompletion({
      taskId: 't-1',
      subject: 'test subject',
      status: 'completed',
      iterations: 3,
      durationMs: 1000,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const payload = handler.mock.calls[0][0];
    expect(payload).toMatchObject({
      taskId: 't-1',
      subject: 'test subject',
      status: 'completed',
      success: true,
    });
    expect(typeof payload.reward).toBe('number');
    expect(typeof payload.timestamp).toBe('number');
  });

  it.skip('LearningSystem.submitFeedback is invoked via the bus, end-to-end', async () => {
    // Per ADR-0195 §Contract between controllers: episode:recorded →
    // LearningSystem subscriber → ensureSession(autopilot:hash(subject))
    // → submitFeedback({sessionId, state, action, reward, ...}).
    //
    // This test wires the subscriber explicitly (the real Phase 4 wires
    // it at AgentDBService init, post-line-359). The contract shape is
    // the same.
    db.learningEvents.on('episode:recorded', async (ep: {
      subject: string;
      status: string;
      reward: number;
      success: boolean;
      timestamp: number;
    }) => {
      const sessionId = await db.learningSystem.startSession(
        'default',
        'q-learning',
        { learningRate: 0.01 },
      );
      await db.learningSystem.submitFeedback({
        sessionId,
        state: ep.subject,
        action: ep.status,
        reward: ep.reward,
      });
    });

    await learning.recordTaskCompletion({
      taskId: 't-1',
      subject: 'integration test feature',
      status: 'completed',
      iterations: 3,
      durationMs: 1000,
    });

    // Subscriber fires synchronously then async — small await.
    await new Promise(r => setImmediate(r));

    expect(db.learningSystem.submitFeedback).toHaveBeenCalledTimes(1);
    expect(db.learningSystemFeedbackCalls[0]).toMatchObject({
      state: 'integration test feature',
      action: 'completed',
    });
    // Reward is the SHAPED reward (ADR-0193 A.3), not the raw +1.
    expect(db.learningSystemFeedbackCalls[0].reward).toBeGreaterThan(0);
  });

  it.skip('downstream subscriber crash does not break upstream operations', async () => {
    // Per ADR-0195 §Risks: synchronous listener throws must not break
    // autopilot writes. EventEmitter default behavior is to surface
    // errors via 'error' listener; the bus owner attaches one that
    // logs + does not re-throw.
    db.learningEvents.on('error', () => {
      /* swallow — test asserts upstream keeps working */
    });
    db.learningEvents.on('episode:recorded', () => {
      throw new Error('subscriber crashed');
    });

    // First write — subscriber crashes; upstream MUST still succeed.
    await learning.recordTaskCompletion({
      taskId: 't-1',
      subject: 'first',
      status: 'completed',
      iterations: 3,
      durationMs: 1000,
    });

    // Second write — bus still operates; no permanent disable.
    await learning.recordTaskCompletion({
      taskId: 't-2',
      subject: 'second',
      status: 'completed',
      iterations: 3,
      durationMs: 1000,
    });

    expect(db.episodes).toHaveLength(2);
  });
});

// ─── ADR-0197 Finding 1 — negative assertion (predictAction never exists) ──

describe('AutopilotLearning Phase 4 (ADR-0195) — ADR-0197 Finding 1 negative assertion', () => {
  it('learningSystem proxy has no predictAction method anywhere on the surface', () => {
    const db = new BusAwareAgentDB();
    // The mock above mirrors the real LearningSystem contract: it has
    // `predict(sessionId, state)`, NOT `predictAction(state)`. Phase 4
    // must NEVER probe for predictAction (ADR-0197 Finding 1 — the
    // optional-chain returned undefined every call and a sibling catch
    // permanently nuked the field).
    const ls = db.getLearningSystem() as Record<string, unknown>;
    expect(ls.predict).toBeTypeOf('function');
    expect('predictAction' in ls).toBe(false);
  });

  it('AgentDBService source no longer contains the predictAction?.() call probe', async () => {
    // Read the source file directly and assert no live call site exists.
    // The post-ADR-0197 source removed the optional-chain CALL — but the
    // comment block documenting the historical mistake intentionally
    // mentions the literal `learningSystem.predictAction?.(state)` to
    // explain what was removed. The assertion targets LIVE call sites,
    // identifiable by `await` immediately before the optional-chain.
    //
    // Discriminate: a real call is `await this.learningSystem.predictAction?.(...)`;
    // the historical mention is inside a comment line beginning with `//`.
    // We strip comments before matching so doc references don't trip us.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const srcPath = path.resolve(
      here,
      '../../src/services/agentdb-service.ts',
    );
    const src = fs.readFileSync(srcPath, 'utf-8');
    // Strip single-line `//` comments before matching so the ADR-0197
    // comment block doesn't trigger.
    const stripped = src
      .split('\n')
      .map(line => {
        // Find first `//` that is NOT inside a string literal — naive
        // pass is sufficient here, the agentdb-service.ts file uses //
        // for comments and rarely has // inside strings.
        const idx = line.indexOf('//');
        return idx === -1 ? line : line.slice(0, idx);
      })
      .join('\n');
    expect(stripped).not.toMatch(/learningSystem\.predictAction\?\.\(/);
  });
});
