/**
 * RuVector Edge-Full Integration
 *
 * Complete WASM toolkit for edge AI providing:
 *
 * Modules:
 * - edge: Core WASM primitives (HNSW, Identity, Crypto)
 * - graph: Graph database with Cypher/SPARQL/SQL support
 * - rvlite: Lightweight vector operations
 * - sona: Self-learning neural adaptation (SONA)
 * - dag: DAG workflow orchestration
 * - onnx: ONNX embeddings inference
 *
 * Features:
 * - Pure WASM: Runs in browser, Node.js, Cloudflare Workers, Deno
 * - Post-quantum cryptography
 * - P2P swarm coordination
 * - Raft consensus
 * - SIMD acceleration
 *
 * @see https://github.com/ruvnet/ruvector/tree/main/examples/edge-full
 */

import { logger } from '../utils/logger.js';
import { getEmbeddingConfig } from '../../../packages/agentdb/src/config/embedding-config.js';

// Module state
let edgeFullModule: EdgeFullModule | null = null;
let initialized = false;
let initPromise: Promise<boolean> | null = null;

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Main EdgeFull module interface
 */
interface EdgeFullModule {
  // Sub-modules
  edge: EdgeModule;
  graph: GraphModule;
  rvlite: RvLiteModule;
  sona: SonaModule;
  dag: DagModule;
  onnx: OnnxModule;

  // Top-level utilities
  isReady: () => boolean;
  getVersion: () => string;
}

/**
 * Edge module - Core WASM primitives
 */
interface EdgeModule {
  // WASM initialization
  default: () => Promise<void>;
  init: () => Promise<void>;
  initSync?: () => void;
  version?: string;

  // HNSW Index
  WasmHnswIndex: new (dim: number, m?: number, efConstruction?: number) => HnswIndexInstance;

  // Identity/Crypto
  WasmIdentity: {
    generate: () => IdentityInstance;
    fromSecretKey: (key: Uint8Array) => IdentityInstance;
  };

  // Crypto utilities
  WasmCrypto?: {
    hash: (data: Uint8Array) => Uint8Array;
    encrypt: (key: Uint8Array, data: Uint8Array) => Uint8Array;
    decrypt: (key: Uint8Array, ciphertext: Uint8Array) => Uint8Array;
  };

  // Post-quantum crypto
  WasmHybridKeyPair?: {
    generate: () => { publicKey: Uint8Array; secretKey: Uint8Array };
    encrypt: (publicKey: Uint8Array, data: Uint8Array) => Uint8Array;
    decrypt: (secretKey: Uint8Array, ciphertext: Uint8Array) => Uint8Array;
  };

  // Semantic matching
  WasmSemanticMatcher: new () => SemanticMatcherInstance;

  // Additional classes
  WasmAdaptiveCompressor?: new () => unknown;
  WasmQuantizer?: new () => unknown;
  WasmRaftNode?: new () => unknown;
  WasmSpikingNetwork?: new () => unknown;

  // Legacy aliases
  HnswIndex?: new (dim: number, m?: number, efConstruction?: number) => HnswIndexInstance;
  Identity?: { generate: () => IdentityInstance; fromSecretKey: (key: Uint8Array) => IdentityInstance };
  SemanticMatcher?: new () => SemanticMatcherInstance;
  isReady?: () => boolean;
}

interface HnswIndexInstance {
  add: (vector: Float32Array) => number;
  search: (query: Float32Array, k: number) => Array<{ index: number; distance: number }>;
  len: () => number;
  serialize: () => Uint8Array;
  deserialize: (data: Uint8Array) => void;
}

interface IdentityInstance {
  publicKey: () => Uint8Array;
  secretKey: () => Uint8Array;
  sign: (data: Uint8Array) => Uint8Array;
  verify: (data: Uint8Array, signature: Uint8Array) => boolean;
}

interface SemanticMatcherInstance {
  registerAgent: (id: string, embedding: Float32Array, capabilities: string[]) => void;
  matchTask: (embedding: Float32Array, topK: number) => Array<{ agentId: string; score: number; capabilities: string[] }>;
}

/**
 * Graph module - Cypher/SPARQL/SQL
 */
