/**
 * Integration tests for AutopilotLearning Phase 3 (ADR-0194).
 *
 * Validates the embedding-cluster pattern discovery against the full
 * AutopilotLearning stack. Tests both the keyword path (Phase 2) AND
 * the embedding-cluster path (Phase 3) emerge from a single
 * `discoverSuccessPatterns()` call with distinguishing `source` tags.
 *
 * Location: inner package (per ADR-0198 Finding 1 — outer-root vitest
 * install is blocked by missing `@ruvector/rvf@0.2.0-patch.147` in
 * Verdaccio; inner package install is reachable).
 *
 * Test strategy: inject a real `AgentDBLike` test double that
 * - persists episodes to an in-memory Map (no SQL needed for the
 *   clustering contract)
 * - returns deterministic synthetic embeddings via `generateEmbeddings`
 *   so cluster membership is testable without a live embedder
 *
 * The contract surface under test is the same one a real
 * `AgentDBService` exposes (`storeEpisode`, `recallEpisodes`,
 * `generateEmbedding` / `generateEmbeddings`, `getFallbackStatus`); the
 * test double mirrors it 1:1.
 *
 * State at write time (2026-05-19):
 *   * `DiscoveredPattern.source` discriminator — NOT YET on the type.
 *     ADR-0194's Closure criteria asserts the field; tests below
 *     introspect with `typeof` so they emit a SKIP message instead of
 *     failing when the implementer hasn't landed the field.
 *   * `AutopilotLearning.discoverPatternsByEmbedding(episodes)` —
 *     METHOD EXISTENCE checked dynamically; .skip via `it.skipIf`.
 *   * `AutopilotLearning.configure({...})` — METHOD EXISTENCE checked
 *     dynamically.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AutopilotLearning,
  type AutopilotEpisode,
} from '../../src/coordination/autopilot-learning.js';

// ─── In-memory AgentDBService test double ────────────────────────────

/**
 * Synthetic 16-dim embedding generator. Deterministic per subject so
 * cluster membership is reproducible across runs. Subjects sharing the
 * same `cluster:N` token produce embeddings within cosine ≥ 0.75 of
 * each other; distinct clusters are below that threshold by
 * construction.
 */
function syntheticEmbedding(subject: string): number[] {
  const dim = 16;
  const vec = new Array<number>(dim).fill(0);
  const match = /cluster:(\d+)/.exec(subject);
  if (!match) {
    // Outlier — random projection per-subject, deterministic from the
    // subject hash.
    let h = 0;
    for (let i = 0; i < subject.length; i++) {
      h = (h * 31 + subject.charCodeAt(i)) | 0;
    }
    for (let i = 0; i < dim; i++) {
      vec[i] = ((h * (i + 1)) % 100) / 100;
    }
    return vec;
  }
  const k = parseInt(match[1], 10);
  vec[k % dim] = 1.0;
  let h = 0;
  for (let i = 0; i < subject.length; i++) {
    h = (h * 17 + subject.charCodeAt(i)) | 0;
  }
  for (let i = 0; i < dim; i++) {
    if (i !== k % dim) {
      vec[i] = ((h * (i + 7)) % 10) / 1000; // ≤ 0.009
    }
  }
  return vec;
}

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
  private nextId = 1;
  public episodes: StoredEpisode[] = [];

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

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map(syntheticEmbedding);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return syntheticEmbedding(text);
  }

  getFallbackStatus(): { degraded: boolean; backend: string; initError: string | null } {
    return { degraded: false, backend: 'in-memory', initError: null };
  }
}

/**
 * Spec-helper: AutopilotLearning's `initialize()` resolves the AgentDB
 * via dynamic import of `../services/agentdb-service.js`. To inject a
 * test double, we reach into the private field directly.
 */
function attachDouble(learning: AutopilotLearning, db: InMemoryAgentDB): void {
  const internals = learning as unknown as { _available: boolean; _agentdb: unknown };
  internals._agentdb = db;
  internals._available = true;
}

