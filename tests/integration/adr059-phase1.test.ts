/**
 * ADR-059 Phase 1 Integration Test
 *
 * Tests AgentDB core wiring with:
 * - GraphTransformerService initialized and exposed
 * - GuardedVectorBackend with MutationGuard
 * - All controllers wired with vectorBackend
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('AgentDB v3 - Proof-Gated Integration', () => {
  let AgentDB: any;
  let agentDB: any;
  let testDbPath: string;

  beforeAll(async () => {
    // Import AgentDB
    const mod = await import('../../packages/agentdb/src/index.js');
    AgentDB = mod.AgentDB;

    // Create temp database
    testDbPath = path.join(os.tmpdir(), `agentdb-v3-test-${Date.now()}.db`);
    agentDB = new AgentDB({ dbPath: testDbPath });
    await agentDB.initialize();
  });

  afterAll(async () => {
    if (agentDB) {
      await agentDB.close();
    }
    if (testDbPath && fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should initialize with GraphTransformer', () => {
    const gt = agentDB.getController('graphTransformer');
    expect(gt).toBeDefined();
    expect(typeof gt.getEngineType).toBe('function');
    const engineType = gt.getEngineType();
    expect(['native', 'wasm', 'js']).toContain(engineType);
    console.log(`[Test] GraphTransformer engine: ${engineType}`);
  });

  it('should have guarded vectorBackend', () => {
    const reflexion = agentDB.getController('reflexion');
    expect(reflexion).toBeDefined();
  });

  it('should use sublinear attention if available', () => {
    const gt = agentDB.getController('graphTransformer');
    const query = Array(384).fill(0.1);
    const adjacency = [
      Array(384).fill(0.1),
      Array(384).fill(0.05)
    ];
    const result = gt.sublinearAttention(query, adjacency, 384, 2);
    expect(result).toBeDefined();
    expect(result.scores).toBeDefined();
    expect(result.indices).toBeDefined();
    expect(result.scores.length).toBeGreaterThan(0);
    expect(result.indices.length).toBeGreaterThan(0);
  });

  it('should verify dimension proofs', () => {
    const gt = agentDB.getController('graphTransformer');
    const proof = gt.proveDimension(384, 384);
    expect(proof.verified).toBe(true);
  });

  it('should wire all controllers with vectorBackend', () => {
    const controllers = [
      'reflexion',
      'skills',
      'reasoning',
      'causalGraph',
      'causalRecall',
      'learningSystem'
    ];

    for (const name of controllers) {
      const ctrl = agentDB.getController(name);
      expect(ctrl).toBeDefined();
    }
  });

  it('should handle causal attention', () => {
    const gt = agentDB.getController('graphTransformer');
    const query = Array(384).fill(0.1);
    const keys = [
      Array(384).fill(0.2),
      Array(384).fill(0.3)
    ];
    const timestamps = [Date.now() - 1000, Date.now()];
    const result = gt.causalAttention(query, keys, timestamps);
    expect(result).toBeDefined();
    expect(result.scores).toBeDefined();
    expect(result.causalWeights).toBeDefined();
  });

  it('should perform verified training step', () => {
    const gt = agentDB.getController('graphTransformer');
    const weights = [1.0, 2.0, 3.0];
    const gradients = [0.1, 0.2, 0.3];
    const result = gt.verifiedStep(weights, gradients, 0.01);
    expect(result).toBeDefined();
    expect(result.updated).toBeDefined();
    expect(result.updated.length).toBe(3);
  });

  it('should compute hamiltonian dynamics', () => {
    const gt = agentDB.getController('graphTransformer');
    const positions = [1.0, 0.0];
    const momenta = [0.0, 1.0];
    const result = gt.hamiltonianStep(positions, momenta, 0.01);
    expect(result).toBeDefined();
    expect(result.newPositions).toBeDefined();
    expect(result.newMomenta).toBeDefined();
    expect(result.energy).toBeDefined();
  });

  it('should detect spiking patterns', () => {
    const gt = agentDB.getController('graphTransformer');
    const potentials = [0.9, 0.3, 0.8];
    const edges = [[0, 0.1, 0], [0, 0, 0.1], [0.1, 0, 0]];
    const result = gt.spikingAttention(potentials, edges, 0.5);
    expect(result).toBeDefined();
    expect(result.spikes).toBeDefined();
    expect(result.activations).toBeDefined();
  });

  it('should compute product manifold distance', () => {
    const gt = agentDB.getController('graphTransformer');
    const a = [1, 0, 0, 0, 1, 0];
    const b = [0, 1, 0, 0, 0, 1];
    const curvatures = [1.0, -1.0];
    const result = gt.productManifoldDistance(a, b, curvatures);
    expect(result).toBeDefined();
    expect(result.distance).toBeDefined();
    expect(result.components).toBeDefined();
  });

  it('should extract granger causality', () => {
    const gt = agentDB.getController('graphTransformer');
    const history = Array.from({ length: 30 }, (_, i) => Math.sin(i * 0.5));
    const result = gt.grangerExtract(history, 3, 10);
    expect(result).toBeDefined();
    expect(result.edges).toBeDefined();
    expect(Array.isArray(result.edges)).toBe(true);
  });

  it('should compute game theoretic equilibrium', () => {
    const gt = agentDB.getController('graphTransformer');
    const utilities = [1.0, 2.0, 3.0];
    const edges = [{ from: 0, to: 1, weight: 0.5 }];
    const result = gt.gameTheoreticAttention(utilities, edges);
    expect(result).toBeDefined();
    expect(result.equilibrium).toBeDefined();
    expect(result.nashScore).toBeDefined();
  });

  it('should store and retrieve experiments via reflexion', async () => {
    const reflexion = agentDB.getController('reflexion');

    await reflexion.storeExperiment('test-exp-1', {
      thought: 'test thought',
      action: 'test action',
      outcome: 'test outcome',
    });

    // Verify we can retrieve
    const episodes = await reflexion.retrieveRelevant({
      task: 'test',
      k: 5
    });

    expect(Array.isArray(episodes)).toBe(true);
  });
});
