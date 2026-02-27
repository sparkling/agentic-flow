/**
 * Precision Optimizer
 *
 * Dynamic mixed-precision optimization - use different quantization levels
 * for different layers based on sensitivity analysis
 */

import { QuantizationBits } from './quantizer.js';

export interface LayerSensitivity {
  layerName: string;
  /** Sensitivity score (0-1, higher = more sensitive) */
  sensitivity: number;
  /** Recommended precision */
  recommendedBits: QuantizationBits;
  /** Accuracy impact if quantized */
  accuracyImpact: number;
}

export interface MixedPrecisionConfig {
  /** Target accuracy threshold */
  accuracyThreshold: number;
  /** Layers to always use FP16 (regex patterns) */
  fp16Layers?: string[];
  /** Layers to allow INT4 (regex patterns) */
  int4Layers?: string[];
  /** Maximum accuracy loss allowed */
  maxAccuracyLoss?: number;
}

export interface OptimizationResult {
  /** Layer-wise precision assignments */
  precisionMap: Map<string, QuantizationBits>;
  /** Expected memory reduction */
  memoryReduction: number;
  /** Expected speedup */
  speedup: number;
  /** Expected accuracy loss */
  accuracyLoss: number;
  /** Number of FP16 layers */
  fp16Count: number;
  /** Number of INT8 layers */
  int8Count: number;
  /** Number of INT4 layers */
  int4Count: number;
}

export class PrecisionOptimizer {
  private config: MixedPrecisionConfig;

  constructor(config: MixedPrecisionConfig) {
    this.config = {
      maxAccuracyLoss: 2.0, // 2% max loss
      ...config,
    };
  }

  /**
   * Analyze layer sensitivity to quantization
   */
  public analyzeSensitivity(
    layerName: string,
    originalWeights: Float32Array,
    activations: Float32Array
  ): LayerSensitivity {
    // Compute sensitivity based on:
    // 1. Weight distribution (high variance = sensitive)
    // 2. Activation magnitudes (large range = sensitive)
    // 3. Layer type (attention layers are more sensitive)

    const weightVariance = this.computeVariance(originalWeights);
    const activationRange = this.computeRange(activations);

    // Normalize sensitivity score (0-1)
    const weightScore = Math.min(1.0, weightVariance / 10.0);
    const activationScore = Math.min(1.0, activationRange / 100.0);

    // Layer type penalty
    let typeScore = 0.5;
    if (layerName.includes('attention') || layerName.includes('attn')) {
      typeScore = 0.9; // Attention layers are very sensitive
    } else if (layerName.includes('norm') || layerName.includes('bn')) {
      typeScore = 0.8; // Normalization layers are sensitive
    } else if (layerName.includes('fc') || layerName.includes('linear')) {
      typeScore = 0.4; // FC layers are less sensitive
    }

    const sensitivity = (weightScore + activationScore + typeScore) / 3;

    // Recommend precision based on sensitivity
    let recommendedBits: QuantizationBits;
    if (sensitivity > 0.7) {
      recommendedBits = 16; // FP16 for high sensitivity
    } else if (sensitivity > 0.4) {
      recommendedBits = 8; // INT8 for medium sensitivity
    } else {
      recommendedBits = 4; // INT4 for low sensitivity
    }

    // Estimate accuracy impact
    const accuracyImpact = this.estimateAccuracyImpact(sensitivity, recommendedBits);

    return {
      layerName,
      sensitivity,
      recommendedBits,
      accuracyImpact,
    };
  }

  /**
   * Optimize mixed-precision configuration
   */
  public optimize(
    sensitivities: LayerSensitivity[]
  ): OptimizationResult {
    const precisionMap = new Map<string, QuantizationBits>();
    let totalAccuracyLoss = 0;
    let fp16Count = 0;
    let int8Count = 0;
    let int4Count = 0;

    // Sort by sensitivity (descending)
    const sorted = [...sensitivities].sort((a, b) => b.sensitivity - a.sensitivity);

    for (const layer of sorted) {
      let bits = layer.recommendedBits;

      // Apply config overrides
      if (this.matchesPattern(layer.layerName, this.config.fp16Layers)) {
        bits = 16;
      } else if (this.matchesPattern(layer.layerName, this.config.int4Layers)) {
        bits = 4;
      }

      // Check if we can afford the accuracy loss
      if (totalAccuracyLoss + layer.accuracyImpact > this.config.maxAccuracyLoss!) {
        // Upgrade to higher precision
        if (bits === 4) bits = 8;
        else if (bits === 8) bits = 16;
      }

      precisionMap.set(layer.layerName, bits);
      totalAccuracyLoss += this.estimateAccuracyImpact(layer.sensitivity, bits);

      if (bits === 16) fp16Count++;
      else if (bits === 8) int8Count++;
      else if (bits === 4) int4Count++;
    }

    // Compute expected improvements
    const memoryReduction = this.computeMemoryReduction(precisionMap);
    const speedup = this.computeSpeedup(precisionMap);

    return {
      precisionMap,
      memoryReduction,
      speedup,
      accuracyLoss: totalAccuracyLoss,
      fp16Count,
      int8Count,
      int4Count,
    };
  }

