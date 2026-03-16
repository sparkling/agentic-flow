/**
 * Attention Mechanisms Benchmark
 *
 * Benchmarks all 5 attention mechanisms vs JS fallback:
 * - Flash Attention: target 50-100x speedup
 * - Linear Attention: target 10-20x speedup
 * - Hyperbolic Attention: target 5-10x speedup
 * - Dot-Product Attention: baseline
 * - Cross Attention: baseline
 */

import { performance } from 'perf_hooks';
import { AttentionService } from '../../packages/agentdb/src/controllers/AttentionService';

interface AttentionBenchResult {
  mechanism: string;
  backend: 'native' | 'wasm' | 'js';
  sequenceLength: number;
  dimensions: number;
  avgLatency: number;
  opsPerSec: number;
  speedupVsJS: number;
  meetsTarget: boolean;
  targetSpeedup: number;
}

export class AttentionMechanismsBench {
  private attentionService: AttentionService | null = null;

  async initialize(): Promise<void> {
    console.log('🔧 Initializing Attention Service...');

    const mockDb = {
      prepare: () => ({ all: () => [], get: () => null, run: () => ({}) }),
      exec: () => {},
    };

    this.attentionService = new AttentionService(mockDb as any);
    console.log('✅ Attention Service initialized\n');
  }

  /**
   * Benchmark Flash Attention
   * Target: 50-100x speedup over JS
   */
  async benchmarkFlashAttention(
    sequenceLength: number = 512,
    dimensions: number = 384,
    iterations: number = 50
  ): Promise<AttentionBenchResult> {
    console.log(
      `📊 Benchmarking Flash Attention (seq=${sequenceLength}, dim=${dimensions})...`
    );

    const query = this.randomVector(dimensions);
    const keys = Array(sequenceLength)
      .fill(null)
      .map(() => this.randomVector(dimensions));
    const values = Array(sequenceLength)
      .fill(null)
      .map(() => this.randomVector(dimensions));

    // Benchmark native/WASM implementation
    const nativeLatencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await this.attentionService!.computeAttention(
        query,
        keys,
        values,
        'flash'
      );
      nativeLatencies.push(performance.now() - start);
    }

