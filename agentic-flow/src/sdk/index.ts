/**
 * SDK Integration Module
 *
 * Re-exports available SDK integration components.
 *
 * NOTE: Many SDK utilities are planned but not yet implemented.
 * This file will be expanded as new SDK features are added.
 */

// Orchestration runtime API (stable programmatic API + loop policy + generic client)
export {
  createOrchestrator,
  getRunStatus,
  cancelRun,
  getRunArtifacts,
  type Orchestrator,
  type OrchestratorConfig,
  type OrchestratorBackend,
  type RunHandle,
  type RunStatus,
  type RunPhase,
  type RunArtifacts,
  type RunProvenance,
  type OrchestrateTaskInput,
  type LoopPolicy,
  type SuccessCriteria,
  type RetryPolicy,
  type BudgetLimits,
  seedMemory,
  recordLearning,
  searchMemory,
  harvestMemory,
  type MemoryEntry,
  type MemorySearchResult,
  type MemorySearchScope,
  type RunLearning,
  createOrchestrationClient,
  type StartRunInput,
  type ClientRunStatus,
  type ClientHarvestResult,
  type RunStatusState,
  type CancelRunResult,
  type OrchestrationClient,
  type CreateOrchestrationClientOptions,
} from '../orchestration/index.js';

// Security utilities
export {
  validateFilePath,
  validateReadPath,
  validateWritePath,
  type PathValidationOptions,
} from '../security/path-validator.js';

export {
  validateString,
  validateLanguage,
  validateRunId,
  validateMemoryKey,
  validateMemoryValue,
  type ValidationOptions,
} from '../security/input-validation.js';

export {
  redactKey,
  sanitizeEnvironment,
  type RedactionOptions,
} from '../security/secret-redaction.js';

export {
  RateLimiter,
  ConcurrencyLimiter,
  type RateLimitConfig,
  type RateLimitInfo,
} from '../security/rate-limiter.js';

// TODO: Implement remaining SDK utilities
// - hooks-bridge.js (session/tool hooks)
// - session-manager.js (session tracking)
// - permission-handler.js (custom permissions)
// - agent-converter.js (agent format conversion)
// - e2b-sandbox.js (E2B sandbox integration)
// - e2b-swarm.js (E2B swarm orchestration)
// - e2b-swarm-optimizer.js (swarm optimization)
// - query-control.js (query management)
// - plugins.js (plugin system)
// - streaming-input.js (streaming utilities)
