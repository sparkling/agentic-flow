/**
 * Calibration for Post-Training Quantization
 *
 * Collects activation statistics to determine optimal quantization ranges
 */

import { QuantizationStats } from './quantizer.js';

export interface CalibrationConfig {
  /** Number of calibration samples */
  numSamples: number;
  /** Calibration method */
  method: 'minmax' | 'percentile' | 'entropy' | 'mse';
  /** Percentile for percentile method (e.g., 99.9) */
  percentile?: number;
  /** Batch size for processing */
  batchSize?: number;
}

export interface CalibrationResult {
  /** Collected statistics per layer */
  layerStats: Map<string, QuantizationStats>;
  /** Optimal scale factors */
  scales: Map<string, number>;
  /** Optimal zero points */
  zeroPoints: Map<string, number>;
  /** Number of samples used */
  sampleCount: number;
}

export class Calibrator {
  private config: CalibrationConfig;
  private activationHistory: Map<string, Float32Array[]> = new Map();

  constructor(config: CalibrationConfig) {
    this.config = {
      batchSize: 32,
      ...config,
    };
  }

  /**
   * Collect activations from a forward pass
   */
  public collectActivations(layerName: string, activations: Float32Array): void {
    if (!this.activationHistory.has(layerName)) {
      this.activationHistory.set(layerName, []);
    }

    const history = this.activationHistory.get(layerName)!;
    if (history.length < this.config.numSamples) {
      history.push(activations.slice()); // Copy activations
    }
  }

  /**
   * Compute calibration statistics
   */
  public calibrate(): CalibrationResult {
    const result: CalibrationResult = {
      layerStats: new Map(),
      scales: new Map(),
      zeroPoints: new Map(),
      sampleCount: 0,
    };

    for (const [layerName, activations] of this.activationHistory.entries()) {
      const stats = this.computeLayerStats(activations);
      result.layerStats.set(layerName, stats);

      const { scale, zeroPoint } = this.computeQuantizationParams(stats, activations);
      result.scales.set(layerName, scale);
      result.zeroPoints.set(layerName, zeroPoint);

      result.sampleCount = Math.max(result.sampleCount, activations.length);
    }

    return result;
  }

  /**
   * Compute statistics for a layer
   */
  private computeLayerStats(activations: Float32Array[]): QuantizationStats {
    let min = Infinity;
    let max = -Infinity;
    let absMax = 0;
    let sum = 0;
    let count = 0;

    for (const act of activations) {
      for (let i = 0; i < act.length; i++) {
        const val = act[i];
        min = Math.min(min, val);
        max = Math.max(max, val);
        absMax = Math.max(absMax, Math.abs(val));
        sum += val;
        count++;
      }
    }

    const mean = sum / count;
    let variance = 0;
    for (const act of activations) {
      for (let i = 0; i < act.length; i++) {
        variance += Math.pow(act[i] - mean, 2);
      }
    }
    const std = Math.sqrt(variance / count);

    return { min, max, absMax, mean, std };
  }

  /**
   * Compute quantization parameters based on calibration method
   */
  private computeQuantizationParams(
    stats: QuantizationStats,
    activations: Float32Array[]
  ): { scale: number; zeroPoint: number } {
    switch (this.config.method) {
      case 'minmax':
        return this.minMaxMethod(stats);
      case 'percentile':
        return this.percentileMethod(activations, this.config.percentile || 99.9);
      case 'entropy':
        return this.entropyMethod(activations);
      case 'mse':
        return this.mseMethod(activations);
      default:
        return this.minMaxMethod(stats);
    }
  }

  /**
   * Min-Max calibration (simplest, most conservative)
   */
  private minMaxMethod(stats: QuantizationStats): { scale: number; zeroPoint: number } {
    const qMax = 127; // INT8
    const scale = stats.absMax / qMax;
    return { scale, zeroPoint: 0 };
  }

  /**
   * Percentile calibration (handles outliers)
   */
  private percentileMethod(
    activations: Float32Array[],
    percentile: number
  ): { scale: number; zeroPoint: number } {
    // Collect all values
    const allValues: number[] = [];
    for (const act of activations) {
      allValues.push(...Array.from(act));
    }

    // Sort and find percentile
    allValues.sort((a, b) => Math.abs(a) - Math.abs(b));
    const idx = Math.floor((percentile / 100) * allValues.length);
    const absMax = Math.abs(allValues[idx]);

    const qMax = 127;
    const scale = absMax / qMax;
    return { scale, zeroPoint: 0 };
  }