    // Benchmark JS fallback
    const jsLatencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      this.flashAttentionJS(query, keys, values);
      jsLatencies.push(performance.now() - start);
    }

    const nativeAvg =
      nativeLatencies.reduce((sum, val) => sum + val, 0) / nativeLatencies.length;
    const jsAvg = jsLatencies.reduce((sum, val) => sum + val, 0) / jsLatencies.length;
    const speedup = jsAvg / nativeAvg;
    const meetsTarget = speedup >= 50;

    console.log(`   Native avg: ${nativeAvg.toFixed(2)}ms`);
    console.log(`   JS avg: ${jsAvg.toFixed(2)}ms`);
    console.log(
      `   ${meetsTarget ? '✅' : '⚠️ '} Speedup: ${speedup.toFixed(1)}x (target: 50-100x)`
    );

    return {
      mechanism: 'Flash Attention',
      backend: 'native',
      sequenceLength,
      dimensions,
      avgLatency: nativeAvg,
      opsPerSec: 1000 / nativeAvg,
      speedupVsJS: speedup,
      meetsTarget,
      targetSpeedup: 50
    };
  }

  /**
   * Benchmark Linear Attention
   * Target: 10-20x speedup over JS
   */
  async benchmarkLinearAttention(
    sequenceLength: number = 1024,
    dimensions: number = 384,
    iterations: number = 50
  ): Promise<AttentionBenchResult> {
    console.log(
      `📊 Benchmarking Linear Attention (seq=${sequenceLength}, dim=${dimensions})...`
    );

    const query = this.randomVector(dimensions);
    const keys = Array(sequenceLength)
      .fill(null)
      .map(() => this.randomVector(dimensions));
    const values = Array(sequenceLength)
      .fill(null)
      .map(() => this.randomVector(dimensions));

    // Benchmark native/WASM
    const nativeLatencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await this.attentionService!.computeAttention(
        query,
        keys,
        values,
        'linear'
      );
      nativeLatencies.push(performance.now() - start);
    }

    // Benchmark JS fallback
    const jsLatencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      this.linearAttentionJS(query, keys, values);
      jsLatencies.push(performance.now() - start);
    }

    const nativeAvg =
      nativeLatencies.reduce((sum, val) => sum + val, 0) / nativeLatencies.length;
    const jsAvg = jsLatencies.reduce((sum, val) => sum + val, 0) / jsLatencies.length;
    const speedup = jsAvg / nativeAvg;
    const meetsTarget = speedup >= 10;

    console.log(`   Native avg: ${nativeAvg.toFixed(2)}ms`);
    console.log(`   JS avg: ${jsAvg.toFixed(2)}ms`);
    console.log(
      `   ${meetsTarget ? '✅' : '⚠️ '} Speedup: ${speedup.toFixed(1)}x (target: 10-20x)`
    );

    return {
      mechanism: 'Linear Attention',
      backend: 'native',
      sequenceLength,
      dimensions,
      avgLatency: nativeAvg,
      opsPerSec: 1000 / nativeAvg,
      speedupVsJS: speedup,
      meetsTarget,
      targetSpeedup: 10
    };
  }

  /**
   * Benchmark Hyperbolic Attention
   * Target: 5-10x speedup over JS
   */
  async benchmarkHyperbolicAttention(
    sequenceLength: number = 256,
    dimensions: number = 384,
    iterations: number = 50
  ): Promise<AttentionBenchResult> {
    console.log(
      `📊 Benchmarking Hyperbolic Attention (seq=${sequenceLength}, dim=${dimensions})...`
    );

    const query = this.randomVector(dimensions);
    const keys = Array(sequenceLength)
      .fill(null)
      .map(() => this.randomVector(dimensions));
    const values = Array(sequenceLength)
      .fill(null)
      .map(() => this.randomVector(dimensions));

    // Benchmark native/WASM
    const nativeLatencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await this.attentionService!.computeAttention(
        query,
        keys,
        values,
        'hyperbolic'
      );
      nativeLatencies.push(performance.now() - start);
    }

    // Benchmark JS fallback
    const jsLatencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      this.hyperbolicAttentionJS(query, keys, values);
      jsLatencies.push(performance.now() - start);
    }

    const nativeAvg =
      nativeLatencies.reduce((sum, val) => sum + val, 0) / nativeLatencies.length;
    const jsAvg = jsLatencies.reduce((sum, val) => sum + val, 0) / jsLatencies.length;
    const speedup = jsAvg / nativeAvg;
    const meetsTarget = speedup >= 5;

    console.log(`   Native avg: ${nativeAvg.toFixed(2)}ms`);
    console.log(`   JS avg: ${jsAvg.toFixed(2)}ms`);
    console.log(
      `   ${meetsTarget ? '✅' : '⚠️ '} Speedup: ${speedup.toFixed(1)}x (target: 5-10x)`
    );

    return {
      mechanism: 'Hyperbolic Attention',
      backend: 'native',
      sequenceLength,
      dimensions,
      avgLatency: nativeAvg,
      opsPerSec: 1000 / nativeAvg,
      speedupVsJS: speedup,
      meetsTarget,
      targetSpeedup: 5
    };
  }

  /**
   * Benchmark Dot-Product Attention (baseline)
   */
  async benchmarkDotProductAttention(
    sequenceLength: number = 512,
    dimensions: number = 384,
    iterations: number = 50
  ): Promise<AttentionBenchResult> {
    console.log(
      `📊 Benchmarking Dot-Product Attention (seq=${sequenceLength}, dim=${dimensions})...`
    );

    const query = this.randomVector(dimensions);
    const keys = Array(sequenceLength)
      .fill(null)
      .map(() => this.randomVector(dimensions));
    const values = Array(sequenceLength)
      .fill(null)
      .map(() => this.randomVector(dimensions));

    const latencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await this.attentionService!.computeAttention(
        query,
        keys,
        values,
        'dot-product'
      );
      latencies.push(performance.now() - start);
    }

    const avg = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;

    console.log(`   Average: ${avg.toFixed(2)}ms (baseline)`);

    return {
      mechanism: 'Dot-Product Attention',
      backend: 'native',
      sequenceLength,
      dimensions,
      avgLatency: avg,
      opsPerSec: 1000 / avg,
      speedupVsJS: 1.0,
      meetsTarget: true,
      targetSpeedup: 1.0
    };
  }

  /**
   * Benchmark Cross Attention
   */
  async benchmarkCrossAttention(
    sequenceLength: number = 512,
    dimensions: number = 384,
    iterations: number = 50
  ): Promise<AttentionBenchResult> {
    console.log(
      `📊 Benchmarking Cross Attention (seq=${sequenceLength}, dim=${dimensions})...`
    );

    const query = this.randomVector(dimensions);
    const keys = Array(sequenceLength)
      .fill(null)
      .map(() => this.randomVector(dimensions));
    const values = Array(sequenceLength)
      .fill(null)
      .map(() => this.randomVector(dimensions));

    const latencies: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await this.attentionService!.computeAttention(
        query,
        keys,
        values,
        'cross'
      );
      latencies.push(performance.now() - start);
    }

    const avg = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;

    console.log(`   Average: ${avg.toFixed(2)}ms`);

    return {
      mechanism: 'Cross Attention',
      backend: 'native',
      sequenceLength,
      dimensions,
      avgLatency: avg,
      opsPerSec: 1000 / avg,
      speedupVsJS: 1.0,
      meetsTarget: true,
      targetSpeedup: 1.0
    };
  }

  /**
   * Helper: Generate random vector
   */
  private randomVector(size: number): Float32Array {
    const vec = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      vec[i] = Math.random() * 2 - 1;
    }
    // Normalize
    const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
    for (let i = 0; i < size; i++) {
      vec[i] /= norm;
    }
    return vec;
  }

  /**
   * JS Fallback: Flash Attention (simplified)
   */
  private flashAttentionJS(
    query: Float32Array,
    keys: Float32Array[],
    values: Float32Array[]
  ): Float32Array {
    const seqLen = keys.length;
    const dim = query.length;

    // Compute attention scores
    const scores = new Float32Array(seqLen);
    for (let i = 0; i < seqLen; i++) {
      let score = 0;
      for (let j = 0; j < dim; j++) {
        score += query[j] * keys[i][j];
      }
      scores[i] = score / Math.sqrt(dim);
    }

    // Softmax
    const maxScore = Math.max(...scores);
    let sumExp = 0;
    for (let i = 0; i < seqLen; i++) {
      scores[i] = Math.exp(scores[i] - maxScore);
      sumExp += scores[i];
    }
    for (let i = 0; i < seqLen; i++) {
      scores[i] /= sumExp;
    }

    // Weighted sum
    const output = new Float32Array(dim);
    for (let i = 0; i < seqLen; i++) {
      for (let j = 0; j < dim; j++) {
        output[j] += scores[i] * values[i][j];
      }
    }

    return output;
  }

  /**
   * JS Fallback: Linear Attention
   */
  private linearAttentionJS(
    query: Float32Array,
    keys: Float32Array[],
    values: Float32Array[]
  ): Float32Array {
    const seqLen = keys.length;
    const dim = query.length;

    // Linear kernel (ReLU)
    const queryKernel = new Float32Array(dim);
    for (let i = 0; i < dim; i++) {
      queryKernel[i] = Math.max(0, query[i]);
    }

    // Compute attention
    const output = new Float32Array(dim);
    let normalization = 0;

    for (let i = 0; i < seqLen; i++) {
      let keyKernelSum = 0;
      for (let j = 0; j < dim; j++) {
        keyKernelSum += Math.max(0, keys[i][j]);
      }

      const weight = keyKernelSum;
      normalization += weight;

      for (let j = 0; j < dim; j++) {
        output[j] += weight * values[i][j];
      }
    }

    // Normalize
    for (let i = 0; i < dim; i++) {
      output[i] /= normalization || 1;
    }

    return output;
  }

  /**
   * JS Fallback: Hyperbolic Attention
   */
  private hyperbolicAttentionJS(
    query: Float32Array,
    keys: Float32Array[],
    values: Float32Array[]
  ): Float32Array {
    const seqLen = keys.length;
    const dim = query.length;

    // Hyperbolic distance (simplified)
    const scores = new Float32Array(seqLen);
    for (let i = 0; i < seqLen; i++) {
      let distance = 0;
      for (let j = 0; j < dim; j++) {
        const diff = query[j] - keys[i][j];
        distance += diff * diff;
      }
      scores[i] = 1.0 / (1.0 + Math.sqrt(distance));
    }

    // Normalize
    const sumScores = scores.reduce((sum, val) => sum + val, 0);
    for (let i = 0; i < seqLen; i++) {
      scores[i] /= sumScores;
    }

    // Weighted sum
    const output = new Float32Array(dim);
    for (let i = 0; i < seqLen; i++) {
      for (let j = 0; j < dim; j++) {
        output[j] += scores[i] * values[i][j];
      }
    }

    return output;
  }
}

