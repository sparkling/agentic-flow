/**
 * Controller Operations Benchmark
 *
 * Tests AgentDB controller performance:
 * - Vector insert with native/WASM/JS backends
 * - HNSW search with various k values
 * - Episode/skill/pattern retrieval latency
 *
 * Targets:
 * - Insert: <10ms
 * - Search (1K vectors): <5ms
 * - Retrieve: <20ms
 */

import { performance } from 'perf_hooks';
import { AgentDB } from '../../packages/agentdb/src/core/AgentDB';
import { ReflexionMemory } from '../../packages/agentdb/src/controllers/ReflexionMemory';
import { SkillLibrary } from '../../packages/agentdb/src/controllers/SkillLibrary';
import { ReasoningBank } from '../../packages/agentdb/src/controllers/ReasoningBank';
import { WASMVectorSearch } from '../../packages/agentdb/src/controllers/WASMVectorSearch';

interface BenchmarkResult {
  name: string;
  category: string;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  opsPerSec: number;
  success: boolean;
  samples: number;
  target?: number;
  meetsTarget?: boolean;
}

export class ControllerOperationsBench {
  private agentDB: AgentDB | null = null;
  private reflexion: ReflexionMemory | null = null;
  private skillLib: SkillLibrary | null = null;
  private reasoningBank: ReasoningBank | null = null;
  private wasmSearch: WASMVectorSearch | null = null;

  async initialize(): Promise<void> {
    console.log('🔧 Initializing AgentDB controllers...');

    // Initialize AgentDB with memory backend
    this.agentDB = new AgentDB({
      persistencePath: ':memory:',
      embeddingConfig: {
        provider: 'transformers',
        model: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384
      }
    });
    await this.agentDB.initialize();

    // Initialize controllers
    this.reflexion = new ReflexionMemory(this.agentDB as any);
    this.skillLib = new SkillLibrary(this.agentDB as any);
    this.reasoningBank = new ReasoningBank(this.agentDB as any);

    // Initialize WASM search
    const mockDb = {
      prepare: () => ({ all: () => [], get: () => null, run: () => ({}) }),
      exec: () => {},
    };
    this.wasmSearch = new WASMVectorSearch(mockDb as any, {
      enableWASM: true,
      batchSize: 100
    });

    console.log('✅ Controllers initialized\n');
  }

  async cleanup(): Promise<void> {
    await this.agentDB?.close();
  }

  /**
   * Benchmark 1: Vector Insert Performance
   * Target: <10ms per insert
   */
  async benchmarkVectorInsert(samples: number = 100): Promise<BenchmarkResult> {
    console.log(`📊 Benchmarking vector insert (${samples} samples)...`);

    const latencies: number[] = [];
    const embeddings = await this.generateTestEmbeddings(samples);

    for (let i = 0; i < samples; i++) {
      const start = performance.now();

      await this.reflexion!.storeEpisode({
        id: `episode_${i}`,
        state: { vector: embeddings[i] },
        action: { type: 'test' },
        observation: { result: 'success' },
        reward: 1.0,
        reflection: 'Test episode',
        embedding: embeddings[i],
        timestamp: Date.now()
      });

      const duration = performance.now() - start;
      latencies.push(duration);
    }

    return this.calculateStats('Vector Insert', 'Controller Operations', latencies, 10);
  }

  /**
   * Benchmark 2: HNSW Search Performance
   * Target: <5ms for 1K vectors
   */
  async benchmarkHNSWSearch(
    vectorCount: number = 1000,
    queries: number = 50,
    k: number = 10
  ): Promise<BenchmarkResult> {
    console.log(`📊 Benchmarking HNSW search (${vectorCount} vectors, k=${k})...`);

    // Pre-populate database with vectors
    const embeddings = await this.generateTestEmbeddings(vectorCount);
    for (let i = 0; i < vectorCount; i++) {
      await this.reflexion!.storeEpisode({
        id: `episode_${i}`,
        state: { vector: embeddings[i] },
        action: { type: 'test' },
        observation: { result: 'success' },
        reward: 1.0,
        reflection: 'Test episode',
        embedding: embeddings[i],
        timestamp: Date.now()
      });
    }

    // Run search queries
    const latencies: number[] = [];
    const queryEmbeddings = await this.generateTestEmbeddings(queries);

    for (let i = 0; i < queries; i++) {
      const start = performance.now();

      await this.reflexion!.recallSimilarEpisodes(
        queryEmbeddings[i],
        k
      );

      const duration = performance.now() - start;
      latencies.push(duration);
    }

    const target = vectorCount <= 1000 ? 5 : 10;
    return this.calculateStats(
      `HNSW Search (${vectorCount} vectors, k=${k})`,
      'Controller Operations',
      latencies,
      target
    );
  }

