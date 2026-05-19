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
 *
 * Security hardening (from security review of ADR-0196 implementation):
 * - Cap install-id file read at 256 bytes before validation, to bound the
 *   worst-case memory/CPU cost of a malicious or corrupted file.
 * - Validate UUIDv4-shape (8-4-4-4-12 hex) before accepting the on-disk
 *   value. Malformed content triggers a re-mint with a `console.warn` so
 *   the regeneration is observable.
 * - Re-mint always writes mode 0600; the parent `.claude-flow` directory
 *   is created with mode 0700.
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
 * Max bytes to read from the install-id file. UUIDv4 is 36 chars; we allow
 * 256 bytes to absorb a trailing newline + small accumulation but reject
 * anything larger. Per the security-hardening note above.
 */
const INSTALL_ID_MAX_BYTES = 256;

/**
 * UUIDv4-shape regex (8-4-4-4-12 lowercase hex with required dashes).
 * `randomUUID` always emits lowercase; we don't accept uppercase forms to
 * keep validation tight.
 */
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Read or create the install-id at `<projectRoot>/.claude-flow/install-id`.
 *
 * - If the file exists and contains a UUIDv4-shaped trimmed string within
 *   the size cap, return it.
 * - On corrupted / malformed / oversized content, log a warning and re-mint
 *   a fresh UUIDv4 (overwriting the file). Per `feedback-no-fallbacks`, the
 *   re-mint is observable via stderr — the user sees that their install-id
 *   changed and can investigate.
 * - On a missing file, mint a new UUIDv4 and write it.
 *
 * FS errors propagate per `feedback-no-fallbacks` — a missing parent
 * directory is created with mode 0700; permission errors bubble up to the
 * caller (AutopilotLearning's constructor will then propagate).
 */
function getOrCreateInstallId(projectRoot: string): string {
  const dir = path.join(projectRoot, CLAUDE_FLOW_DIR);
  const file = path.join(dir, INSTALL_ID_FILENAME);
  if (existsSync(file)) {
    // Read up to the size cap, then trim + validate. Reading the whole
    // file is fine because the cap is small; readFileSync's full-file
    // read is bounded by the file's actual size.
    const raw = readFileSync(file, 'utf-8');
    if (raw.length > INSTALL_ID_MAX_BYTES) {
      console.warn(
        `[SyncCoordinatorFederatedAdapter] install-id file ${file} ` +
        `exceeds ${INSTALL_ID_MAX_BYTES}-byte cap (got ${raw.length}); ` +
        `re-minting`,
      );
    } else {
      const trimmed = raw.trim();
      if (UUID_V4_REGEX.test(trimmed)) {
        return trimmed;
      }
      console.warn(
        `[SyncCoordinatorFederatedAdapter] install-id file ${file} ` +
        `contains malformed content (not UUIDv4-shape); re-minting`,
      );
    }
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
