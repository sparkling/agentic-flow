/**
 * Core Quantization Engine
 *
 * Implements INT8/INT4 symmetric and asymmetric quantization
 */

export type QuantizationBits = 4 | 8 | 16;
export type QuantizationScheme = 'symmetric' | 'asymmetric';

export interface QuantizationParams {
  /** Number of bits (4, 8, 16) */
  bits: QuantizationBits;
  /** Symmetric or asymmetric quantization */
  scheme: QuantizationScheme;
  /** Per-channel (true) or per-tensor (false) */
  perChannel: boolean;
  /** Scale factors */
  scales: Float32Array;
  /** Zero points (for asymmetric) */
  zeroPoints?: Int32Array;
}

export interface QuantizationStats {
  min: number;
  max: number;
  absMax: number;
  mean: number;
  std: number;
}

/**
 * Core Quantizer class
 */
export class Quantizer {
  private bits: QuantizationBits;
  private scheme: QuantizationScheme;
  private perChannel: boolean;

  constructor(bits: QuantizationBits, scheme: QuantizationScheme, perChannel: boolean = true) {
    this.bits = bits;
    this.scheme = scheme;
    this.perChannel = perChannel;
  }

  /**
   * Quantize FP32 weights to INT8/INT4
   */
  public quantize(weights: Float32Array, channelCount: number = 1): QuantizationParams {
    const params: QuantizationParams = {
      bits: this.bits,
      scheme: this.scheme,
      perChannel: this.perChannel,
      scales: new Float32Array(this.perChannel ? channelCount : 1),
      zeroPoints: this.scheme === 'asymmetric'
        ? new Int32Array(this.perChannel ? channelCount : 1)
        : undefined,
    };

    if (this.perChannel) {
      // Per-channel quantization
      const channelSize = Math.floor(weights.length / channelCount);
      for (let i = 0; i < channelCount; i++) {
        const channelWeights = weights.slice(i * channelSize, (i + 1) * channelSize);
        const stats = this.computeStats(channelWeights);
        params.scales[i] = this.computeScale(stats);
        if (params.zeroPoints) {
          params.zeroPoints[i] = this.computeZeroPoint(stats, params.scales[i]);
        }
      }
    } else {
      // Per-tensor quantization
      const stats = this.computeStats(weights);
      params.scales[0] = this.computeScale(stats);
      if (params.zeroPoints) {
        params.zeroPoints[0] = this.computeZeroPoint(stats, params.scales[0]);
      }
    }

    return params;
  }

  /**
   * Apply quantization to weights
   */
  public applyQuantization(
    weights: Float32Array,
    params: QuantizationParams
  ): Int8Array | Uint8Array {
    const quantized = this.bits === 8
      ? new Int8Array(weights.length)
      : new Uint8Array(Math.ceil(weights.length / 2)); // INT4 packed

    if (this.perChannel) {
      const channelCount = params.scales.length;
      const channelSize = Math.floor(weights.length / channelCount);

      for (let i = 0; i < channelCount; i++) {
        const scale = params.scales[i];
        const zeroPoint = params.zeroPoints?.[i] || 0;

        for (let j = 0; j < channelSize; j++) {
          const idx = i * channelSize + j;
          quantized[idx] = this.quantizeValue(weights[idx], scale, zeroPoint);
        }
      }
    } else {
      const scale = params.scales[0];
      const zeroPoint = params.zeroPoints?.[0] || 0;

      for (let i = 0; i < weights.length; i++) {
        quantized[i] = this.quantizeValue(weights[i], scale, zeroPoint);
      }
    }

    return quantized;
  }

  /**
   * Dequantize INT8/INT4 back to FP32
   */
  public dequantize(
    quantized: Int8Array | Uint8Array,
    params: QuantizationParams
  ): Float32Array {
    const weights = new Float32Array(quantized.length);

    if (this.perChannel) {
      const channelCount = params.scales.length;
      const channelSize = Math.floor(quantized.length / channelCount);

      for (let i = 0; i < channelCount; i++) {
        const scale = params.scales[i];
        const zeroPoint = params.zeroPoints?.[i] || 0;

        for (let j = 0; j < channelSize; j++) {
          const idx = i * channelSize + j;
          weights[idx] = this.dequantizeValue(quantized[idx], scale, zeroPoint);
        }
      }
    } else {
      const scale = params.scales[0];
      const zeroPoint = params.zeroPoints?.[0] || 0;

      for (let i = 0; i < quantized.length; i++) {
        weights[i] = this.dequantizeValue(quantized[i], scale, zeroPoint);
      }
    }

    return weights;
  }

