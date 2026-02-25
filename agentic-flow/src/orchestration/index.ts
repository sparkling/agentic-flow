/**
 * Orchestration Runtime API (PR1)
 *
 * Stable programmatic API for task orchestration.
 */

export type {
  OrchestratorConfig,
  OrchestratorBackend,
  RunHandle,
  RunStatus,
  RunPhase,
  RunArtifacts,
  RunProvenance,
  OrchestrateTaskInput,
  LoopPolicy,
  SuccessCriteria,
  RetryPolicy,
  BudgetLimits,
} from './orchestration-types.js';

export type { MemoryEntry, MemorySearchResult, MemorySearchScope } from './memory-plane-types.js';

export {
  createOrchestrator,
  getRunStatus,
  cancelRun,
  getRunArtifacts,
  type Orchestrator,
} from './orchestration-runtime.js';

export {
  seedMemory,
  recordLearning,
  searchMemory,
  harvestMemory,
  type RunLearning,
} from './memory-plane.js';

// Generic orchestration client (stable input/output for build agents, IDEs, CI)
export {
  createOrchestrationClient,
  type StartRunInput,
  type ClientRunStatus,
  type ClientHarvestResult,
  type RunStatusState,
  type CancelRunResult,
  type OrchestrationClient,
  type CreateOrchestrationClientOptions,
} from './orchestration-client.js';
