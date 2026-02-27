/**
 * Memory Usage Benchmark
 *
 * Profiles memory usage with different vector counts:
 * - 10K vectors: target <500MB
 * - 100K vectors: target <5GB
 * - 1M vectors: measure and document
 *
 * Also identifies memory leaks and growth patterns
 */

import { performance } from 'perf_hooks';
import { AgentDB } from '../../packages/agentdb/src/core/AgentDB';
import { ReflexionMemory } from '../../packages/agentdb/src/controllers/ReflexionMemory';

interface MemorySnapshot {
  timestamp: number;
  vectorCount: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

interface MemoryBenchResult {
  vectorCount: number;
  initialMemory: number;
  finalMemory: number;
  peakMemory: number;
  memoryPerVector: number;
  target?: number;
  meetsTarget?: boolean;
  snapshots: MemorySnapshot[];
}

export class MemoryUsageBench {
  private agentDB: AgentDB | null = null;
  private reflexion: ReflexionMemory | null = null;

  async initialize(): Promise<void> {
    console.log('🔧 Initializing AgentDB for memory profiling...');

    this.agentDB = new AgentDB({
      persistencePath: ':memory:',
      embeddingConfig: {
        provider: 'transformers',
        model: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384
      }
    });
    await this.agentDB.initialize();

    this.reflexion = new ReflexionMemory(this.agentDB as any);

    console.log('✅ AgentDB initialized\n');
  }

  async cleanup(): Promise<void> {
    await this.agentDB?.close();
  }

  /**
   * Benchmark memory usage with 10K vectors
   * Target: <500MB
   */
  async benchmark10KVectors(): Promise<MemoryBenchResult> {
    console.log('📊 Benchmarking memory usage with 10K vectors...');

    // Force GC before starting
    if (global.gc) {
      global.gc();
    }

    const snapshots: MemorySnapshot[] = [];
    const vectorCount = 10000;
    const batchSize = 100;

    // Initial snapshot
    snapshots.push(this.takeSnapshot(0));

    // Insert vectors in batches
    for (let i = 0; i < vectorCount; i += batchSize) {
      const batch = Math.min(batchSize, vectorCount - i);

      for (let j = 0; j < batch; j++) {
        const idx = i + j;
        await this.reflexion!.storeEpisode({
          id: `episode_${idx}`,
          state: { index: idx },
          action: { type: 'test' },
          observation: { result: 'success' },
          reward: Math.random(),
          reflection: `Reflection ${idx}`,
          embedding: this.randomVector(384),
          timestamp: Date.now()
        });
      }

      // Take snapshot every 1000 vectors
      if ((i + batch) % 1000 === 0) {
        snapshots.push(this.takeSnapshot(i + batch));
      }
    }

    // Final snapshot
    snapshots.push(this.takeSnapshot(vectorCount));

    // Force GC and take final measurement
    if (global.gc) {
      global.gc();
      await this.sleep(100);
      snapshots.push(this.takeSnapshot(vectorCount));
    }

    const result = this.analyzeMemoryResults(vectorCount, snapshots, 500 * 1024 * 1024);
    this.printMemoryResult('10K Vectors', result);
    return result;
  }

  /**
   * Benchmark memory usage with 100K vectors
   * Target: <5GB
   */
  async benchmark100KVectors(): Promise<MemoryBenchResult> {
    console.log('📊 Benchmarking memory usage with 100K vectors...');

    if (global.gc) {
      global.gc();
    }

    const snapshots: MemorySnapshot[] = [];
    const vectorCount = 100000;
    const batchSize = 1000;

    snapshots.push(this.takeSnapshot(0));

    for (let i = 0; i < vectorCount; i += batchSize) {
      const batch = Math.min(batchSize, vectorCount - i);

      for (let j = 0; j < batch; j++) {
        const idx = i + j;
        await this.reflexion!.storeEpisode({
          id: `episode_${idx}`,
          state: { index: idx },
          action: { type: 'test' },
          observation: { result: 'success' },
          reward: Math.random(),
          reflection: `Reflection ${idx}`,
          embedding: this.randomVector(384),
          timestamp: Date.now()
        });
      }

      // Take snapshot every 10K vectors
      if ((i + batch) % 10000 === 0) {
        snapshots.push(this.takeSnapshot(i + batch));
        console.log(`   Progress: ${i + batch}/${vectorCount} vectors`);
      }
    }

    snapshots.push(this.takeSnapshot(vectorCount));

    if (global.gc) {
      global.gc();
      await this.sleep(100);
      snapshots.push(this.takeSnapshot(vectorCount));
    }

    const result = this.analyzeMemoryResults(
      vectorCount,
      snapshots,
      5 * 1024 * 1024 * 1024
    );
    this.printMemoryResult('100K Vectors', result);
    return result;
  }

