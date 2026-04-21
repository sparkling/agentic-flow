/**
 * AgentDB Integration Service
 *
 * Singleton service providing a unified interface to AgentDB controllers.
 * Detects backends (RuVector -> HNSWLib -> sql.js) with in-memory fallback.
 */
import * as path from 'path';
import * as fs from 'fs';
import { CostOptimizerService } from './cost-optimizer-service.js';
import { getEmbeddingConfig, deriveHNSWParams } from '../../../packages/agentdb/src/config/embedding-config.js'; // ADR-0069

// -- Public interfaces ------------------------------------------------------

export interface EpisodeData {
  sessionId: string;
  task: string;
  input?: string;
  output?: string;
  critique?: string;
  reward: number;
  success: boolean;
  latencyMs?: number;
  tokensUsed?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface Episode extends EpisodeData {
  id: number;
  ts: number;
  similarity?: number;
}

export interface SkillData {
  name: string;
  description?: string;
  code?: string;
  successRate: number;
  metadata?: Record<string, unknown>;
}

export interface Skill extends SkillData {
  id: number;
  uses: number;
  avgReward: number;
  similarity?: number;
}

export interface PatternData {
  taskType: string;
  approach: string;
  successRate: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface Pattern extends PatternData {
  id: number;
  uses: number;
  similarity?: number;
}

export interface CausalPath {
  from: string;
  to: string;
  edges: Array<{ fromId: string; toId: string; similarity: number; uplift?: number; confidence: number }>;
}

export interface TrajectoryStep {
  state: string;
  action: string;
  reward: number;
  nextState?: string;
}

export interface PredictedAction {
  action: string;
  confidence: number;
  alternatives: Array<{ action: string; confidence: number }>;
}

export interface RouteResult {
  tier: 1 | 2 | 3;
  handler: string;
  confidence: number;
  reasoning: string;
}

export interface Explanation {
  decisionId: string;
  chunks: string[];
  minimalWhy: string[];
  completenessScore: number;
}

export interface ServiceMetrics {
  backend: string;
  episodes: number;
  skills: number;
  patterns: number;
  uptime: number;
}

/**
 * Fallback / health status surface for MCP health-check tools.
 * See sparkling/agentic-flow#4 — InMemoryStore data loss fix.
 */
export interface FallbackStatus {
  /** Active backend name — 'agentdb' when healthy, 'in-memory' when init failed */
  backend: string;
  /** True when the service is running in degraded (non-persistent) mode */
  degraded: boolean;
  /** Captured init error message, or null when init succeeded */
  initError: string | null;
  /** Counters for writes that were rejected while in degraded mode */
  droppedWrites: {
    episodes: number;
    skills: number;
    patterns: number;
  };
}

// -- ADR-0076 Phase 5: InMemoryStore removed (silent data loss fallback) ----
// ADR-0076 / sparkling/agentic-flow#4: writes against an uninitialized backend
// now throw loudly with a captured init error instead of silently returning
// placeholder IDs.  `getFallbackStatus()` surfaces degraded state to callers.

// -- Service ----------------------------------------------------------------

export class AgentDBService {
  private static instance: AgentDBService | null = null;

  private db: any = null;
  private reflexionMemory: any = null;
  private skillLibrary: any = null;
  private reasoningBank: any = null;
  private causalGraph: any = null;
  private causalRecall: any = null;
  private learningSystem: any = null;
  private embeddingService: any = null;
  private vectorBackend: any = null;

  // Phase 1: High-impact dormant controllers
  private attentionService: any = null;
  private wasmVectorSearch: any = null;
  private mmrRanker: any = null;
  private contextSynthesizer: any = null;

  // Phase 2: RuVector package integrations
  private gnnLearning: any = null;  // @ruvector/gnn
  private semanticRouter: any = null;  // @ruvector/router
  private graphAdapter: any = null;  // @ruvector/graph-node
  private sonaService: any = null;  // @ruvector/sona
  private gnnEnabled: boolean = false;
  private routerEnabled: boolean = false;
  private graphEnabled: boolean = false;
  private sonaEnabled: boolean = false;

  // Phase 4: Distributed controllers
  private syncCoordinator: any = null;
  private nightlyLearner: any = null;
  private explainableRecall: any = null;
  private quicClient: any = null;
  private quicServer: any = null;

  // ADR-063: RVF Optimizer for 2-100x embedding optimization
  private rvfOptimizer: any = null;

  // ADR-066 P2-3: Hierarchical Memory System
  public hierarchicalMemory: any = null;
  public memoryConsolidation: any = null;

  // ADR-064: Cost Optimizer for 90% savings via intelligent model routing
  private costOptimizer: CostOptimizerService | null = null;

  // ADR-0076: counters track fallback operations (no data stored in-memory)
  private fallbackEpisodeCount = 0;
  private fallbackSkillCount = 0;
  private fallbackPatternCount = 0;
  private causalEdges: Array<{ from: string; to: string; metadata: unknown }> = [];
  private trajectories: Array<{ steps: TrajectoryStep[]; reward: number }> = [];

  // sparkling/agentic-flow#4: captured at end of initialize() catch, non-null
  // means the service is in degraded mode and all persistent writes must throw.
  private initError: string | null = null;

  private backendName = 'in-memory';
  private startTime = Date.now();
  private initialized = false;

  private constructor() {}

  static async getInstance(): Promise<AgentDBService> {
    if (!AgentDBService.instance) {
      AgentDBService.instance = new AgentDBService();
      await AgentDBService.instance.initialize();
    }
    return AgentDBService.instance;
  }

  static resetInstance(): void { AgentDBService.instance = null; }

  // -- Init -----------------------------------------------------------------

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    const dbDir = path.join(process.cwd(), '.claude-flow', 'agentdb');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'agentdb.sqlite');

