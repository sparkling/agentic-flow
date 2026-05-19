/**
 * FederatedSyncProvider — ADR-0196 Phase 5 federation interface (runtime deferred)
 *
 * Per ADR-0196 (Option 2 — adapter over `SyncCoordinator`), Phase 5 ships the
 * interface + a no-op default + a thin adapter over agentdb's existing
 * `SyncCoordinator`. The transport (real QUIC binding) remains deferred to a
 * separate ADR; the interface lets `AutopilotLearning` notify a provider of
 * each episode without taking a hard dependency on the federation runtime.
 *
 * Deviations from ADR text:
 * - Interface shape uses explicit `push() / pull() / status() / notifyEpisode()`
 *   surfaces rather than the ADR's `requestSync() / onRemoteEpisode()` event
 *   pattern. Push and pull are separate so callers can drive direction
 *   independently (matches `SyncCoordinator.detectChanges`/`applyChanges`
 *   split). The adapter wraps a single `SyncCoordinator.sync(ctx)` call to
 *   service both directions.
 * - `notifyEpisode` replaces the event-subscription pattern (`onRemoteEpisode`
 *   in the ADR). Episode writes already go through `AgentDBService.storeEpisode`
 *   → SQL `episodes` table, which `SyncCoordinator.detectChanges()` picks up
 *   on next sync. `notifyEpisode` is the optional out-of-band signal hook a
 *   provider can use to trigger an eager push (e.g., the future QUIC provider
 *   can stream the episode immediately rather than waiting for the next batch
 *   sync window).
 *
 * Per `feedback-no-fallbacks`: provider methods MUST propagate errors. The
 * `NoopFederatedSyncProvider` default does not throw, but any real provider
 * (adapter / future QUIC) MUST surface failures. The `notifyEpisode` hook
 * called from `AutopilotLearning._record` re-throws — no silent catch.
 *
 * Per ADR-0197 Finding 3: agentdb's `SyncCoordinator` + QUIC + CRDT surface is
 * interface-complete; only the transport is stubbed. This interface composes
 * with `SyncCoordinator`, so when the QUIC transport ADR lands, no
 * autopilot-side change is needed.
 */

import type { AutopilotEpisode } from '../coordination/autopilot-learning.js';

/**
 * Conflict resolution strategy for federated sync. Mirrors
 * `SyncCoordinator.SyncCoordinatorConfig.conflictStrategy` (latest-wins is
 * the default agentdb uses at `SyncCoordinator.ts:84`).
 */
export type ConflictResolutionStrategy =
  | 'local-wins'
  | 'remote-wins'
  | 'latest-wins'
  | 'merge';

/**
 * Snapshot of the provider's federation state. Mirrors fields surfaced by
 * `SyncCoordinator.getStatus()` so the adapter can pass them through
 * verbatim.
 */
export interface FederatedSyncStatus {
  /** True when the underlying transport is reachable and authenticated. */
  available: boolean;
  /** Epoch-ms of last successful sync; 0 if never synced. */
  lastSyncAt: number;
  /** Number of successful syncs over the provider's lifetime. */
  syncCount: number;
  /** Total items (episodes + skills + edges) synced across all calls. */
  itemsSynced: number;
  /** Number of errors observed during sync attempts. */
  errors: number;
}

/**
 * Sync direction report — returned by `push()` and `pull()`. Subset of
 * `SyncCoordinator.SyncReport` so consumers don't need to reach into
 * agentdb's type surface.
 */
export interface FederatedSyncReport {
  success: boolean;
  durationMs: number;
  itemsTransferred: number;
  conflictsResolved: number;
  errors: string[];
}

/**
 * FederatedSyncProvider interface — surface that `AutopilotLearning` consumes.
 *
 * Method contracts:
 *
 * - `notifyEpisode(episode)`: called from `AutopilotLearning._record` after
 *   every successful episode write. Provider MAY use this to trigger an
 *   eager push or buffer for batching. Errors MUST propagate — no silent
 *   catch in caller (per `feedback-no-fallbacks`).
 *
 * - `push()`: flush local changes since last sync to the remote peer.
 *   Resolves with a per-direction report. Errors MUST propagate.
 *
 * - `pull()`: fetch remote changes since last sync and apply locally.
 *   Resolves with a per-direction report. Errors MUST propagate.
 *
 * - `status()`: synchronous snapshot of provider state. Never throws.
 *
 * - `conflictStrategy()`: synchronous accessor for the configured strategy.
 *   Never throws.
 *
 * - `getLocalInstallId()`: stable identifier for this install, used as the
 *   `originInstallId` on outgoing episodes. Synchronous; never throws.
 */
export interface FederatedSyncProvider {
  notifyEpisode(episode: AutopilotEpisode): Promise<void>;
  push(): Promise<FederatedSyncReport>;
  pull(): Promise<FederatedSyncReport>;
  status(): FederatedSyncStatus;
  conflictStrategy(): ConflictResolutionStrategy;
  getLocalInstallId(): string;
}

/**
 * No-op provider — the default `AutopilotLearning` uses when no real provider
 * is wired. Preserves single-install behaviour: episode writes still go to
 * the local SQL `episodes` table via `AgentDBService.storeEpisode`, and no
 * cross-install sync happens.
 *
 * Returns a stable `local` install id so callers that always read
 * `getLocalInstallId()` (and pass it through to other systems) don't need to
 * special-case the no-op path. `latest-wins` strategy matches the
 * `SyncCoordinator` default.
 */
export class NoopFederatedSyncProvider implements FederatedSyncProvider {
  /**
   * Returns 'local' rather than a generated UUID. Real providers (the
   * `SyncCoordinatorFederatedAdapter`) generate / persist a UUID; the no-op
   * keeps a fixed sentinel so test fixtures don't have to mock around it.
   */
  getLocalInstallId(): string {
    return 'local';
  }

  /**
   * No-op. Per the interface contract, real providers MUST propagate errors;
   * the no-op's contract is "always succeed, never produce side effects."
   */
  async notifyEpisode(_episode: AutopilotEpisode): Promise<void> {
    // Intentionally empty — single-install default has nothing to notify.
  }

  async push(): Promise<FederatedSyncReport> {
    return {
      success: true,
      durationMs: 0,
      itemsTransferred: 0,
      conflictsResolved: 0,
      errors: [],
    };
  }

  async pull(): Promise<FederatedSyncReport> {
    return {
      success: true,
      durationMs: 0,
      itemsTransferred: 0,
      conflictsResolved: 0,
      errors: [],
    };
  }

  status(): FederatedSyncStatus {
    return {
      available: false,
      lastSyncAt: 0,
      syncCount: 0,
      itemsSynced: 0,
      errors: 0,
    };
  }

  conflictStrategy(): ConflictResolutionStrategy {
    return 'latest-wins';
  }
}
