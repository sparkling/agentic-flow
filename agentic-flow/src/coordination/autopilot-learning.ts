/**
 * AutopilotLearning — Phase 2 + ADR-0194 Phase 3 implementation
 *
 * ADR-058 + ADR-072 + ADR-0192 Phase 1 + ADR-0193 Items A+B + ADR-0194:
 * learning loop for the autopilot system. AgentDB-backed episode log +
 * frequency-aggregated pattern discovery + embedding-cluster pattern
 * discovery + embedding-based recall + SonaRvfService-backed RL
 * trajectory recording + reward-shaped persistence + retention cap.
 * Graceful-unavailable when AgentDB isn't reachable.
 *
 * ADR-0194 Phase 3: `discoverPatternsByEmbedding` clusters episode
 * subjects by cosine similarity over their embeddings (greedy single-
 * pass, threshold default 0.75 matching MemoryConsolidation). Phase 2's
 * keyword path is NOT replaced — both algorithms run in
 * `discoverSuccessPatterns` and the union is returned. Each result is
 * tagged with `source: 'phase2-keyword' | 'phase3-embedding'` so
 * consumers can distinguish them.
 *
 * Storage strategy:
 *   Episodes flow through AgentDBService.storeEpisode (the existing
 *   ReflexionMemory-backed API). The episode's `sessionId` is set to
 *   the EPISODE_SESSION_ID constant so we can list autopilot episodes
 *   via the metadata filter without re-indexing other reflexion data.
 *   This reuses the existing schema rather than introducing a new
 *   namespace.
 *
 *   Trajectories flow through the process-local SonaRvfService
 *   singleton (sona-rvf-service.ts:beginTrajectory/addStep/endTrajectory).
 *   The autopilot opens at most one active trajectory at a time;
 *   `recordIterationStep` opens lazily on first call and appends; the
 *   matching `endSwarmTrajectory` closes it. AutopilotLearning tracks
 *   its own counter (_trajectoriesOpened) for getMetrics().trajectories
 *   so the surfaced count is autopilot-specific rather than a
 *   process-wide aggregate of every SonaRvfService consumer.
 */

// === PHASE 4 BEGIN (ADR-0195 cross-controller event bus) ===
import type { EventEmitter } from 'node:events';
// === PHASE 4 END ===

// === PHASE 5 BEGIN (ADR-0196 federation imports) ===
import type { VectorClock } from 'agentdb';
import { incrementVectorClock, createVectorClock } from 'agentdb';
import type { FederatedSyncProvider } from '../services/federated-sync-provider.js';
import { NoopFederatedSyncProvider } from '../services/federated-sync-provider.js';
// === PHASE 5 END ===

export interface AutopilotEpisode {
  taskId: string;
  subject: string;
  status: 'completed' | 'blocked' | 'failed' | string;
  iterations: number;
  durationMs: number;
  reward?: number;            // computed default: +1 success, -1 failure
  critique?: string;
  timestamp?: number;         // set by record* methods on write
  sessionId?: string;         // analytics only; not used for partitioning
  // === PHASE 5 BEGIN (ADR-0196 federated identity fields) ===
  /**
   * ADR-0196 Phase 5: stable origin identifier for federation. Populated
   * by `_record` from the configured `FederatedSyncProvider.getLocalInstallId()`
   * before persistence — per `feedback-no-fallbacks`, ALWAYS the
   * provider's value, never a caller-supplied literal. Optional on the
   * public surface so existing callers that construct episode literals
   * don't have to know about federation.
   */
  originInstallId?: string;
  /**
   * ADR-0196 Phase 5: vector clock for CRDT-style conflict resolution.
   * Advanced by `_record` via `incrementVectorClock(prev, installId)`
   * AFTER each successful `storeEpisode` — see security review
   * hardening (Phase 5 commit message). Carried through episode
   * metadata so `SyncCoordinator` / future `EpisodeSync.causalClock`
   * can use it without a separate lookup.
   *
   * Typed as `VectorClock` from agentdb; optional here so episodes built
   * before federation is wired remain typed-compatible.
   */
  vectorClock?: VectorClock;
  // === PHASE 5 END ===
}

export interface DiscoveredPattern {
  pattern: string;            // human-readable subject-keyword (Phase 2) or cluster centroid-nearest subject (Phase 3)
  frequency: number;          // # episodes matching
  avgReward: number;          // mean reward over matching episodes
  /**
   * ADR-0194 Phase 3: discriminator for the producer algorithm. Existing
   * consumers that ignore unknown fields are unaffected. New consumers
   * can branch on this to A/B compare the two discovery strategies.
   *
   * - `'phase2-keyword'`: produced by `_aggregatePatterns` (ADR-058,
   *   token-frequency aggregation over ≥4-char tokens).
   * - `'phase3-embedding'`: produced by `discoverPatternsByEmbedding`
   *   (greedy cosine-similarity clustering on episode-subject embeddings,
   *   default threshold 0.75 per `MemoryConsolidation.clusterMemories`).
   */
  source: 'phase2-keyword' | 'phase3-embedding';
}

/**
 * ADR-0194 Phase 3: knobs for the embedding-cluster algorithm. Mirrors
 * `MemoryConsolidation`'s `clusterThreshold` / `maxClusterSize` /
 * `minClusterSize` to keep the algorithm comparable with the in-tree
 * precedent. Defaults match `MemoryConsolidation.clusterMemories`
 * (threshold 0.75) and `_aggregatePatterns` (min size 2).
 */
export interface AutopilotLearningConfig {
  /** Cosine similarity threshold for cluster membership. Default 0.75. */
  embeddingClusterThreshold?: number;
  /** Maximum members per cluster (safety cap). Default 100. */
  embeddingClusterMaxSize?: number;
  /** Minimum members to emit a pattern. Default 2 (matches Phase 2 `count >= 2`). */
  embeddingClusterMinSize?: number;
  /**
   * ADR-0194 security hardening: maximum episodes fed into a single
   * `discoverPatternsByEmbedding` call. Defense-in-depth against the
   * greedy clustering's O(n²) worst case. Default 1000.
   */
  maxEpisodesPerClustering?: number;
}

export interface ReEngagementContext {
  pastFailures: Array<{ task: string; critique?: string; reward: number }>;
  pastSuccesses: Array<{ task: string; reward: number }>;
  patterns: DiscoveredPattern[];
  recommendations: string[];  // surfaced from top patterns + failure critiques
  confidence: number;         // 0-1 = min(1, episodes / 50)
}

export interface LearningMetrics {
  available: boolean;
  episodes: number;
  patterns: number;
  trajectories: number;       // ADR-0193 Item B: count of swarm trajectories opened in this process
}

// ─────────────────────────────────────────────────────────────────────

/**
 * sessionId used for every autopilot episode write. Lets us scope
 * `recallEpisodes` queries to the autopilot subset via metadata filter
 * without colliding with the host process's reflexion sessions.
 */
const EPISODE_SESSION_ID = 'autopilot:phase1';

/** Episode count at which confidence saturates to 1.0. */
const CONFIDENCE_FLOOR = 50;