  /**
   * Compute statistics for quantization
   */
  private computeStats(weights: Float32Array): QuantizationStats {
    let min = Infinity;
    let max = -Infinity;
    let absMax = 0;
    let sum = 0;

    for (let i = 0; i < weights.length; i++) {
      const val = weights[i];
      min = Math.min(min, val);
      max = Math.max(max, val);
      absMax = Math.max(absMax, Math.abs(val));
      sum += val;
    }

    const mean = sum / weights.length;
    let variance = 0;
    for (let i = 0; i < weights.length; i++) {
      variance += Math.pow(weights[i] - mean, 2);
    }
    const std = Math.sqrt(variance / weights.length);

    return { min, max, absMax, mean, std };
  }

  /**
   * Compute scale factor for quantization
   */
  private computeScale(stats: QuantizationStats): number {
    const qMax = Math.pow(2, this.bits - 1) - 1; // e.g., 127 for INT8

    if (this.scheme === 'symmetric') {
      // Symmetric: scale = absMax / qMax
      return stats.absMax / qMax;
    } else {
      // Asymmetric: scale = (max - min) / (2 * qMax)
      return (stats.max - stats.min) / (2 * qMax);
    }
  }

  /**
   * Compute zero point for asymmetric quantization
   */
  private computeZeroPoint(stats: QuantizationStats, scale: number): number {
    if (this.scheme === 'symmetric') {
      return 0;
    }

    const qMax = Math.pow(2, this.bits - 1) - 1;
    const zeroPoint = -Math.round(stats.min / scale);
    return Math.max(-qMax, Math.min(qMax, zeroPoint));
  }

  /**
   * Quantize a single value
   */
  private quantizeValue(value: number, scale: number, zeroPoint: number): number {
    const qMax = Math.pow(2, this.bits - 1) - 1;
    const qMin = -qMax - (this.scheme === 'asymmetric' ? 1 : 0);

    const quantized = Math.round(value / scale) + zeroPoint;
    return Math.max(qMin, Math.min(qMax, quantized));
  }

  /**
   * Dequantize a single value
   */
  private dequantizeValue(quantized: number, scale: number, zeroPoint: number): number {
    return (quantized - zeroPoint) * scale;
  }

  /**
   * Measure quantization error (MSE)
   */
  public measureError(original: Float32Array, quantized: Float32Array): number {
    let mse = 0;
    for (let i = 0; i < original.length; i++) {
      const diff = original[i] - quantized[i];
      mse += diff * diff;
    }
    return mse / original.length;
  }

  /**
   * Pack INT4 values (2 per byte)
   */
  public packINT4(values: Int8Array): Uint8Array {
    const packed = new Uint8Array(Math.ceil(values.length / 2));
    for (let i = 0; i < values.length; i += 2) {
      const v1 = values[i] & 0x0F;
      const v2 = (i + 1 < values.length) ? (values[i + 1] & 0x0F) : 0;
      packed[i / 2] = (v1 << 4) | v2;
    }
    return packed;
  }

  /**
   * Unpack INT4 values
   */
  public unpackINT4(packed: Uint8Array, length: number): Int8Array {
    const values = new Int8Array(length);
    for (let i = 0; i < length; i++) {
      const byteIdx = Math.floor(i / 2);
      const shift = (i % 2) * 4;
      values[i] = (packed[byteIdx] >> shift) & 0x0F;
    }
    return values;
  }
}

/**
 * Convenience functions
 */

export function quantizeINT8Symmetric(
  weights: Float32Array,
  perChannel: boolean = true
): { quantized: Int8Array; params: QuantizationParams } {
  const quantizer = new Quantizer(8, 'symmetric', perChannel);
  const params = quantizer.quantize(weights);
  const quantized = quantizer.applyQuantization(weights, params) as Int8Array;
  return { quantized, params };
}

export function quantizeINT4Symmetric(
  weights: Float32Array,
  perChannel: boolean = true
): { quantized: Uint8Array; params: QuantizationParams } {
  const quantizer = new Quantizer(4, 'symmetric', perChannel);
  const params = quantizer.quantize(weights);
  const quantized = quantizer.applyQuantization(weights, params) as Uint8Array;
  return { quantized, params };
}

export function dequantizeINT8(
  quantized: Int8Array,
  params: QuantizationParams
): Float32Array {
  const quantizer = new Quantizer(8, params.scheme, params.perChannel);
  return quantizer.dequantize(quantized, params);
}

export function dequantizeINT4(
  quantized: Uint8Array,
  params: QuantizationParams
): Float32Array {
  const quantizer = new Quantizer(4, params.scheme, params.perChannel);
  return quantizer.dequantize(quantized, params);
}
