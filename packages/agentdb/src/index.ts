/**
 * AgentDB - Main Entry Point
 *
 * Frontier Memory Features with MCP Integration:
 * - Causal reasoning and memory graphs
 * - Reflexion memory with self-critique
 * - Skill library with automated learning
 * - Vector search with embeddings
 * - Reinforcement learning (9 algorithms)
 */

// Main AgentDB class
export { AgentDB } from './core/AgentDB.js';

// Core controllers
export { CausalMemoryGraph } from './controllers/CausalMemoryGraph.js';
export { CausalRecall } from './controllers/CausalRecall.js';
export { ExplainableRecall } from './controllers/ExplainableRecall.js';
export { NightlyLearner } from './controllers/NightlyLearner.js';
export { ReflexionMemory } from './controllers/ReflexionMemory.js';
export { SkillLibrary } from './controllers/SkillLibrary.js';
export { LearningSystem } from './controllers/LearningSystem.js';
export { ReasoningBank } from './controllers/ReasoningBank.js';

// Embedding services
export { EmbeddingService } from './controllers/EmbeddingService.js';
export { EnhancedEmbeddingService } from './controllers/EnhancedEmbeddingService.js';

// Model cache (offline .rvf model loading)
export { ModelCacheLoader } from './model/ModelCacheLoader.js';

// WASM acceleration and HNSW indexing
export { WASMVectorSearch } from './controllers/WASMVectorSearch.js';
export { HNSWIndex, isHnswlibAvailable } from './controllers/HNSWIndex.js';

// Attention mechanisms
export { AttentionService } from './controllers/AttentionService.js';

// Memory Controller with Attention Integration
export { MemoryController } from './controllers/MemoryController.js';

// Attention Controllers
export { SelfAttentionController } from './controllers/attention/SelfAttentionController.js';
export { CrossAttentionController } from './controllers/attention/CrossAttentionController.js';
export { MultiHeadAttentionController } from './controllers/attention/MultiHeadAttentionController.js';

// Database utilities
export { createDatabase } from './db-fallback.js';

// Optimizations
export { BatchOperations } from './optimizations/BatchOperations.js';
export { QueryOptimizer } from './optimizations/QueryOptimizer.js';
export { RVFOptimizer } from './optimizations/RVFOptimizer.js';

// Security
export {
  validateTableName,
  validateColumnName,
  validatePragmaCommand,
  buildSafeWhereClause,
  buildSafeSetClause,
  ValidationError,
} from './security/input-validation.js';

// Services - RuVector package integrations
export { SemanticRouter } from './services/SemanticRouter.js';
export { SonaTrajectoryService } from './services/SonaTrajectoryService.js';
export { LLMRouter } from './services/LLMRouter.js';
export { GraphTransformerService } from './services/GraphTransformerService.js';
export { GNNService } from './services/GNNService.js';

// Consensus - Distributed coordination
export { RaftConsensus } from './consensus/RaftConsensus.js';
export type { RaftConfig, LogEntry, RaftState } from './consensus/RaftConsensus.js';

// Re-export service types for convenience
export type { RouteResult, RouteConfig } from './services/SemanticRouter.js';
export type { TrajectoryStep, StoredTrajectory, PredictionResult, SonaStats } from './services/SonaTrajectoryService.js';
export type { LLMConfig, LLMResponse } from './services/LLMRouter.js';
export type { GraphTransformerStats } from './services/GraphTransformerService.js';
export type { GNNConfig, IntentResult } from './services/GNNService.js';
export type { RVFConfig } from './optimizations/RVFOptimizer.js';

// Vector math utilities
export { cosineSimilarity, batchCosineSimilarity, distanceToSimilarity, serializeEmbedding, deserializeEmbedding } from './utils/vector-math.js';

// Re-export all controllers for convenience
export * from './controllers/index.js';

// Thompson Sampling bandit (RVF backend)
export { SolverBandit } from './backends/rvf/SolverBandit.js';
export type { BanditArmStats, BanditConfig, BanditStats, BanditState } from './backends/rvf/SolverBandit.js';

// LLM Router - Multi-provider LLM integration with RuvLLM support
export {
  LLMRouter,
  isRuvLLMInstalled,
  type LLMConfig,
  type LLMResponse,
} from './services/LLMRouter.js';