/** Upper bound on how many episodes we pull for in-memory aggregation. */
const MAX_LIST = 1000;

/**
 * ADR-0193 Item A.4: episode retention cap. After every successful
 * `_record`, if the listing exceeds this, the oldest entries are
 * evicted via `AgentDBService.deleteEpisode`. Default 10000; override
 * via `AUTOPILOT_EPISODE_CAP` env var. Set to a small value in tests
 * that need to exercise the eviction path without populating 10k rows.
 *
 * Evaluated lazily on every retention enforcement so tests can mutate
 * `process.env.AUTOPILOT_EPISODE_CAP` after module load without
 * needing a re-import. The const-vs-getter trade-off is small here —
 * the cost is one env-var read per `_record`.
 */
function _readEpisodeCap(): number {
  const raw = process.env.AUTOPILOT_EPISODE_CAP;
  if (!raw) return 10000;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
}

/** ADR-0193 Item A.3: numeric helpers for the shaped-reward formula. */
function _clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

function _median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Narrowed SonaRvfService surface used by AutopilotLearning. The full
 * SonaRvfService has 13+ methods; this interface declares only the
 * four needed for trajectory recording so the public surface that
 * leaks through AgentDBLike stays small.
 *
 * Methods MUST mirror sona-rvf-service.ts (lines 94-156). `getStats`
 * returns process-wide totals (not autopilot-specific); the autopilot
 * tracks its own counter for `getMetrics().trajectories`.
 */
interface SonaServiceLike {
  beginTrajectory(): { id: string };
  addStep(
    trajectoryId: string,
    step: { state: string; action: string; reward: number },
  ): unknown;
  endTrajectory(trajectoryId: string): unknown;
  getStats(): { totalTrajectories: number; totalSteps: number };
}

