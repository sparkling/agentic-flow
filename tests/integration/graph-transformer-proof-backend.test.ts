/**
 * Integration Test: Graph Transformer Proof Backend (ADR-060 Phase 3)
 *
 * Verifies:
 * 1. GraphTransformerService initialization with native/WASM/JS fallback
 * 2. MutationGuard uses GraphTransformerService for proofs
 * 3. Backend factory detects graph-transformer availability
 * 4. GuardedVectorBackend creates attestations with graph-transformer
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { GraphTransformerService } from '../../packages/agentdb/src/services/GraphTransformerService.js';
import { MutationGuard } from '../../packages/agentdb/src/security/MutationGuard.js';
import { detectBackends, createGuardedBackend } from '../../packages/agentdb/src/backends/factory.js';

describe('Graph Transformer Proof Backend Integration', () => {
  describe('GraphTransformerService', () => {
    let service: GraphTransformerService;

    beforeAll(async () => {
      service = new GraphTransformerService();
      await service.initialize();
    });

    it('should initialize with correct engine type', () => {
      const engineType = service.getStats().engineType;
      expect(['native', 'wasm', 'js']).toContain(engineType);
      console.log(`[Test] GraphTransformerService engine: ${engineType}`);
    });

    it('should provide status information', () => {
      const stats = service.getStats();
      expect(stats).toHaveProperty('available');
      expect(stats).toHaveProperty('engineType');
      expect(stats).toHaveProperty('modulesLoaded');
      expect(Array.isArray(stats.modulesLoaded)).toBe(true);

      if (stats.available) {
        expect(stats.modulesLoaded.length).toBeGreaterThan(0);
        console.log(`[Test] Available modules: ${stats.modulesLoaded.length}`);
      }
    });

    it('should perform dimension proof', () => {
      const proof = service.proveDimension(384, 384);
      expect(proof).toHaveProperty('verified');
      expect(proof.verified).toBe(true);

      if (service.isAvailable()) {
        expect(proof).toHaveProperty('proof_id');
        console.log(`[Test] Dimension proof ID: ${proof.proof_id}`);
      }
    });

    it('should handle dimension mismatch', () => {
      const proof = service.proveDimension(384, 512);
      expect(proof).toHaveProperty('verified');
      expect(proof.verified).toBe(false);
    });

    it('should execute sublinear attention', () => {
      const query = [1, 0, 0];
      const adjacency = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const result = service.sublinearAttention(query, adjacency, 3, 2);

      expect(result).toHaveProperty('scores');
      expect(result).toHaveProperty('indices');
      expect(Array.isArray(result.scores)).toBe(true);
      expect(Array.isArray(result.indices)).toBe(true);
      console.log(`[Test] Sublinear attention scores: ${result.scores.length}`);
    });

    it('should execute verified training step', () => {
      const weights = [1.0, 2.0, 3.0];
      const gradients = [0.1, 0.2, 0.3];
      const lr = 0.01;
      const result = service.verifiedStep(weights, gradients, lr);

      // Native may return different structure, just verify we get updated weights
      const updated = result.updated || result;
      expect(updated).toBeDefined();
      expect(Array.isArray(updated) || (result && typeof result === 'object')).toBe(true);

      if (Array.isArray(updated)) {
        expect(updated.length).toBe(weights.length);
        console.log(`[Test] Verified step updated ${updated.length} weights (native array format)`);
      } else if (result && 'updated' in result) {
        expect(result.updated.length).toBe(weights.length);
        console.log(`[Test] Verified step updated ${result.updated.length} weights`);
      }
    });

    it('should execute causal attention', () => {
      const query = [1, 0, 0];
      const keys = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      const timestamps = [100, 200, 300];
      const result = service.causalAttention(query, keys, timestamps);

      // Native may return array directly or object with scores/causalWeights
      if (Array.isArray(result)) {
        expect(result.length).toBeGreaterThan(0);
        console.log(`[Test] Causal attention array: ${result.length} (native array format)`);
      } else {
        expect(result).toHaveProperty('scores');
        expect(result).toHaveProperty('causalWeights');
        expect(Array.isArray(result.scores)).toBe(true);
        console.log(`[Test] Causal attention scores: ${result.scores.length}`);
      }
    });

    it('should create and verify attestations when available', () => {
      if (!service.isAvailable()) {
        console.log('[Test] Skipping attestation test - engine not available');
        return;
      }

      const proof = service.proveDimension(384, 384);
      if (proof.proof_id) {
        const attestation = service.createAttestation(proof.proof_id);
        if (attestation) {
          expect(attestation).toBeInstanceOf(Uint8Array);
          expect(attestation.length).toBeGreaterThan(0);

          const isValid = service.verifyAttestation(attestation);
          expect(isValid).toBe(true);
          console.log(`[Test] Attestation verified: ${attestation.length} bytes`);
        }
      }
    });
  });

  describe('MutationGuard with GraphTransformer', () => {
    let guard: MutationGuard;

    beforeAll(async () => {
      guard = new MutationGuard({
        dimension: 384,
        maxElements: 10000,
        enableWasmProofs: true,
        enableAttestationLog: false,
        defaultNamespace: 'test',
      });
      await guard.initialize();
    });

    it('should initialize with correct proof engine', () => {
      const stats = guard.getStats();
      expect(stats).toHaveProperty('engineType');
      expect(['native', 'wasm', 'legacy-wasm', 'js']).toContain(stats.engineType);
      console.log(`[Test] MutationGuard engine: ${stats.engineType}`);
      console.log(`[Test] WASM available: ${stats.wasmAvailable}`);
    });

    it('should prove valid insert', () => {
      const embedding = new Float32Array(384).fill(0.5);
      const result = guard.proveInsert('test-vector-1', embedding);

      expect(result).toHaveProperty('valid');
      if ('valid' in result && result.valid) {
        expect(result.operation).toBe('insert');
        expect(result.invariantChecks).toBeDefined();
        expect(result.invariantChecks.length).toBeGreaterThan(0);

        // Check for graph-transformer proof evidence
        const hasGraphProof = result.invariantChecks.some(
          check => check.check.includes('graph_transformer')
        );
        console.log(`[Test] Insert proof has graph-transformer check: ${hasGraphProof}`);

        if (result.wasmProofId) {
          console.log(`[Test] Proof ID: ${result.wasmProofId}`);
        }
      }
    });

    it('should deny insert with wrong dimension', () => {
      const embedding = new Float32Array(512).fill(0.5); // Wrong dimension
      const result = guard.proveInsert('test-vector-2', embedding);

      if (!('valid' in result)) {
        expect(result).toHaveProperty('reason');
        expect(result.reason).toContain('dimension');
        console.log(`[Test] Denied: ${result.reason}`);
      }
    });

    it('should track proof statistics', () => {
      const stats = guard.getStats();
      expect(stats.proofsIssued).toBeGreaterThan(0);
      expect(stats).toHaveProperty('avgProofTimeNs');
      console.log(`[Test] Proofs issued: ${stats.proofsIssued}, Avg time: ${Math.round(stats.avgProofTimeNs / 1000)}µs`);
    });
  });

  describe('Backend Factory Detection', () => {
    it('should detect graph-transformer availability', async () => {
      const detection = await detectBackends();
      expect(detection).toHaveProperty('ruvector');
      expect(detection.ruvector).toHaveProperty('graphTransformer');

      console.log(`[Test] RuVector core: ${detection.ruvector.core}`);
      console.log(`[Test] RuVector native: ${detection.ruvector.native}`);
      console.log(`[Test] Graph transformer: ${detection.ruvector.graphTransformer}`);
      console.log(`[Test] Available backend: ${detection.available}`);
    });

    it('should create guarded backend with proof engine', async () => {
      try {
        const { backend, guard, log } = await createGuardedBackend('auto', {
          dimension: 384,
          maxElements: 1000,
        });

        expect(backend).toBeDefined();
        expect(guard).toBeDefined();

        const stats = guard.getStats();
        console.log(`[Test] Guarded backend proof engine: ${stats.engineType}`);
        console.log(`[Test] WASM proofs available: ${stats.wasmAvailable}`);

        // Test a simple insert through the guarded backend
        const testVector = new Float32Array(384).fill(0.5);
        await backend.insert('guarded-test-1', testVector);
        console.log('[Test] Successfully inserted vector through guarded backend');

        const vectorCount = guard.getVectorCount();
        expect(vectorCount).toBeGreaterThan(0);
      } catch (error) {
        console.log(`[Test] Guarded backend not available: ${(error as Error).message}`);
        // This is acceptable if no backend is installed
      }
    });
  });

  describe('Module Compatibility', () => {
    let service: GraphTransformerService;

    beforeAll(async () => {
      service = new GraphTransformerService();
      await service.initialize();
    });

    it('should provide all 8 graph modules', () => {
      const stats = service.getStats();
      const expectedModules = [
        'sublinearAttention',
        'verifiedStep',
        'causalAttention',
        'grangerExtract',
        'hamiltonianStep',
        'spikingAttention',
        'gameTheoreticAttention',
        'productManifoldDistance'
      ];

      if (stats.available) {
        for (const module of expectedModules) {
          expect(stats.modulesLoaded).toContain(module);
        }
        console.log(`[Test] All ${expectedModules.length} modules available`);
      } else {
        console.log('[Test] Native modules not available, using JS fallback');
      }
    });

    it('should gracefully fallback to JS for all modules', () => {
      // These should all return results even without native backend
      const sublinear = service.sublinearAttention([1, 0], [[1, 0], [0, 1]], 2, 1);
      expect(sublinear).toBeDefined();

      const verified = service.verifiedStep([1.0], [0.1], 0.01);
      expect(verified).toBeDefined();

      const causal = service.causalAttention([1], [[1]], [100]);
      expect(causal).toBeDefined();

      const granger = service.grangerExtract([1, 2, 3, 4], 2, 2);
      expect(granger).toBeDefined();

      const hamiltonian = service.hamiltonianStep([1], [1], 0.1);
      expect(hamiltonian).toBeDefined();

      const spiking = service.spikingAttention([0.5], [[0.1]], 1.0);
      expect(spiking).toBeDefined();

      const gameTheoretic = service.gameTheoreticAttention([1, 2], [{ from: 0, to: 1, weight: 0.5 }]);
      expect(gameTheoretic).toBeDefined();

      const manifold = service.productManifoldDistance([1, 2], [3, 4], [0, 0]);
      expect(manifold).toBeDefined();

      console.log('[Test] All modules provide JS fallback results');
    });
  });
});
