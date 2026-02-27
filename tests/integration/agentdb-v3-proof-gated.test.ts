/**
 * AgentDB v3 — Proof-Gated Graph Intelligence Integration Tests
 *
 * ADR-060: Validates:
 * 1. MutationGuard with graph-transformer proof backend (native → wasm → js fallback)
 * 2. GraphTransformerService with all 8 modules
 * 3. GuardedVectorBackend integration
 * 4. Controller barrel exports (Issue 3)
 * 5. No empty default export (Issue 5)
 * 6. AgentDB core wiring with all controllers
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmbedding(dim: number, fill = 0.1): Float32Array {
  return new Float32Array(dim).fill(fill);
}

function createMockDb() {
  const rows: any[] = [];
  return {
    exec(_sql: string) { /* schema DDL */ },
    prepare(_sql: string) {
      return {
        run(..._params: any[]) { rows.push({ params: _params }); return { changes: 1 }; },
        all(..._params: any[]) { return []; },
        get(..._params: any[]) { return { total: 0, proved: 0, denied: 0, uniqueAgents: 0, oldestTs: 0 }; },
      };
    },
  };
}

// ===========================================================================
// 1. MutationGuard with graph-transformer proof backend
// ===========================================================================

describe('MutationGuard v3 — graph-transformer integration', () => {
  it('initializes with engineType field in stats', async () => {
    const { MutationGuard } = await import('../../packages/agentdb/src/security/MutationGuard.js');
    const guard = new MutationGuard({
      dimension: 384,
      maxElements: 10000,
      enableWasmProofs: true,
      enableAttestationLog: false,
      defaultNamespace: 'test',
    });
    await guard.initialize();
    const stats = guard.getStats();
    expect(stats).toHaveProperty('engineType');
    expect(['native', 'wasm', 'legacy-wasm', 'js']).toContain(stats.engineType);
  });

  it('proof-gates insert with graph-transformer or JS fallback', async () => {
    const { MutationGuard } = await import('../../packages/agentdb/src/security/MutationGuard.js');
    const guard = new MutationGuard({
      dimension: 384,
      maxElements: 10000,
      enableWasmProofs: true,
      enableAttestationLog: false,
      defaultNamespace: 'test',
    });
    await guard.initialize();

    // Valid insert
    const proof = guard.proveInsert('v3-test-id', createEmbedding(384));
    expect(MutationGuard.isDenial(proof)).toBe(false);
    expect((proof as any).valid).toBe(true);

    // Invalid dimension
    const denial = guard.proveInsert('v3-test-id', createEmbedding(128));
    expect(MutationGuard.isDenial(denial)).toBe(true);
  });

  it('gracefully falls back when no proof engine is available', async () => {
    const { MutationGuard } = await import('../../packages/agentdb/src/security/MutationGuard.js');
    const guard = new MutationGuard({
      dimension: 384,
      maxElements: 10000,
      enableWasmProofs: true,
      enableAttestationLog: false,
      defaultNamespace: 'test',
    });
    await guard.initialize();

    // Should still work — proofs are valid even in JS fallback
    const result = guard.proveInsert('fallback-id', createEmbedding(384));
    expect(MutationGuard.isDenial(result)).toBe(false);
  });
});

// ===========================================================================
// 2. GraphTransformerService — 8 modules
// ===========================================================================