interface AgentDBLike {
  storeEpisode(episode: {
    sessionId: string;
    task: string;
    reward: number;
    success: boolean;
    critique?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string>;
  recallEpisodes(
    query: string,
    limit?: number,
    filters?: Record<string, unknown>,
  ): Promise<Array<{
    id?: number | string;
    sessionId?: string;
    task?: string;
    reward?: number;
    success?: boolean;
    critique?: string;
    metadata?: Record<string, unknown>;
    ts?: number;
  }>>;
  /**
   * ADR-0193 Item A.4: delete a single episode by id. Optional on the
   * interface — when missing (older AgentDBService versions or test
   * doubles), the retention cap becomes soft-only and logs a warning
   * instead of evicting.
   */
  deleteEpisode?(id: number | string): Promise<boolean>;
  /**
   * ADR-0193 Item B: returns the process-local SonaRvfService instance
   * for trajectory recording. Optional on the interface to keep
   * graceful-unavailable when test doubles omit it; the trajectory
   * methods early-return with a console.error when absent.
   */
  getSonaService?(): Promise<SonaServiceLike>;
  getFallbackStatus?(): { degraded?: boolean; backend?: string; initError?: string | null };
  /**
   * ADR-0194 Phase 3: batched embedding generation for cluster discovery.
   * AgentDBService exposes both single (`generateEmbedding`) and batched
   * (`generateEmbeddings`) variants; we declare both as optional and
   * prefer the batched call site (10-100× faster per ADR-063).
   *
   * Per `feedback-no-fallbacks`: when these are missing,
   * `discoverPatternsByEmbedding` throws rather than silently returning
   * an empty cluster set. There is no keyword-only "fallback" — the
   * Phase 2 keyword path still runs unconditionally; Phase 3 either
   * works or surfaces a real error.
   */
  generateEmbedding?(text: string): Promise<number[]>;
  generateEmbeddings?(texts: string[]): Promise<number[][]>;
  // === PHASE 4 BEGIN (ADR-0195 cross-controller event bus accessor) ===
  /**
   * ADR-0195 Phase 4: accessor for the shared cross-controller event bus.
   * AutopilotLearning emits four events (episode:recorded /
   * trajectory:opened / trajectory:step / trajectory:closed) via
   * `_resolveEventBus`. Optional on the interface so test doubles that
   * don't care about the bus can omit it; `_resolveEventBus` returns
   * null when absent.
   */
  getLearningEvents?(): EventEmitter;
  // === PHASE 4 END ===
}

/**
 * ADR-0194 Phase 3: resolved-defaults shape used internally.
 *
 * `maxEpisodesPerClustering` (ADR-0194 security hardening, default 1000)
 * caps how many episodes are fed into `discoverPatternsByEmbedding`
 * per call — defense-in-depth against greedy clustering's O(n²)
 * worst case. The autopilot's normal corpus is well below this cap;
 * the bound surfaces a clear error rather than a silent slowdown when
 * a misconfigured retention cap explodes the input set.
 */
interface ResolvedClusterConfig {
  threshold: number;
  maxSize: number;
  minSize: number;
  maxEpisodesPerClustering: number;
}

export class AutopilotLearning {
  private _available = false;
  private _agentdb: AgentDBLike | null = null;

  /**
   * ADR-0194 Phase 3: resolved cluster knobs. Mutable via
   * `configure(config)` so populated tests can sweep the threshold
   * without reconstructing the instance. `maxEpisodesPerClustering`
   * is the ADR-0194 security-hardening defense-in-depth cap.
   */
  private _clusterConfig: ResolvedClusterConfig = {
    threshold: 0.75,
    maxSize: 100,
    minSize: 2,
    maxEpisodesPerClustering: 1000,
  };

  /**
   * ADR-0193 Item B: id of the currently-open SonaRvfService trajectory,
   * or null when no swarm is in progress. `recordIterationStep` opens
   * lazily on first call; `endSwarmTrajectory` closes and resets to null.
   */
  private _activeTrajectoryId: string | null = null;

  /**
   * ADR-0193 Item B: total count of trajectories this AutopilotLearning
   * instance has OPENED (incremented in recordIterationStep when
   * _activeTrajectoryId transitions from null → id). Surfaced via
   * `getMetrics().trajectories`. This is autopilot-specific — we don't
   * read SonaRvfService.getStats() because that's a process-wide
   * aggregate including any non-autopilot consumer.
   */
  private _trajectoriesOpened = 0;

  // === PHASE 5 BEGIN (ADR-0196 federation provider) ===
  /**
   * ADR-0196 Phase 5: federated sync provider. Default
   * `NoopFederatedSyncProvider` preserves single-install behaviour
   * (episode writes go to the local SQL `episodes` table only). A real
   * provider (e.g., `SyncCoordinatorFederatedAdapter`) is injected via
   * the constructor to enable cross-install sync via agentdb's
   * `SyncCoordinator`.
   *
   * Held as a class field rather than a constructor arg pass-through so
   * `_record` can call `provider.notifyEpisode(episode)` after every
   * successful write without re-reading constructor args.
   */
  private readonly _syncProvider: FederatedSyncProvider;

  /**
   * ADR-0196 Phase 5: vector clock state for this instance. Each
   * `_record` call invokes `incrementVectorClock(prev, installId)` on
   * this clock AFTER the storeEpisode write succeeds (per security
   * review — failing writes must not leak clock ticks). Matches
   * `EpisodeSync.causalClock` (`forks/agentdb/src/types/quic.ts`) —
   * empty clock at boot, advances on each successful write.
   *
   * NOTE: process-local. When two AutopilotLearning instances share an
   * install-id (e.g., crash + restart), the post-restart clock restarts
   * at zero. The future federation-runtime ADR must persist the latest
   * clock alongside the install-id and rehydrate on boot. Tracked as a
   * follow-up in ADR-0196's open questions.
   */
  private _vectorClock: VectorClock;

  /**
   * ADR-0196 Phase 5: optional constructor. When `provider` is omitted,
   * the no-op default runs and Phase 5 federation stays inactive — same
   * observable behaviour as Phase 2/3/4. Optionality preserves the
   * `new AutopilotLearning()` call shape every existing caller uses
   * (autopilot-hook.mjs, populated test harness, etc.).
   */
  constructor(provider?: FederatedSyncProvider) {
    this._syncProvider = provider ?? new NoopFederatedSyncProvider();
    this._vectorClock = createVectorClock();
  }

  /**
   * ADR-0196 Phase 5: public accessor for the configured sync provider.
   * Used by the `autopilot federation status` CLI subcommand to surface
   * the live provider state. When the constructor was called without an
   * argument, this returns the `NoopFederatedSyncProvider` — which is an
   * honest "single-install" state, not a fallback (per
   * `feedback-no-fallbacks`).
   */
  getSyncProvider(): FederatedSyncProvider {
    return this._syncProvider;
  }
  // === PHASE 5 END ===

  async initialize(): Promise<boolean> {
    try {
      const svc = await import('../services/agentdb-service.js');
      const inst = await svc.getAgentDBService?.();
      if (!inst) {
        // ADR-0191 §absence-not-accepted: log reason directly at the
        // producer boundary (in addition to the doctor's consumer-side
        // surface) so a Reason #5 absence is observable in stderr at
        // startup.
        console.error('[AutopilotLearning] unavailable: getAgentDBService() returned null');
        this._available = false;
        return false;
      }
      // Runtime-guarded narrowing — the typeof checks below are the
      // structural check; single cast is sufficient.
      const asAdb = inst as AgentDBLike;
      // The AgentDBService surface we depend on: storeEpisode +
      // recallEpisodes. If either is missing, treat as unavailable
      // rather than throwing on first use.
      if (typeof asAdb.storeEpisode !== 'function'
          || typeof asAdb.recallEpisodes !== 'function') {
        console.error('[AutopilotLearning] unavailable: AgentDBService missing storeEpisode/recallEpisodes — version mismatch?');
        this._available = false;
        return false;
      }
      // ADR-0192: AgentDBService runs in DEGRADED mode when its underlying
      // `agentdb` package import or init fails (e.g., `AgentDB is not a
      // constructor` if the package shape doesn't match expectations).
      // In that mode, `storeEpisode` throws via `assertPersistent` — every
      // `recordTaskCompletion` would explode at runtime. Surface this as
      // graceful-unavailable here so consumers see a typed `available:false`
      // (the absence-not-accepted contract) rather than a midstream throw.
      if (typeof asAdb.getFallbackStatus === 'function') {
        try {
          const status = asAdb.getFallbackStatus();
          if (status?.degraded === true) {
            console.error(`[AutopilotLearning] unavailable: AgentDBService DEGRADED (backend=${status?.backend ?? 'unknown'}, initError=${status?.initError ?? 'unknown'})`);
            this._available = false;
            return false;
          }
        } catch (statusErr) {
          // getFallbackStatus shouldn't throw, but if it does treat as
          // an unknown state and refuse to claim availability.
          console.error(`[AutopilotLearning] unavailable: getFallbackStatus() threw: ${statusErr instanceof Error ? statusErr.message : String(statusErr)}`);
          this._available = false;
          return false;
        }
      }
      this._agentdb = asAdb;
      this._available = true;
      return true;
    } catch (initErr) {
      // ADR-0191 §absence-not-accepted: log the actual error so a Reason #5
      // packaging condition vs an unexpected non-packaging error is
      // discriminable in stderr.
      console.error(`[AutopilotLearning] unavailable: initialize() threw: ${initErr instanceof Error ? initErr.message : String(initErr)}`);
      this._available = false;
      return false;
    }
  }

  isAvailable(): boolean { return this._available; }

  async recordTaskCompletion(ep: AutopilotEpisode): Promise<void> {
    return this._record(ep, ep.reward ?? +1, true);
  }

  async recordTaskFailure(ep: AutopilotEpisode): Promise<void> {
    return this._record(ep, ep.reward ?? -1, false);
  }

  /**
   * ADR-0193 Item B: real per-iteration trajectory step recording.
   *
   * `progress` becomes the step's reward (0 for non-numeric); `drift`
   * (DriftDetector signals) is encoded into `action` (`drift:N` when
   * non-empty, `progress` baseline otherwise). `state` is `iter:<N>`
   * so consecutive steps form an ordered trace.
   *
   * Errors from SonaRvfService are logged via `console.error` and NOT
   * silently swallowed (per `feedback-no-fallbacks`). The trajectory
   * counter increments only when `beginTrajectory` returns a usable id,
   * keeping `getMetrics().trajectories` honest.
   */
  async recordIterationStep(progress: unknown, drift: unknown[]): Promise<void> {
    const sona = await this._resolveSona('recordIterationStep');
    if (!sona) return;
    if (this._activeTrajectoryId === null) {
      let trajectory: { id: string };
      try {
        trajectory = sona.beginTrajectory();
      } catch (err) {
        console.error(`[AutopilotLearning] recordIterationStep: beginTrajectory threw: ${this._errMsg(err)}`);
        return;
      }
      if (!trajectory || typeof trajectory.id !== 'string') {
        console.error('[AutopilotLearning] recordIterationStep: beginTrajectory returned falsy or missing id');
        return;
      }
      this._activeTrajectoryId = trajectory.id;
      this._trajectoriesOpened++;
      // === PHASE 4 BEGIN (ADR-0195 trajectory:opened emit) ===
      this._emitLearningEvent('trajectory:opened', {
        trajectoryId: trajectory.id,
        openedAt: Date.now(),
      }, 'recordIterationStep');
      // === PHASE 4 END ===
    }
    const stepIndex = Array.isArray(drift) ? drift.length : 0;
    const actionLabel = Array.isArray(drift) && drift.length > 0 ? `drift:${drift.length}` : 'progress';
    const rewardValue = typeof progress === 'number' && Number.isFinite(progress) ? progress : 0;
    try {
      sona.addStep(this._activeTrajectoryId, {
        state: `iter:${stepIndex}`,
        action: actionLabel,
        reward: rewardValue,
      });
      // === PHASE 4 BEGIN (ADR-0195 trajectory:step emit) ===
      // Emit only when addStep succeeded — failed addStep means no
      // step was actually recorded, so a downstream consumer would
      // see a phantom signal otherwise.
      this._emitLearningEvent('trajectory:step', {
        trajectoryId: this._activeTrajectoryId,
        state: `iter:${stepIndex}`,
        action: actionLabel,
        reward: rewardValue,
      }, 'recordIterationStep');
      // === PHASE 4 END ===
    } catch (err) {
      // Trajectory id is still open; subsequent steps may succeed.
      console.error(`[AutopilotLearning] recordIterationStep: addStep threw: ${this._errMsg(err)}`);
    }
  }

  /**
   * ADR-0193 Item B: close the active swarm trajectory. Silent no-op
   * when no trajectory was opened (defensive callers OK). `summary`
   * is reserved for future use — SonaRvfService.endTrajectory takes
   * only the id today.
   */
  async endSwarmTrajectory(_summary: unknown): Promise<void> {
    if (this._activeTrajectoryId === null) return;
    const trajectoryId = this._activeTrajectoryId;
    this._activeTrajectoryId = null;
    const sona = await this._resolveSona('endSwarmTrajectory');
    if (!sona) return;
    try {
      sona.endTrajectory(trajectoryId);
      // === PHASE 4 BEGIN (ADR-0195 trajectory:closed emit) ===
      // Emit only when endTrajectory succeeded — failed close means
      // SONA didn't finalize the trajectory, so subscribers would see
      // a misleading "closed" signal otherwise.
      this._emitLearningEvent('trajectory:closed', {
        trajectoryId,
        closedAt: Date.now(),
      }, 'endSwarmTrajectory');
      // === PHASE 4 END ===
    } catch (err) {
      console.error(`[AutopilotLearning] endSwarmTrajectory: endTrajectory threw: ${this._errMsg(err)}`);
    }
  }

  async discoverSuccessPatterns(): Promise<DiscoveredPattern[]> {
    if (!this._available) return [];
    const episodes = await this._listEpisodes();
    const successful = episodes.filter(e => (e.reward ?? 0) > 0);
    // ADR-0194 Phase 3: Phase 2 keyword path + Phase 3 embedding-cluster
    // path run BOTH; results are unioned. Per the implementation brief:
    // keyword path is strictly preserved; cluster path is additive; the
    // `source` discriminator lets downstream consumers tell them apart.
    const phase2 = this._aggregatePatterns(successful);
    // Phase 3 needs ≥ minSize episodes to form a cluster. Short-circuit
    // the embedding-generation cost when the corpus is below threshold.
    if (successful.length < this._clusterConfig.minSize) {
      return phase2;
    }
    const phase3 = await this.discoverPatternsByEmbedding(successful);
    return [...phase2, ...phase3];
  }

  /**
   * ADR-0194 Phase 3: configure the embedding-cluster algorithm. Unset
   * keys keep their current value (defaults: threshold=0.75, maxSize=100,
   * minSize=2). Returns the resolved config snapshot for inspection.
   *
   * Threshold is bounded to `[0, 1]`; sizes must be positive integers.
   * Invalid inputs throw rather than silently coercing (per
   * `feedback-no-fallbacks`).
   */
  configure(config: AutopilotLearningConfig): ResolvedClusterConfig {
    if (config.embeddingClusterThreshold !== undefined) {
      const t = config.embeddingClusterThreshold;
      if (!Number.isFinite(t) || t < 0 || t > 1) {
        throw new Error(`[AutopilotLearning] embeddingClusterThreshold must be in [0,1], got ${t}`);
      }
      this._clusterConfig.threshold = t;
    }
    if (config.embeddingClusterMaxSize !== undefined) {
      const m = config.embeddingClusterMaxSize;
      if (!Number.isInteger(m) || m < 1) {
        throw new Error(`[AutopilotLearning] embeddingClusterMaxSize must be a positive integer, got ${m}`);
      }
      this._clusterConfig.maxSize = m;
    }
    if (config.embeddingClusterMinSize !== undefined) {
      const n = config.embeddingClusterMinSize;
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(`[AutopilotLearning] embeddingClusterMinSize must be a positive integer, got ${n}`);
      }
      this._clusterConfig.minSize = n;
    }
    if (config.maxEpisodesPerClustering !== undefined) {
      const cap = config.maxEpisodesPerClustering;
      if (!Number.isInteger(cap) || cap < 1) {
        throw new Error(`[AutopilotLearning] maxEpisodesPerClustering must be a positive integer, got ${cap}`);
      }
      this._clusterConfig.maxEpisodesPerClustering = cap;
    }
    return { ...this._clusterConfig };
  }

  /**
   * ADR-0194 Phase 3: cluster episodes by cosine-similarity over their
   * subject embeddings; emit one `DiscoveredPattern` per cluster with
   * `source: 'phase3-embedding'`.
   *
   * Algorithm (ported from
   * `forks/agentdb/src/controllers/MemoryConsolidation.ts:298-341`):
   *
   *   1. Sort episodes by id ascending (determinism per ADR-0194 risk
   *      mitigation — greedy ordering otherwise depends on storage
   *      iteration order).
   *   2. For each unassigned episode, seed a new cluster with that
   *      episode as the centroid.
   *   3. Scan remaining unassigned episodes; assign to the cluster
   *      when `cosineSimilarity(centroid, candidate) >= threshold`.
   *      Update centroid as the simple average of member embeddings
   *      after each assignment.
   *   4. After clustering, drop clusters below `minSize` (default 2,
   *      matching Phase 2's `count >= 2` filter).
   *   5. Label each surviving cluster with its centroid-nearest
   *      member's subject (the in-cluster representative). Cap output
   *      at 10 entries by frequency-desc, matching Phase 2's slice(0,10).
   *
   * Embeddings are sourced from `_agentdb.generateEmbeddings` (batched)
   * or `_agentdb.generateEmbedding` (single, per episode). Per
   * `feedback-no-fallbacks`: when both are missing, this method THROWS;
   * it does NOT silently return an empty cluster set. The Phase 2
   * keyword path still runs unconditionally inside
   * `discoverSuccessPatterns`, so a Phase 3 outage degrades to keyword
   * results loudly rather than silently.
   *
   * Returns `[]` when:
   * - the autopilot is unavailable (no throw — symmetric with Phase 2);
   * - the input is empty or smaller than `minSize`;
   * - clustering produces zero clusters of size ≥ `minSize`.
   */
  async discoverPatternsByEmbedding(
    episodes: AutopilotEpisode[],
  ): Promise<DiscoveredPattern[]> {
    // Per feedback-no-fallbacks: when the controller is unavailable or the
    // agentdb handle is null, the method cannot do its job. Throw instead of
    // returning an empty result, which would silently mask the degraded
    // state. discoverSuccessPatterns has its own outer `_available` guard
    // (~line 545) that returns the Phase-2-only union before reaching here.
    // Direct callers must check isAvailable() first.
    if (!this._available) {
      throw new Error(
        '[AutopilotLearning] discoverPatternsByEmbedding: controller not ' +
        'available (embeddings service did not initialise). Call ' +
        '`isAvailable()` before invoking, or use `discoverSuccessPatterns` ' +
        "which retains Phase 2's keyword discovery in degraded mode.",
      );
    }
    if (!this._agentdb) {
      throw new Error(
        '[AutopilotLearning] discoverPatternsByEmbedding: _agentdb is null ' +
        '(initialised state inconsistent — possible race with disable()).',
      );
    }
    if (episodes.length < this._clusterConfig.minSize) return [];
    // ADR-0194 security hardening: defense-in-depth cap on greedy
    // clustering's O(n²) worst case. Per `feedback-no-fallbacks`,
    // surface this loudly rather than silently truncating — the caller
    // can configure() a larger cap if they accept the cost.
    if (episodes.length > this._clusterConfig.maxEpisodesPerClustering) {
      throw new Error(
        `[AutopilotLearning] discoverPatternsByEmbedding: input size ` +
        `${episodes.length} exceeds maxEpisodesPerClustering=` +
        `${this._clusterConfig.maxEpisodesPerClustering} (ADR-0194 ` +
        `security cap on greedy clustering O(n²)). Configure a larger ` +
        `cap via configure({maxEpisodesPerClustering: N}) if the ` +
        `clustering cost is acceptable for the corpus size.`,
      );
    }
    // Per feedback-no-fallbacks: surface a real error if no embedding
    // surface is reachable. Phase 2 keyword discovery still runs above;
    // this throw bubbles to discoverSuccessPatterns and is the
    // discriminable failure signal.
    if (typeof this._agentdb.generateEmbeddings !== 'function'
        && typeof this._agentdb.generateEmbedding !== 'function') {
      throw new Error(
        '[AutopilotLearning] discoverPatternsByEmbedding: ' +
        'AgentDBService exposes neither generateEmbeddings nor ' +
        'generateEmbedding — Phase 3 unreachable. Upgrade AgentDBService ' +
        'or restrict callers to discoverSuccessPatterns (which retains ' +
        "Phase 2's keyword discovery).",
      );
    }
    // Determinism: sort by id ascending so the greedy seed order is
    // stable across runs. Episodes from `_listEpisodes` carry `id` via
    // `_rowToEpisode`; when absent (test doubles), fall back to subject
    // for a stable secondary order.
    type WithId = AutopilotEpisode & { id?: number | string };
    const sorted: WithId[] = [...episodes].sort((a, b) => {
      const ai = (a as WithId).id;
      const bi = (b as WithId).id;
      if (ai !== undefined && bi !== undefined) {
        const as = String(ai), bs = String(bi);
        if (as < bs) return -1;
        if (as > bs) return 1;
      } else if (ai !== undefined) return -1;
      else if (bi !== undefined) return 1;
      return a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0;
    });
    const subjects = sorted.map(e => e.subject);
    // Prefer batched embedding generation (10-100× faster per ADR-063);
    // fall through to per-episode generateEmbedding when only the single
    // variant is present.
    let rawEmbeddings: number[][];
    if (typeof this._agentdb.generateEmbeddings === 'function') {
      rawEmbeddings = await this._agentdb.generateEmbeddings(subjects);
    } else {
      // Known above: `generateEmbedding` is defined when `generateEmbeddings`
      // is not, by the early throw.
      const gen = this._agentdb.generateEmbedding!;
      rawEmbeddings = [];
      for (const s of subjects) {
        rawEmbeddings.push(await gen.call(this._agentdb, s));
      }
    }
    if (rawEmbeddings.length !== sorted.length) {
      throw new Error(
        `[AutopilotLearning] discoverPatternsByEmbedding: embedding ` +
        `count mismatch — expected ${sorted.length}, got ${rawEmbeddings.length}`,
      );
    }
    // Cast to Float32Array for the math hot loop (matches
    // MemoryConsolidation.clusterMemories' centroid type).
    const embeddings: Float32Array[] = rawEmbeddings.map(e => Float32Array.from(e));
    // Greedy clustering — mirror of MemoryConsolidation.clusterMemories
    // (lines 298-341).
    interface ProtoCluster {
      centroid: Float32Array;
      memberIndices: number[];
    }
    const clusters: ProtoCluster[] = [];
    const assigned = new Set<number>();
    const { threshold, maxSize, minSize } = this._clusterConfig;
    for (let i = 0; i < sorted.length; i++) {
      if (assigned.has(i)) continue;
      const seed: ProtoCluster = {
        // Clone the seed embedding — we mutate the centroid in-place
        // when averaging, and don't want to corrupt the source array.
        centroid: new Float32Array(embeddings[i]),
        memberIndices: [i],
      };
      assigned.add(i);
      for (let j = i + 1; j < sorted.length; j++) {
        if (assigned.has(j)) continue;
        if (seed.memberIndices.length >= maxSize) break;
        const sim = AutopilotLearning._cosine(seed.centroid, embeddings[j]);
        if (sim >= threshold) {
          seed.memberIndices.push(j);
          assigned.add(j);
          AutopilotLearning._updateCentroid(seed.centroid, seed.memberIndices, embeddings);
        }
      }
      clusters.push(seed);
    }
    // Drop sub-threshold-sized clusters, label, and compute reward.
    const surviving = clusters.filter(c => c.memberIndices.length >= minSize);
    const results: DiscoveredPattern[] = surviving.map(c => {
      // Centroid-nearest label: the in-cluster member with the highest
      // cosine to the final centroid. Defensive when ties or zero-norm
      // embeddings: pick the lowest-indexed member.
      let bestIdx = c.memberIndices[0];
      let bestSim = -Infinity;
      for (const memberIdx of c.memberIndices) {
        const sim = AutopilotLearning._cosine(c.centroid, embeddings[memberIdx]);
        if (sim > bestSim) {
          bestSim = sim;
          bestIdx = memberIdx;
        }
      }
      let rewardSum = 0;
      for (const memberIdx of c.memberIndices) {
        rewardSum += sorted[memberIdx].reward ?? 0;
      }
      return {
        pattern: sorted[bestIdx].subject,
        frequency: c.memberIndices.length,
        avgReward: rewardSum / c.memberIndices.length,
        source: 'phase3-embedding' as const,
      };
    });
    // Match Phase 2's frequency-desc + slice(0,10) ordering convention.
    return results
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);
  }