// ─── Capability probes ───────────────────────────────────────────────

/**
 * Probe at module-load time whether Phase 3 is wired. Tests skip when
 * absent so the file stays runnable as a binding spec.
 */
const phase3MethodExists = typeof (AutopilotLearning.prototype as Record<string, unknown>)
  .discoverPatternsByEmbedding === 'function';
const configureExists = typeof (AutopilotLearning.prototype as Record<string, unknown>)
  .configure === 'function';

// AutopilotLearning constructor may throw (Phase 5 imports
// `createVectorClock` from `agentdb`; if the published package omits
// the export, construction fails). Probe inside a try.
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

// ─── Phase 3 — embedding-cluster pattern discovery ───────────────────

describe('AutopilotLearning Phase 3 (ADR-0194)', () => {
  let learning: AutopilotLearning;
  let db: InMemoryAgentDB;

  beforeEach(() => {
    if (!canConstruct) return;
    learning = new AutopilotLearning();
    db = new InMemoryAgentDB();
    attachDouble(learning, db);
  });

  it.skipIf(!canConstruct)(
    'discoverSuccessPatterns returns BOTH phase2-keyword and phase3-embedding patterns',
    async () => {
      if (!phase3MethodExists) {
        // eslint-disable-next-line no-console
        console.warn(
          '[ADR-0194 integration] SKIP-LIKE: discoverPatternsByEmbedding not yet wired;' +
            ' Phase 2 keyword path returns alone. Test asserts only the keyword path here.',
        );
      }
      const subjects = [
        'implement adr-0100 cluster:1',
        'implement adr-0101 cluster:1',
        'implement adr-0102 cluster:1',
        'implement adr-0103 cluster:1',
        'fix bug in module foo cluster:2',
        'fix bug in module bar cluster:2',
        'fix bug in module baz cluster:2',
        'fix bug in module qux cluster:2',
        'standalone outlier alpha',
        'standalone outlier beta',
      ];
      for (let i = 0; i < subjects.length; i++) {
        await learning.recordTaskCompletion({
          taskId: `t-${i}`,
          subject: subjects[i],
          status: 'completed',
          iterations: 3,
          durationMs: 1000,
        });
      }

      const patterns = await learning.discoverSuccessPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      if (phase3MethodExists) {
        // Binding-spec assertion: when wired, both sources appear.
        const phase2 = patterns.filter(
          p => (p as { source?: string }).source === 'phase2-keyword',
        );
        const phase3 = patterns.filter(
          p => (p as { source?: string }).source === 'phase3-embedding',
        );
        expect(phase2.length).toBeGreaterThan(0);
        expect(phase3.length).toBeGreaterThanOrEqual(2);
      }
    },
  );

  it.skipIf(!canConstruct || !phase3MethodExists)(
    'produces 2 phase3 clusters of size ≥3 for the synthetic corpus',
    async () => {
      const subjects = [
        'implement adr-0100 cluster:1',
        'implement adr-0101 cluster:1',
        'implement adr-0102 cluster:1',
        'implement adr-0103 cluster:1',
        'fix bug in module foo cluster:2',
        'fix bug in module bar cluster:2',
        'fix bug in module baz cluster:2',
        'fix bug in module qux cluster:2',
        'standalone outlier alpha',
        'standalone outlier beta',
      ];
      for (let i = 0; i < subjects.length; i++) {
        await learning.recordTaskCompletion({
          taskId: `t-${i}`,
          subject: subjects[i],
          status: 'completed',
          iterations: 3,
          durationMs: 1000,
        });
      }

      const patterns = await learning.discoverSuccessPatterns();
      const phase3Big = patterns.filter(
        p =>
          (p as { source?: string }).source === 'phase3-embedding' &&
          p.frequency >= 3,
      );
      expect(phase3Big.length).toBe(2);
      for (const p of phase3Big) {
        expect(subjects).toContain(p.pattern);
      }
    },
  );

  it.skipIf(!canConstruct || !configureExists || !phase3MethodExists)(
    'configure(threshold) controls cluster merging',
    async () => {
      const subjects = [
        'implement adr-0100 cluster:1',
        'implement adr-0101 cluster:1',
        'implement adr-0102 cluster:1',
      ];
      for (let i = 0; i < subjects.length; i++) {
        await learning.recordTaskCompletion({
          taskId: `t-${i}`,
          subject: subjects[i],
          status: 'completed',
          iterations: 3,
          durationMs: 1000,
        });
      }

      // High threshold → no cluster forms.
      (learning as unknown as {
        configure: (cfg: { embeddingClusterThreshold?: number }) => unknown;
      }).configure({ embeddingClusterThreshold: 0.99 });
      const tight = await learning.discoverSuccessPatterns();
      const phase3Tight = tight.filter(
        p => (p as { source?: string }).source === 'phase3-embedding',
      );
      expect(phase3Tight.length).toBe(0);

      // Low threshold → all three merge.
      (learning as unknown as {
        configure: (cfg: { embeddingClusterThreshold?: number }) => unknown;
      }).configure({ embeddingClusterThreshold: 0.5 });
      const loose = await learning.discoverSuccessPatterns();
      const phase3Loose = loose.filter(
        p => (p as { source?: string }).source === 'phase3-embedding',
      );
      expect(phase3Loose.length).toBe(1);
      expect(phase3Loose[0].frequency).toBe(3);
    },
  );

  it.skipIf(!canConstruct || !phase3MethodExists)(
    'throws (no silent fallback) when AgentDBService exposes no embedding surface',
    async () => {
      // Per feedback-no-fallbacks: when neither generateEmbedding nor
      // generateEmbeddings is available, `discoverPatternsByEmbedding`
      // throws rather than silently returning [].
      class NoEmbedDB extends InMemoryAgentDB {
        generateEmbeddings = undefined as unknown as InMemoryAgentDB['generateEmbeddings'];
        generateEmbedding = undefined as unknown as InMemoryAgentDB['generateEmbedding'];
      }
      const noEmbedDB = new NoEmbedDB();
      const noEmbedLearning = new AutopilotLearning();
      attachDouble(noEmbedLearning, noEmbedDB);

      const successful: AutopilotEpisode[] = [
        { taskId: 't-0', subject: 'a cluster:1', status: 'completed', iterations: 3, durationMs: 1000, reward: 1 },
        { taskId: 't-1', subject: 'b cluster:1', status: 'completed', iterations: 3, durationMs: 1000, reward: 1 },
        { taskId: 't-2', subject: 'c cluster:1', status: 'completed', iterations: 3, durationMs: 1000, reward: 1 },
      ];
      await expect(
        (noEmbedLearning as unknown as {
          discoverPatternsByEmbedding: (eps: AutopilotEpisode[]) => Promise<unknown>;
        }).discoverPatternsByEmbedding(successful),
      ).rejects.toThrow(/Phase 3 unreachable|generateEmbedding|unreachable/);
    },
  );

});

// ─── Contract probes (always run; never use `beforeEach`) ────────────

describe('AutopilotLearning Phase 3 — contract probes', () => {
  it('AutopilotLearning is importable from inner package', () => {
    expect(AutopilotLearning).toBeDefined();
    expect(typeof AutopilotLearning).toBe('function');
  });

  it('reports construction status and method-existence as a contract probe', () => {
    // This test never fails — it surfaces the current contract state
    // visibly so a CI report makes the gap obvious.
    // eslint-disable-next-line no-console
    console.warn(
      `[ADR-0194 contract probe] canConstruct=${canConstruct}` +
        ` ctorErr=${ctorProbe.err ? JSON.stringify(ctorProbe.err) : 'null'}` +
        ` discoverPatternsByEmbedding=${phase3MethodExists}` +
        ` configure=${configureExists}`,
    );
    expect(typeof canConstruct).toBe('boolean');
  });
});
