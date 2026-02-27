/**
 * Orchestration Runtime - Implementation (PR1)
 *
 * Delegates to existing safe-exec path; run lifecycle stored in-memory.
 */

import { ulid } from 'ulid';
import { seedMemory } from './memory-plane.js';
import type {
  OrchestratorConfig,
  RunHandle,
  RunStatus,
  RunArtifacts,
  OrchestrateTaskInput,
} from './orchestration-types.js';

const defaultConfig: Required<Pick<OrchestratorConfig, 'backend'>> = {
  backend: 'safe-exec',
};

/** In-memory run store: runId -> RunStatus. */
const runStatusStore = new Map<string, RunStatus>();

/** In-memory artifacts store: runId -> RunArtifacts. */
const runArtifactsStore = new Map<string, RunArtifacts>();

export interface Orchestrator {
  orchestrateTask(input: OrchestrateTaskInput): Promise<RunHandle>;
}

/**
 * Create an orchestrator instance.
 */
export function createOrchestrator(config: OrchestratorConfig = {}): Orchestrator {
  const { backend } = { ...defaultConfig, ...config };

  return {
    async orchestrateTask(input: OrchestrateTaskInput): Promise<RunHandle> {
      const runId = ulid();
      runStatusStore.set(runId, { phase: 'running', progress: 0, finished: false });

      if (input.initialMemoryEntries?.length) {
        await seedMemory(runId, input.initialMemoryEntries);
      }

      try {
        if (backend === 'safe-exec') {
          const { execTaskOrchestrate } = await import('../utils/safe-exec.js');
          const strategy = input.strategy ?? 'adaptive';
          const priority = input.priority ?? 'medium';
          execTaskOrchestrate(input.description, strategy, priority);
        }
        runStatusStore.set(runId, { phase: 'completed', progress: 100, finished: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        runStatusStore.set(runId, {
          phase: 'failed',
          progress: 100,
          error: message,
          finished: true,
        });
      }

      runArtifactsStore.set(runId, {
        commits: [],
        testLogs: [],
        memoryWrites: [],
      });

      return { runId };
    },
  };
}

/**
 * Get status for a run.
 */
export async function getRunStatus(runId: string): Promise<RunStatus> {
  const status = runStatusStore.get(runId);
  if (status) return status;
  return { phase: 'unknown', progress: 0, finished: false };
}

/**
 * Best-effort cancel of a run. No-op when backend does not support cancel.
 */
export async function cancelRun(_runId: string): Promise<void> {
  // P2P and safe-exec backends do not support cancel today.
}

/**
 * Get artifacts for a run.
 */
export async function getRunArtifacts(runId: string): Promise<RunArtifacts> {
  const artifacts = runArtifactsStore.get(runId);
  if (artifacts) return artifacts;
  return { commits: [], testLogs: [], memoryWrites: [] };
}
