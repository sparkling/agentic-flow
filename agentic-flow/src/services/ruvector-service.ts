export interface RuVectorAvailability {
  core: boolean;
  attention: boolean;
  graphNode: boolean;
  router: boolean;
  gnn: boolean;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  data: Record<string, unknown>;
}

export interface AttentionResult {
  output: number[];
  weights: number[];
  mechanism: string;
}

export interface GraphQueryResult {
  nodes: any[];
  edges: any[];
  count: number;
}

export interface BenchmarkResult {
  indexSize: number;
  queryTimeMs: number;
  recallAt10: number;
  throughput: number;
}

export class RuVectorService {
  private static instance: RuVectorService | null = null;
  private availability: RuVectorAvailability = {
    core: false, attention: false, graphNode: false, router: false, gnn: false,
  };
  private modules: Record<string, any> = {};
  private initialized = false;

  private constructor() {}

  static async getInstance(): Promise<RuVectorService> {
    if (!RuVectorService.instance) {
      RuVectorService.instance = new RuVectorService();
      await RuVectorService.instance.initialize();
    }
    return RuVectorService.instance;
  }

  static resetInstance(): void {
    RuVectorService.instance = null;
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;

    const tryImport = async (name: string, key: keyof RuVectorAvailability) => {
      try {
        this.modules[key] = await import(/* webpackIgnore: true */ name);
        this.availability[key] = true;
      } catch {
        this.availability[key] = false;
      }
    };

    await Promise.allSettled([
      tryImport('@ruvector/core', 'core'),
      tryImport('@ruvector/attention', 'attention'),
      tryImport('@ruvector/graph-node', 'graphNode'),
      tryImport('@ruvector/router', 'router'),
      tryImport('@ruvector/gnn', 'gnn'),
    ]);

    this.initialized = true;
  }

  getAvailability(): RuVectorAvailability {
    return { ...this.availability };
  }

  async search(query: number[], k: number = 10): Promise<{ available: boolean; results?: VectorSearchResult[]; reason?: string }> {
    if (!this.availability.router) {
      return { available: false, reason: '@ruvector/router not installed' };
    }
    try {
      const mod = this.modules.router;
      const VectorDb = mod.VectorDb || mod.default?.VectorDb;
      if (!VectorDb) return { available: false, reason: 'VectorDb class not found in @ruvector/router' };
      const db = new VectorDb({ dimension: query.length });
      const results = await db.search(query, k);
      return {
        available: true,
        results: (results || []).map((r: any, i: number) => ({
          id: r.id || String(i),
          score: r.score || r.distance || 0,
          data: r.data || r.metadata || {},
        })),
      };
    } catch (error: any) {
      return { available: false, reason: error.message };
    }
  }

  async runAttention(params: { queries: number[][]; keys: number[][]; values: number[][]; mechanism?: string }): Promise<{ available: boolean; result?: AttentionResult; reason?: string }> {
    if (!this.availability.attention) {
      return { available: false, reason: '@ruvector/attention not installed' };
    }
    try {
      const mod = this.modules.attention;
      const mechanism = params.mechanism || 'scaled-dot-product';
      let fn: any;

      if (mechanism === 'flash') {
        fn = mod.flashAttention || mod.default?.flashAttention;
      } else if (mechanism === 'multi-head') {
        fn = mod.multiHeadAttention || mod.default?.multiHeadAttention;
      } else {
        fn = mod.scaledDotProductAttention || mod.default?.scaledDotProductAttention;
      }

      if (!fn) {
        return { available: false, reason: `${mechanism} attention function not found` };
      }

      const result = await fn(params.queries, params.keys, params.values);
      return {
        available: true,
        result: {
          output: result.output || result,
          weights: result.weights || [],
          mechanism,
        },
      };
    } catch (error: any) {
      return { available: false, reason: error.message };
    }
  }

