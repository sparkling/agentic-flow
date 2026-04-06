/**
 * Controller Bridge — ADR-0076 Phase 4 transition adapter
 *
 * Provides the same public API shape as AgentDBService but delegates every call
 * to ControllerRegistry.get().  MCP tool files can switch their import from
 * AgentDBService to this bridge without changing their calling pattern.
 *
 * This file is intentionally thin: every method is a one-liner delegation.
 * It holds NO state of its own — it is purely a pass-through.
 *
 * Phase 5 will remove this bridge entirely, wiring MCP tools directly to the
 * registry.
 *
 * @module controller-bridge
 */

import type { ControllerRegistry, ControllerName } from '@claude-flow/memory';

// ---------------------------------------------------------------------------
// Registry holder (set once at startup)
// ---------------------------------------------------------------------------

let _registry: ControllerRegistry | null = null;

/**
 * Bind the bridge to a live ControllerRegistry instance.
 * Must be called before any other bridge function.
 */
export function setRegistry(registry: ControllerRegistry): void {
  _registry = registry;
}

function getRegistry(): ControllerRegistry {
  if (!_registry) {
    throw new Error(
      'ControllerRegistry not initialized. Call setRegistry() first.',
    );
  }
  return _registry;
}

// ---------------------------------------------------------------------------
// Generic controller accessor (mirrors AgentDBService's internal pattern)
// ---------------------------------------------------------------------------

/**
 * Retrieve any controller by name.
 * Returns `null` when the controller is unavailable — callers must guard.
 */
export function getController<T = unknown>(name: ControllerName): T | null {
  return getRegistry().get<T>(name);
}

// ---------------------------------------------------------------------------
// Typed accessors for the 15 most-used controllers
//
// Each mirrors a private field that AgentDBService held.  The return type is
// intentionally `any` to match AgentDBService's untyped controller fields —
// the real types live inside the controller implementations and will be
// surfaced when Phase 5 adds proper generics.
// ---------------------------------------------------------------------------

/** ReflexionMemory — episode store/recall */
export function getReflexionMemory(): unknown {
  return getRegistry().get('reflexion');
}

/** SkillLibrary — skill publish/find */
export function getSkillLibrary(): unknown {
  return getRegistry().get('skills');
}

/** ReasoningBank — pattern store/search */
export function getReasoningBank(): unknown {
  return getRegistry().get('reasoningBank');
}

/** CausalGraph — edge recording and path queries */
export function getCausalGraph(): unknown {
  return getRegistry().get('causalGraph');
}

/** CausalRecall — explainable retrieval */
export function getCausalRecall(): unknown {
  return getRegistry().get('causalRecall');
}

/** LearningSystem — RL training loop */
export function getLearningSystem(): unknown {
  return getRegistry().get('learningSystem');
}

/** AttentionService — self/cross/multi-head attention */
export function getAttentionService(): unknown {
  return getRegistry().get('attentionService');
}

/** ContextSynthesizer — multi-episode context synthesis */
export function getContextSynthesizer(): unknown {
  return getRegistry().get('contextSynthesizer');
}

/** MMRDiversityRanker — diverse recall via MMR */
export function getMMRRanker(): unknown {
  return getRegistry().get('mmrDiversityRanker');
}

/** ExplainableRecall — certificates and provenance */
export function getExplainableRecall(): unknown {
  return getRegistry().get('explainableRecall');
}

/** NightlyLearner — automated consolidation */
export function getNightlyLearner(): unknown {
  return getRegistry().get('nightlyLearner');
}

/** RVFOptimizer — embedding compression & dedup */
export function getRvfOptimizer(): unknown {
  return getRegistry().get('rvfOptimizer');
}

/** SemanticRouter — task routing */
export function getSemanticRouter(): unknown {
  return getRegistry().get('semanticRouter');
}

/** GNNService — graph neural network learning */
export function getGnnService(): unknown {
  return getRegistry().get('gnnService');
}

/** VectorBackend — raw vector storage */
export function getVectorBackend(): unknown {
  return getRegistry().get('vectorBackend');
}

/** GraphAdapter — graph-node integration */
export function getGraphAdapter(): unknown {
  return getRegistry().get('graphAdapter');
}

/** SONA trajectory tracking */
export function getSonaTrajectory(): unknown {
  return getRegistry().get('sonaTrajectory');
}

/** HierarchicalMemory — tiered memory system */
export function getHierarchicalMemory(): unknown {
  return getRegistry().get('hierarchicalMemory');
}

/** MemoryConsolidation — memory compaction */
export function getMemoryConsolidation(): unknown {
  return getRegistry().get('memoryConsolidation');
}

/** EnhancedEmbeddingService — ADR-0069 embeddings */
export function getEnhancedEmbeddingService(): unknown {
  return getRegistry().get('enhancedEmbeddingService');
}

/** QueryOptimizer — query planning */
export function getQueryOptimizer(): unknown {
  return getRegistry().get('queryOptimizer');
}

/** AuditLogger — audit trail */
export function getAuditLogger(): unknown {
  return getRegistry().get('auditLogger');
}

/** TieredCache — multi-level caching */
export function getTieredCache(): unknown {
  return getRegistry().get('tieredCache');
}

/** LearningBridge — CLI-layer learning integration */
export function getLearningBridge(): unknown {
  return getRegistry().get('learningBridge');
}

/** MemoryGraph — graph-based memory */
export function getMemoryGraph(): unknown {
  return getRegistry().get('memoryGraph');
}

// ---------------------------------------------------------------------------
// Convenience: check whether the registry has been bound
// ---------------------------------------------------------------------------

export function isRegistryBound(): boolean {
  return _registry !== null;
}
