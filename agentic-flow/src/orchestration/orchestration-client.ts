/**
 * Generic orchestration client (Option A).
 *
 * Stable input/output shape for apps (build systems, IDEs, CI) that drive
 * agentic-flow in-process. Map your app payload to StartRunInput; get back
 * runId and a consistent status/cancel result shape.
 */

import {
  createOrchestrator,
  getRunStatus,
  cancelRun,
  getRunArtifacts,
} from './orchestration-runtime.js';
import type {
  OrchestratorConfig,
  RunPhase,
  LoopPolicy,
} from './orchestration-types.js';
import {
  seedMemory,
  recordLearning,
  searchMemory,
  harvestMemory,
} from './memory-plane.js';
import type { MemorySearchScope } from './memory-plane-types.js';
import type { MemorySearchResult } from './memory-plane-types.js';
import type { RunLearning } from './memory-plane.js';

/** Generic input for starting a run. Apps map their payload to this shape. */
export interface StartRunInput {
  /** Full task description for the build agent. */
  taskDescription: string;
  /** Working directory for the run. */
  cwd?: string;
  /** Memory entries to seed before the run (e.g. context refs). */
  memorySeed?: Array<{
    key: string;
    value: string;
    namespace?: string;
    metadata?: Record<string, unknown>;
  }>;
  /** Acceptance criteria (e.g. "tests pass", "lint clean"). */
  acceptanceCriteria?: string[];
  /** Paths the run is allowed to modify. */
  allowedPaths?: string[];
  /** Paths the run must not modify. */
  forbiddenPaths?: string[];
  /** Provenance (run/card/assignment ids) for audit. */
  provenance?: { runId?: string; assignmentId?: string; cardId?: string; [key: string]: unknown };
  /** Loop policy: max iterations, success criteria, retry, budget. Pass-through for backends. */
  loopPolicy?: LoopPolicy;
}

/** Status state returned by the generic client. */
export type RunStatusState =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'unknown';

/** Generic run status. Apps map this to their own status type if needed. */
export interface ClientRunStatus {
  runId: string;
  status: RunStatusState;
  progress: number;
  error?: string;
  finished?: boolean;
  summary?: string;
  commits?: Array<{ sha: string; branch: string; message: string }>;
}

/** Result of cancel. */
export interface CancelRunResult {
  success: boolean;
  error?: string;
}

/** Harvested run memory (entries + learnings with provenance). */
export interface ClientHarvestResult {
  entries: Array<{ key?: string; value: string; metadata?: Record<string, unknown> }>;
  learnings: RunLearning[];
}

/** Generic orchestration client interface. */
export interface OrchestrationClient {
  startRun(input: StartRunInput): Promise<{ runId: string }>;
  getStatus(runId: string): Promise<ClientRunStatus>;
  cancel(runId: string): Promise<CancelRunResult>;
  /** Seed run-scoped memory before or during a run. */
  seed(runId: string, entries: Array<{ key?: string; value: string; metadata?: Record<string, unknown> }>): Promise<void>;
  /** Record a learning/pattern for the run (included in harvest). */
  recordLearning(
    runId: string,
    learning: string,
    score?: number,
    provenance?: Record<string, unknown>
  ): Promise<void>;
  /** Search memory (run-scoped or global). */
  search(scope: MemorySearchScope | { runId?: string }, query: string, topK: number): Promise<MemorySearchResult[]>;
  /** Harvest run-scoped entries and learnings after a run (for audit/reuse). */
  harvest(runId: string): Promise<ClientHarvestResult>;
}

function phaseToState(phase: RunPhase): RunStatusState {
  switch (phase) {
    case 'pending':
      return 'queued';
    case 'running':
      return 'running';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'unknown':
    default:
      return 'unknown';
  }
}

export interface CreateOrchestrationClientOptions {
  /** Orchestrator config (e.g. backend: 'safe-exec' | 'test'). */
  config?: OrchestratorConfig;
}

/**
 * Create a generic orchestration client. Use this when your app needs a stable
 * input/output shape (taskDescription, memorySeed, acceptanceCriteria, paths,
 * provenance) and runId/status/cancel results. Map your app payload to
 * StartRunInput; use the returned runId for getStatus and cancel.
 */
export function createOrchestrationClient(
  options: CreateOrchestrationClientOptions = {}
): OrchestrationClient {
  const { config = {} } = options;
  const orchestrator = createOrchestrator(config);

  return {
    async startRun(input: StartRunInput) {
      const handle = await orchestrator.orchestrateTask({
        description: input.taskDescription,
        strategy: 'adaptive',
        priority: 'medium',
        initialMemoryEntries: input.memorySeed,
        cwd: input.cwd,
        acceptanceCriteria: input.acceptanceCriteria,
        allowedPaths: input.allowedPaths,
        forbiddenPaths: input.forbiddenPaths,
        provenance: input.provenance,
        loopPolicy: input.loopPolicy,
      });
      return { runId: handle.runId };
    },

    async getStatus(runId: string): Promise<ClientRunStatus> {
      const status = await getRunStatus(runId);
      const artifacts = await getRunArtifacts(runId);
      const commits = (artifacts.commits ?? []).map((c) => ({
        sha: c.sha ?? '',
        branch: '',
        message: c.message ?? '',
      }));

      return {
        runId,
        status: phaseToState(status.phase),
        progress: status.progress,
        error: status.error,
        finished: status.finished,
        summary: status.finished ? `Progress: ${status.progress}%` : undefined,
        commits: commits.length > 0 ? commits : undefined,
      };
    },

    async cancel(runId: string): Promise<CancelRunResult> {
      try {
        await cancelRun(runId);
        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message };
      }
    },

    async seed(
      runId: string,
      entries: Array<{ key?: string; value: string; metadata?: Record<string, unknown> }>
    ): Promise<void> {
      await seedMemory(runId, entries);
    },

    async recordLearning(
      runId: string,
      learning: string,
      score?: number,
      provenance?: Record<string, unknown>
    ): Promise<void> {
      await recordLearning(runId, learning, score, provenance);
    },

    async search(
      scope: MemorySearchScope | { runId?: string },
      query: string,
      topK: number
    ): Promise<MemorySearchResult[]> {
      return searchMemory(scope, query, topK);
    },

    async harvest(runId: string): Promise<ClientHarvestResult> {
      return harvestMemory(runId);
    },
  };
}