interface GraphModule {
  default: () => Promise<void>;
  init: () => Promise<void>;
  initSync?: () => void;
  GraphDB: new () => GraphDBInstance;
  isReady?: () => boolean;
}

interface GraphDBInstance {
  // Cypher queries
  cypher: (query: string) => Promise<any>;

  // SPARQL queries
  sparql: (query: string) => Promise<any>;

  // SQL queries
  sql: (query: string) => Promise<any>;

  // Node/Edge operations
  createNode: (labels: string[], properties: Record<string, any>) => string;
  createEdge: (from: string, to: string, type: string, properties?: Record<string, any>) => string;
  getNode: (id: string) => any;
  deleteNode: (id: string) => boolean;

  // Vector search on graph
  vectorSearch: (embedding: Float32Array, k: number) => Array<{ nodeId: string; distance: number }>;

  // Serialization
  export: () => Uint8Array;
  import: (data: Uint8Array) => void;
}

/**
 * RvLite module - Lightweight vector ops
 */
interface RvLiteModule {
  default: () => Promise<void>;
  init: () => Promise<void>;
  initSync?: () => void;

  // Vector operations
  cosineSimilarity?: (a: Float32Array, b: Float32Array) => number;
  dotProduct?: (a: Float32Array, b: Float32Array) => number;
  euclideanDistance?: (a: Float32Array, b: Float32Array) => number;
  normalize?: (v: Float32Array) => Float32Array;

  // Batch operations
  batchCosineSimilarity?: (queries: Float32Array[], corpus: Float32Array[]) => number[][];

  // SIMD status
  isSIMDEnabled?: () => boolean;
  isReady?: () => boolean;
}

/**
 * SONA module - Self-learning
 */
interface SonaModule {
  default: () => Promise<void>;
  init: () => Promise<void>;
  initSync?: () => void;
  SonaEngine?: new (config?: SonaConfig) => SonaEngineInstance;
  isReady?: () => boolean;
}

interface SonaConfig {
  embeddingDim?: number;
  hiddenDim?: number;
  microLoraRank?: number;
  baseLoraRank?: number;
  ewcLambda?: number;
  learningRate?: number;
}

interface SonaEngineInstance {
  // Routing
  route: (taskEmbedding: Float32Array) => { agentId: string; confidence: number };

  // Learning
  learn: (taskEmbedding: Float32Array, agentId: string, reward: number) => void;

  // Pattern management
  addPattern: (pattern: { task: string; agent: string; success: boolean }) => void;
  findPatterns: (query: Float32Array, k: number) => Array<{ task: string; agent: string; similarity: number }>;

  // State
  getStats: () => { patterns: number; trajectories: number; avgReward: number };
  serialize: () => Uint8Array;
  deserialize: (data: Uint8Array) => void;
}

/**
 * DAG module - Workflow orchestration
 */
interface DagModule {
  default: () => Promise<void>;
  init: () => Promise<void>;
  initSync?: () => void;
  DagWorkflow?: new () => DagWorkflowInstance;
  isReady?: () => boolean;
}

interface DagWorkflowInstance {
  // Node management
  addNode: (id: string, handler: (input: any) => Promise<any>) => void;
  addEdge: (from: string, to: string) => void;

  // Execution
  execute: (input: any) => Promise<any>;
  executeParallel: (inputs: any[]) => Promise<any[]>;

  // State
  getTopologicalOrder: () => string[];
  validate: () => { valid: boolean; errors: string[] };
}

/**
 * ONNX module - Embeddings
 */
interface OnnxModule {
  default: () => Promise<void>;
  init: () => Promise<void>;
  initSync?: () => void;

  // Embedding generation
  embed?: (text: string) => Promise<Float32Array>;
  embedBatch?: (texts: string[]) => Promise<Float32Array[]>;

  // Model management
  loadModel?: (modelData?: Uint8Array) => Promise<void>;
  isModelLoaded?: () => boolean;
  getModelInfo?: () => { name: string; dimension: number };