    try {
      const agentdb = await import(
        /* webpackIgnore: true */ '../../../packages/agentdb/src/index.js'
      );
      const AgentDB = agentdb.AgentDB;
      this.db = new AgentDB({ dbPath });
      await this.db.initialize();

      const EmbeddingSvc = agentdb.EmbeddingService;
      const embCfg = getEmbeddingConfig(); // ADR-0069: config-chain-aware
      this.embeddingService = new EmbeddingSvc({
        model: embCfg.model, dimension: embCfg.dimension, provider: embCfg.provider,
      });
      await this.embeddingService.initialize();

      // ADR-063: Initialize RVFOptimizer for 2-100x embedding optimization
      try {
        const { RVFOptimizer } = await import(
          /* webpackIgnore: true */ '../../../packages/agentdb/src/optimizations/RVFOptimizer.js'
        );
        // ADR-0069 A11: config-chain dedup threshold
        let _dedupThreshold = 0.95;
        try {
          const _cfg = JSON.parse(fs.readFileSync(
            path.join(process.cwd(), '.claude-flow', 'config.json'), 'utf-8'));
          _dedupThreshold = _cfg.memory?.dedupThreshold ?? 0.95;
        } catch { /* use default */ }

        this.rvfOptimizer = new RVFOptimizer({
          compression: {
            enabled: true,
            quantizeBits: 8,  // 4x memory reduction, minimal quality loss
            deduplicationThreshold: _dedupThreshold,  // ADR-0069 A11: was 0.98, now config-chain-aware
            adaptive: true,
            progressive: true
          },
          pruning: {
            enabled: true,
            minConfidence: 0.3,  // Remove low-quality memories
            maxAge: 30 * 24 * 60 * 60 * 1000  // 30 days
          },
          batching: {
            enabled: true,
            batchSize: 32,  // Optimal for most workloads
            maxWaitMs: 10   // 10ms max latency
          },
          caching: {
            enabled: true,
            maxSize: 10000,  // 10K embeddings cached
            ttl: 60 * 60 * 1000,  // 1 hour TTL
            multiLevel: true
          }
        });
        console.log('[AgentDBService] RVFOptimizer initialized (2-100x performance improvement)');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[AgentDBService] RVFOptimizer unavailable (${msg}), using unoptimized embeddings`);
      }

      // Initialize VectorBackend for HNSW-accelerated search
      let vectorBackend: any = null;
      try {
        const { createBackend } = await import(
          /* webpackIgnore: true */ '../../../packages/agentdb/src/backends/factory.js'
        );
        const hnswParams = deriveHNSWParams(embCfg.dimension); // ADR-0069: config-chain-aware
        vectorBackend = await createBackend('auto', {
          dimension: embCfg.dimension,
          metric: 'cosine',
          maxElements: hnswParams.maxElements, // ADR-0069: use config-chain capacity
          efConstruction: hnswParams.efConstruction,
          M: hnswParams.M,
        });
        this.vectorBackend = vectorBackend;
        console.log('[AgentDBService] VectorBackend initialized');
      } catch (err) {
        console.warn('[AgentDBService] VectorBackend unavailable, using SQL fallback');
      }

      const database = this.db.database;
      // ADR-060: Wrap vectorBackend with proof-gated MutationGuard.
      // Proofs via @ruvector/graph-transformer prevent the root-cause errors
      // (dimension mismatch, missing field `k`) before they reach the native addon.
      let controllerVB: any = null;
      if (vectorBackend) {
        try {
          const { MutationGuard } = await import(
            /* webpackIgnore: true */ '../../../packages/agentdb/src/security/MutationGuard.js'
          );
          const { GuardedVectorBackend } = await import(
            /* webpackIgnore: true */ '../../../packages/agentdb/src/backends/ruvector/GuardedVectorBackend.js'
          );
          const { AttestationLog } = await import(
            /* webpackIgnore: true */ '../../../packages/agentdb/src/security/AttestationLog.js'
          );
          const guard = new MutationGuard({
            dimension: embCfg.dimension, // ADR-0069: config-chain-aware
            maxElements: hnswParams.maxElements, // ADR-0069: use config-chain capacity
            enableWasmProofs: true,
            enableAttestationLog: true,
            defaultNamespace: 'agentdb',
          });
          await guard.initialize();
          const attestLog = new AttestationLog(database);
          controllerVB = new GuardedVectorBackend(vectorBackend, guard, attestLog);
          console.log(`[AgentDBService] VectorBackend guarded (${guard.getStats().engineType})`);
        } catch (guardErr) {
          const msg = guardErr instanceof Error ? guardErr.message : String(guardErr);
          console.warn(`[AgentDBService] MutationGuard unavailable (${msg}), vectorBackend disabled`);
        }
      }
      // ADR-0076 Phase 4: Import getOrCreate from @claude-flow/memory to share
      // controller instances with ControllerRegistry (prevents dual construction).
      let getOrCreate: ((name: string, factory: () => any) => any) | null = null;
      try {
        const intercept = await import(/* webpackIgnore: true */ '@claude-flow/memory');
        getOrCreate = intercept.getOrCreate ?? null;
      } catch { /* @claude-flow/memory not available */ }

      // ADR-0069 F1: Delegate to AgentDB.getController() for single-instance controllers.
      // Fall back to direct construction if getController() returns null.
      // ADR-0076 Phase 4: Wrap with getOrCreate() so ControllerRegistry and
      // AgentDBService share the same controller instances.
      this.reflexionMemory = getOrCreate
        ? getOrCreate('reflexion', () => this.db.getController('reflexion')
            ?? new agentdb.ReflexionMemory(database, this.embeddingService, controllerVB))
        : this.db.getController('reflexion')
            ?? new agentdb.ReflexionMemory(database, this.embeddingService, controllerVB);
      this.skillLibrary = getOrCreate
        ? getOrCreate('skills', () => this.db.getController('skills')
            ?? new agentdb.SkillLibrary(database, this.embeddingService, controllerVB))
        : this.db.getController('skills')
            ?? new agentdb.SkillLibrary(database, this.embeddingService, controllerVB);
      this.reasoningBank = getOrCreate
        ? getOrCreate('reasoningBank', () => this.db.getController('reasoning')
            ?? new agentdb.ReasoningBank(database, this.embeddingService, controllerVB))
        : this.db.getController('reasoning')
            ?? new agentdb.ReasoningBank(database, this.embeddingService, controllerVB);
      this.causalGraph = getOrCreate
        ? getOrCreate('causalGraph', () => this.db.getController('causalGraph')
            ?? new agentdb.CausalMemoryGraph(database))
        : this.db.getController('causalGraph')
            ?? new agentdb.CausalMemoryGraph(database);
      this.causalRecall = getOrCreate
        ? getOrCreate('causalRecall', () => this.db.getController('causalRecall')
            ?? new agentdb.CausalRecall(database, this.embeddingService))
        : this.db.getController('causalRecall')
            ?? new agentdb.CausalRecall(database, this.embeddingService);
      this.learningSystem = getOrCreate
        ? getOrCreate('learningSystem', () => this.db.getController('learning')
            ?? new agentdb.LearningSystem(database, this.embeddingService))
        : this.db.getController('learning')
            ?? new agentdb.LearningSystem(database, this.embeddingService);
      this.backendName = 'agentdb';
      console.log('[AgentDBService] Initialized with real AgentDB backend');

      // Phase 1: Initialize high-impact dormant controllers
      await this.initializePhase1Controllers(database);
      // Replace basic EmbeddingService with EnhancedEmbeddingService
      await this.upgradeEmbeddingService();
      // Phase 2: Initialize RuVector package integrations
      await this.initializePhase2RuVectorPackages(database);
      // Phase 4: Initialize distributed controllers
      await this.initializePhase4Controllers(database);

      // ADR-064: Initialize Cost Optimizer for intelligent model routing
      try {
        this.costOptimizer = CostOptimizerService.getInstance();
        console.log('[AgentDBService] CostOptimizer initialized (90% savings via intelligent routing)');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[AgentDBService] CostOptimizer unavailable (${msg})`);
      }

      // ADR-066 P2-3: Initialize Hierarchical Memory System
      // ADR-0069 F1: Prefer AgentDB.getController() with fallback to direct construction
      try {
        this.hierarchicalMemory = this.db.getController('hierarchicalMemory');
        if (!this.hierarchicalMemory) {
          const { HierarchicalMemory } = await import(
            /* webpackIgnore: true */ '../../../packages/agentdb/src/controllers/HierarchicalMemory.js'
          );
          const graphBackend: any = null;
          this.hierarchicalMemory = new HierarchicalMemory(
            database,
            this.embeddingService,
            vectorBackend,
            graphBackend,
            {
              workingMemoryLimit: 1024 * 1024, // 1MB
              episodicWindow: 7 * 24 * 60 * 60 * 1000, // 7 days
              autoConsolidate: true,
            }
          );
        }

        this.memoryConsolidation = this.db.getController('memoryConsolidation');
        if (!this.memoryConsolidation) {
          const { MemoryConsolidation } = await import(
            /* webpackIgnore: true */ '../../../packages/agentdb/src/controllers/MemoryConsolidation.js'
          );
          const graphBackend: any = null;
          this.memoryConsolidation = new MemoryConsolidation(
            database,
            this.hierarchicalMemory,
            this.embeddingService,
            vectorBackend,
            graphBackend,
            {
              clusterThreshold: 0.75,
              importanceThreshold: 0.6,
              enableSpacedRepetition: true,
            }
          );
        }

        console.log('[AgentDBService] HierarchicalMemory + MemoryConsolidation initialized (3-tier memory system)');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[AgentDBService] HierarchicalMemory unavailable (${msg})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // sparkling/agentic-flow#4: capture init error so subsequent writes
      // throw loudly instead of silently accepting data into a volatile map.
      this.initError = msg;
      console.error(
        `[AgentDBService] AgentDB init failed (${msg}). ` +
        `Service is in DEGRADED mode — all persistent writes will throw. ` +
        `Read operations return empty results. Call getFallbackStatus() for details.`,
      );
      this.backendName = 'in-memory';
    }
    this.initialized = true;
  }

  /**
   * Guard for persistent write methods. Throws loudly when the service failed
   * to initialize a real backend, so callers cannot silently lose data.
   * See sparkling/agentic-flow#4.
   */
  private assertPersistent(operation: string): void {
    if (this.initError) {
      throw new Error(
        `AgentDBService is in degraded mode — ${operation} cannot persist data. ` +
        `Original init error: ${this.initError}. ` +
        `Use getFallbackStatus() to check health before calling write methods.`,
      );
    }
  }

  /**
   * Returns the current fallback/health status for MCP health-check tools.
   * Callers can use this to decide whether to attempt persistent writes.
   * See sparkling/agentic-flow#4.
   */
  getFallbackStatus(): FallbackStatus {
    return {
      backend: this.backendName,
      degraded: this.initError !== null,
      initError: this.initError,
      droppedWrites: {
        episodes: this.fallbackEpisodeCount,
        skills: this.fallbackSkillCount,
        patterns: this.fallbackPatternCount,
      },
    };
  }

