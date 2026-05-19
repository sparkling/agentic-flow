/**
 * AutopilotLearning — Phase 1 implementation
 *
 * ADR-058 + ADR-072 + ADR-0192 Phase 1: learning loop for the autopilot
 * system. AgentDB-backed episode log + frequency-aggregated pattern
 * discovery + literal-substring recall. Graceful-unavailable when
 * AgentDB isn't reachable. No GNN, no RL trajectories — see ADR-059
 * scoping notes and the Phase 1 out-of-scope list in
 * docs/plans/adr0192-autopilot-learning-implementation.md.
 *
 * Storage strategy:
 *   Episodes flow through AgentDBService.storeEpisode (the existing
 *   ReflexionMemory-backed API). The episode's `sessionId` is set to
 *   the EPISODE_SESSION_ID constant so we can list autopilot episodes
 *   via the metadata filter without re-indexing other reflexion data.
 *   This reuses the existing schema rather than introducing a new
 *   namespace.
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
  trajectories: number;       // Phase 1: always 0 (no trajectory recording yet)
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
    sessionId?: string;
    task?: string;
    reward?: number;
    success?: boolean;
    critique?: string;
    metadata?: Record<string, unknown>;
    ts?: number;
  }>>;
  getFallbackStatus?(): { degraded?: boolean; backend?: string; initError?: string | null };
}

export class AutopilotLearning {
  private _available = false;
  private _agentdb: AgentDBLike | null = null;

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

  async recordIterationStep(_p: unknown, _d: unknown[]): Promise<void> {
    // Phase 1: no trajectory recording. Surface exists so consumers
    // can call it; later phases can wire SONA trajectories here.
    return;
  }

  async endSwarmTrajectory(_summary: unknown): Promise<void> {
    // Phase 1: no trajectory recording. See recordIterationStep.
    return;
  }

  async discoverSuccessPatterns(): Promise<DiscoveredPattern[]> {
    if (!this._available) return [];
    const episodes = await this._listEpisodes();
    return this._aggregatePatterns(episodes.filter(e => (e.reward ?? 0) > 0));
  }

  async recallSimilarTasks(query: string, limit: number): Promise<AutopilotEpisode[]> {
    if (!this._available) return [];
    // Phase 1: literal substring match against the in-memory listing.
    // Embedder-backed similarity is a Phase 2 follow-up; the storage
    // layer (AgentDBService.recallEpisodes) already does its own
    // similarity, but we intentionally keep this deterministic so the
    // populated-suite assertions stay stable.
    const episodes = await this._listEpisodes();
    const q = query.toLowerCase();
    return episodes
      .filter(e => e.subject.toLowerCase().includes(q))
      .slice(0, limit);
  }

  async predictNextAction(_state: Record<string, unknown>): Promise<{ action: string; confidence: number }> {
    if (!this._available) return { action: 'continue', confidence: 0 };
    const metrics = await this.getMetrics();
    return {
      action: 'continue',
      confidence: Math.min(1.0, metrics.episodes / CONFIDENCE_FLOOR),
    };
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
    return { available: true, episodes: episodes.length, patterns: patterns.length, trajectories: 0 };
  }

  // ─── private ────────────────────────────────────────────────────

  private async _record(ep: AutopilotEpisode, reward: number, success: boolean): Promise<void> {
    if (!this._available || !this._agentdb) return;
    const timestamp = ep.timestamp ?? Date.now();
    // Persist into the ReflexionMemory-backed episode store. Metadata
    // carries the autopilot-specific fields so we can rehydrate the
    // full AutopilotEpisode shape on listEpisodes().
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
  }

  private async _listEpisodes(): Promise<AutopilotEpisode[]> {
    if (!this._available || !this._agentdb) return [];
    // Empty-string query matches everything (the producer's MMR/sim path
    // treats it as no-filter). The session filter restricts to autopilot
    // episodes.
    const rows = await this._agentdb.recallEpisodes('', MAX_LIST, {
      sessionId: EPISODE_SESSION_ID,
    });
    return rows.map(r => {
      const md = (r.metadata ?? {}) as Record<string, unknown>;
      return {
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
    });
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