describe('GraphTransformerService', () => {
  let service: any;

  beforeEach(async () => {
    const { GraphTransformerService } = await import(
      '../../packages/agentdb/src/services/GraphTransformerService.js'
    );
    service = new GraphTransformerService();
    await service.initialize();
  });

  it('reports stats with engineType', () => {
    const stats = service.getStats();
    expect(stats).toHaveProperty('available');
    expect(stats).toHaveProperty('engineType');
    expect(['native', 'wasm', 'js']).toContain(stats.engineType);
  });

  it('sublinearAttention returns scores and indices', () => {
    const query = [1, 0, 0, 0];
    const adjacency = [[1, 0, 0, 0], [0, 1, 0, 0], [0.5, 0.5, 0, 0]];
    const result = service.sublinearAttention(query, adjacency, 4, 2);
    expect(result.scores).toHaveLength(2);
    expect(result.indices).toHaveLength(2);
    expect(result.indices[0]).toBe(0); // most similar
  });

  it('verifiedStep performs SGD update', () => {
    const weights = [1.0, 2.0, 3.0];
    const gradients = [0.1, 0.2, 0.3];
    const result = service.verifiedStep(weights, gradients, 0.01);
    expect(result.updated).toHaveLength(3);
    expect(result.updated[0]).toBeCloseTo(1.0 - 0.01 * 0.1, 5);
  });

  it('causalAttention returns scores with temporal decay', () => {
    const query = [1, 0, 0];
    const keys = [[1, 0, 0], [0, 1, 0]];
    const timestamps = [100, 50];
    const result = service.causalAttention(query, keys, timestamps);
    expect(result.scores).toHaveLength(2);
    expect(result.causalWeights).toHaveLength(2);
    // First key is more similar, so should have higher score
    expect(result.scores[0]).toBeGreaterThan(result.scores[1]);
  });

  it('grangerExtract discovers edges', () => {
    const history = Array.from({ length: 30 }, (_, i) => Math.sin(i * 0.5));
    const result = service.grangerExtract(history, 3, 10);
    expect(result.edges).toBeDefined();
    expect(Array.isArray(result.edges)).toBe(true);
  });

  it('hamiltonianStep preserves approximate energy', () => {
    const positions = [1.0, 0.0];
    const momenta = [0.0, 1.0];
    const result = service.hamiltonianStep(positions, momenta, 0.01);
    expect(result.newPositions).toHaveLength(2);
    expect(result.newMomenta).toHaveLength(2);
    expect(result.energy).toBeGreaterThan(0);
    // Energy should be approximately conserved
    const initialEnergy = 0.5 * (0 + 1) + 0.5 * (1 + 0);
    expect(Math.abs(result.energy - initialEnergy)).toBeLessThan(0.1);
  });

  it('spikingAttention detects spikes', () => {
    const potentials = [0.9, 0.3, 0.8];
    const edges = [[0, 0.1, 0], [0, 0, 0.1], [0.1, 0, 0]];
    const result = service.spikingAttention(potentials, edges, 0.5);
    expect(result.spikes).toHaveLength(3);
    expect(result.activations).toHaveLength(3);
    expect(result.spikes[0]).toBe(true);  // 0.9 + edge inputs >= 0.5
    expect(result.spikes[1]).toBe(false); // 0.3 + edge inputs < 0.5
  });

  it('gameTheoreticAttention computes equilibrium', () => {
    const utilities = [1.0, 2.0, 3.0];
    const edges = [{ from: 0, to: 1, weight: 0.5 }];
    const result = service.gameTheoreticAttention(utilities, edges);
    expect(result.equilibrium).toHaveLength(3);
    expect(result.nashScore).toBeGreaterThanOrEqual(0);
    expect(result.nashScore).toBeLessThanOrEqual(1);
    // Probabilities should sum to ~1
    const sum = result.equilibrium.reduce((a: number, b: number) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 3);
  });

  it('productManifoldDistance computes distance', () => {
    const a = [1, 0, 0, 0, 1, 0];
    const b = [0, 1, 0, 0, 0, 1];
    const curvatures = [1.0, -1.0];
    const result = service.productManifoldDistance(a, b, curvatures);
    expect(result.distance).toBeGreaterThan(0);
    expect(result.components).toHaveLength(2);
  });

  it('proveDimension validates matching dimensions', () => {
    const result = service.proveDimension(384, 384);
    expect(result.verified).toBe(true);
  });

  it('proveDimension rejects mismatched dimensions', () => {
    const result = service.proveDimension(384, 128);
    expect(result.verified).toBe(false);
  });
});

// ===========================================================================
// 3. GuardedVectorBackend with proof-gated guard
// ===========================================================================

describe('GuardedVectorBackend v3 integration', () => {
  it('wraps inner backend with proof gate', async () => {
    const { MutationGuard } = await import('../../packages/agentdb/src/security/MutationGuard.js');
    const { GuardedVectorBackend, ProofDeniedError } = await import(
      '../../packages/agentdb/src/backends/ruvector/GuardedVectorBackend.js'
    );
    const { AttestationLog } = await import('../../packages/agentdb/src/security/AttestationLog.js');

    const guard = new MutationGuard({
      dimension: 384, maxElements: 10000,
      enableWasmProofs: true, enableAttestationLog: true,
      defaultNamespace: 'v3-test',
    });
    await guard.initialize();

    const mockInner = {
      name: 'ruvector' as const,
      insert: vi.fn(),
      insertBatch: vi.fn(),
      search: vi.fn().mockReturnValue([]),
      remove: vi.fn().mockReturnValue(true),
      getStats: vi.fn().mockReturnValue({ count: 0, dimension: 384, metric: 'cosine', backend: 'ruvector', memoryUsage: 0 }),
      save: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
    };

    const db = createMockDb();
    const log = new AttestationLog(db as any);
    const guarded = new GuardedVectorBackend(mockInner, guard, log);

    // Valid insert
    guarded.insert('valid-id', createEmbedding(384));
    expect(mockInner.insert).toHaveBeenCalledOnce();

    // Invalid dimension — should throw ProofDeniedError, NOT hit inner backend
    expect(() => guarded.insert('bad-id', createEmbedding(128))).toThrow(ProofDeniedError);
    expect(mockInner.insert).toHaveBeenCalledTimes(1); // still 1

    // Verify guard stats include engineType
    const stats = guard.getStats();
    expect(stats.proofsIssued).toBeGreaterThanOrEqual(1);
    expect(stats.denials).toBeGreaterThanOrEqual(1);
    expect(stats).toHaveProperty('engineType');
  });
});

