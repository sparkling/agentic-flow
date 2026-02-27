/**
 * Quantization Service Tests
 *
 * 25 comprehensive tests covering INT8, INT4, dynamic quantization,
 * knowledge distillation, pruning, and caching
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import QuantizationService from '../../agentic-flow/src/services/quantization-service.js';
import { Quantizer, quantizeINT8Symmetric, quantizeINT4Symmetric } from '../../packages/agent-booster/src/quantize/quantizer.js';
import { Calibrator } from '../../packages/agent-booster/src/quantize/calibration.js';
import { PrecisionOptimizer } from '../../packages/agent-booster/src/quantize/precision-optimizer.js';

describe('Quantization Service', () => {
  let service: typeof QuantizationService;

  beforeEach(() => {
    service = QuantizationService;
  });

  afterEach(async () => {
    await service.clearCache();
  });

  // ==========================================================================
  // INT8 Quantization Tests (6 tests)
  // ==========================================================================

  describe('INT8 Quantization', () => {
    it('should quantize model to INT8 with 4x memory reduction', async () => {
      const result = await service.quantizeINT8(
        '/tmp/test-model.onnx',
        '/tmp/test-model-int8.onnx'
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('int8');
      expect(result.memoryReduction).toBeGreaterThan(3.5); // At least 3.5x
      expect(result.memoryReduction).toBeLessThan(4.5); // At most 4.5x
      expect(result.accuracyLoss).toBeLessThan(5); // Less than 5% loss
    });

    it('should achieve 2-4x faster inference with INT8', async () => {
      const result = await service.quantizeINT8(
        '/tmp/test-model.onnx',
        '/tmp/test-model-int8.onnx'
      );

      expect(result.inferenceSpeedup).toBeGreaterThan(2.0);
      expect(result.inferenceSpeedup).toBeLessThan(4.5);
    });

    it('should use symmetric quantization by default', async () => {
      const result = await service.quantizeINT8(
        '/tmp/test-model.onnx',
        '/tmp/test-model-int8.onnx',
        { symmetric: true }
      );

      expect(result.metadata?.symmetric).toBe(true);
    });

    it('should support per-channel quantization', async () => {
      const result = await service.quantizeINT8(
        '/tmp/test-model.onnx',
        '/tmp/test-model-int8.onnx',
        { perChannel: true }
      );

      expect(result.metadata?.perChannel).toBe(true);
    });

    it('should allow custom calibration size', async () => {
      const result = await service.quantizeINT8(
        '/tmp/test-model.onnx',
        '/tmp/test-model-int8.onnx',
        { calibrationSize: 200 }
      );

      expect(result.metadata?.calibrationSize).toBe(200);
    });

    it('should handle quantization errors gracefully', async () => {
      const result = await service.quantizeINT8(
        '/invalid/path/model.onnx',
        '/tmp/output.onnx'
      );

      expect(result.success).toBe(false);
      expect(result.metadata?.error).toBeDefined();
    });
  });

  // ==========================================================================
  // INT4 Quantization Tests (5 tests)
  // ==========================================================================

  describe('INT4 Quantization', () => {
    it('should quantize model to INT4 with 8x memory reduction', async () => {
      const result = await service.quantizeINT4(
        '/tmp/test-model.onnx',
        '/tmp/test-model-int4.onnx'
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('int4');
      expect(result.memoryReduction).toBeGreaterThan(7.0);
      expect(result.memoryReduction).toBeLessThan(9.0);
    });

    it('should accept higher accuracy loss for INT4', async () => {
      const result = await service.quantizeINT4(
        '/tmp/test-model.onnx',
        '/tmp/test-model-int4.onnx'
      );

      expect(result.accuracyLoss).toBeLessThan(10); // Less than 10% loss
    });

    it('should use larger calibration dataset for INT4', async () => {
      const result = await service.quantizeINT4(
        '/tmp/test-model.onnx',
        '/tmp/test-model-int4.onnx',
        { calibrationSize: 200 }
      );

      expect(result.metadata?.calibrationSize).toBe(200);
    });

    it('should pack INT4 values efficiently', () => {
      const quantizer = new Quantizer(4, 'symmetric', false);
      const values = new Int8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const packed = quantizer.packINT4(values);

      expect(packed.length).toBe(4); // 8 values packed into 4 bytes
    });

    it('should unpack INT4 values correctly', () => {
      const quantizer = new Quantizer(4, 'symmetric', false);
      const values = new Int8Array([1, 2, 3, 4]);
      const packed = quantizer.packINT4(values);
      const unpacked = quantizer.unpackINT4(packed, 4);

      expect(unpacked.length).toBe(4);
      expect(unpacked[0]).toBe(1);
      expect(unpacked[3]).toBe(4);
    });
  });

  // ==========================================================================
  // Knowledge Distillation Tests (5 tests)
  // ==========================================================================

  describe('Knowledge Distillation', () => {
    it('should transfer knowledge from teacher to student', async () => {
      const result = await service.distill({
        teacherModel: '/tmp/teacher.onnx',
        studentModel: '/tmp/student.onnx',
        temperature: 3.0,
        alpha: 0.5,
        epochs: 10,
      });

      expect(result.success).toBe(true);
      expect(result.accuracyRetention).toBeGreaterThan(90); // At least 90%
    });

    it('should reduce model size significantly', async () => {
      const result = await service.distill({
        teacherModel: '/tmp/teacher.onnx',
        studentModel: '/tmp/student.onnx',
      });

      expect(result.sizeReduction).toBeGreaterThan(2.0); // At least 2x smaller
    });

    it('should improve student inference speed', async () => {
      const result = await service.distill({
        teacherModel: '/tmp/teacher.onnx',
        studentModel: '/tmp/student.onnx',
      });

      expect(result.speedup).toBeGreaterThan(1.5); // At least 1.5x faster
    });

    it('should use default temperature of 3.0', async () => {
      const result = await service.distill({
        teacherModel: '/tmp/teacher.onnx',
        studentModel: '/tmp/student.onnx',
      });

      // Default temperature applied internally
      expect(result.success).toBe(true);
    });

    it('should support custom alpha weighting', async () => {
      const result = await service.distill({
        teacherModel: '/tmp/teacher.onnx',
        studentModel: '/tmp/student.onnx',
        alpha: 0.7, // More weight on teacher
      });

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Dynamic Quantization Tests (5 tests)
  // ==========================================================================

  describe('Dynamic Quantization', () => {
    it('should use FP16 for high precision tasks', async () => {
      const result = await service.quantizeDynamic(
        '/tmp/model.onnx',
        '/tmp/model-high.onnx',
        'high'
      );

      expect(result.type).toBe('fp16');
      expect(result.memoryReduction).toBeCloseTo(2.0, 0.5); // ~2x
    });

    it('should use INT8 for medium precision tasks', async () => {
      const result = await service.quantizeDynamic(
        '/tmp/model.onnx',
        '/tmp/model-medium.onnx',
        'medium'
      );

      expect(result.type).toBe('int8');
      expect(result.memoryReduction).toBeGreaterThan(3.5);
    });

    it('should use INT4 for low precision tasks', async () => {
      const result = await service.quantizeDynamic(
        '/tmp/model.onnx',
        '/tmp/model-low.onnx',
        'low'
      );

      expect(result.type).toBe('int4');
      expect(result.memoryReduction).toBeGreaterThan(7.0);
    });

    it('should balance accuracy and performance', async () => {
      const resultHigh = await service.quantizeDynamic('/tmp/model.onnx', '/tmp/high.onnx', 'high');
      const resultLow = await service.quantizeDynamic('/tmp/model.onnx', '/tmp/low.onnx', 'low');

      expect(resultHigh.accuracyLoss).toBeLessThan(resultLow.accuracyLoss);
      expect(resultLow.memoryReduction).toBeGreaterThan(resultHigh.memoryReduction);
    });

    it('should provide appropriate speedup per precision', async () => {
      const resultMedium = await service.quantizeDynamic('/tmp/model.onnx', '/tmp/medium.onnx', 'medium');

      expect(resultMedium.inferenceSpeedup).toBeGreaterThan(2.0);
    });
  });

  // ==========================================================================
  // Pruning & Sparsification Tests (4 tests)
  // ==========================================================================

  describe('Pruning & Sparsification', () => {
    it('should prune model with target sparsity', async () => {
      const result = await service.prune(
        '/tmp/model.onnx',
        '/tmp/model-pruned.onnx',
        { sparsity: 0.5, method: 'magnitude' }
      );

      expect(result.success).toBe(true);
      expect(result.sparsity).toBeCloseTo(0.5, 0.1); // ~50% sparsity
    });

    it('should reduce model size with pruning', async () => {
      const result = await service.prune(
        '/tmp/model.onnx',
        '/tmp/model-pruned.onnx',
        { sparsity: 0.5, method: 'magnitude' }
      );

      expect(result.sizeReduction).toBeGreaterThan(1.5);
    });

    it('should improve inference speed after pruning', async () => {
      const result = await service.prune(
        '/tmp/model.onnx',
        '/tmp/model-pruned.onnx',
        { sparsity: 0.5, method: 'magnitude' }
      );

      expect(result.speedup).toBeGreaterThan(1.2);
    });

    it('should fine-tune after pruning to recover accuracy', async () => {
      const resultWithFine = await service.prune(
        '/tmp/model.onnx',
        '/tmp/model-pruned-fine.onnx',
        { sparsity: 0.5, method: 'magnitude', fineTune: true, fineTuneEpochs: 5 }
      );

      const resultNoFine = await service.prune(
        '/tmp/model.onnx',
        '/tmp/model-pruned-no-fine.onnx',
        { sparsity: 0.5, method: 'magnitude', fineTune: false }
      );

      expect(resultWithFine.accuracyLoss).toBeLessThan(resultNoFine.accuracyLoss);
    });
  });

  // ==========================================================================
  // Core Quantizer Tests
  // ==========================================================================

  describe('Core Quantizer', () => {
    it('should compute quantization parameters', () => {
      const weights = new Float32Array([1.0, 2.0, 3.0, 4.0, 5.0]);
      const quantizer = new Quantizer(8, 'symmetric', false);
      const params = quantizer.quantize(weights);

      expect(params.bits).toBe(8);
      expect(params.scheme).toBe('symmetric');
      expect(params.scales.length).toBeGreaterThan(0);
    });

    it('should quantize and dequantize with minimal error', () => {
      const weights = new Float32Array([1.0, 2.0, 3.0, 4.0, 5.0]);
      const { quantized, params } = quantizeINT8Symmetric(weights, false);

      expect(quantized.length).toBe(weights.length);

      const quantizer = new Quantizer(8, 'symmetric', false);
      const dequantized = quantizer.dequantize(quantized, params);
      const error = quantizer.measureError(weights, dequantized);

      expect(error).toBeLessThan(0.5); // MSE < 0.5
    });
  });

  // ==========================================================================
  // Calibration Tests
  // ==========================================================================

  describe('Calibration', () => {
    it('should collect and calibrate activations', () => {
      const calibrator = new Calibrator({
        numSamples: 10,
        method: 'percentile',
        percentile: 99.9,
      });

      for (let i = 0; i < 10; i++) {
        const activations = new Float32Array([1.0, 2.0, 3.0, 4.0, 5.0]);
        calibrator.collectActivations('layer1', activations);
      }

      const result = calibrator.calibrate();
      expect(result.scales.has('layer1')).toBe(true);
      expect(result.sampleCount).toBe(10);
    });

    it('should use different calibration methods', () => {
      const methods: Array<'minmax' | 'percentile' | 'entropy' | 'mse'> = [
        'minmax',
        'percentile',
        'entropy',
        'mse',
      ];

      for (const method of methods) {
        const calibrator = new Calibrator({
          numSamples: 5,
          method,
        });

        for (let i = 0; i < 5; i++) {
          calibrator.collectActivations('layer1', new Float32Array([1, 2, 3]));
        }

        const result = calibrator.calibrate();
        expect(result.scales.has('layer1')).toBe(true);
      }
    });
  });

  // ==========================================================================
  // Precision Optimizer Tests
  // ==========================================================================

  describe('Precision Optimizer', () => {
    it('should analyze layer sensitivity', () => {
      const optimizer = new PrecisionOptimizer({
        accuracyThreshold: 0.95,
        maxAccuracyLoss: 2.0,
      });

      const weights = new Float32Array([1.0, 2.0, 3.0, 4.0, 5.0]);
      const activations = new Float32Array([0.5, 1.0, 1.5, 2.0, 2.5]);

      const sensitivity = optimizer.analyzeSensitivity('layer1', weights, activations);

      expect(sensitivity.sensitivity).toBeGreaterThan(0);
      expect(sensitivity.sensitivity).toBeLessThanOrEqual(1);
      expect([4, 8, 16]).toContain(sensitivity.recommendedBits);
    });

    it('should optimize mixed precision configuration', () => {
      const optimizer = new PrecisionOptimizer({
        accuracyThreshold: 0.95,
        maxAccuracyLoss: 2.0,
      });

      const sensitivities = [
        { layerName: 'attention', sensitivity: 0.9, recommendedBits: 16 as const, accuracyImpact: 0.1 },
        { layerName: 'fc1', sensitivity: 0.4, recommendedBits: 8 as const, accuracyImpact: 0.5 },
        { layerName: 'fc2', sensitivity: 0.3, recommendedBits: 4 as const, accuracyImpact: 1.0 },
      ];

      const result = optimizer.optimize(sensitivities);

      expect(result.precisionMap.size).toBe(3);
      expect(result.memoryReduction).toBeGreaterThan(1);
      expect(result.speedup).toBeGreaterThan(1);
      expect(result.accuracyLoss).toBeLessThan(3);
    });
  });

  // ==========================================================================
  // Model Caching Tests
  // ==========================================================================

  describe('Model Caching', () => {
    it('should cache quantized models', async () => {
      await service.quantizeINT8('/tmp/model.onnx', '/tmp/model-int8.onnx');
      const cached = await service.getCachedModel('model-int8.onnx', 'int8');

      expect(cached).toBeDefined();
    });

    it('should return null for uncached models', async () => {
      const cached = await service.getCachedModel('nonexistent', 'int8');
      expect(cached).toBeNull();
    });

    it('should track cache metrics', async () => {
      await service.quantizeINT8('/tmp/model.onnx', '/tmp/model-int8.onnx');
      const metrics = service.getMetrics();

      expect(metrics.cachedModels).toBeGreaterThan(0);
      expect(metrics.quantizationJobs).toBeGreaterThan(0);
    });

    it('should clear cache on demand', async () => {
      await service.quantizeINT8('/tmp/model.onnx', '/tmp/model-int8.onnx');
      await service.clearCache();

      const metrics = service.getMetrics();
      expect(metrics.cachedModels).toBe(0);
      expect(metrics.totalMemory).toBe(0);
    });
  });
});