  /**
   * Benchmark 3: Episode Retrieval
   * Target: <20ms
   */
  async benchmarkEpisodeRetrieval(samples: number = 50): Promise<BenchmarkResult> {
    console.log(`📊 Benchmarking episode retrieval (${samples} samples)...`);

    // Pre-populate with episodes
    const episodeIds: string[] = [];
    for (let i = 0; i < 100; i++) {
      const id = `episode_${i}`;
      episodeIds.push(id);

      await this.reflexion!.storeEpisode({
        id,
        state: { data: `state_${i}` },
        action: { type: 'test' },
        observation: { result: 'success' },
        reward: Math.random(),
        reflection: `Reflection ${i}`,
        embedding: new Float32Array(384).fill(Math.random()),
        timestamp: Date.now()
      });
    }

    // Benchmark retrieval
    const latencies: number[] = [];
    for (let i = 0; i < samples; i++) {
      const randomId = episodeIds[Math.floor(Math.random() * episodeIds.length)];

      const start = performance.now();
      await this.reflexion!.getEpisode(randomId);
      const duration = performance.now() - start;

      latencies.push(duration);
    }

    return this.calculateStats('Episode Retrieval', 'Controller Operations', latencies, 20);
  }

  /**
   * Benchmark 4: Skill Search
   * Target: <20ms
   */
  async benchmarkSkillSearch(samples: number = 50): Promise<BenchmarkResult> {
    console.log(`📊 Benchmarking skill search (${samples} samples)...`);

    // Pre-populate with skills
    for (let i = 0; i < 100; i++) {
      await this.skillLib!.storeSkill({
        id: `skill_${i}`,
        name: `Skill ${i}`,
        description: `Test skill ${i}`,
        code: `function skill_${i}() { return ${i}; }`,
        usageCount: Math.floor(Math.random() * 100),
        successRate: Math.random(),
        embedding: new Float32Array(384).fill(Math.random()),
        timestamp: Date.now()
      });
    }

    // Benchmark skill search
    const latencies: number[] = [];
    const queryEmbeddings = await this.generateTestEmbeddings(samples);

    for (let i = 0; i < samples; i++) {
      const start = performance.now();
      await this.skillLib!.searchSimilarSkills(queryEmbeddings[i], 10);
      const duration = performance.now() - start;
      latencies.push(duration);
    }

    return this.calculateStats('Skill Search', 'Controller Operations', latencies, 20);
  }

  /**
   * Benchmark 5: Pattern Retrieval
   * Target: <20ms
   */
  async benchmarkPatternRetrieval(samples: number = 50): Promise<BenchmarkResult> {
    console.log(`📊 Benchmarking pattern retrieval (${samples} samples)...`);

    // Pre-populate with patterns
    const patternIds: string[] = [];
    for (let i = 0; i < 100; i++) {
      const id = `pattern_${i}`;
      patternIds.push(id);

      await this.reasoningBank!.storePattern({
        id,
        name: `Pattern ${i}`,
        description: `Test pattern ${i}`,
        solution: `Solution ${i}`,
        confidence: Math.random(),
        usageCount: Math.floor(Math.random() * 50),
        embedding: new Float32Array(384).fill(Math.random()),
        timestamp: Date.now()
      });
    }

    // Benchmark retrieval
    const latencies: number[] = [];
    for (let i = 0; i < samples; i++) {
      const randomId = patternIds[Math.floor(Math.random() * patternIds.length)];

      const start = performance.now();
      await this.reasoningBank!.getPattern(randomId);
      const duration = performance.now() - start;

      latencies.push(duration);
    }

    return this.calculateStats('Pattern Retrieval', 'Controller Operations', latencies, 20);
  }