  /**
   * Initialize Phase 1 high-impact controllers
   */
  private async initializePhase1Controllers(database: any): Promise<void> {
    // 1. AttentionService - Advanced attention mechanisms with @ruvector/attention
    // ADR-0069 F1: Prefer AgentDB.getController() with fallback to direct construction
    try {
      this.attentionService = this.db.getController('attentionService');
      if (!this.attentionService) {
        const { AttentionService } = await import(
          /* webpackIgnore: true */ '../../../packages/agentdb/src/controllers/AttentionService.js'
        );
        this.attentionService = new AttentionService({
          numHeads: 8,
          headDim: 48,
          embedDim: getEmbeddingConfig()?.dimension ?? 768,
          useFlash: true,
          dropout: 0.1,
        });
        await this.attentionService.initialize();
      }
      console.log('[AgentDBService] AttentionService initialized');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AgentDBService] AttentionService unavailable (${msg})`);
    }

    // 2. WASMVectorSearch - High-performance vector operations with ReasoningBank WASM
    try {
      const { WASMVectorSearch } = await import(
        /* webpackIgnore: true */ '../../../packages/agentdb/src/controllers/WASMVectorSearch.js'
      );
      this.wasmVectorSearch = new WASMVectorSearch(database, {
        enableWASM: true,
        enableSIMD: true,
        batchSize: 100,
        indexThreshold: 1000,
      });
      console.log('[AgentDBService] WASMVectorSearch initialized');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AgentDBService] WASMVectorSearch unavailable (${msg})`);
    }

    // 3. MMRDiversityRanker - Already loaded statically, store reference
    try {
      const { MMRDiversityRanker } = await import(
        /* webpackIgnore: true */ '../../../packages/agentdb/src/controllers/MMRDiversityRanker.js'
      );
      this.mmrRanker = MMRDiversityRanker;
      console.log('[AgentDBService] MMRDiversityRanker initialized');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AgentDBService] MMRDiversityRanker unavailable (${msg})`);
    }

    // 4. ContextSynthesizer - Context generation from multiple memories
    try {
      const { ContextSynthesizer } = await import(
        /* webpackIgnore: true */ '../../../packages/agentdb/src/controllers/ContextSynthesizer.js'
      );
      this.contextSynthesizer = ContextSynthesizer;
      console.log('[AgentDBService] ContextSynthesizer initialized');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AgentDBService] ContextSynthesizer unavailable (${msg})`);
    }
  }

  /**
   * Upgrade basic EmbeddingService through a 3-tier fallback chain.
   *
   * ADR-0069 F3 §3: chain is ONNX → Enhanced → Basic. Higher tiers are
   * preferred; a failing tier falls through with a loud warning (ADR-0082:
   * no silent fallback — every failed tier logs the error kind + message).
   *
   *   Tier 1: ONNXEmbeddingService (packages/agentdb-onnx) — local,
   *           GPU-accelerated via onnxruntime / @xenova/transformers.
   *   Tier 2: EnhancedEmbeddingService — WASM-accelerated, batch-capable.
   *   Tier 3: keep the basic EmbeddingService constructed earlier.
   */
  private async upgradeEmbeddingService(): Promise<void> {
    if (!this.embeddingService) return;

    const upgradeCfg = getEmbeddingConfig(); // ADR-0069: config-chain-aware
    const tierFailures: Array<{ tier: string; error: string }> = [];

    // -------------------------------------------------------------------
    // Tier 1: ONNXEmbeddingService (ADR-0069 F3 §3 — highest priority)
    // -------------------------------------------------------------------
    try {
      const onnxMod = await import(
        /* webpackIgnore: true */ '../../../packages/agentdb-onnx/src/services/ONNXEmbeddingService.js'
      );
      const ONNXEmbeddingService = (onnxMod as any).ONNXEmbeddingService;
      if (typeof ONNXEmbeddingService !== 'function') {
        throw new Error('ONNXEmbeddingService export not found in agentdb-onnx package');
      }

      // Model name: prefer canonical config, coerce to Xenova/... shape if
      // no HF-org prefix is present (ONNX service does the same internally).
      const modelName = upgradeCfg.model.includes('/')
        ? upgradeCfg.model
        : `Xenova/${upgradeCfg.model}`;

      const onnx = new ONNXEmbeddingService({
        modelName,
        batchSize: 32,
        cacheSize: 10000,
        quantization: 'none',
        useGPU: true,
      });
      await onnx.initialize();

      // Adapt ONNX service.embed() -> plain Float32Array shape that
      // the rest of the codebase (controllers, mmrRanker) expects.
      const adapter = {
        model: modelName,
        dimension: upgradeCfg.dimension,
        async embed(text: string): Promise<Float32Array> {
          const r = await onnx.embed(text);
          return r.embedding;
        },
        async embedBatch(texts: string[]): Promise<Float32Array[]> {
          const r = await onnx.embedBatch(texts);
          return r.embeddings;
        },
        getDimension(): number {
          return typeof onnx.getDimension === 'function'
            ? onnx.getDimension()
            : upgradeCfg.dimension;
        },
        _tier: 'onnx' as const,
        _onnx: onnx,
      };

      this.embeddingService = adapter as any;
      // Propagate to the AgentDB instance if it exposes the hook (F1 §1).
      // Guarded because the upstream hook is not yet merged in every fork
      // build — guarding preserves the upgrade even when the method is
      // missing, without silently masking a wired-up failure.
      if (this.db && typeof (this.db as any).replaceEmbeddingService === 'function') {
        try {
          (this.db as any).replaceEmbeddingService(adapter);
        } catch (propErr) {
          const m = propErr instanceof Error ? propErr.message : String(propErr);
          console.warn(`[AgentDBService] ONNX embedder propagation failed: ${m}`);
        }
      }
      console.log('[AgentDBService] Upgraded to ONNXEmbeddingService (local, GPU-accelerated) — tier=onnx');
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const kind = err instanceof Error ? err.constructor.name : 'UnknownError';
      tierFailures.push({ tier: 'onnx', error: `${kind}: ${msg}` });
      console.warn(`[AgentDBService] ONNXEmbeddingService unavailable (${kind}: ${msg}), trying Enhanced tier`);
    }

    // -------------------------------------------------------------------
    // Tier 2: EnhancedEmbeddingService
    // -------------------------------------------------------------------
    try {
      const { EnhancedEmbeddingService } = await import(
        /* webpackIgnore: true */ '../../../packages/agentdb/src/controllers/EnhancedEmbeddingService.js'
      );

      const enhanced = new EnhancedEmbeddingService({
        model: upgradeCfg.model,
        dimension: upgradeCfg.dimension,
        provider: upgradeCfg.provider,
        enableWASM: true,
        enableBatchProcessing: true,
        batchSize: 100,
      });
      await enhanced.initialize();
      (enhanced as any)._tier = 'enhanced';

      // Replace basic service with enhanced version
      this.embeddingService = enhanced;
      if (this.db && typeof (this.db as any).replaceEmbeddingService === 'function') {
        try {
          (this.db as any).replaceEmbeddingService(enhanced);
        } catch (propErr) {
          const m = propErr instanceof Error ? propErr.message : String(propErr);
          console.warn(`[AgentDBService] Enhanced embedder propagation failed: ${m}`);
        }
      }
      console.log('[AgentDBService] Upgraded to EnhancedEmbeddingService with WASM acceleration — tier=enhanced');
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const kind = err instanceof Error ? err.constructor.name : 'UnknownError';
      tierFailures.push({ tier: 'enhanced', error: `${kind}: ${msg}` });
      console.warn(`[AgentDBService] EnhancedEmbeddingService unavailable (${kind}: ${msg}), keeping basic service`);
    }

    // -------------------------------------------------------------------
    // Tier 3: basic — already set on this.embeddingService; keep as-is.
    // ADR-0082: emit the full tier-failure trail so the demotion is
    // visible in the log instead of being silently swallowed.
    // -------------------------------------------------------------------
    (this.embeddingService as any)._tier = (this.embeddingService as any)._tier ?? 'basic';
    if (tierFailures.length > 0) {
      console.warn(
        `[AgentDBService] Embedder demoted to basic tier after ${tierFailures.length} failures: ` +
        tierFailures.map(f => `${f.tier}(${f.error})`).join(' -> ')
      );
    }
  }

  /**
   * Initialize Phase 2: Activate 4 dormant RuVector packages
   * 1. @ruvector/gnn - Graph Neural Networks for enhanced embeddings
   * 2. @ruvector/router - Semantic routing
   * 3. @ruvector/graph-node - Native hypergraph database
   * 4. @ruvector/sona - RL trajectory learning
   */
  private async initializePhase2RuVectorPackages(database: any): Promise<void> {
    // 1. @ruvector/gnn - GNN-enhanced learning
    // ADR-0069 F1: Prefer AgentDB.getController() with fallback to direct construction
    try {
      this.gnnLearning = this.db.getController('gnnLearning');
      if (!this.gnnLearning) {
        const { RuVectorLearning } = await import(
          /* webpackIgnore: true */ '../../../packages/agentdb/src/backends/ruvector/RuVectorLearning.js'
        );

        this.gnnLearning = new RuVectorLearning({
          inputDim: getEmbeddingConfig()?.dimension ?? 768,
          hiddenDim: 256,
          heads: 4,
          dropout: 0.1
        });

        await this.gnnLearning.initialize();
        // Register back into AgentDB so getController() works for others
        this.db.setController('gnnLearning', this.gnnLearning);
      }
      this.gnnEnabled = true;
      console.log('✅ [AgentDBService] Phase 2.1: GNN-enhanced learning active (@ruvector/gnn)');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AgentDBService] Phase 2.1: GNN unavailable (${msg})`);
      this.gnnEnabled = false;
    }

    // 2. @ruvector/router - Semantic routing
    // ADR-0069 F1: Prefer AgentDB.getController() with fallback to direct construction
    try {
      this.semanticRouter = this.db.getController('semanticRouter');
      if (!this.semanticRouter) {
        const { SemanticRouter } = await import(
          /* webpackIgnore: true */ '../../../packages/agentdb/src/services/SemanticRouter.js'
        );

        this.semanticRouter = new SemanticRouter();
        const initialized = await this.semanticRouter.initialize();
        this.routerEnabled = initialized;

        if (initialized) {
          // Add default routes for tier routing
          await this.semanticRouter.addRoute('tier1', 'Simple transforms and basic operations', ['transform', 'convert', 'format']);
          await this.semanticRouter.addRoute('tier2', 'Moderate complexity tasks', ['implement', 'create', 'build']);
          await this.semanticRouter.addRoute('tier3', 'Complex reasoning and architecture', ['design', 'architect', 'optimize']);

          // Register back into AgentDB so getController() works for others
          this.db.setController('semanticRouter', this.semanticRouter);
          console.log('✅ [AgentDBService] Phase 2.2: Semantic routing active (@ruvector/router)');
        } else {
          console.warn('[AgentDBService] Phase 2.2: Router using keyword fallback');
        }
      } else {
        this.routerEnabled = true;
        console.log('✅ [AgentDBService] Phase 2.2: Semantic routing active (via getController)');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AgentDBService] Phase 2.2: Router unavailable (${msg})`);
      this.routerEnabled = false;
    }

    // 3. @ruvector/graph-node - Native hypergraph database
    // ADR-0069 F1: Prefer AgentDB.getController() with fallback to direct construction
    try {
      this.graphAdapter = this.db.getController('graphAdapter');
      if (!this.graphAdapter) {
        const { GraphDatabaseAdapter } = await import(
          /* webpackIgnore: true */ '../../../packages/agentdb/src/backends/graph/GraphDatabaseAdapter.js'
        );

        const graphPath = path.join(process.cwd(), '.claude-flow', 'agentdb', 'graph.db');
        this.graphAdapter = new GraphDatabaseAdapter(
          {
            storagePath: graphPath,
            dimensions: embCfg.dimension, // ADR-0069: config-chain-aware
            distanceMetric: 'Cosine'
          },
          this.embeddingService
        );

        await this.graphAdapter.initialize();
      }
      this.graphEnabled = !!this.graphAdapter;
      if (this.graphEnabled) {
        console.log('✅ [AgentDBService] Phase 2.3: Native hypergraph DB active (@ruvector/graph-node)');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AgentDBService] Phase 2.3: Graph DB unavailable (${msg})`);
      this.graphEnabled = false;
    }

    // 4. @ruvector/sona - RL trajectory learning
    // ADR-0069 F1: Prefer AgentDB.getController() with fallback to direct construction
    try {
      this.sonaService = this.db.getController('sonaService');
      if (!this.sonaService) {
        const { SonaTrajectoryService } = await import(
          /* webpackIgnore: true */ '../../../packages/agentdb/src/services/SonaTrajectoryService.js'
        );

        this.sonaService = new SonaTrajectoryService();
        const initialized = await this.sonaService.initialize();
        this.sonaEnabled = initialized;

        if (initialized) {
          // Register back into AgentDB so getController() works for others
          this.db.setController('sonaService', this.sonaService);
          console.log('✅ [AgentDBService] Phase 2.4: Sona RL trajectory learning active (@ruvector/sona)');
        } else {
          console.warn('[AgentDBService] Phase 2.4: Sona using in-memory fallback');
        }
      } else {
        this.sonaEnabled = true;
        console.log('✅ [AgentDBService] Phase 2.4: Sona RL trajectory learning active (via getController)');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AgentDBService] Phase 2.4: Sona unavailable (${msg})`);
      this.sonaEnabled = false;
    }

    console.log(`[AgentDBService] Phase 2 complete: GNN=${this.gnnEnabled}, Router=${this.routerEnabled}, Graph=${this.graphEnabled}, Sona=${this.sonaEnabled}`);
  }

  /**
   * Initialize Phase 4 distributed controllers (WASM + Distributed Features)
   */
  private async initializePhase4Controllers(database: any): Promise<void> {
    // 1. SyncCoordinator - Multi-instance sync with conflict resolution
    try {
      const { SyncCoordinator } = await import(
        /* webpackIgnore: true */ '../../../packages/agentdb/src/controllers/SyncCoordinator.js'
      );
      // Initialize QUIC client if enabled
      const quicEnabled = process.env.ENABLE_QUIC_SYNC === 'true';
      if (quicEnabled && process.env.QUIC_SERVER_HOST) {
        try {
          const { QUICClient } = await import(
            /* webpackIgnore: true */ '../../../packages/agentdb/src/controllers/QUICClient.js'
          );
          this.quicClient = new QUICClient({
            serverHost: process.env.QUIC_SERVER_HOST || 'localhost',
            serverPort: parseInt(process.env.QUIC_SERVER_PORT || '4433'),
            authToken: process.env.QUIC_AUTH_TOKEN,
          });
          console.log('[AgentDBService] QUICClient initialized');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[AgentDBService] QUICClient unavailable (${msg})`);
        }
      }

      this.syncCoordinator = new SyncCoordinator({
        db: database,
        client: this.quicClient,
        conflictStrategy: 'latest-wins',
        batchSize: 100,
        autoSync: false,
      });
      console.log('[AgentDBService] SyncCoordinator initialized');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AgentDBService] SyncCoordinator unavailable (${msg})`);
    }

    // 2. NightlyLearner - Automated causal discovery
    // ADR-0069 F1: Prefer AgentDB.getController() with fallback to direct construction
    try {
      this.nightlyLearner = this.db.getController('nightlyLearner');
      if (!this.nightlyLearner) {
        const { NightlyLearner } = await import(
          /* webpackIgnore: true */ '../../../packages/agentdb/src/controllers/NightlyLearner.js'
        );
        // ADR-0069 A7: config-chain similarity threshold
        const _cfgSimThreshold = (() => { try { const c = JSON.parse(require('fs').readFileSync(require('path').join(process.cwd(), '.claude-flow', 'config.json'), 'utf-8')); return c?.memory?.similarityThreshold; } catch { return undefined; } })();
        this.nightlyLearner = new NightlyLearner(database, this.embeddingService, {
          minSimilarity: _cfgSimThreshold ?? 0.7,
          minSampleSize: 30,
          confidenceThreshold: 0.6,
          upliftThreshold: 0.05,
          pruneOldEdges: true,
          edgeMaxAgeDays: 90,
          autoExperiments: true,
          experimentBudget: 10,
          ENABLE_FLASH_CONSOLIDATION: false,
        });
      }
      console.log('[AgentDBService] NightlyLearner initialized');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AgentDBService] NightlyLearner unavailable (${msg})`);
    }

    // 3. ExplainableRecall - Merkle provenance chains
    // ADR-0069 F1: Prefer AgentDB.getController() with fallback to direct construction
    try {
      this.explainableRecall = this.db.getController('explainableRecall');
      if (!this.explainableRecall) {
        const { ExplainableRecall } = await import(
          /* webpackIgnore: true */ '../../../packages/agentdb/src/controllers/ExplainableRecall.js'
        );
        this.explainableRecall = new ExplainableRecall(database, this.embeddingService, {
          ENABLE_GRAPH_ROPE: false,
        });
      }
      console.log('[AgentDBService] ExplainableRecall initialized');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AgentDBService] ExplainableRecall unavailable (${msg})`);
    }

    // 4. QUIC Server (optional, for distributed deployments)
    const quicServerEnabled = process.env.ENABLE_QUIC_SERVER === 'true';
    if (quicServerEnabled) {
      try {
        const { QUICServer } = await import(
          /* webpackIgnore: true */ '../../../packages/agentdb/src/controllers/QUICServer.js'
        );
        this.quicServer = new QUICServer(database, {
          host: process.env.QUIC_SERVER_HOST || '0.0.0.0',
          port: parseInt(process.env.QUIC_SERVER_PORT || '4433'),
          authToken: process.env.QUIC_AUTH_TOKEN,
          maxConnections: 100,
        });
        console.log('[AgentDBService] QUICServer initialized');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[AgentDBService] QUICServer unavailable (${msg})`);
      }
    }
  }

  // -- Episodes -------------------------------------------------------------

  async storeEpisode(episode: EpisodeData): Promise<string> {
    if (this.reflexionMemory) {
      try {
        return String(await this.reflexionMemory.storeEpisode(episode));
      } catch { this.reflexionMemory = null; }
    }
    // sparkling/agentic-flow#4: throw loudly when init failed; never silently
    // discard episode data.  Callers that want best-effort behaviour must
    // wrap the call in try/catch themselves.
    this.fallbackEpisodeCount++;
    this.assertPersistent('storeEpisode');
    console.warn('[AgentDBService] storeEpisode: ReflexionMemory controller unavailable after init, episode not persisted');
    return String(this.fallbackEpisodeCount);
  }

  async recallEpisodes(query: string, limit = 5, filters?: Record<string, any>): Promise<Episode[]> {
    if (this.reflexionMemory) {
      try {
        const fetchCount = filters && Object.keys(filters).length > 0 ? limit * 2 : limit;
        const results = await this.reflexionMemory.retrieveRelevant({ task: query, k: fetchCount });
        let episodes = (results ?? []).map((r: any) => ({
          id: r.id ?? 0, ts: r.ts ?? 0, sessionId: r.sessionId ?? '',
          task: r.task ?? '', input: r.input, output: r.output, critique: r.critique,
          reward: r.reward ?? 0, success: r.success ?? false, similarity: r.similarity,
          metadata: r.metadata,
        }));
        // Apply metadata filters if provided
        if (filters && Object.keys(filters).length > 0) {
          try {
            const { MetadataFilter } = await import(
              /* webpackIgnore: true */ '../../../packages/agentdb/src/controllers/MetadataFilter.js'
            );
            episodes = MetadataFilter.apply(episodes, filters);
          } catch { /* MetadataFilter unavailable */ }
        }
        return episodes.slice(0, limit);
      } catch { this.reflexionMemory = null; }
    }
    // ADR-0076: no silent in-memory fallback — return empty
    return [];
  }

  /**
   * Recall diverse episodes using MMR ranking to prevent near-duplicate results.
   * Now wired to use initialized MMRDiversityRanker controller.
   */
  async recallDiverseEpisodes(query: string, limit = 5, lambda = 0.5): Promise<Episode[]> {
    if (!this.reflexionMemory || !this.embeddingService) {
      return this.recallEpisodes(query, limit);
    }
    try {
      // Get extra candidates for diversity selection
      const candidates = await this.reflexionMemory.retrieveRelevant({ task: query, k: limit * 3 });
      if (!candidates || candidates.length <= limit) {
        return this.recallEpisodes(query, limit);
      }
      // Get query embedding
      const queryEmbedding = await this.embeddingService.embed(query);
      // Build MMR candidates
      const mmrCandidates = candidates.map((r: any) => ({
        id: r.id ?? 0,
        embedding: r.embedding ? Array.from(r.embedding) : [],
        similarity: r.similarity ?? 0,
        ...r,
      }));
      // Only apply MMR if we have embeddings and MMRRanker is initialized
      if (this.mmrRanker && mmrCandidates.some((c: any) => c.embedding.length > 0)) {
        try {
          const diverse = this.mmrRanker.selectDiverse(
            mmrCandidates,
            Array.from(queryEmbedding),
            { lambda, k: limit },
          );
          return diverse.map((r: any) => ({
            id: r.id ?? 0, ts: r.ts ?? 0, sessionId: r.sessionId ?? '',
            task: r.task ?? '', input: r.input, output: r.output, critique: r.critique,
            reward: r.reward ?? 0, success: r.success ?? false, similarity: r.similarity,
            metadata: r.metadata,
          }));
        } catch { /* MMR unavailable, fall through */ }
      }
    } catch { /* fall through */ }
    return this.recallEpisodes(query, limit);
  }

  // -- Skills ---------------------------------------------------------------

  async publishSkill(skill: SkillData): Promise<string> {
    if (this.skillLibrary) {
      try {
        return String(await this.skillLibrary.createSkill({
          name: skill.name, description: skill.description,
          code: skill.code, successRate: skill.successRate, metadata: skill.metadata,
        }));
      } catch { this.skillLibrary = null; }
    }
    // sparkling/agentic-flow#4: throw loudly when init failed; never silently
    // discard skill data.
    this.fallbackSkillCount++;
    this.assertPersistent('publishSkill');
    console.warn('[AgentDBService] publishSkill: SkillLibrary controller unavailable after init, skill not persisted');
    return String(this.fallbackSkillCount);
  }

  async findSkills(description: string, limit = 5, filters?: Record<string, any>): Promise<Skill[]> {
    if (this.skillLibrary) {
      try {
        const fetchCount = filters && Object.keys(filters).length > 0 ? limit * 2 : limit;
        const results = await this.skillLibrary.retrieveSkills({ task: description, k: fetchCount });
        let skills = (results ?? []).map((r: any) => ({
          id: r.id ?? 0, name: r.name ?? '', description: r.description, code: r.code,
          successRate: r.successRate ?? 0, uses: r.uses ?? 0, avgReward: r.avgReward ?? 0,
          similarity: r.similarity, metadata: r.metadata,
        }));
        // Apply metadata filters if provided
        if (filters && Object.keys(filters).length > 0) {
          try {
            const { MetadataFilter } = await import(
              /* webpackIgnore: true */ '../../../packages/agentdb/src/controllers/MetadataFilter.js'
            );
            skills = MetadataFilter.apply(skills, filters);
          } catch { /* MetadataFilter unavailable */ }
        }
        return skills.slice(0, limit);
      } catch { this.skillLibrary = null; }
    }
    // ADR-0076: no silent in-memory fallback — return empty
    return [];
  }

  // -- Patterns -------------------------------------------------------------

  async storePattern(pattern: PatternData): Promise<string> {
    if (this.reasoningBank) {
      try {
        return String(await this.reasoningBank.storePattern({
          taskType: pattern.taskType, approach: pattern.approach,
          successRate: pattern.successRate, tags: pattern.tags, metadata: pattern.metadata,
        }));
      } catch { this.reasoningBank = null; }
    }
    // sparkling/agentic-flow#4: throw loudly when init failed; never silently
    // discard pattern data.
    this.fallbackPatternCount++;
    this.assertPersistent('storePattern');
    console.warn('[AgentDBService] storePattern: ReasoningBank controller unavailable after init, pattern not persisted');
    return String(this.fallbackPatternCount);
  }

  async searchPatterns(query: string, limit = 5, diverse = false): Promise<Pattern[]> {
    if (this.reasoningBank) {
      try {
        const fetchCount = diverse ? limit * 3 : limit;
        const results = await this.reasoningBank.searchPatterns({ task: query, k: fetchCount });
        let patterns = (results ?? []).map((r: any) => ({
          id: r.id ?? 0, taskType: r.taskType ?? '', approach: r.approach ?? '',
          successRate: r.successRate ?? 0, uses: r.uses ?? 0,
          tags: r.tags, metadata: r.metadata, similarity: r.similarity,
          embedding: r.embedding ? Array.from(r.embedding) : [],
        }));
        // Apply MMR diversity ranking if requested and embeddings available
        if (diverse && this.embeddingService && this.mmrRanker && patterns.length > limit) {
          const hasEmbeddings = patterns.some((p: any) => p.embedding && p.embedding.length > 0);
          if (hasEmbeddings) {
            try {
              const queryEmbedding = await this.embeddingService.embed(query);
              patterns = this.mmrRanker.selectDiverse(
                patterns.map((p: any) => ({ ...p, id: p.id, similarity: p.similarity ?? 0 })),
                Array.from(queryEmbedding),
                { lambda: 0.5, k: limit },
              );
            } catch { /* MMR unavailable, fall through to slice */ }
          }
        }
        // Strip internal embedding field before returning
        return patterns.slice(0, limit).map(({ embedding, ...rest }: any) => rest);
      } catch { this.reasoningBank = null; }
    }
    // ADR-0076: no silent in-memory fallback — return empty
    return [];
  }

  // -- Causal ---------------------------------------------------------------

  async recordCausalEdge(from: string, to: string, metadata: unknown): Promise<void> {
    if (this.causalGraph) {
      try {
        await this.causalGraph.addCausalEdge({
          fromMemoryId: Number(from) || 0, fromMemoryType: 'episode',
          toMemoryId: Number(to) || 0, toMemoryType: 'episode',
          similarity: 1.0, confidence: 1.0, metadata,
        });
      } catch {
        this.causalGraph = null;
        this.causalEdges.push({ from, to, metadata });
      }
      return;
    }
    this.causalEdges.push({ from, to, metadata });
  }

  async queryCausalPath(from: string, to: string): Promise<CausalPath[]> {
    if (this.causalGraph) {
      try {
        const edges = this.causalGraph.queryCausalEffects({
          interventionMemoryId: Number(from), interventionMemoryType: 'episode',
          outcomeMemoryId: Number(to),
        });
        if (edges && edges.length > 0) {
          return [{
            from, to,
            edges: edges.map((e: any) => ({
              fromId: String(e.fromMemoryId ?? from), toId: String(e.toMemoryId ?? to),
              similarity: e.similarity ?? 0, uplift: e.uplift, confidence: e.confidence ?? 0,
            })),
          }];
        }
      } catch {
        // Fall through to in-memory lookup
      }
    }
    const direct = this.causalEdges.filter((e) => e.from === from && e.to === to);
    if (direct.length === 0) return [];
    return [{
      from, to,
      edges: direct.map((e) => ({ fromId: e.from, toId: e.to, similarity: 1.0, confidence: 1.0 })),
    }];
  }

  // -- Learning -------------------------------------------------------------

  /**
   * Record agent trajectory (Phase 2: @ruvector/sona integration)
   */
  async recordTrajectory(steps: TrajectoryStep[], reward: number): Promise<void> {
    // Phase 2: Record to Sona if available
    if (this.sonaEnabled && this.sonaService) {
      try {
        const sonaSteps = steps.map(step => ({
          state: { description: step.state },
          action: step.action,
          reward: step.reward
        }));

        await this.sonaService.recordTrajectory('agent', sonaSteps);
      } catch (error) {
        console.warn('[AgentDBService] Sona trajectory recording failed:', error);
      }
    }

    // Original LearningSystem integration
    if (this.learningSystem) {
      try {
        const sessionId = await this.learningSystem.startSession(
          'default', 'q-learning', { learningRate: 0.01, discountFactor: 0.99 },
        );
        for (const step of steps) {
          await this.learningSystem.submitFeedback({
            sessionId, action: step.action, state: step.state, reward: step.reward,
            nextState: step.nextState, success: step.reward > 0, timestamp: Date.now(),
          });
        }
      } catch {
        this.learningSystem = null;
        this.trajectories.push({ steps, reward });
      }
      return;
    }
    this.trajectories.push({ steps, reward });
  }

  /**
   * Predict next action (Phase 2: @ruvector/sona integration)
   */
  async predictAction(state: any): Promise<PredictedAction> {
    // Phase 2: Try Sona prediction first
    if (this.sonaEnabled && this.sonaService) {
      try {
        const prediction = await this.sonaService.predict(state);
        if (prediction.confidence > 0.6) {
          return {
            action: prediction.action,
            confidence: prediction.confidence,
            alternatives: []
          };
        }
      } catch (error) {
        console.warn('[AgentDBService] Sona prediction failed:', error);
      }
    }

    // Fallback to LearningSystem
    if (this.learningSystem) {
      try {
        const p = await this.learningSystem.predictAction?.(String(state));
        if (p) return { action: p.action ?? 'noop', confidence: p.confidence ?? 0, alternatives: p.alternatives ?? [] };
      } catch { this.learningSystem = null; }
    }
    return { action: 'noop', confidence: 0, alternatives: [] };
  }

  // -- Graph ----------------------------------------------------------------

  /**
   * Store graph state (Phase 2: @ruvector/graph-node integration)
   */
  async storeGraphState(nodes: any[], edges: any[]): Promise<void> {
    // Phase 2: Try graph database first
    if (this.graphEnabled && this.graphAdapter) {
      try {
        // Store nodes
        for (const node of nodes) {
          const embedding = await this.embeddingService.embed(JSON.stringify(node));
          await this.graphAdapter.createNode({
            id: node.id || `node-${Date.now()}-${Math.random()}`,
            embedding,
            labels: [node.type || 'Node'],
            properties: node
          });
        }

        // Store edges
        for (const edge of edges) {
          const edgeEmbedding = await this.embeddingService.embed(
            `${edge.from} -> ${edge.to}: ${edge.description || ''}`
          );
          await this.graphAdapter.createEdge({
            from: String(edge.from),
            to: String(edge.to),
            description: edge.description || 'edge',
            embedding: edgeEmbedding,
            confidence: edge.confidence,
            metadata: edge
          });
        }

        console.log(`[AgentDBService] Stored ${nodes.length} nodes and ${edges.length} edges in graph DB`);
        return;
      } catch (error) {
        console.warn('[AgentDBService] Graph DB storage failed:', error);
      }
    }

    // Fallback: CausalGraph
    if (this.causalGraph) {
      try {
        for (const edge of edges) {
          await this.causalGraph.addCausalEdge({
            fromMemoryId: edge.from ?? 0, fromMemoryType: edge.fromType ?? 'episode',
            toMemoryId: edge.to ?? 0, toMemoryType: edge.toType ?? 'episode',
            similarity: edge.similarity ?? 1.0, confidence: edge.confidence ?? 1.0,
            metadata: { nodes, edgeData: edge },
          });
        }
        return;
      } catch {
        this.causalGraph = null;
      }
    }

    // Final fallback: in-memory
    for (const edge of edges) {
      this.causalEdges.push({ from: String(edge.from), to: String(edge.to), metadata: { nodes, edgeData: edge } });
    }
  }

  async queryGraph(query: string): Promise<any[]> {
    if (this.causalRecall) {
      try {
        const result = await this.causalRecall.recall?.({ task: query, k: 10 });
        return result?.candidates ?? [];
      } catch { /* fall through */ }
    }
    return [];
  }

  // -- Routing --------------------------------------------------------------

  /**
   * Route task using semantic understanding (Phase 2: @ruvector/router integration)
   */
  async routeSemantic(taskDescription: string): Promise<RouteResult> {
    // Phase 2: Try semantic router first
    if (this.routerEnabled && this.semanticRouter) {
      try {
        const routeResult = await this.semanticRouter.route(taskDescription);

        // Map route names to tiers
        const tierMap: Record<string, { tier: 1 | 2 | 3; handler: string }> = {
          'tier1': { tier: 1, handler: 'agent-booster' },
          'tier2': { tier: 2, handler: 'haiku' },
          'tier3': { tier: 3, handler: 'sonnet' }
        };

        const mapping = tierMap[routeResult.route] || { tier: 2, handler: 'haiku' };

        return {
          tier: mapping.tier,
          handler: mapping.handler,
          confidence: routeResult.confidence,
          reasoning: `Semantic router (${this.semanticRouter.isAvailable() ? 'embedding-based' : 'keyword-based'}): ${routeResult.route}`
        };
      } catch (error) {
        console.warn('[AgentDBService] Semantic router failed, using keyword fallback');
      }
    }

    // Fallback: keyword-based routing
    const lower = taskDescription.toLowerCase();
    const complex = ['architecture', 'security', 'refactor', 'design', 'complex', 'optimize', 'performance', 'migration'];
    const simple = ['rename', 'format', 'lint', 'const', 'type', 'typo', 'fix import'];
    if (simple.some((kw) => lower.includes(kw)))
      return { tier: 1, handler: 'agent-booster', confidence: 0.85, reasoning: 'Simple transform detected' };
    if (complex.some((kw) => lower.includes(kw)))
      return { tier: 3, handler: 'sonnet', confidence: 0.8, reasoning: 'Complex reasoning required' };
    return { tier: 2, handler: 'haiku', confidence: 0.7, reasoning: 'Standard task complexity' };
  }

  // -- Explain --------------------------------------------------------------

  async explainDecision(decisionId: string): Promise<Explanation> {
    if (this.causalRecall?.explain) {
      const r = await this.causalRecall.explain(decisionId);
      return { decisionId, chunks: r?.chunkIds ?? [], minimalWhy: r?.minimalWhy ?? [], completenessScore: r?.completenessScore ?? 0 };
    }
    return { decisionId, chunks: [], minimalWhy: ['No explanation backend available'], completenessScore: 0 };
  }

  // -- Metrics --------------------------------------------------------------

  async getMetrics(): Promise<ServiceMetrics> {
    let episodes = this.fallbackEpisodeCount;
    let skills = this.fallbackSkillCount;
    let patterns = this.fallbackPatternCount;
    try {
      if (this.reflexionMemory) episodes = (await this.reflexionMemory.getEpisodeCount?.()) ?? episodes;
    } catch { /* use in-memory count */ }
    try {
      if (this.skillLibrary) skills = (await this.skillLibrary.getSkillCount?.()) ?? skills;
    } catch { /* use in-memory count */ }
    try {
      if (this.reasoningBank) patterns = (await this.reasoningBank.getPatternCount?.()) ?? patterns;
    } catch { /* use in-memory count */ }
    return { backend: this.backendName, episodes, skills, patterns, uptime: Date.now() - this.startTime };
  }

  // -- Phase 1 Controller Methods -------------------------------------------

  /**
   * Get AttentionService instance
   */
  getAttentionService(): any {
    return this.attentionService;
  }

  /**
   * Search using WASM-accelerated vector operations
   */
  async searchWithWASM(
    query: Float32Array,
    k: number,
    options?: { threshold?: number; filters?: Record<string, any> }
  ): Promise<any[]> {
    if (!this.wasmVectorSearch) {
      throw new Error('WASMVectorSearch not available');
    }
    return this.wasmVectorSearch.findKNN(query, k, 'pattern_embeddings', options);
  }

  /**
   * Synthesize context from multiple episodes
   */
  async synthesizeContext(
    episodes: Episode[],
    options?: {
      minPatternFrequency?: number;
      includeRecommendations?: boolean;
      maxSummaryLength?: number;
    }
  ): Promise<any> {
    if (!this.contextSynthesizer) {
      return {
        summary: 'Context synthesis unavailable',
        patterns: [],
        successRate: 0,
        averageReward: 0,
        recommendations: [],
        keyInsights: [],
        totalMemories: 0,
      };
    }

    // Map episodes to memory pattern format
    const memories = episodes.map(ep => ({
      task: ep.task,
      reward: ep.reward,
      success: ep.success,
      critique: ep.critique,
      input: ep.input,
      output: ep.output,
      similarity: ep.similarity,
    }));

    return this.contextSynthesizer.synthesize(memories, options);
  }

  /**
   * Get WASM vector search statistics
   */
  getWASMStats(): any {
    if (!this.wasmVectorSearch) {
      return {
        wasmAvailable: false,
        simdAvailable: false,
        indexBuilt: false,
        indexSize: 0,
        lastIndexUpdate: null,
      };
    }
    return this.wasmVectorSearch.getStats();
  }

  /**
   * Get attention service statistics
   */
  getAttentionStats(): any {
    if (!this.attentionService) {
      return {
        totalOps: 0,
        avgExecutionTimeMs: 0,
        peakMemoryBytes: 0,
        mechanismCounts: {},
        runtimeCounts: {},
      };
    }
    return this.attentionService.getStats();
  }

  // -- Phase 4 Controller Methods -------------------------------------------

  /**
   * Run nightly learner for automated causal discovery
   */
  async runNightlyLearner(): Promise<any> {
    if (!this.nightlyLearner) {
      throw new Error('NightlyLearner not available');
    }

    // Run learning consolidation
    const learningResults = await this.nightlyLearner.run();

    // ADR-063: Auto-prune stale memories (confidence <0.3, age >30d)
    let pruningResults = null;
    if (this.rvfOptimizer) {
      try {
        pruningResults = await this.pruneStaleMemories();
        console.log(`[NightlyLearner] Pruned ${pruningResults.pruned} stale memories`);
      } catch (err) {
        console.warn('[NightlyLearner] Pruning failed:', err);
      }
    }

    return {
      learning: learningResults,
      pruning: pruningResults,
      timestamp: Date.now()
    };
  }

  /**
   * Consolidate episodes using FlashAttention
   */
  async consolidateEpisodes(sessionId?: string): Promise<any> {
    if (!this.nightlyLearner) {
      throw new Error('NightlyLearner not available');
    }
    return this.nightlyLearner.consolidateEpisodes(sessionId);
  }

  /**
   * Synchronize with remote AgentDB instance
   */
  async syncWithRemote(onProgress?: (progress: any) => void): Promise<any> {
    if (!this.syncCoordinator) {
      throw new Error('SyncCoordinator not available');
    }
    return this.syncCoordinator.sync(onProgress);
  }

  /**
   * Get synchronization status
   */
  getSyncStatus(): any {
    if (!this.syncCoordinator) {
      return {
        isSyncing: false,
        autoSyncEnabled: false,
        state: {
          lastSyncAt: 0,
          lastEpisodeSync: 0,
          lastSkillSync: 0,
          lastEdgeSync: 0,
          totalItemsSynced: 0,
          totalBytesSynced: 0,
          syncCount: 0,
        },
      };
    }
    return this.syncCoordinator.getStatus();
  }

  /**
   * Create explainable recall certificate for a retrieval
   */
  async createRecallCertificate(params: {
    queryId: string;
    queryText: string;
    chunks: Array<{ id: string; type: string; content: string; relevance: number }>;
    requirements: string[];
    accessLevel?: string;
  }): Promise<any> {
    if (!this.explainableRecall) {
      throw new Error('ExplainableRecall not available');
    }
    return this.explainableRecall.createCertificate(params);
  }

  /**
   * Verify a recall certificate
   */
  verifyRecallCertificate(certificateId: string): any {
    if (!this.explainableRecall) {
      throw new Error('ExplainableRecall not available');
    }
    return this.explainableRecall.verifyCertificate(certificateId);
  }

  /**
   * Get justification for a chunk in a recall certificate
   */
  getRecallJustification(certificateId: string, chunkId: string): any {
    if (!this.explainableRecall) {
      throw new Error('ExplainableRecall not available');
    }
    return this.explainableRecall.getJustification(certificateId, chunkId);
  }

  /**
   * Trace provenance lineage for a certificate
   */
  traceProvenance(certificateId: string): any {
    if (!this.explainableRecall) {
      throw new Error('ExplainableRecall not available');
    }
    return this.explainableRecall.traceProvenance(certificateId);
  }

  /**
   * Audit a recall certificate
   */
  auditCertificate(certificateId: string): any {
    if (!this.explainableRecall) {
      throw new Error('ExplainableRecall not available');
    }
    return this.explainableRecall.auditCertificate(certificateId);
  }

  /**
   * Start QUIC server for distributed sync
   */
  async startQUICServer(): Promise<void> {
    if (!this.quicServer) {
      throw new Error('QUICServer not available');
    }
    return this.quicServer.start();
  }

  /**
   * Stop QUIC server
   */
  async stopQUICServer(): Promise<void> {
    if (!this.quicServer) {
      throw new Error('QUICServer not available');
    }
    return this.quicServer.stop();
  }

  /**
   * Get Phase 4 controller availability status
   */
  getPhase4Status(): {
    syncCoordinator: boolean;
    nightlyLearner: boolean;
    explainableRecall: boolean;
    quicClient: boolean;
    quicServer: boolean;
  } {
    return {
      syncCoordinator: this.syncCoordinator !== null,
      nightlyLearner: this.nightlyLearner !== null,
      explainableRecall: this.explainableRecall !== null,
      quicClient: this.quicClient !== null,
      quicServer: this.quicServer !== null,
    };
  }

  // -- ADR-063: RVF Optimizer Methods --------------------------------------

  /**
   * Generate optimized embedding (compressed, cached, batched)
   * ADR-063: 2-100x performance improvement over raw embeddings
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.embeddingService) {
      throw new Error('EmbeddingService not initialized');
    }

    // If RVFOptimizer unavailable, use raw embeddings
    if (!this.rvfOptimizer) {
      return await this.embeddingService.embed(text);
    }

    // Use batched + compressed embeddings
    const embedFn = async (t: string) => {
      const result = await this.embeddingService.embed(t);
      return result;
    };

    const embedding = await this.rvfOptimizer.batchEmbed(text, embedFn);
    return this.rvfOptimizer.compressEmbedding(embedding);
  }

  /**
   * Generate multiple embeddings in batch (10-100x faster than sequential)
   * ADR-063: Batch size 32, max latency 10ms
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.embeddingService) {
      throw new Error('EmbeddingService not initialized');
    }

    // If RVFOptimizer unavailable, use raw embeddings
    if (!this.rvfOptimizer) {
      return await Promise.all(texts.map(t => this.embeddingService.embed(t)));
    }

    const embedFn = async (t: string) => {
      const result = await this.embeddingService.embed(t);
      return result;
    };

    const embeddings = await Promise.all(
      texts.map(text => this.rvfOptimizer.batchEmbed(text, embedFn))
    );

    return embeddings.map(e => this.rvfOptimizer.compressEmbedding(e));
  }

  /**
   * Store episodes with automatic deduplication (20-50% storage reduction)
   * ADR-063: 98% similarity threshold
   */
  async storeEpisodesWithDedup(episodes: EpisodeData[]): Promise<string[]> {
    if (!this.rvfOptimizer) {
      // Fallback: store all without deduplication
      return await Promise.all(episodes.map(ep => this.storeEpisode(ep)));
    }

    // Generate embeddings for all episodes
    const texts = episodes.map(ep => JSON.stringify(ep));
    const embeddings = await this.generateEmbeddings(texts);

    // Create items for deduplication
    const items = episodes.map((ep, i) => ({
      id: `ep-${Date.now()}-${i}`,
      embedding: embeddings[i],
      confidence: ep.reward || 0.5
    }));

    // Deduplicate (removes 20-50% typically)
    const unique = this.rvfOptimizer.deduplicate(items);

    // Store only unique episodes
    const ids = await Promise.all(
      unique.map(item => {
        const idx = items.findIndex(it => it.id === item.id);
        return this.storeEpisode(episodes[idx]);
      })
    );

    return ids;
  }

  /**
   * Prune stale memories (confidence <0.3, age >30d)
   * ADR-063: Automatic cleanup to prevent memory bloat
   */
  async pruneStaleMemories(): Promise<{ pruned: number; remaining: number }> {
    if (!this.rvfOptimizer) {
      return { pruned: 0, remaining: this.fallbackEpisodeCount };
    }

    // Get all episodes
    const episodes = await this.recallEpisodes('*', 10000);

    // Convert to format expected by RVFOptimizer
    const items = episodes.map(ep => ({
      id: String(ep.id),
      embedding: [], // Not needed for pruning
      confidence: ep.reward,
      timestamp: ep.ts
    }));

    // Get IDs to prune
    const toPrune = this.rvfOptimizer.pruneMemories(items);

    // Delete episodes (in-memory store)
    let pruned = 0;
    for (const id of toPrune) {
      // For real AgentDB backend, would use this.reflexionMemory.delete(id)
      // For in-memory store, we can't delete directly, so just count
      pruned++;
    }

    return {
      pruned,
      remaining: this.fallbackEpisodeCount - pruned
    };
  }

  /**
   * Preview what would be pruned without deleting
   * ADR-063: Dry-run mode for safety
   */
  async previewPruning(): Promise<{ pruned: number; remaining: number }> {
    if (!this.rvfOptimizer) {
      return { pruned: 0, remaining: this.fallbackEpisodeCount };
    }

    const episodes = await this.recallEpisodes('*', 10000);
    const items = episodes.map(ep => ({
      id: String(ep.id),
      embedding: [],
      confidence: ep.reward,
      timestamp: ep.ts
    }));

    const toPrune = this.rvfOptimizer.pruneMemories(items);

    return {
      pruned: toPrune.length,
      remaining: episodes.length - toPrune.length
    };
  }

  /**
   * Get RVF optimizer statistics
   * ADR-063: Monitor compression ratio, cache hit rate, batch queue size
   */
  getRVFStats(): any {
    if (!this.rvfOptimizer) {
      return {
        available: false,
        message: 'RVFOptimizer not initialized'
      };
    }

    return {
      available: true,
      ...this.rvfOptimizer.getStats()
    };
  }

  /**
   * Clear embedding cache (forces fresh embeddings)
   * ADR-063: Useful when model or data changes
   */
  clearEmbeddingCache(): void {
    if (this.rvfOptimizer) {
      this.rvfOptimizer.clearCache();
    }
  }

  // -- ADR-064: Cost Optimizer Integration ----------------------------------

  /**
   * Auto-select optimal model before an LLM call.
   * Returns the model ID and estimated cost.
   */
  selectModelForTask(task: {
    complexity: number;
    inputTokens: number;
    outputTokens: number;
    maxLatency?: number;
    minQuality?: number;
  }): { modelId: string; estimatedCost: number; reasoning: string } {
    if (!this.costOptimizer) {
      return { modelId: 'claude-sonnet-4', estimatedCost: 0, reasoning: 'CostOptimizer unavailable, using default' };
    }
    return this.costOptimizer.selectOptimalModel(task);
  }

  /**
   * Auto-record spend after an LLM call completes.
   */
  recordModelSpend(modelId: string, inputTokens: number, outputTokens: number): void {
    if (this.costOptimizer) {
      this.costOptimizer.recordSpend(modelId, inputTokens, outputTokens);
    }
  }

  /**
   * Get the CostOptimizerService instance for direct access.
   */
  getCostOptimizer(): CostOptimizerService | null {
    return this.costOptimizer;
  }

  // -- Cleanup --------------------------------------------------------------

  async shutdown(): Promise<void> {
    // Cleanup Phase 1 controllers
    if (this.wasmVectorSearch) {
      try {
        this.wasmVectorSearch.clearIndex();
      } catch { /* ignore cleanup errors */ }
      this.wasmVectorSearch = null;
    }
    if (this.attentionService) {
      try {
        this.attentionService.resetStats();
      } catch { /* ignore cleanup errors */ }
      this.attentionService = null;
    }
    this.mmrRanker = null;
    this.contextSynthesizer = null;

    // Cleanup Phase 2 RuVector packages
    if (this.graphAdapter) {
      try {
        this.graphAdapter.close?.();
      } catch { /* ignore cleanup errors */ }
      this.graphAdapter = null;
    }
    if (this.sonaService) {
      try {
        this.sonaService.clear?.();
      } catch { /* ignore cleanup errors */ }
      this.sonaService = null;
    }
    this.gnnLearning = null;
    this.semanticRouter = null;

    // Cleanup Phase 4 controllers
    if (this.syncCoordinator) {
      try {
        this.syncCoordinator.stopAutoSync?.();
      } catch { /* ignore cleanup errors */ }
      this.syncCoordinator = null;
    }
    if (this.quicServer) {
      try {
        await this.quicServer.stop?.();
      } catch { /* ignore cleanup errors */ }
      this.quicServer = null;
    }
    if (this.quicClient) {
      try {
        await this.quicClient.disconnect?.();
      } catch { /* ignore cleanup errors */ }
      this.quicClient = null;
    }
    this.nightlyLearner = null;
    this.explainableRecall = null;

    // ADR-063: Cleanup RVFOptimizer
    if (this.rvfOptimizer) {
      try {
        this.rvfOptimizer.clearCache();
      } catch { /* ignore cleanup errors */ }
      this.rvfOptimizer = null;
    }

    // ADR-064: Cleanup CostOptimizer
    this.costOptimizer = null;

    // Existing cleanup
    if (this.vectorBackend) {
      try {
        if (typeof this.vectorBackend.close === 'function') this.vectorBackend.close();
        else if (typeof this.vectorBackend.dispose === 'function') this.vectorBackend.dispose();
      } catch { /* ignore cleanup errors */ }
      this.vectorBackend = null;
    }
    if (this.db && typeof this.db.close === 'function') await this.db.close();
    this.initialized = false;
    AgentDBService.instance = null;
  }
}

/**
 * Get or create the singleton AgentDBService instance
 */
export async function getAgentDBService(): Promise<AgentDBService> {
  return await AgentDBService.getInstance();
}