// ===========================================================================
// 4. Controller barrel exports (Issue 3)
// ===========================================================================

describe('Controllers barrel export completeness (Issue 3)', () => {
  it('exports all 6 previously missing controllers', async () => {
    const controllers = await import('../../packages/agentdb/src/controllers/index.js');
    expect(controllers.CausalMemoryGraph).toBeDefined();
    expect(controllers.CausalRecall).toBeDefined();
    expect(controllers.ExplainableRecall).toBeDefined();
    expect(controllers.NightlyLearner).toBeDefined();
    expect(controllers.LearningSystem).toBeDefined();
    expect(controllers.ReasoningBank).toBeDefined();
  });

  it('exports types for added controllers', async () => {
    // Type exports can't be tested at runtime, but we can verify
    // the module loads without errors (compile-time check)
    const controllers = await import('../../packages/agentdb/src/controllers/index.js');
    expect(Object.keys(controllers).length).toBeGreaterThan(18);
  });

  it('exports security primitives', async () => {
    const controllers = await import('../../packages/agentdb/src/controllers/index.js');
    expect(controllers.MutationGuard).toBeDefined();
    expect(controllers.AttestationLog).toBeDefined();
    expect(controllers.GuardedVectorBackend).toBeDefined();
    expect(controllers.ProofDeniedError).toBeDefined();
  });
});

// ===========================================================================
// 5. No empty default export (Issue 5)
// ===========================================================================

describe('index.ts — no empty default export (Issue 5)', () => {
  it('exports AgentDB as named export', async () => {
    const mod = await import('../../packages/agentdb/src/index.js');
    expect(mod.AgentDB).toBeDefined();
    expect(typeof mod.AgentDB).toBe('function');
  });

  it('does not have a default export', async () => {
    const mod = await import('../../packages/agentdb/src/index.js');
    expect(mod.default).toBeUndefined();
  });
});

// ===========================================================================
// 6. Factory — createGuardedBackend
// ===========================================================================

describe('createGuardedBackend factory', () => {
  it('exports createGuardedBackend function', async () => {
    const factory = await import('../../packages/agentdb/src/backends/factory.js');
    expect(typeof factory.createGuardedBackend).toBe('function');
  });

  it('detectBackends includes graphTransformer field', async () => {
    const factory = await import('../../packages/agentdb/src/backends/factory.js');
    const detection = await factory.detectBackends();
    expect(detection.ruvector).toHaveProperty('graphTransformer');
    expect(typeof detection.ruvector.graphTransformer).toBe('boolean');
  });
});

// ===========================================================================
// 7. Package version
// ===========================================================================

describe('Package metadata', () => {
  it('version is 3.0.0-alpha.7', async () => {
    const pkg = await import('../../packages/agentdb/package.json', { with: { type: 'json' } });
    const data = pkg.default ?? pkg;
    expect(data.version).toBe('3.0.0-alpha.7');
  });

  it('has proof-gated keywords', async () => {
    const pkg = await import('../../packages/agentdb/package.json', { with: { type: 'json' } });
    const data = pkg.default ?? pkg;
    expect(data.keywords).toContain('proof-gated');
    expect(data.keywords).toContain('graph-transformer');
    expect(data.keywords).toContain('mutation-guard');
  });

  it('has @ruvector/graph-transformer in optionalDependencies', async () => {
    const pkg = await import('../../packages/agentdb/package.json', { with: { type: 'json' } });
    const data = pkg.default ?? pkg;
    expect(data.optionalDependencies['@ruvector/graph-transformer']).toBeDefined();
  });
});