  /**
   * ADR-0194 Phase 3: cosine similarity between two equal-length
   * vectors. Mirrors `forks/agentdb/src/utils/similarity.ts` (the
   * function imported by `MemoryConsolidation.clusterMemories`).
   *
   * Returns 0 on zero-norm inputs to keep the clustering robust against
   * degenerate embeddings (the algorithm just won't merge them, which
   * is the desired behaviour).
   */
  private static _cosine(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      const av = a[i];
      const bv = b[i];
      dot += av * bv;
      normA += av * av;
      normB += bv * bv;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * ADR-0194 Phase 3: in-place centroid update — simple average of
   * member embeddings. Matches
   * `MemoryConsolidation.updateCentroid` (lines 346-359).
   */
  private static _updateCentroid(
    centroid: Float32Array,
    memberIndices: number[],
    allEmbeddings: Float32Array[],
  ): void {
    const dim = centroid.length;
    for (let i = 0; i < dim; i++) centroid[i] = 0;
    for (const idx of memberIndices) {
      const e = allEmbeddings[idx];
      for (let i = 0; i < dim; i++) centroid[i] += e[i];
    }
    const n = memberIndices.length;
    for (let i = 0; i < dim; i++) centroid[i] /= n;
  }

  /**
   * ADR-0193 Item A.2: embedding-based recall via
   * AgentDBService.recallEpisodes. The storage layer's `recallEpisodes`
   * already uses ReflexionMemory.retrieveRelevant (embedding-based
   * cosine similarity), so we delegate directly rather than re-fetching
   * the whole listing and filtering in-memory.
   *
   * No try/catch fallback to substring — if the embedder fails, let
   * the error propagate (per `feedback-no-fallbacks`). A silent
   * fallback would mask embedder regressions; the populated-suite
   * tests need to assert real embedding ordering.
   */
  async recallSimilarTasks(query: string, limit: number): Promise<AutopilotEpisode[]> {
    if (!this._available || !this._agentdb) return [];
    const rows = await this._agentdb.recallEpisodes(query, limit, {
      sessionId: EPISODE_SESSION_ID,
    });
    return rows.map(r => this._rowToEpisode(r));
  }

  /**
   * ADR-0193 Item A.1: real next-action prediction.
   *
   * Pulls the top-10 similar episodes via `recallSimilarTasks`, tallies
   * their `status` distribution, and returns the most-frequent value
   * as the predicted action. Confidence:
   *
   *   confidence = unanimity × log(matchCount + 1) / log(11)
   *
   * - unanimity ∈ [0,1] is the fraction of matches voting for the
   *   winning action (1.0 when all matches agree, 1/N when uniformly
   *   spread).
   * - log(matchCount+1)/log(11) saturates at 1.0 when matchCount=10
   *   (matching the recall limit), 0 when no matches.
   *
   * Returns the deterministic baseline `{action:'continue',
   * confidence:0}` when:
   * - learning is unavailable
   * - state lacks a string `subject` (consumer responsibility)
   * - recall returns no matches
   */
  async predictNextAction(state: Record<string, unknown>): Promise<{ action: string; confidence: number }> {
    if (!this._available) return { action: 'continue', confidence: 0 };
    const subject = typeof state?.subject === 'string' ? state.subject : '';
    if (!subject) return { action: 'continue', confidence: 0 };
    const matches = await this.recallSimilarTasks(subject, 10);
    if (matches.length === 0) return { action: 'continue', confidence: 0 };
    const tally = new Map<string, number>();
    for (const m of matches) {
      const action = typeof m.status === 'string' && m.status.length > 0 ? m.status : 'continue';
      tally.set(action, (tally.get(action) ?? 0) + 1);
    }
    let winner = 'continue';
    let winnerCount = 0;
    for (const [action, count] of tally) {
      if (count > winnerCount) {
        winner = action;
        winnerCount = count;
      }
    }
    const unanimity = winnerCount / matches.length;
    const sizeFactor = Math.log(matches.length + 1) / Math.log(11);
    const confidence = Math.min(1.0, unanimity * sizeFactor);
    return { action: winner, confidence };
  }

  async getReEngagementContext(
    incompleteTasks: Array<{ subject: string; status: string }>,
  ): Promise<ReEngagementContext> {
    if (!this._available) {
      return { pastFailures: [], pastSuccesses: [], patterns: [], recommendations: [], confidence: 0 };
    }
    const episodes = await this._listEpisodes();
    const matching = this._matchByIncomplete(episodes, incompleteTasks);
    const pastFailures = matching.filter(e => (e.reward ?? 0) < 0).map(e => ({
      task: e.subject, critique: e.critique, reward: e.reward ?? -1,
    }));
    const pastSuccesses = matching.filter(e => (e.reward ?? 0) > 0).map(e => ({
      task: e.subject, reward: e.reward ?? +1,
    }));
    const patterns = this._aggregatePatterns(matching);
    return {
      pastFailures,
      pastSuccesses,
      patterns,
      recommendations: this._buildRecommendations(patterns, pastFailures),
      confidence: Math.min(1.0, episodes.length / CONFIDENCE_FLOOR),
    };
  }

  async getMetrics(): Promise<LearningMetrics> {
    if (!this._available) return { available: false, episodes: 0, patterns: 0, trajectories: 0 };
    const episodes = await this._listEpisodes();
    const patterns = this._aggregatePatterns(episodes);
    // ADR-0193 Item B: trajectories = count of swarms this instance has
    // opened via recordIterationStep (autopilot-specific, not process-wide).
    return {
      available: true,
      episodes: episodes.length,
      patterns: patterns.length,
      trajectories: this._trajectoriesOpened,
    };
  }

  // ─── private ────────────────────────────────────────────────────

  /**
   * ADR-0193 Item B: shared error-message extractor for SonaRvfService
   * branches. Keeps the trajectory methods readable.
   */
  private _errMsg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  /**
   * ADR-0193 Item B: resolve a SonaServiceLike instance for the
   * trajectory methods. Returns null when the autopilot is unavailable,
   * when AgentDBService doesn't expose `getSonaService`, when the
   * getter throws, or when the getter returns falsy — each branch
   * logs a distinct `console.error` with `caller` for diagnosis. Never
   * silently swallows (per `feedback-no-fallbacks`).
   */
  private async _resolveSona(caller: string): Promise<SonaServiceLike | null> {
    if (!this._available || !this._agentdb) return null;
    if (typeof this._agentdb.getSonaService !== 'function') {
      console.error(`[AutopilotLearning] ${caller}: AgentDBService.getSonaService unavailable`);
      return null;
    }
    try {
      const sona = await this._agentdb.getSonaService();
      if (!sona) {
        console.error(`[AutopilotLearning] ${caller}: getSonaService returned falsy`);
        return null;
      }
      return sona;
    } catch (err) {
      console.error(`[AutopilotLearning] ${caller}: getSonaService threw: ${this._errMsg(err)}`);
      return null;
    }
  }

  // === PHASE 4 BEGIN (ADR-0195 cross-controller event bus helpers) ===
  /**
   * ADR-0195 Phase 4: resolve the shared cross-controller EventEmitter
   * for the four producer-side emits. Mirrors `_resolveSona` shape.
   * Returns null when the autopilot is unavailable, when AgentDBService
   * doesn't expose `getLearningEvents` (older versions / test doubles),
   * or when the getter throws. Older-version absence uses `console.warn`
   * since that is a legitimate graceful path; other failures use
   * `console.error` so absence is observable per `feedback-no-fallbacks`.
   *
   * Synchronous (unlike `_resolveSona`'s async) — the bus is a plain
   * field on AgentDBService, no I/O.
   */
  private _resolveEventBus(caller: string): EventEmitter | null {
    if (!this._available || !this._agentdb) return null;
    if (typeof this._agentdb.getLearningEvents !== 'function') {
      console.warn(`[AutopilotLearning] ${caller}: AgentDBService.getLearningEvents unavailable (older version?)`);
      return null;
    }
    try {
      const bus = this._agentdb.getLearningEvents();
      if (!bus) {
        console.error(`[AutopilotLearning] ${caller}: getLearningEvents returned falsy`);
        return null;
      }
      return bus;
    } catch (err) {
      console.error(`[AutopilotLearning] ${caller}: getLearningEvents threw: ${this._errMsg(err)}`);
      return null;
    }
  }

  /**
   * ADR-0195 Phase 4: emit one of the four cross-controller events.
   * AgentDBService attaches a default `'error'` listener on the bus
   * that catches subscriber throws (synchronous emit), so this inline
   * call is safe — a subscriber's thrown error cannot break autopilot's
   * `storeEpisode` invariant.
   */
  private _emitLearningEvent(
    event: 'episode:recorded' | 'trajectory:opened' | 'trajectory:step' | 'trajectory:closed',
    payload: Record<string, unknown>,
    caller: string,
  ): void {
    const bus = this._resolveEventBus(caller);
    if (!bus) return;
    try {
      bus.emit(event, payload);
    } catch (err) {
      // emit itself shouldn't throw under normal conditions; if it does,
      // surface (don't swallow per `feedback-no-fallbacks`) but don't
      // propagate — producer's primary write already succeeded.
      console.error(`[AutopilotLearning] ${caller}: bus.emit(${event}) threw: ${this._errMsg(err)}`);
    }
  }
  // === PHASE 4 END ===

  private async _record(ep: AutopilotEpisode, baseReward: number, success: boolean): Promise<void> {
    if (!this._available || !this._agentdb) return;
    const timestamp = ep.timestamp ?? Date.now();
    // ADR-0193 Item A.3: shape the reward instead of the bare ±1 baseline.
    // The shaped reward is what gets persisted (and what _aggregatePatterns
    // averages over) — populated-suite tests depend on the formula below.
    const reward = await this._computeShapedReward(ep, baseReward);
    // === PHASE 5 BEGIN (ADR-0196 federated identity stamp — pre-write) ===
    // Security hardening: ALWAYS source the origin install-id from the
    // configured provider — never accept a caller-supplied
    // `ep.originInstallId` literal. Per `feedback-no-fallbacks`, allowing
    // a fallback path would let downstream consumers forge origin
    // attribution on locally-authored episodes.
    //
    // VectorClock advance happens AFTER the storeEpisode write succeeds
    // (below) — a failing write must not leak a clock tick into the
    // next retry, otherwise peers see clock gaps and CRDT merge
    // mis-orders the redelivered episode.
    const originInstallId = this._syncProvider.getLocalInstallId();
    // === PHASE 5 END ===
    await this._agentdb.storeEpisode({
      sessionId: EPISODE_SESSION_ID,
      task: ep.subject,
      reward,
      success,
      critique: ep.critique,
      metadata: {
        autopilotTaskId: ep.taskId,
        status: ep.status,
        iterations: ep.iterations,
        durationMs: ep.durationMs,
        timestamp,
        // === PHASE 5 BEGIN (ADR-0196 origin attribution in metadata) ===
        // Stamp origin attribution at write time. The advancing vector
        // clock is captured post-write and travels with the
        // provider-notify payload; the persisted episode carries the
        // origin id only — peers reconstruct causality from their own
        // post-pull clocks via SyncCoordinator's CRDT merge.
        originInstallId,
        // === PHASE 5 END ===
      },
    });
    // === PHASE 5 BEGIN (ADR-0196 vector-clock advance — POST-write) ===
    // Advance the clock only AFTER the local write succeeds. A failing
    // storeEpisode (AgentDB disconnect, schema mismatch) must not leak
    // a clock tick — otherwise peers would see clock gaps and CRDT
    // merge would mis-order the retry. The advanced clock is captured
    // into the in-flight provider notify payload below.
    this._vectorClock = incrementVectorClock(this._vectorClock, originInstallId);
    const vectorClock = this._vectorClock;
    // === PHASE 5 END ===
    // === PHASE 5 BEGIN (ADR-0196 provider notify) ===
    // Per `feedback-no-fallbacks`: provider throws propagate — no silent
    // catch. NoopFederatedSyncProvider trivially succeeds; the
    // SyncCoordinator adapter MAY trigger an eager push or buffer for
    // batched sync. Pass the stamped episode (with originInstallId +
    // vectorClock) so the provider doesn't re-derive identity.
    const stampedEpisode: AutopilotEpisode = {
      ...ep,
      timestamp,
      reward,
      originInstallId,
      vectorClock,
    };
    await this._syncProvider.notifyEpisode(stampedEpisode);
    // === PHASE 5 END ===
    // === PHASE 4 BEGIN (ADR-0195 episode:recorded emit) ===
    // Cross-controller signal: AFTER storeEpisode succeeds, before
    // retention enforcement. LearningSystem subscriber in AgentDBService
    // translates this into `submitFeedback` with synthesized per-subject
    // sessionId. Reward is the SHAPED reward (ADR-0193 Item A.3),
    // inherited per ADR-0195 §Decision Outcome.
    this._emitLearningEvent('episode:recorded', {
      taskId: ep.taskId,
      subject: ep.subject,
      status: ep.status,
      reward,
      success,
      timestamp,
    }, '_record');
    // === PHASE 4 END ===
    // ADR-0193 Item A.4: enforce retention cap after every successful
    // write. Soft-cap when deleteEpisode is unavailable (older
    // AgentDBService versions); see _enforceRetentionCap for the
    // graceful-degrade branch.
    await this._enforceRetentionCap();
  }

  /**
   * ADR-0193 Item A.3: shaped reward formula.
   *
   *   base = success ? 1 : -1
   *   efficiency   = clamp(median(iterations) / ep.iterations, 0, 2)
   *   time_penalty = clamp(ep.durationMs / median(durationMs), 0, 2)
   *   critique_penalty = ep.critique ? -0.5 : 0
   *   reward = clamp(base × efficiency / max(time_penalty, 0.1) + critique_penalty, -2, 2)
   *
   * Medians are computed over PRIOR episodes with the same subject
   * (the current episode is not yet persisted at call time). When no
   * priors exist, both medians collapse to the current episode's
   * own values → `efficiency = 1` and `time_penalty = 1`, so the
   * reward defaults to `base + critique_penalty` for a first-of-its-
   * subject task. This matches the intent of the formula (no signal
   * to shape against on the first run).
   */
  private async _computeShapedReward(
    ep: AutopilotEpisode,
    baseReward: number,
  ): Promise<number> {
    const safeBase = Number.isFinite(baseReward) ? baseReward : 0;
    const episodeIters = ep.iterations > 0 ? ep.iterations : 1;
    const episodeDuration = ep.durationMs > 0 ? ep.durationMs : 1;
    const priors = await this._listEpisodes();
    const sameSubject = priors.filter(p => p.subject === ep.subject);
    const medianIter = sameSubject.length > 0
      ? _median(sameSubject.map(p => (p.iterations > 0 ? p.iterations : 1)))
      : episodeIters;
    const medianDur = sameSubject.length > 0
      ? _median(sameSubject.map(p => (p.durationMs > 0 ? p.durationMs : 1)))
      : episodeDuration;
    const efficiency = _clamp(medianIter / episodeIters, 0, 2);
    const timePenalty = _clamp(episodeDuration / medianDur, 0, 2);
    const critiquePenalty = ep.critique ? -0.5 : 0;
    const raw = safeBase * efficiency / Math.max(timePenalty, 0.1) + critiquePenalty;
    return _clamp(raw, -2, 2);
  }

  /**
   * ADR-0193 Item A.4: evict oldest episodes when the listing exceeds
   * EPISODE_CAP. Soft-cap mode (warn + skip eviction) when
   * `_agentdb.deleteEpisode` is unavailable; the cap is honored on
   * any AgentDBService version >= the one that introduced
   * `deleteEpisode` (post-ADR-0193). Documented as soft-only to make
   * the degraded behavior auditable rather than a silent leak.
   */
  private async _enforceRetentionCap(): Promise<void> {
    if (!this._available || !this._agentdb) return;
    const cap = _readEpisodeCap();
    const episodes = await this._listEpisodes();
    if (episodes.length <= cap) return;
    if (typeof this._agentdb.deleteEpisode !== 'function') {
      console.warn(
        `[AutopilotLearning] AUTOPILOT_EPISODE_CAP=${cap} exceeded ` +
        `(have ${episodes.length}) but AgentDBService.deleteEpisode unavailable ` +
        `— soft-cap mode, no eviction performed`,
      );
      return;
    }
    const sorted = [...episodes].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    const toEvict = sorted.slice(0, episodes.length - cap);
    for (const victim of toEvict) {
      const id = (victim as AutopilotEpisode & { id?: number | string }).id;
      if (id === undefined || id === null || id === '') continue;
      try {
        await this._agentdb.deleteEpisode(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[AutopilotLearning] retention: deleteEpisode(${id}) failed: ${msg}`);
      }
    }
  }

  /**
   * ADR-0193 Item A.2: extracted row→episode mapper, shared by
   * `_listEpisodes` (bulk read) and `recallSimilarTasks` (embedding-
   * ranked read). Carries the `id` field through so the retention
   * cap can evict by id.
   */
  private _rowToEpisode(
    r: { id?: number | string; sessionId?: string; task?: string; reward?: number; success?: boolean; critique?: string; metadata?: Record<string, unknown>; ts?: number },
  ): AutopilotEpisode & { id?: number | string } {
    const md = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      taskId: typeof md.autopilotTaskId === 'string' ? md.autopilotTaskId : '',
      subject: r.task ?? '',
      status: typeof md.status === 'string' ? md.status : (r.success ? 'completed' : 'failed'),
      iterations: typeof md.iterations === 'number' ? md.iterations : 0,
      durationMs: typeof md.durationMs === 'number' ? md.durationMs : 0,
      reward: r.reward,
      critique: r.critique,
      timestamp: typeof md.timestamp === 'number' ? md.timestamp : r.ts,
      sessionId: r.sessionId,
      // ADR-0196 Phase 5: surface federation attribution on read-back.
      // `originInstallId` is persisted by `_record` into metadata;
      // `vectorClock` is NOT (per `_record`: peers reconstruct causality
      // via SyncCoordinator CRDT merge), so it stays `undefined` on read.
      // Per `feedback-no-fallbacks` we surface what is actually persisted
      // — no synthetic clock.
      originInstallId: typeof md.originInstallId === 'string' ? md.originInstallId : undefined,
    };
  }

  /**
   * Public read-only listing of recent autopilot episodes, newest-first
   * by `timestamp` (falling back to row `ts`). Returns AT MOST `limit`
   * episodes. Used by the `autopilot episodes` CLI subcommand.
   *
   * Per `feedback-no-fallbacks`: callers must call `initialize()` first
   * and gate on `isAvailable()`. When unavailable this returns `[]` (the
   * same absence-not-accepted signal the rest of the surface uses); the
   * CLI gates separately and throws a clear error so the absent branch
   * is observable to the user.
   */
  async listRecentEpisodes(limit: number): Promise<AutopilotEpisode[]> {
    if (!this._available) return [];
    const episodes = await this._listEpisodes();
    return [...episodes]
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      .slice(0, Math.max(0, limit));
  }

  private async _listEpisodes(): Promise<AutopilotEpisode[]> {
    if (!this._available || !this._agentdb) return [];
    // Empty-string query matches everything (the producer's MMR/sim path
    // treats it as no-filter). The session filter restricts to autopilot
    // episodes.
    const rows = await this._agentdb.recallEpisodes('', MAX_LIST, {
      sessionId: EPISODE_SESSION_ID,
    });
    return rows.map(r => this._rowToEpisode(r));
  }

  private _aggregatePatterns(episodes: AutopilotEpisode[]): DiscoveredPattern[] {
    const buckets = new Map<string, { count: number; rewardSum: number }>();
    for (const ep of episodes) {
      const tokens = new Set(
        ep.subject.toLowerCase().split(/\s+/).filter(t => t.length >= 4),
      );
      for (const t of tokens) {
        const b = buckets.get(t) ?? { count: 0, rewardSum: 0 };
        b.count++;
        b.rewardSum += ep.reward ?? 0;
        buckets.set(t, b);
      }
    }
    return Array.from(buckets.entries())
      .filter(([, b]) => b.count >= 2)
      .map(([pattern, b]) => ({
        pattern,
        frequency: b.count,
        avgReward: b.rewardSum / b.count,
        // ADR-0194 Phase 3: tag the producer so `discoverSuccessPatterns`'s
        // unioned output is disambiguable downstream.
        source: 'phase2-keyword' as const,
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);
  }

  private _matchByIncomplete(
    episodes: AutopilotEpisode[],
    incomplete: Array<{ subject: string; status: string }>,
  ): AutopilotEpisode[] {
    const incompleteTokens = new Set(
      incomplete.flatMap(t =>
        t.subject.toLowerCase().split(/\s+/).filter(x => x.length >= 4),
      ),
    );
    return episodes.filter(ep => {
      const epTokens = ep.subject.toLowerCase().split(/\s+/);
      return epTokens.some(t => incompleteTokens.has(t));
    });
  }

  private _buildRecommendations(
    patterns: DiscoveredPattern[],
    pastFailures: Array<{ critique?: string }>,
  ): string[] {
    const recs: string[] = [];
    const topSuccess = patterns.filter(p => p.avgReward > 0).slice(0, 3);
    for (const p of topSuccess) {
      recs.push(
        `Pattern "${p.pattern}" succeeded ${p.frequency}× (avg reward ${p.avgReward.toFixed(2)})`,
      );
    }
    const critiques = pastFailures
      .map(f => f.critique)
      .filter((c): c is string => Boolean(c))
      .slice(0, 3);
    for (const c of critiques) {
      recs.push(`Past failure note: ${c}`);
    }
    return recs;
  }
}
