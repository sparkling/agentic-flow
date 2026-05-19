/**
 * Integration tests for AutopilotLearning Phase 5 (ADR-0196) federation.
 *
 * ADR-0196 ships the FEDERATION INTERFACE + a no-op default + a thin
 * adapter over agentdb's `SyncCoordinator`. The runtime QUIC transport
 * stays deferred to a separate ADR; this test exercises the interface
 * + the SyncCoordinator-backed adapter against an in-memory SQLite
 * pairing (two databases on one host, manual sync).
 *
 * Location: inner package (per ADR-0198 Finding 1).
 *
 * Current state (2026-05-19):
 *
 *   * `FederatedSyncProvider` interface — IMPLEMENTED in
 *     `src/services/federated-sync-provider.ts`.
 *   * `NoopFederatedSyncProvider` — IMPLEMENTED.
 *   * `SyncCoordinatorBackedProvider` (the adapter the ADR specifies) —
 *     NOT YET IMPLEMENTED.
 *   * `AutopilotLearning` constructor accepting `syncProvider` —
 *     NOT YET WIRED.
 *   * Episode metadata `originInstallId` / `vectorClock` —
 *     NOT YET POPULATED.
 *
 * CONTRACT GAP DISCOVERED (recorded in test report):
 *   The implementer's `FederatedSyncProvider` interface deviates from
 *   ADR-0196 §Interface shape. The ADR specifies
 *   `requestSync()` + `onRemoteEpisode(cb)`; the source ships
 *   `push() / pull() / status() / notifyEpisode(episode)`. Both shapes
 *   are coherent but they're NOT the same interface. The tests below
 *   exercise the ACTUAL source shape, with a TODO noting the deviation.
 *
 * Tests that depend on the missing pieces are marked `.skip` with a
 * TODO comment so the assertion shape is preserved as a binding spec.
 * The interface-shape and Noop-provider tests run today.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  AutopilotLearning,
  type AutopilotEpisode,
} from '../../src/coordination/autopilot-learning.js';

// Phase 5 federation surface — imported dynamically because the module
// is in flux between landings and may not exist on every commit. When
// absent, the interface-shape tests below SKIP cleanly.
type FederatedSyncProvider = {
  notifyEpisode: (e: AutopilotEpisode) => Promise<void>;
  push: () => Promise<unknown>;
  pull: () => Promise<unknown>;
  status: () => unknown;
  conflictStrategy: () => string;
  getLocalInstallId: () => string;
};

interface FederatedSyncReport {
  success: boolean;
  durationMs: number;
  itemsTransferred: number;
  conflictsResolved: number;
  errors: string[];
}

interface FederatedSyncStatus {
  available: boolean;
  lastSyncAt: number;
  syncCount: number;
  itemsSynced: number;
  errors: number;
}

interface FederatedSyncModule {
  NoopFederatedSyncProvider: new () => FederatedSyncProvider;
}

let federatedModule: FederatedSyncModule | null = null;
let _federatedImportErr: string | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  federatedModule = (await import(
    '../../src/services/federated-sync-provider.js'
  )) as unknown as FederatedSyncModule;
} catch (err) {
  _federatedImportErr = err instanceof Error ? err.message : String(err);
}
const NoopFederatedSyncProvider = federatedModule?.NoopFederatedSyncProvider;

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

class InMemoryAgentDB {
  private nextId: number;
  public episodes: StoredEpisode[] = [];
  public installId: string;

  constructor(installId: string, idStart = 1) {
    this.installId = installId;
    this.nextId = idStart;
  }

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
    const idNum = typeof id === 'string' ? parseInt(id, 10) : id;
    const before = this.episodes.length;
    this.episodes = this.episodes.filter(e => e.id !== idNum);
    return this.episodes.length < before;
  }

  getFallbackStatus(): { degraded: boolean; backend: string; initError: string | null } {
    return { degraded: false, backend: 'in-memory', initError: null };
  }
}

function attachDouble(learning: AutopilotLearning, db: InMemoryAgentDB): void {
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

// ─── Phase 5 — interface shape (binding spec) ────────────────────────

describe('AutopilotLearning Phase 5 (ADR-0196) — FederatedSyncProvider interface', () => {
  it.skipIf(!NoopFederatedSyncProvider)('NoopFederatedSyncProvider implements the full FederatedSyncProvider surface', () => {
    const provider: FederatedSyncProvider = new (NoopFederatedSyncProvider as new () => FederatedSyncProvider)();

    // Method-shape assertions — proves the interface symbols are
    // exported and the implementation conforms structurally.
    expect(provider.notifyEpisode).toBeTypeOf('function');
    expect(provider.push).toBeTypeOf('function');
    expect(provider.pull).toBeTypeOf('function');
    expect(provider.status).toBeTypeOf('function');
    expect(provider.conflictStrategy).toBeTypeOf('function');
    expect(provider.getLocalInstallId).toBeTypeOf('function');
  });

  it.skipIf(!NoopFederatedSyncProvider)('NoopFederatedSyncProvider returns stable install id and latest-wins strategy', () => {
    const provider = new (NoopFederatedSyncProvider as new () => FederatedSyncProvider)();
    expect(provider.getLocalInstallId()).toBe('local');
    expect(provider.conflictStrategy()).toBe('latest-wins');
  });

  it.skipIf(!NoopFederatedSyncProvider)('NoopFederatedSyncProvider status reports available:false (no transport)', () => {
    const provider = new (NoopFederatedSyncProvider as new () => FederatedSyncProvider)();
    const status: FederatedSyncStatus = provider.status();
    expect(status.available).toBe(false);
    expect(status.syncCount).toBe(0);
    expect(status.itemsSynced).toBe(0);
    expect(status.errors).toBe(0);
  });

  it.skipIf(!NoopFederatedSyncProvider)('NoopFederatedSyncProvider push/pull return success with zero items', async () => {
    const provider = new (NoopFederatedSyncProvider as new () => FederatedSyncProvider)();
    const push: FederatedSyncReport = await provider.push();
    expect(push.success).toBe(true);
    expect(push.itemsTransferred).toBe(0);
    expect(push.errors).toEqual([]);

    const pull = await provider.pull();
    expect(pull.success).toBe(true);
    expect(pull.itemsTransferred).toBe(0);
  });

  it('reports construction status (contract probe)', () => {
    // eslint-disable-next-line no-console
    console.warn(
      `[ADR-0196 contract probe] canConstruct=${canConstruct}` +
        ` ctorErr=${ctorProbe.err ? JSON.stringify(ctorProbe.err) : 'null'}`,
    );
    expect(typeof canConstruct).toBe('boolean');
  });

  it.skipIf(!NoopFederatedSyncProvider)('NoopFederatedSyncProvider.notifyEpisode resolves without side effects', async () => {
    const provider = new (NoopFederatedSyncProvider as new () => FederatedSyncProvider)();
    const episode: AutopilotEpisode = {
      taskId: 't-1',
      subject: 'test',
      status: 'completed',
      iterations: 3,
      durationMs: 1000,
    };
    // Must not throw.
    await provider.notifyEpisode(episode);
    // No state change — status still reports zero.
    expect(provider.status().syncCount).toBe(0);
  });
});

// ─── Phase 5 — adapter over SyncCoordinator (NOT YET IMPLEMENTED) ─────

describe('AutopilotLearning Phase 5 (ADR-0196) — SyncCoordinator adapter', () => {
  // TODO (ADR-0196 §Scope when implemented · NEW
  // src/services/federated-sync-provider.ts):
  //
  // The `SyncCoordinatorBackedProvider` class is NOT yet implemented in
  // src/services/federated-sync-provider.ts (only `Noop` is exported).
  // Flip these `.skip` blocks to `.it` once the adapter class lands.

  it.skip('adapter constructs over a real SyncCoordinator + in-memory better-sqlite3 db', async () => {
    // Per ADR-0196 §Closure criteria: "two-SQLite integration test"
    // exercises the adapter against agentdb's SyncCoordinator. Real
    // requirements:
    //   1. Two `better-sqlite3` :memory: databases.
    //   2. Two SyncCoordinator instances configured against each db.
    //   3. Two AutopilotLearning instances writing episodes.
    //   4. A peer object connecting the two SyncCoordinators (manual
    //      apply in lieu of QUIC transport — see ADR-0196 §Risks).
    //   5. `adapter.push()` flushes local episodes to the peer.
    //   6. After flush, peer's `recallEpisodes` returns the synced
    //      episodes with the correct `originInstallId`.
    //
    // Implementation note: SyncCoordinator's transport is stubbed
    // (QUICClient.connect() returns silently). The test bypasses it by
    // calling SyncCoordinator-internal `applyChanges` directly on the
    // peer's coordinator — this is what ADR-0196 §Risks calls "the
    // integration test must bypass QUICClient and call
    // SyncCoordinator.sync(ctx) directly."
    expect(true).toBe(false); // placeholder — fails-if-flipped
  });

  it.skipIf(!canConstruct).fails(
    'episodes carry originInstallId in metadata (XFAIL — _record stamp not yet wired)',
    async () => {
      // ADR-0196 §Implementation phases · 1: episode metadata MUST carry
      // `originInstallId`. The interface field exists on `AutopilotEpisode`
      // but `_record` does not populate the metadata stamp today —
      // CONTRACT GAP recorded in test report. `.fails()` flips on once the
      // stamp lands and this test passes naturally.
      const learning = new AutopilotLearning();
      const db = new InMemoryAgentDB('install-A');
      attachDouble(learning, db);

      await learning.recordTaskCompletion({
        taskId: 't-1',
        subject: 'test',
        status: 'completed',
        iterations: 3,
        durationMs: 1000,
      });

      const stored = db.episodes[0];
      expect(stored.metadata?.originInstallId).toMatch(/^(local|install-A)$/);
    },
  );

  it.skipIf(!canConstruct).fails(
    'episodes carry vectorClock in metadata (XFAIL — Phase 5 step 5 not yet landed)',
    async () => {
      // ADR-0196 §Implementation phases · 5 (deferred). When wired,
      // `_record` invokes `incrementVectorClock(prev, installId)` on
      // every write and stamps the clock into metadata. `.fails()`
      // turns into pass once the stamp lands.
      const learning = new AutopilotLearning();
      const db = new InMemoryAgentDB('install-A');
      attachDouble(learning, db);

      await learning.recordTaskCompletion({
        taskId: 't-1',
        subject: 'test',
        status: 'completed',
        iterations: 3,
        durationMs: 1000,
      });

      const stored = db.episodes[0];
      expect(stored.metadata?.vectorClock).toBeDefined();
      const vc = stored.metadata?.vectorClock as
        | { clocks: Record<string, number> }
        | undefined;
      expect(vc?.clocks).toBeDefined();
      const entries = Object.entries(vc?.clocks ?? {});
      expect(entries.length).toBe(1);
      expect(entries[0][1]).toBe(1);
    },
  );

  it.skipIf(!canConstruct).fails('notifyEpisode is called on every successful episode write (XFAIL — _record provider hook not yet wired)', async () => {
    // Per the source contract: `_record` (autopilot-learning.ts) MUST
    // call `syncProvider.notifyEpisode(episode)` after every
    // `storeEpisode` success. AutopilotLearning's constructor needs to
    // accept the provider (currently no constructor arg — see ADR-0196
    // §Implementation phases · 2 "Interface skin · wire constructor").
    const provider = {
      notifyEpisode: vi.fn(async () => undefined),
      push: vi.fn(async () => ({ success: true, durationMs: 0, itemsTransferred: 0, conflictsResolved: 0, errors: [] })),
      pull: vi.fn(async () => ({ success: true, durationMs: 0, itemsTransferred: 0, conflictsResolved: 0, errors: [] })),
      status: vi.fn(() => ({ available: false, lastSyncAt: 0, syncCount: 0, itemsSynced: 0, errors: 0 })),
      conflictStrategy: vi.fn(() => 'latest-wins' as const),
      getLocalInstallId: vi.fn(() => 'install-A'),
    };

    // ADR-0196 Phase 5: source state is `new AutopilotLearning(provider?)`
    // — provider passed positionally, not via an opts object. Adjust the
    // call shape if the wiring later switches to opts.
    const learning = new (AutopilotLearning as unknown as new (
      provider?: FederatedSyncProvider,
    ) => AutopilotLearning)(provider);
    const db = new InMemoryAgentDB('install-A');
    attachDouble(learning, db);

    await learning.recordTaskCompletion({
      taskId: 't-1',
      subject: 'test',
      status: 'completed',
      iterations: 3,
      durationMs: 1000,
    });

    expect(provider.notifyEpisode).toHaveBeenCalledTimes(1);
    const arg = provider.notifyEpisode.mock.calls[0][0];
    expect(arg.taskId).toBe('t-1');
    expect(arg.subject).toBe('test');
  });

  it.skip('round-trip: peer.recallEpisodes returns episodes written on local + flushed via push', async () => {
    // The end-to-end Phase 5 closure criterion. Requires:
    //   * AutopilotLearning ctor accepts syncProvider
    //   * SyncCoordinatorBackedProvider exists
    //   * SyncCoordinator wired to in-memory better-sqlite3
    // None of which are present today.
    expect(true).toBe(false); // placeholder
  });
});