  /**
   * Detect memory leaks by monitoring growth over time
   */
  async detectMemoryLeaks(
    operations: number = 1000,
    iterations: number = 10
  ): Promise<{
    hasLeak: boolean;
    growthRate: number;
    snapshots: MemorySnapshot[];
  }> {
    console.log('📊 Detecting memory leaks...');

    const snapshots: MemorySnapshot[] = [];

    for (let i = 0; i < iterations; i++) {
      // Perform operations
      for (let j = 0; j < operations; j++) {
        await this.reflexion!.storeEpisode({
          id: `leak_test_${i}_${j}`,
          state: { data: 'test' },
          action: { type: 'test' },
          observation: { result: 'success' },
          reward: 1.0,
          reflection: 'Test',
          embedding: this.randomVector(384),
          timestamp: Date.now()
        });
      }

      // Force GC
      if (global.gc) {
        global.gc();
        await this.sleep(100);
      }

      // Take snapshot
      snapshots.push(this.takeSnapshot(i * operations));
    }

    // Analyze growth rate
    const initialMemory = snapshots[0].heapUsed;
    const finalMemory = snapshots[snapshots.length - 1].heapUsed;
    const growthRate = (finalMemory - initialMemory) / initialMemory;

    // Consider it a leak if memory grows by more than 50% after GC
    const hasLeak = growthRate > 0.5;

    console.log(`   Initial memory: ${this.formatBytes(initialMemory)}`);
    console.log(`   Final memory: ${this.formatBytes(finalMemory)}`);
    console.log(`   Growth rate: ${(growthRate * 100).toFixed(1)}%`);
    console.log(
      `   ${hasLeak ? '⚠️  Potential memory leak detected' : '✅ No memory leak detected'}`
    );

    return { hasLeak, growthRate, snapshots };
  }

  /**
   * Measure memory usage under sustained load
   */
  async benchmarkSustainedLoad(
    duration: number = 30000,
    opsPerSecond: number = 10
  ): Promise<{
    duration: number;
    totalOps: number;
    avgMemory: number;
    peakMemory: number;
    memoryStability: number;
    snapshots: MemorySnapshot[];
  }> {
    console.log(
      `📊 Benchmarking sustained load (${duration}ms at ${opsPerSecond} ops/sec)...`
    );

    const snapshots: MemorySnapshot[] = [];
    const startTime = Date.now();
    const interval = 1000 / opsPerSecond;
    let totalOps = 0;

    snapshots.push(this.takeSnapshot(0));

    while (Date.now() - startTime < duration) {
      const opStart = Date.now();

      await this.reflexion!.storeEpisode({
        id: `sustained_${totalOps}`,
        state: { data: 'test' },
        action: { type: 'test' },
        observation: { result: 'success' },
        reward: 1.0,
        reflection: 'Test',
        embedding: this.randomVector(384),
        timestamp: Date.now()
      });

      totalOps++;

      // Take snapshot every 100 ops
      if (totalOps % 100 === 0) {
        snapshots.push(this.takeSnapshot(totalOps));
      }

      // Wait for next interval
      const elapsed = Date.now() - opStart;
      if (elapsed < interval) {
        await this.sleep(interval - elapsed);
      }
    }

    // Final snapshot
    snapshots.push(this.takeSnapshot(totalOps));

    // Calculate statistics
    const memoryUsages = snapshots.map(s => s.heapUsed);
    const avgMemory =
      memoryUsages.reduce((sum, val) => sum + val, 0) / memoryUsages.length;
    const peakMemory = Math.max(...memoryUsages);

    // Memory stability: coefficient of variation (lower is more stable)
    const stdDev = Math.sqrt(
      memoryUsages.reduce((sum, val) => sum + Math.pow(val - avgMemory, 2), 0) /
        memoryUsages.length
    );
    const memoryStability = stdDev / avgMemory;

    console.log(`   Total operations: ${totalOps}`);
    console.log(`   Average memory: ${this.formatBytes(avgMemory)}`);
    console.log(`   Peak memory: ${this.formatBytes(peakMemory)}`);
    console.log(`   Memory stability: ${(memoryStability * 100).toFixed(2)}% (lower is better)`);

    return {
      duration: Date.now() - startTime,
      totalOps,
      avgMemory,
      peakMemory,
      memoryStability,
      snapshots
    };
  }