/**
 * Run all attention mechanism benchmarks
 */
export async function runAttentionBenchmarks(): Promise<AttentionBenchResult[]> {
  console.log('=' .repeat(80));
  console.log('🚀 Attention Mechanisms Benchmark Suite');
  console.log('=' .repeat(80));
  console.log();

  const bench = new AttentionMechanismsBench();
  await bench.initialize();

  const results: AttentionBenchResult[] = [];

  // Flash Attention
  results.push(await bench.benchmarkFlashAttention(512, 384, 50));
  console.log();

  // Linear Attention
  results.push(await bench.benchmarkLinearAttention(1024, 384, 50));
  console.log();

  // Hyperbolic Attention
  results.push(await bench.benchmarkHyperbolicAttention(256, 384, 50));
  console.log();

  // Dot-Product Attention (baseline)
  results.push(await bench.benchmarkDotProductAttention(512, 384, 50));
  console.log();

  // Cross Attention
  results.push(await bench.benchmarkCrossAttention(512, 384, 50));
  console.log();

  return results;
}

// Run if called directly
if (require.main === module) {
  runAttentionBenchmarks()
    .then(results => {
      console.log('✅ Attention mechanism benchmarks completed');
      console.log(`   Total mechanisms: ${results.length}`);
      console.log(`   Met targets: ${results.filter(r => r.meetsTarget).length}`);

      const avgSpeedup =
        results
          .filter(r => r.speedupVsJS > 1)
          .reduce((sum, r) => sum + r.speedupVsJS, 0) /
        results.filter(r => r.speedupVsJS > 1).length;

      console.log(`   Average speedup: ${avgSpeedup.toFixed(1)}x`);
    })
    .catch(error => {
      console.error('❌ Benchmark failed:', error);
      process.exit(1);
    });
}
