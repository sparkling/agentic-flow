/**
 * Memory plane implementation (PR3)
 *
 * Explicit methods so vector memorization and run context are guaranteed.
 * In-memory implementation; can be wired to AgentDB/ReasoningBank/safe-exec later.
 */

import type { MemoryEntry, MemorySearchResult, MemorySearchScope } from './memory-plane-types.js';

/** Run-scoped seeded entries: runId -> entries. */
const runEntriesStore = new Map<string, MemoryEntry[]>();

/** Run-scoped learnings: runId -> { learning, score?, provenance? }[]. */
const runLearningsStore = new Map<string, Array<{ learning: string; score?: number; provenance?: Record<string, unknown> }>>();

/**
 * Seed run context so the run sees these entries. Guaranteed, not prompt-only.
 */
export async function seedMemory(
  runId: string,
  entries: Array<{ key?: string; value: string; metadata?: Record<string, unknown> }>
): Promise<void> {
  const existing = runEntriesStore.get(runId) ?? [];
  runEntriesStore.set(runId, [...existing, ...entries]);
}

/**
 * Record a learning/pattern for the run (e.g. for ReasoningBank/pattern store).
 */
export async function recordLearning(
  runId: string,
  learning: string,
  score?: number,
  provenance?: Record<string, unknown>
): Promise<void> {
  const existing = runLearningsStore.get(runId) ?? [];
  existing.push({ learning, score, provenance });
  runLearningsStore.set(runId, existing);
}

/**
 * Search memory. Scope is run-scoped (when runId present) or 'global'.
 * Returns up to topK results. In-memory impl uses simple substring match.
 */
export async function searchMemory(
  scope: MemorySearchScope | { runId?: string },
  query: string,
  topK: number
): Promise<MemorySearchResult[]> {
  const q = query.toLowerCase();
  const results: MemorySearchResult[] = [];
  const runId = typeof scope === 'object' && scope && 'runId' in scope ? scope.runId : undefined;

  const scoreMatch = (text: string): number => {
    const t = text.toLowerCase();
    if (t.includes(q)) return 0.9;
    const words = q.split(/\s+/).filter(Boolean);
    const hits = words.filter((w) => t.includes(w)).length;
    return words.length ? hits / words.length : 0;
  };

  if (runId) {
    const entries = runEntriesStore.get(runId) ?? [];
    const learnings = runLearningsStore.get(runId) ?? [];
    for (const e of entries) {
      const score = scoreMatch(e.value);
      if (score > 0) results.push({ value: e.value, score, metadata: e.metadata });
    }
    for (const { learning, score: s } of learnings) {
      const score = scoreMatch(learning);
      if (score > 0) results.push({ value: learning, score: s ?? score });
    }
  } else {
    for (const [, entries] of runEntriesStore) {
      for (const e of entries) {
        const score = scoreMatch(e.value);
        if (score > 0) results.push({ value: e.value, score, metadata: e.metadata });
      }
    }
    for (const [, learnings] of runLearningsStore) {
      for (const { learning, score: s } of learnings) {
        const score = scoreMatch(learning);
        if (score > 0) results.push({ value: learning, score: s ?? score });
      }
    }
  }

  results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return results.slice(0, Math.max(0, topK));
}

/** Learning record stored for a run. */
export interface RunLearning {
  learning: string;
  score?: number;
  provenance?: Record<string, unknown>;
}

/**
 * Harvest run-scoped memory (entries + learnings) for a run. Use after completion
 * to pull context and learnings with provenance for audit or reuse.
 */
export async function harvestMemory(runId: string): Promise<{
  entries: MemoryEntry[];
  learnings: RunLearning[];
}> {
  const entries = runEntriesStore.get(runId) ?? [];
  const learnings = runLearningsStore.get(runId) ?? [];
  return { entries: [...entries], learnings: [...learnings] };
}