  // Similarity
  similarity?: (text1: string, text2: string) => Promise<number>;
  isReady?: () => boolean;
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize EdgeFull WASM module
 */
export async function initEdgeFull(): Promise<boolean> {
  if (initialized) return edgeFullModule !== null;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Import individual modules to avoid main module ONNX export bug
      const [edgeMod, graphMod, rvliteMod, sonaMod, dagMod] = await Promise.all([
        import('@ruvector/edge-full/edge').catch(() => null),
        import('@ruvector/edge-full/graph').catch(() => null),
        import('@ruvector/edge-full/rvlite').catch(() => null),
        import('@ruvector/edge-full/sona').catch(() => null),
        import('@ruvector/edge-full/dag').catch(() => null),
      ]);

      // Also try ONNX separately (may fail on some platforms)
      let onnxMod = null;
      try {
        onnxMod = await import('@ruvector/edge-full/onnx');
      } catch {
        logger.debug('ONNX module not available');
      }

      // Construct module interface
      edgeFullModule = {
        edge: edgeMod as unknown as EdgeModule,
        graph: graphMod as unknown as GraphModule,
        rvlite: rvliteMod as unknown as RvLiteModule,
        sona: sonaMod as unknown as SonaModule,
        dag: dagMod as unknown as DagModule,
        onnx: onnxMod as unknown as OnnxModule,
        isReady: () => true,
        getVersion: () => '0.1.0',
      };

      // Initialize sub-modules in parallel
      const initPromises: Promise<void>[] = [];

      if (edgeFullModule.edge?.default) {
        initPromises.push(edgeFullModule.edge.default());
      }
      if (edgeFullModule.graph?.default) {
        initPromises.push(edgeFullModule.graph.default());
      }
      if (edgeFullModule.rvlite?.default) {
        initPromises.push(edgeFullModule.rvlite.default());
      }
      if (edgeFullModule.sona?.default) {
        initPromises.push(edgeFullModule.sona.default());
      }
      if (edgeFullModule.dag?.default) {
        initPromises.push(edgeFullModule.dag.default());
      }
      if (edgeFullModule.onnx?.default) {
        initPromises.push(edgeFullModule.onnx.default());
      }

      await Promise.all(initPromises);

      initialized = true;

      logger.info('EdgeFull WASM initialized', {
        version: edgeFullModule.getVersion?.() || '0.1.0',
        modules: ['edge', 'graph', 'rvlite', 'sona', 'dag', 'onnx'],
        simd: edgeFullModule.rvlite?.isSIMDEnabled?.() ?? false,
      });

      return true;
    } catch (error) {
      logger.debug('EdgeFull WASM not available, using fallbacks', { error });
      initialized = true;
      return false;
    }
  })();

  return initPromise;
}

/**
 * Check if EdgeFull is available
 */
export function isEdgeFullAvailable(): boolean {
  return edgeFullModule !== null && (edgeFullModule.isReady?.() ?? false);
}

/**
 * Get EdgeFull module (initialize if needed)
 */
export async function getEdgeFull(): Promise<EdgeFullModule | null> {
  if (!initialized) {
    await initEdgeFull();
  }
  return edgeFullModule;
}

// ============================================================================
// High-Level API Wrappers
// ============================================================================

/**
 * EdgeFull HNSW Index with JS fallback
 */
export class EdgeFullHnswIndex {
  private wasmIndex: HnswIndexInstance | null = null;
  private jsVectors: Float32Array[] = [];
  private dimensions: number;

  constructor(dimensions: number, m: number = 16, efConstruction: number = 200) {
    this.dimensions = dimensions;

    if (edgeFullModule?.edge?.HnswIndex) {
      try {
        this.wasmIndex = new edgeFullModule.edge.HnswIndex(dimensions, m, efConstruction);
      } catch (error) {
        logger.debug('Failed to create WASM HNSW, using JS fallback', { error });
      }
    }
  }

  add(vector: Float32Array | number[]): number {
    const vec = vector instanceof Float32Array ? vector : new Float32Array(vector);

    if (this.wasmIndex) {
      try {
        return this.wasmIndex.add(vec);
      } catch {
        // Fall through
      }
    }

    const idx = this.jsVectors.length;
    this.jsVectors.push(vec);
    return idx;
  }

