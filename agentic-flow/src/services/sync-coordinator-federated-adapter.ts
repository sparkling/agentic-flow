/**
 * SyncCoordinatorFederatedAdapter — ADR-0196 Phase 5
 *
 * Thin adapter that implements `FederatedSyncProvider` by delegating to
 * agentdb's `SyncCoordinator`. Per ADR-0196 (Option 2), this adapter is the
 * autopilot-side consumer for the existing federation substrate (`QUICServer`
 * + `QUICClient` + `SyncCoordinator` + `VectorClock` CRDT primitives in
 * `forks/agentdb`), so the runtime ADR's job narrows to "pick a QUIC binding
 * and wire the socket" rather than "design federation semantics from
 * scratch."
 *
 * Per `feedback-no-fallbacks`: this adapter does NOT swallow errors from the
 * underlying `SyncCoordinator`. Any throw from `sync()` propagates back to
 * the caller. `notifyEpisode` is a best-effort signal hook — see the
 * method's doc-comment for the contract.
 *
 * Install-id source (ADR-0196 open-question default A): a UUIDv4 persisted
 * at `<projectRoot>/.claude-flow/install-id`, generated on first read. Stable
 * across process restarts; deliberately NOT a hostname/machine-id derivative
 * so that two installs on the same host (e.g., dev + scratch checkouts) get
 * distinct ids.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { AutopilotEpisode } from '../coordination/autopilot-learning.js';
import type {
  ConflictResolutionStrategy,
  FederatedSyncProvider,
  FederatedSyncReport,
  FederatedSyncStatus,
} from './federated-sync-provider.js';

/**
 * Minimal `SyncCoordinator` surface used by the adapter. Mirrors the shape at
 * `forks/agentdb/src/controllers/SyncCoordinator.ts` (bidirectional `sync` +
 * status accessor + config). Declared as an interface rather than a `typeof`
 * import so the adapter compiles even when the agentdb package's
 * `SyncCoordinator` is unavailable at type-check time.
 *
 * The `sync()` signature here accepts a single optional progress callback
 * because that is the surface `AgentDBService.syncWithRemote` already
 * targets (`agentdb-service.ts:1546`). The real `SyncCoordinator.sync`
 * takes `(ctx, onProgress)` — `AgentDBService` is responsible for threading
 * the MutationContext when the real sync runs. This adapter sits one layer
 * above and does not mint contexts.
 */
export interface SyncCoordinatorLike {
  sync(onProgress?: (progress: unknown) => void): Promise<{
    success: boolean;
    durationMs?: number;
    itemsPushed?: number;
    itemsPulled?: number;
    conflictsResolved?: number;
    errors?: string[];
  }>;
  getStatus?(): {
    isSyncing?: boolean;
    state?: {
      lastSyncAt?: number;
      syncCount?: number;
      totalItemsSynced?: number;
      lastError?: string;
    };
  };
}

/**
 * Adapter config. `syncCoordinator` is the agentdb instance (typically
 * `AgentDBService.syncCoordinator`). `projectRoot` defaults to `process.cwd()`
 * and is the parent directory of `.claude-flow/install-id`. `strategy`
 * defaults to `latest-wins` to match `SyncCoordinator.ts:84`.
 */
export interface SyncCoordinatorFederatedAdapterConfig {
  syncCoordinator: SyncCoordinatorLike;
  projectRoot?: string;
  strategy?: ConflictResolutionStrategy;
}

const INSTALL_ID_FILENAME = 'install-id';
const CLAUDE_FLOW_DIR = '.claude-flow';

/**
 * Read or create the install-id at `<projectRoot>/.claude-flow/install-id`.
 *
 * - If the file exists and contains a non-empty trimmed string, return it.
 * - Otherwise generate a UUIDv4, write it, and return it.
 *
 * Errors from FS operations propagate per `feedback-no-fallbacks`. A missing
 * `.claude-flow/` directory is created with mode 0700 (the install-id is not
 * a secret, but is per-user data — restrict to the owner).
 */
