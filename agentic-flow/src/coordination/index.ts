/**
 * Attention-based coordination exports
 */

export { AttentionCoordinator, createAttentionCoordinator } from './attention-coordinator.js';
export type {
  AgentOutput,
  SpecializedAgent,
  Task,
  SwarmTopology,
  CoordinationResult,
  ExpertRoutingResult,
} from './attention-coordinator.js';

// ADR-0192 Phase 2: AutopilotLearning re-exports. Producer file is
// `./autopilot-learning.ts`; subpath export is wired in package.json so
// downstream consumers (cli's `autopilot-state.ts`) can resolve either
// `agentic-flow/coordination/autopilot-learning` or
// `agentic-flow/coordination` and pick the symbol.
export { AutopilotLearning } from './autopilot-learning.js';
export type {
  AutopilotEpisode,
  DiscoveredPattern,
  ReEngagementContext,
  LearningMetrics,
} from './autopilot-learning.js';