  search(query: Float32Array | number[], k: number = 10): Array<{ index: number; distance: number }> {
    const vec = query instanceof Float32Array ? query : new Float32Array(query);

    if (this.wasmIndex) {
      try {
        return this.wasmIndex.search(vec, k);
      } catch {
        // Fall through
      }
    }

    // JS fallback - brute force
    const distances = this.jsVectors.map((v, idx) => ({
      index: idx,
      distance: this.euclideanDistance(vec, v),
    }));

    return distances.sort((a, b) => a.distance - b.distance).slice(0, k);
  }

  size(): number {
    if (this.wasmIndex) {
      try {
        return this.wasmIndex.len();
      } catch {
        // Fall through
      }
    }
    return this.jsVectors.length;
  }

  isWasmAccelerated(): boolean {
    return this.wasmIndex !== null;
  }

  private euclideanDistance(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }
}

/**
 * EdgeFull Graph Database with Cypher support
 */
export class EdgeFullGraphDB {
  private wasmGraph: GraphDBInstance | null = null;
  private jsNodes: Map<string, { labels: string[]; properties: Record<string, any> }> = new Map();
  private jsEdges: Map<string, { from: string; to: string; type: string; properties: Record<string, any> }> = new Map();
  private nodeCounter = 0;
  private edgeCounter = 0;

  constructor() {
    if (edgeFullModule?.graph?.GraphDB) {
      try {
        this.wasmGraph = new edgeFullModule.graph.GraphDB();
      } catch (error) {
        logger.debug('Failed to create WASM GraphDB, using JS fallback', { error });
      }
    }
  }

  async cypher(query: string): Promise<any> {
    if (this.wasmGraph) {
      try {
        return await this.wasmGraph.cypher(query);
      } catch {
        // Fall through
      }
    }
    throw new Error('Cypher queries require WASM GraphDB');
  }

  createNode(labels: string[], properties: Record<string, any> = {}): string {
    if (this.wasmGraph) {
      try {
        return this.wasmGraph.createNode(labels, properties);
      } catch {
        // Fall through
      }
    }

    const id = `node_${++this.nodeCounter}`;
    this.jsNodes.set(id, { labels, properties });
    return id;
  }

  createEdge(from: string, to: string, type: string, properties: Record<string, any> = {}): string {
    if (this.wasmGraph) {
      try {
        return this.wasmGraph.createEdge(from, to, type, properties);
      } catch {
        // Fall through
      }
    }

    const id = `edge_${++this.edgeCounter}`;
    this.jsEdges.set(id, { from, to, type, properties });
    return id;
  }

  getNode(id: string): any {
    if (this.wasmGraph) {
      try {
        return this.wasmGraph.getNode(id);
      } catch {
        // Fall through
      }
    }
    return this.jsNodes.get(id) || null;
  }

  isWasmAccelerated(): boolean {
    return this.wasmGraph !== null;
  }
}

/**
 * EdgeFull SONA Engine with JS fallback
 */
export class EdgeFullSonaEngine {
  private wasmSona: SonaEngineInstance | null = null;
  private jsPatterns: Array<{ task: string; agent: string; embedding?: Float32Array; success: boolean; reward: number }> = [];
  private agentScores: Map<string, { total: number; count: number }> = new Map();

  constructor(config?: SonaConfig) {
    if (edgeFullModule?.sona?.SonaEngine) {
      try {
        this.wasmSona = new edgeFullModule.sona.SonaEngine(config);
      } catch (error) {
        logger.debug('Failed to create WASM SONA, using JS fallback', { error });
      }
    }
  }

  route(taskEmbedding: Float32Array): { agentId: string; confidence: number } {
    if (this.wasmSona) {
      try {
        return this.wasmSona.route(taskEmbedding);
      } catch {
        // Fall through
      }
    }

    // JS fallback: select best performing agent
    let bestAgent = 'general';
    let bestScore = 0;

    for (const [agent, stats] of this.agentScores) {
      const avgScore = stats.total / stats.count;
      if (avgScore > bestScore) {
        bestScore = avgScore;
        bestAgent = agent;
      }
    }

    return { agentId: bestAgent, confidence: Math.min(0.9, bestScore) };
  }