  /**
   * Take a memory snapshot
   */
  private takeSnapshot(vectorCount: number): MemorySnapshot {
    const memUsage = process.memoryUsage();
    return {
      timestamp: Date.now(),
      vectorCount,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss
    };
  }

  /**
   * Analyze memory results
   */
  private analyzeMemoryResults(
    vectorCount: number,
    snapshots: MemorySnapshot[],
    target?: number
  ): MemoryBenchResult {
    const initialMemory = snapshots[0].heapUsed;
    const finalMemory = snapshots[snapshots.length - 1].heapUsed;
    const peakMemory = Math.max(...snapshots.map(s => s.heapUsed));
    const memoryPerVector = (finalMemory - initialMemory) / vectorCount;
    const meetsTarget = target ? finalMemory < target : undefined;

    return {
      vectorCount,
      initialMemory,
      finalMemory,
      peakMemory,
      memoryPerVector,
      target,
      meetsTarget,
      snapshots
    };
  }

  /**
   * Print memory result
   */
  private printMemoryResult(name: string, result: MemoryBenchResult): void {
    const icon =
      result.meetsTarget === true
        ? '✅'
        : result.meetsTarget === false
        ? '❌'
        : '';

    console.log(`   ${icon} ${name}:`);
    console.log(`      Initial: ${this.formatBytes(result.initialMemory)}`);
    console.log(`      Final: ${this.formatBytes(result.finalMemory)}`);
    console.log(`      Peak: ${this.formatBytes(result.peakMemory)}`);
    console.log(`      Per vector: ${this.formatBytes(result.memoryPerVector)}`);

    if (result.target) {
      console.log(
        `      Target: <${this.formatBytes(result.target)} ${result.meetsTarget ? '(MET)' : '(MISSED)'}`
      );
    }
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  /**
   * Generate random vector
   */
  private randomVector(size: number): Float32Array {
    const vec = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      vec[i] = Math.random() * 2 - 1;
    }
    const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
    for (let i = 0; i < size; i++) {
      vec[i] /= norm;
    }
    return vec;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Run all memory usage benchmarks
 */
export async function runMemoryBenchmarks(): Promise<{
  memory10K: MemoryBenchResult;
  memory100K: MemoryBenchResult;
  leakDetection: any;
  sustainedLoad: any;
}> {
  console.log('=' .repeat(80));
  console.log('🚀 Memory Usage Benchmark Suite');
  console.log('=' .repeat(80));
  console.log();

  const bench = new MemoryUsageBench();
  await bench.initialize();

  // Benchmark 10K vectors
  const memory10K = await bench.benchmark10KVectors();
  console.log();

  // Benchmark 100K vectors
  const memory100K = await bench.benchmark100KVectors();
  console.log();

  // Detect memory leaks
  const leakDetection = await bench.detectMemoryLeaks(1000, 10);
  console.log();

  // Sustained load test
  const sustainedLoad = await bench.benchmarkSustainedLoad(30000, 10);
  console.log();

  await bench.cleanup();

  return { memory10K, memory100K, leakDetection, sustainedLoad };
}

// Run if called directly
if (require.main === module) {
  runMemoryBenchmarks()
    .then(results => {
      console.log('✅ Memory benchmarks completed');
      console.log(
        `   10K vectors: ${(results.memory10K.finalMemory / (1024 * 1024)).toFixed(2)} MB`
      );
      console.log(
        `   100K vectors: ${(results.memory100K.finalMemory / (1024 * 1024)).toFixed(2)} MB`
      );
      console.log(
        `   Memory leak: ${results.leakDetection.hasLeak ? 'DETECTED' : 'NONE'}`
      );
      console.log(
        `   Sustained load stability: ${(results.sustainedLoad.memoryStability * 100).toFixed(2)}%`
      );
    })
    .catch(error => {
      console.error('❌ Benchmark failed:', error);
      process.exit(1);
    });
}