  /**
   * Benchmark 6: WASM vs JS Comparison
   */
  async benchmarkWASMvsJS(samples: number = 100): Promise<{
    wasm: BenchmarkResult;
    js: BenchmarkResult;
    speedup: number;
  }> {
    console.log(`📊 Benchmarking WASM vs JS (${samples} samples)...`);

    const embeddings = await this.generateTestEmbeddings(samples);
    const queryVector = embeddings[0];

    // Benchmark WASM
    const wasmLatencies: number[] = [];
    for (let i = 1; i < samples; i++) {
      const start = performance.now();
      this.wasmSearch!.cosineSimilarity(queryVector, embeddings[i]);
      const duration = performance.now() - start;
      wasmLatencies.push(duration);
    }

    // Benchmark JS fallback
    const jsLatencies: number[] = [];
    for (let i = 1; i < samples; i++) {
      const start = performance.now();
      this.cosineSimilarityJS(queryVector, embeddings[i]);
      const duration = performance.now() - start;
      jsLatencies.push(duration);
    }

    const wasmStats = this.calculateStats('WASM Similarity', 'WASM vs JS', wasmLatencies);
    const jsStats = this.calculateStats('JS Similarity', 'WASM vs JS', jsLatencies);
    const speedup = jsStats.mean / wasmStats.mean;

    console.log(`   ⚡ WASM is ${speedup.toFixed(2)}x faster than JS`);

    return { wasm: wasmStats, js: jsStats, speedup };
  }

  /**
   * Helper: Generate test embeddings
   */
  private async generateTestEmbeddings(count: number): Promise<Float32Array[]> {
    const embeddings: Float32Array[] = [];
    for (let i = 0; i < count; i++) {
      const embedding = new Float32Array(384);
      for (let j = 0; j < 384; j++) {
        embedding[j] = Math.random() * 2 - 1; // Range [-1, 1]
      }
      // Normalize
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      for (let j = 0; j < 384; j++) {
        embedding[j] /= norm;
      }
      embeddings.push(embedding);
    }
    return embeddings;
  }

  /**
   * Helper: Calculate statistics
   */
  private calculateStats(
    name: string,
    category: string,
    latencies: number[],
    target?: number
  ): BenchmarkResult {
    const sorted = [...latencies].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const mean = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
    const opsPerSec = 1000 / mean;

    const meetsTarget = target ? p95 <= target : undefined;
    const targetIcon = meetsTarget === true ? '✅' : meetsTarget === false ? '❌' : '';

    console.log(`   ${targetIcon} ${name}:`);
    console.log(`      p50: ${p50.toFixed(2)}ms, p95: ${p95.toFixed(2)}ms, p99: ${p99.toFixed(2)}ms`);
    console.log(`      mean: ${mean.toFixed(2)}ms, ops/sec: ${opsPerSec.toFixed(0)}`);
    if (target) {
      console.log(`      target: <${target}ms ${meetsTarget ? '(MET)' : '(MISSED)'}`);
    }

    return {
      name,
      category,
      p50,
      p95,
      p99,
      mean,
      opsPerSec,
      success: true,
      samples: latencies.length,
      target,
      meetsTarget
    };
  }

  /**
   * JS fallback for cosine similarity
   */
  private cosineSimilarityJS(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

/**
 * Run all controller benchmarks
 */
export async function runControllerBenchmarks(): Promise<BenchmarkResult[]> {
  console.log('=' .repeat(80));
  console.log('🚀 Controller Operations Benchmark Suite');
  console.log('=' .repeat(80));
  console.log();

  const bench = new ControllerOperationsBench();
  await bench.initialize();

  const results: BenchmarkResult[] = [];

  try {
    // Benchmark 1: Vector insert
    results.push(await bench.benchmarkVectorInsert(100));
    console.log();

    // Benchmark 2: HNSW search (various sizes)
    results.push(await bench.benchmarkHNSWSearch(1000, 50, 10));
    console.log();
    results.push(await bench.benchmarkHNSWSearch(10000, 50, 10));
    console.log();

    // Benchmark 3: Episode retrieval
    results.push(await bench.benchmarkEpisodeRetrieval(50));
    console.log();

    // Benchmark 4: Skill search
    results.push(await bench.benchmarkSkillSearch(50));
    console.log();

    // Benchmark 5: Pattern retrieval
    results.push(await bench.benchmarkPatternRetrieval(50));
    console.log();

    // Benchmark 6: WASM vs JS
    const wasmComparison = await bench.benchmarkWASMvsJS(100);
    results.push(wasmComparison.wasm);
    results.push(wasmComparison.js);
    console.log();

  } finally {
    await bench.cleanup();
  }

  return results;
}

// Run if called directly
if (require.main === module) {
  runControllerBenchmarks()
    .then(results => {
      console.log('✅ Controller benchmarks completed');
      console.log(`   Total: ${results.length} benchmarks`);
      console.log(`   Passed: ${results.filter(r => r.meetsTarget !== false).length}`);
      console.log(`   Failed: ${results.filter(r => r.meetsTarget === false).length}`);
    })
    .catch(error => {
      console.error('❌ Benchmark failed:', error);
      process.exit(1);
    });
}