  /**
   * Entropy calibration (minimize information loss)
   */
  private entropyMethod(activations: Float32Array[]): { scale: number; zeroPoint: number } {
    // Collect all values
    const allValues: number[] = [];
    for (const act of activations) {
      allValues.push(...Array.from(act));
    }

    // Try different scales and pick the one with minimum KL divergence
    let bestScale = 1.0;
    let minDivergence = Infinity;

    const candidateScales = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    for (const scale of candidateScales) {
      const divergence = this.computeKLDivergence(allValues, scale);
      if (divergence < minDivergence) {
        minDivergence = divergence;
        bestScale = scale;
      }
    }

    return { scale: bestScale, zeroPoint: 0 };
  }

  /**
   * MSE calibration (minimize reconstruction error)
   */
  private mseMethod(activations: Float32Array[]): { scale: number; zeroPoint: number } {
    // Collect all values
    const allValues: number[] = [];
    for (const act of activations) {
      allValues.push(...Array.from(act));
    }

    // Try different scales and pick the one with minimum MSE
    let bestScale = 1.0;
    let minMSE = Infinity;

    const candidateScales = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    for (const scale of candidateScales) {
      const mse = this.computeMSE(allValues, scale);
      if (mse < minMSE) {
        minMSE = mse;
        bestScale = scale;
      }
    }

    return { scale: bestScale, zeroPoint: 0 };
  }

  /**
   * Compute KL divergence between original and quantized distributions
   */
  private computeKLDivergence(values: number[], scale: number): number {
    const qMax = 127;
    const bins = 256;
    const histOrig = new Array(bins).fill(0);
    const histQuant = new Array(bins).fill(0);

    // Build histograms
    for (const val of values) {
      const bin = Math.min(bins - 1, Math.floor((Math.abs(val) / scale) * bins));
      histOrig[bin]++;

      const quantized = Math.round(val / scale);
      const clipped = Math.max(-qMax, Math.min(qMax, quantized));
      const dequantized = clipped * scale;
      const quantBin = Math.min(bins - 1, Math.floor((Math.abs(dequantized) / scale) * bins));
      histQuant[quantBin]++;
    }

    // Normalize
    const total = values.length;
    for (let i = 0; i < bins; i++) {
      histOrig[i] /= total;
      histQuant[i] /= total;
    }

    // Compute KL divergence
    let divergence = 0;
    for (let i = 0; i < bins; i++) {
      if (histOrig[i] > 0 && histQuant[i] > 0) {
        divergence += histOrig[i] * Math.log(histOrig[i] / histQuant[i]);
      }
    }

    return divergence;
  }

  /**
   * Compute MSE between original and quantized values
   */
  private computeMSE(values: number[], scale: number): number {
    const qMax = 127;
    let mse = 0;

    for (const val of values) {
      const quantized = Math.round(val / scale);
      const clipped = Math.max(-qMax, Math.min(qMax, quantized));
      const dequantized = clipped * scale;
      mse += Math.pow(val - dequantized, 2);
    }

    return mse / values.length;
  }

  /**
   * Clear activation history
   */
  public reset(): void {
    this.activationHistory.clear();
  }

  /**
   * Get collected sample count
   */
  public getSampleCount(): number {
    let maxSamples = 0;
    for (const activations of this.activationHistory.values()) {
      maxSamples = Math.max(maxSamples, activations.length);
    }
    return maxSamples;
  }
}

/**
 * Convenience function for quick calibration
 */
export function calibrateModel(
  activations: Map<string, Float32Array[]>,
  method: CalibrationConfig['method'] = 'percentile'
): CalibrationResult {
  const calibrator = new Calibrator({
    numSamples: 100,
    method,
    percentile: 99.9,
  });

  for (const [layerName, acts] of activations.entries()) {
    for (const act of acts) {
      calibrator.collectActivations(layerName, act);
    }
  }

  return calibrator.calibrate();
}
