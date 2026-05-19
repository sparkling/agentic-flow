/**
 * AutopilotLearning — Phase 2 implementation
 *
 * ADR-058 + ADR-072 + ADR-0192 Phase 1 + ADR-0193 Items A+B: learning
 * loop for the autopilot system. AgentDB-backed episode log +
 * frequency-aggregated pattern discovery + embedding-based recall +
 * SonaRvfService-backed RL trajectory recording + reward-shaped
 * persistence + retention cap. Graceful-unavailable when AgentDB isn't
 * reachable.
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
}

export interface DiscoveredPattern {
  pattern: string;            // human-readable subject-keyword
  frequency: number;          // # episodes matching
  avgReward: number;          // mean reward over matching episodes
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
}

export class AutopilotLearning {
  private _available = false;
  private _agentdb: AgentDBLike | null = null;

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
    } catch (err) {
      console.error(`[AutopilotLearning] endSwarmTrajectory: endTrajectory threw: ${this._errMsg(err)}`);
    }
  }

  async discoverSuccessPatterns(): Promise<DiscoveredPattern[]> {
    if (!this._available) return [];
    const episodes = await this._listEpisodes();
    return this._aggregatePatterns(episodes.filter(e => (e.reward ?? 0) > 0));
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

  private async _record(ep: AutopilotEpisode, baseReward: number, success: boolean): Promise<void> {
    if (!this._available || !this._agentdb) return;
    const timestamp = ep.timestamp ?? Date.now();
    // ADR-0193 Item A.3: shape the reward instead of the bare ±1 baseline.
    // The shaped reward is what gets persisted (and what _aggregatePatterns
    // averages over) — populated-suite tests depend on the formula below.
    const reward = await this._computeShapedReward(ep, baseReward);
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
      },
    });
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
    };
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