function getOrCreateInstallId(projectRoot: string): string {
  const dir = path.join(projectRoot, CLAUDE_FLOW_DIR);
  const file = path.join(dir, INSTALL_ID_FILENAME);
  if (existsSync(file)) {
    const raw = readFileSync(file, 'utf-8').trim();
    if (raw.length > 0) return raw;
  }
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const id = randomUUID();
  writeFileSync(file, id + '\n', { encoding: 'utf-8', mode: 0o600 });
  return id;
}

export class SyncCoordinatorFederatedAdapter implements FederatedSyncProvider {
  private readonly _syncCoordinator: SyncCoordinatorLike;
  private readonly _installId: string;
  private readonly _strategy: ConflictResolutionStrategy;

  constructor(config: SyncCoordinatorFederatedAdapterConfig) {
    if (!config.syncCoordinator) {
      throw new Error(
        '[SyncCoordinatorFederatedAdapter] syncCoordinator is required (per ADR-0196 Phase 5 — Option 2 adapter pre-commits to agentdb\'s SyncCoordinator substrate)',
      );
    }
    this._syncCoordinator = config.syncCoordinator;
    this._installId = getOrCreateInstallId(config.projectRoot ?? process.cwd());
    this._strategy = config.strategy ?? 'latest-wins';
  }

  getLocalInstallId(): string {
    return this._installId;
  }

  conflictStrategy(): ConflictResolutionStrategy {
    return this._strategy;
  }

  /**
   * Best-effort signal hook. The default contract is "do nothing" because
   * episodes already flow into the local SQL `episodes` table via
   * `AgentDBService.storeEpisode` → `ReflexionMemory`, which
   * `SyncCoordinator.detectChanges()` picks up on the next `sync()` call.
   * The future QUIC-streaming provider will override this to trigger an
   * eager push.
   *
   * Per `feedback-no-fallbacks`: this method does NOT silence errors. The
   * default no-op trivially succeeds; if an override throws, the caller in
   * `AutopilotLearning._record` will propagate.
   */
  async notifyEpisode(_episode: AutopilotEpisode): Promise<void> {
    // Default: rely on `SyncCoordinator.detectChanges()` to surface the
    // episode on next sync. No eager push without a real QUIC transport.
  }

  /**
   * Push local changes to the remote peer.
   *
   * Delegates to `SyncCoordinator.sync()`, which is bidirectional — there is
   * no push-only call in the underlying surface. We surface only the
   * `itemsPushed` slice in the report. Errors propagate.
   */
  async push(): Promise<FederatedSyncReport> {
    const result = await this._syncCoordinator.sync();
    return {
      success: result.success === true,
      durationMs: result.durationMs ?? 0,
      itemsTransferred: result.itemsPushed ?? 0,
      conflictsResolved: result.conflictsResolved ?? 0,
      errors: result.errors ?? [],
    };
  }

  /**
   * Pull remote changes and apply locally.
   *
   * Delegates to `SyncCoordinator.sync()`, which is bidirectional. We
   * surface only the `itemsPulled` slice in the report. Errors propagate.
   */
  async pull(): Promise<FederatedSyncReport> {
    const result = await this._syncCoordinator.sync();
    return {
      success: result.success === true,
      durationMs: result.durationMs ?? 0,
      itemsTransferred: result.itemsPulled ?? 0,
      conflictsResolved: result.conflictsResolved ?? 0,
      errors: result.errors ?? [],
    };
  }

  /**
   * Synchronous status snapshot. Reads from `SyncCoordinator.getStatus()`
   * if available; falls back to a zeroed snapshot when not (older
   * `SyncCoordinator` versions or test doubles). The zeroed snapshot is
   * NOT a silent failure — it's the documented "no syncs yet" state.
   */
  status(): FederatedSyncStatus {
    if (typeof this._syncCoordinator.getStatus !== 'function') {
      return {
        available: false,
        lastSyncAt: 0,
        syncCount: 0,
        itemsSynced: 0,
        errors: 0,
      };
    }
    const raw = this._syncCoordinator.getStatus();
    return {
      available: raw?.state !== undefined,
      lastSyncAt: raw?.state?.lastSyncAt ?? 0,
      syncCount: raw?.state?.syncCount ?? 0,
      itemsSynced: raw?.state?.totalItemsSynced ?? 0,
      errors: raw?.state?.lastError ? 1 : 0,
    };
  }
}