  /**
   * Compute variance of weights
   */
  private computeVariance(weights: Float32Array): number {
    let mean = 0;
    for (let i = 0; i < weights.length; i++) {
      mean += weights[i];
    }
    mean /= weights.length;

    let variance = 0;
    for (let i = 0; i < weights.length; i++) {
      variance += Math.pow(weights[i] - mean, 2);
    }
    return variance / weights.length;
  }

  /**
   * Compute range of activations
   */
  private computeRange(activations: Float32Array): number {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < activations.length; i++) {
      min = Math.min(min, activations[i]);
      max = Math.max(max, activations[i]);
    }
    return max - min;
  }

  /**
   * Estimate accuracy impact based on sensitivity and precision
   */
  private estimateAccuracyImpact(sensitivity: number, bits: QuantizationBits): number {
    const baseLoss = {
      16: 0.1, // FP16: 0.1% loss
      8: 1.0,  // INT8: 1% loss
      4: 3.0,  // INT4: 3% loss
    };

    return baseLoss[bits] * sensitivity;
  }

  /**
   * Check if layer name matches patterns
   */
  private matchesPattern(layerName: string, patterns?: string[]): boolean {
    if (!patterns) return false;
    return patterns.some(pattern => {
      const regex = new RegExp(pattern);
      return regex.test(layerName);
    });
  }

  /**
   * Compute expected memory reduction
   */
  private computeMemoryReduction(precisionMap: Map<string, QuantizationBits>): number {
    const totalLayers = precisionMap.size;
    if (totalLayers === 0) return 1;

    let totalReduction = 0;
    for (const bits of precisionMap.values()) {
      if (bits === 16) totalReduction += 32 / 16; // 2x
      else if (bits === 8) totalReduction += 32 / 8; // 4x
      else if (bits === 4) totalReduction += 32 / 4; // 8x
    }

    return totalReduction / totalLayers;
  }

  /**
   * Compute expected speedup
   */
  private computeSpeedup(precisionMap: Map<string, QuantizationBits>): number {
    const totalLayers = precisionMap.size;
    if (totalLayers === 0) return 1;

    let totalSpeedup = 0;
    for (const bits of precisionMap.values()) {
      if (bits === 16) totalSpeedup += 1.5; // FP16: 1.5x
      else if (bits === 8) totalSpeedup += 2.5; // INT8: 2.5x
      else if (bits === 4) totalSpeedup += 4.0; // INT4: 4x
    }

    return totalSpeedup / totalLayers;
  }

  /**
   * Generate summary report
   */
  public generateReport(result: OptimizationResult): string {
    const lines = [
      '=== Mixed Precision Optimization Report ===',
      '',
      `Total layers: ${result.precisionMap.size}`,
      `  - FP16: ${result.fp16Count} (${((result.fp16Count / result.precisionMap.size) * 100).toFixed(1)}%)`,
      `  - INT8: ${result.int8Count} (${((result.int8Count / result.precisionMap.size) * 100).toFixed(1)}%)`,
      `  - INT4: ${result.int4Count} (${((result.int4Count / result.precisionMap.size) * 100).toFixed(1)}%)`,
      '',
      `Expected improvements:`,
      `  - Memory reduction: ${result.memoryReduction.toFixed(2)}x`,
      `  - Inference speedup: ${result.speedup.toFixed(2)}x`,
      `  - Accuracy loss: ${result.accuracyLoss.toFixed(2)}%`,
      '',
    ];

    return lines.join('\n');
  }
}

/**
 * Convenience function for quick optimization
 */
export function optimizePrecision(
  sensitivities: LayerSensitivity[],
  accuracyThreshold: number = 0.95
): OptimizationResult {
  const optimizer = new PrecisionOptimizer({
    accuracyThreshold,
    maxAccuracyLoss: 2.0,
  });

  return optimizer.optimize(sensitivities);
}