  learn(taskEmbedding: Float32Array, agentId: string, reward: number): void {
    if (this.wasmSona) {
      try {
        this.wasmSona.learn(taskEmbedding, agentId, reward);
        return;
      } catch {
        // Fall through
      }
    }

    // JS fallback
    const stats = this.agentScores.get(agentId) || { total: 0, count: 0 };
    stats.total += reward;
    stats.count += 1;
    this.agentScores.set(agentId, stats);
  }

  addPattern(pattern: { task: string; agent: string; success: boolean }): void {
    if (this.wasmSona) {
      try {
        this.wasmSona.addPattern(pattern);
        return;
      } catch {
        // Fall through
      }
    }

    this.jsPatterns.push({ ...pattern, reward: pattern.success ? 1 : -1 });
  }

  getStats(): { patterns: number; trajectories: number; avgReward: number } {
    if (this.wasmSona) {
      try {
        return this.wasmSona.getStats();
      } catch {
        // Fall through
      }
    }

    let totalReward = 0;
    for (const stats of this.agentScores.values()) {
      totalReward += stats.total;
    }
    const count = Array.from(this.agentScores.values()).reduce((a, b) => a + b.count, 0);

    return {
      patterns: this.jsPatterns.length,
      trajectories: count,
      avgReward: count > 0 ? totalReward / count : 0,
    };
  }

  isWasmAccelerated(): boolean {
    return this.wasmSona !== null;
  }
}

/**
 * EdgeFull ONNX Embeddings
 */
export class EdgeFullOnnxEmbeddings {
  private initialized = false;

  async init(): Promise<boolean> {
    if (!edgeFullModule?.onnx) {
      await initEdgeFull();
    }
    this.initialized = edgeFullModule?.onnx?.isReady?.() ?? false;
    return this.initialized;
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.initialized) await this.init();

    if (edgeFullModule?.onnx?.embed) {
      try {
        return await edgeFullModule.onnx.embed(text);
      } catch {
        // Fall through
      }
    }

    // Fallback to simple embedding
    return this.simpleEmbed(text);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (!this.initialized) await this.init();

    if (edgeFullModule?.onnx?.embedBatch) {
      try {
        return await edgeFullModule.onnx.embedBatch(texts);
      } catch {
        // Fall through
      }
    }

    return texts.map((t) => this.simpleEmbed(t));
  }

  async similarity(text1: string, text2: string): Promise<number> {
    if (edgeFullModule?.onnx?.similarity) {
      try {
        return await edgeFullModule.onnx.similarity(text1, text2);
      } catch {
        // Fall through
      }
    }

    const [e1, e2] = await Promise.all([this.embed(text1), this.embed(text2)]);
    return this.cosineSimilarity(e1, e2);
  }

  isAvailable(): boolean {
    return edgeFullModule?.onnx?.isReady?.() ?? false;
  }

  private simpleEmbed(text: string, dim: number = getEmbeddingConfig()?.dimension ?? 768): Float32Array {
    const embedding = new Float32Array(dim);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      embedding[i % dim] += code / 255;
      embedding[(i * 7) % dim] += (code * 0.3) / 255;
    }
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += embedding[i] * embedding[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) embedding[i] /= norm;
    return embedding;
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }
}

/**
 * EdgeFull DAG Workflow
 */
export class EdgeFullDagWorkflow {
  private wasmDag: DagWorkflowInstance | null = null;
  private nodes: Map<string, (input: any) => Promise<any>> = new Map();
  private edges: Array<{ from: string; to: string }> = [];

  constructor() {
    if (edgeFullModule?.dag?.DagWorkflow) {
      try {
        this.wasmDag = new edgeFullModule.dag.DagWorkflow();
      } catch (error) {
        logger.debug('Failed to create WASM DAG, using JS fallback', { error });
      }
    }
  }

  addNode(id: string, handler: (input: any) => Promise<any>): void {
    if (this.wasmDag) {
      try {
        this.wasmDag.addNode(id, handler);
        return;
      } catch {
        // Fall through
      }
    }
    this.nodes.set(id, handler);
  }