  async graphQuery(cypher: string): Promise<{ available: boolean; result?: GraphQueryResult; reason?: string }> {
    if (!this.availability.graphNode) {
      return { available: false, reason: '@ruvector/graph-node not installed' };
    }
    try {
      const mod = this.modules.graphNode;
      const GraphDB = mod.GraphDB || mod.default?.GraphDB || mod.GraphDatabase || mod.default?.GraphDatabase;
      if (!GraphDB) return { available: false, reason: 'GraphDB class not found in @ruvector/graph-node' };
      const db = new GraphDB();
      const result = await db.query(cypher);
      return {
        available: true,
        result: {
          nodes: result?.nodes || [],
          edges: result?.edges || [],
          count: (result?.nodes?.length || 0) + (result?.edges?.length || 0),
        },
      };
    } catch (error: any) {
      return { available: false, reason: error.message };
    }
  }

  async graphCreate(params: { nodes: any[]; edges: any[] }): Promise<{ available: boolean; result?: { nodesCreated: number; edgesCreated: number }; reason?: string }> {
    if (!this.availability.graphNode) {
      return { available: false, reason: '@ruvector/graph-node not installed' };
    }
    try {
      const mod = this.modules.graphNode;
      const GraphDB = mod.GraphDB || mod.default?.GraphDB || mod.GraphDatabase || mod.default?.GraphDatabase;
      if (!GraphDB) return { available: false, reason: 'GraphDB class not found' };
      const db = new GraphDB();
      for (const node of params.nodes) {
        await db.addNode?.(node) ?? db.createNode?.(node);
      }
      for (const edge of params.edges) {
        await db.addEdge?.(edge) ?? db.createEdge?.(edge);
      }
      return { available: true, result: { nodesCreated: params.nodes.length, edgesCreated: params.edges.length } };
    } catch (error: any) {
      return { available: false, reason: error.message };
    }
  }

  async route(query: number[], candidates: Array<{ id: string; vector: number[] }>): Promise<{ available: boolean; result?: { bestMatch: string; score: number; rankings: Array<{ id: string; score: number }> }; reason?: string }> {
    if (!this.availability.router) {
      return { available: false, reason: '@ruvector/router not installed' };
    }
    try {
      // Cosine similarity fallback
      const cosineSim = (a: number[], b: number[]): number => {
        let dot = 0, magA = 0, magB = 0;
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          dot += a[i] * b[i];
          magA += a[i] * a[i];
          magB += b[i] * b[i];
        }
        return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
      };
      const rankings = candidates.map(c => ({ id: c.id, score: cosineSim(query, c.vector) }))
        .sort((a, b) => b.score - a.score);
      return { available: true, result: { bestMatch: rankings[0]?.id || '', score: rankings[0]?.score || 0, rankings } };
    } catch (error: any) {
      return { available: false, reason: error.message };
    }
  }

  async benchmark(params: { dimension?: number; numVectors?: number; numQueries?: number }): Promise<{ available: boolean; result?: BenchmarkResult; reason?: string }> {
    const dim = params.dimension || 128;
    const numVecs = params.numVectors || 1000;
    const numQ = params.numQueries || 100;

    try {
      // Generate random vectors
      const vectors: number[][] = [];
      for (let i = 0; i < numVecs; i++) {
        vectors.push(Array.from({ length: dim }, () => Math.random()));
      }
      const queries: number[][] = [];
      for (let i = 0; i < numQ; i++) {
        queries.push(Array.from({ length: dim }, () => Math.random()));
      }

      const start = performance.now();
      // Simple brute-force search as benchmark baseline
      for (const q of queries) {
        vectors.map((v, idx) => {
          let dot = 0;
          for (let i = 0; i < dim; i++) dot += q[i] * v[i];
          return { idx, score: dot };
        }).sort((a, b) => b.score - a.score).slice(0, 10);
      }
      const elapsed = performance.now() - start;

      return {
        available: true,
        result: {
          indexSize: numVecs,
          queryTimeMs: elapsed / numQ,
          recallAt10: 1.0, // brute-force is exact
          throughput: (numQ / elapsed) * 1000,
        },
      };
    } catch (error: any) {
      return { available: false, reason: error.message };
    }
  }
}