  addEdge(from: string, to: string): void {
    if (this.wasmDag) {
      try {
        this.wasmDag.addEdge(from, to);
        return;
      } catch {
        // Fall through
      }
    }
    this.edges.push({ from, to });
  }

  async execute(input: any): Promise<any> {
    if (this.wasmDag) {
      try {
        return await this.wasmDag.execute(input);
      } catch {
        // Fall through
      }
    }

    // Simple JS execution (topological order)
    const order = this.getTopologicalOrder();
    let result = input;
    for (const nodeId of order) {
      const handler = this.nodes.get(nodeId);
      if (handler) {
        result = await handler(result);
      }
    }
    return result;
  }

  getTopologicalOrder(): string[] {
    if (this.wasmDag) {
      try {
        return this.wasmDag.getTopologicalOrder();
      } catch {
        // Fall through
      }
    }

    // Simple topological sort
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (node: string) => {
      if (visited.has(node)) return;
      visited.add(node);
      for (const edge of this.edges) {
        if (edge.from === node) {
          visit(edge.to);
        }
      }
      order.unshift(node);
    };

    for (const node of this.nodes.keys()) {
      visit(node);
    }

    return order;
  }

  isWasmAccelerated(): boolean {
    return this.wasmDag !== null;
  }
}

// ============================================================================
// RvLite Vector Operations
// ============================================================================

/**
 * Cosine similarity (SIMD-accelerated when available)
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (edgeFullModule?.rvlite?.cosineSimilarity) {
    try {
      return edgeFullModule.rvlite.cosineSimilarity(a, b);
    } catch {
      // Fall through
    }
  }

  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

/**
 * Dot product (SIMD-accelerated when available)
 */
export function dotProduct(a: Float32Array, b: Float32Array): number {
  if (edgeFullModule?.rvlite?.dotProduct) {
    try {
      return edgeFullModule.rvlite.dotProduct(a, b);
    } catch {
      // Fall through
    }
  }

  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Normalize vector (SIMD-accelerated when available)
 */
export function normalize(v: Float32Array): Float32Array {
  if (edgeFullModule?.rvlite?.normalize) {
    try {
      return edgeFullModule.rvlite.normalize(v);
    } catch {
      // Fall through
    }
  }

  const result = new Float32Array(v.length);
  let norm = 0;
  for (let i = 0; i < v.length; i++) {
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) {
    result[i] = v[i] / norm;
  }
  return result;
}

/**
 * Check if SIMD is enabled
 */
export function isSIMDEnabled(): boolean {
  return edgeFullModule?.rvlite?.isSIMDEnabled?.() ?? false;
}

// ============================================================================
// Statistics
// ============================================================================

export interface EdgeFullStats {
  available: boolean;
  version: string;
  modules: {
    edge: boolean;
    graph: boolean;
    rvlite: boolean;
    sona: boolean;
    dag: boolean;
    onnx: boolean;
  };
  simdEnabled: boolean;
}

/**
 * Get EdgeFull statistics
 */
export function getEdgeFullStats(): EdgeFullStats {
  return {
    available: isEdgeFullAvailable(),
    version: edgeFullModule?.getVersion?.() || '0.0.0',
    modules: {
      edge: edgeFullModule?.edge?.isReady?.() ?? false,
      graph: edgeFullModule?.graph?.isReady?.() ?? false,
      rvlite: edgeFullModule?.rvlite?.isReady?.() ?? false,
      sona: edgeFullModule?.sona?.isReady?.() ?? false,
      dag: edgeFullModule?.dag?.isReady?.() ?? false,
      onnx: edgeFullModule?.onnx?.isReady?.() ?? false,
    },
    simdEnabled: isSIMDEnabled(),
  };
}

// ============================================================================
// Exports
// ============================================================================

export default {
  // Initialization
  initEdgeFull,
  isEdgeFullAvailable,
  getEdgeFull,
  getEdgeFullStats,

  // Classes
  EdgeFullHnswIndex,
  EdgeFullGraphDB,
  EdgeFullSonaEngine,
  EdgeFullOnnxEmbeddings,
  EdgeFullDagWorkflow,

  // Vector operations
  cosineSimilarity,
  dotProduct,
  normalize,
  isSIMDEnabled,
};
