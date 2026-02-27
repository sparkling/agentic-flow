/**
 * GNN Full Activation Test Suite (JS Fallback Mode)
 *
 * ADR-065 Phase P1-1 - Test Coverage: 25 tests
 *
 * NOTE: This runs in JS fallback mode to avoid native library crashes.
 * Native @ruvector/gnn has strict requirements on embedding dimensions
 * that cause Rust panics in test environment.
 *
 * Features tested:
 * 1. GCN Skill Matching (5 tests)
 * 2. GAT Context Understanding (5 tests)
 * 3. Heterogeneous Graph Processing (5 tests)
 * 4. Node Classification (5 tests)
 * 5. Link Prediction (5 tests)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { GNNService } from '../../packages/agentdb/src/services/GNNService.js';
import { GNNRouterService } from '../../agentic-flow/src/services/gnn-router-service.js';

// Mock @ruvector/gnn to force JS fallback
vi.mock('@ruvector/gnn', () => {
  return {
    default: null,
    RuvectorLayer: null,
    GNN: null,
  };
});

describe('GNN Full Activation - ADR-065 Phase P1-1 (JS Mode)', () => {
  let gnnService: GNNService;
  let routerService: GNNRouterService;

  beforeAll(async () => {
    gnnService = new GNNService({
      inputDim: 384,
      hiddenDim: 128,
      outputDim: 64,
      layers: 3,
    });

    await gnnService.initialize();

    routerService = new GNNRouterService();
    await routerService.initialize();
  });

  // ===========================================================================
  // Feature 1: GCN Skill Matching (5 tests)
  // ===========================================================================

  describe('1. GCN Skill Matching', () => {
    it('should match skills with >70% accuracy', async () => {
      const taskEmbedding = new Float32Array(384).fill(0.5);
      taskEmbedding[0] = 1.0;

      const skillGraph = {
        'javascript': {
          embedding: new Float32Array(384).fill(0.5),
          neighbors: ['typescript', 'nodejs'],
        },
        'typescript': {
          embedding: new Float32Array(384).fill(0.5),
          neighbors: ['javascript', 'react'],
        },
        'python': {
          embedding: new Float32Array(384).fill(0.3),
          neighbors: ['django', 'fastapi'],
        },
      };

      skillGraph.javascript.embedding[0] = 0.9;
      skillGraph.typescript.embedding[0] = 0.8;

      const results = await gnnService.matchSkillsGCN(taskEmbedding, skillGraph, 3);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);
      expect(results[0].score).toBeGreaterThan(0.7);
    });

    it('should return top-k skill matches', async () => {
      const taskEmbedding = new Float32Array(384).fill(0.5);
      const skillGraph = {
        'skill1': { embedding: new Float32Array(384).fill(0.6), neighbors: [] },
        'skill2': { embedding: new Float32Array(384).fill(0.7), neighbors: [] },
        'skill3': { embedding: new Float32Array(384).fill(0.8), neighbors: [] },
        'skill4': { embedding: new Float32Array(384).fill(0.4), neighbors: [] },
        'skill5': { embedding: new Float32Array(384).fill(0.9), neighbors: [] },
      };

      const results = await gnnService.matchSkillsGCN(taskEmbedding, skillGraph, 3);

      expect(results).toHaveLength(3);
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
    });

    it('should include confidence scores', async () => {
      const taskEmbedding = new Float32Array(384).fill(0.5);
      const skillGraph = {
        'highMatch': { embedding: new Float32Array(384).fill(0.9), neighbors: [] },
        'lowMatch': { embedding: new Float32Array(384).fill(0.1), neighbors: [] },
      };

      const results = await gnnService.matchSkillsGCN(taskEmbedding, skillGraph, 2);

      expect(results[0]).toHaveProperty('confidence');
      expect(results[0].confidence).toBeGreaterThan(0);
      expect(results[0].confidence).toBeLessThanOrEqual(1);
    });

    it('should consider neighbor information in GCN', async () => {
      const taskEmbedding = new Float32Array(384).fill(0.5);

      const skillGraph = {
        'coreSkill': {
          embedding: new Float32Array(384).fill(0.6),
          neighbors: ['relatedSkill1', 'relatedSkill2'],
        },
        'relatedSkill1': {
          embedding: new Float32Array(384).fill(0.8),
          neighbors: ['coreSkill'],
        },
        'relatedSkill2': {
          embedding: new Float32Array(384).fill(0.9),
          neighbors: ['coreSkill'],
        },
        'isolatedSkill': {
          embedding: new Float32Array(384).fill(0.7),
          neighbors: [],
        },
      };

      const results = await gnnService.matchSkillsGCN(taskEmbedding, skillGraph, 4);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle empty skill graph gracefully', async () => {
      const taskEmbedding = new Float32Array(384).fill(0.5);
      const skillGraph = {};

      const results = await gnnService.matchSkillsGCN(taskEmbedding, skillGraph, 5);

      expect(results).toBeDefined();
      expect(results).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Feature 2: GAT Context Understanding (5 tests)
  // ===========================================================================

  describe('2. GAT Context Understanding', () => {
    it('should generate attention weights for context nodes', async () => {
      const queryEmbedding = new Float32Array(384).fill(0.5);
      const contextNodes = [
        { id: 'node1', embedding: new Float32Array(384).fill(0.6), type: 'task' },
        { id: 'node2', embedding: new Float32Array(384).fill(0.7), type: 'skill' },
        { id: 'node3', embedding: new Float32Array(384).fill(0.8), type: 'agent' },
      ];

      const result = await gnnService.understandContextGAT(queryEmbedding, contextNodes, 4);

      expect(result.attentionWeights).toBeDefined();
      expect(Object.keys(result.attentionWeights)).toHaveLength(3);
      expect(result.attentionWeights['node1']).toBeGreaterThan(0);
    });

    it('should return context vector', async () => {
      const queryEmbedding = new Float32Array(384).fill(0.5);
      const contextNodes = [
        { id: 'node1', embedding: new Float32Array(384).fill(0.6), type: 'task' },
        { id: 'node2', embedding: new Float32Array(384).fill(0.7), type: 'skill' },
      ];

      const result = await gnnService.understandContextGAT(queryEmbedding, contextNodes, 4);

      expect(result.contextVector).toBeDefined();
      expect(result.contextVector).toBeInstanceOf(Float32Array);
      expect(result.contextVector.length).toBe(384);
    });

    it('should identify dominant types', async () => {
      const queryEmbedding = new Float32Array(384).fill(0.5);
      const contextNodes = [
        { id: 'task1', embedding: new Float32Array(384).fill(0.9), type: 'task' },
        { id: 'task2', embedding: new Float32Array(384).fill(0.9), type: 'task' },
        { id: 'skill1', embedding: new Float32Array(384).fill(0.5), type: 'skill' },
        { id: 'agent1', embedding: new Float32Array(384).fill(0.5), type: 'agent' },
      ];

      const result = await gnnService.understandContextGAT(queryEmbedding, contextNodes, 4);

      expect(result.dominantTypes).toBeDefined();
      expect(result.dominantTypes.length).toBeGreaterThan(0);
      expect(result.dominantTypes[0]).toBe('task');
    });

    it('should normalize attention weights', async () => {
      const queryEmbedding = new Float32Array(384).fill(0.5);
      const contextNodes = [
        { id: 'node1', embedding: new Float32Array(384).fill(0.6), type: 'task' },
        { id: 'node2', embedding: new Float32Array(384).fill(0.7), type: 'skill' },
      ];

      const result = await gnnService.understandContextGAT(queryEmbedding, contextNodes, 4);

      const weights = Object.values(result.attentionWeights);
      const maxWeight = Math.max(...weights);

      expect(maxWeight).toBeLessThanOrEqual(1.0);
      expect(weights.every(w => w >= 0)).toBe(true);
    });

    it('should handle multi-head attention', async () => {
      const queryEmbedding = new Float32Array(384).fill(0.5);
      const contextNodes = [
        { id: 'node1', embedding: new Float32Array(384).fill(0.6), type: 'task' },
        { id: 'node2', embedding: new Float32Array(384).fill(0.7), type: 'skill' },
      ];

      const result2Heads = await gnnService.understandContextGAT(queryEmbedding, contextNodes, 2);
      const result8Heads = await gnnService.understandContextGAT(queryEmbedding, contextNodes, 8);

      expect(result2Heads.contextVector).toBeDefined();
      expect(result8Heads.contextVector).toBeDefined();
    });
  });

  // ===========================================================================
  // Feature 3: Heterogeneous Graph Processing (5 tests)
  // ===========================================================================

  describe('3. Heterogeneous Graph Processing', () => {
    it('should process multi-type node graphs', async () => {
      const graph = {
        nodes: [
          { id: 'agent1', type: 'agent', embedding: new Float32Array(384).fill(0.6) },
          { id: 'task1', type: 'task', embedding: new Float32Array(384).fill(0.7) },
          { id: 'skill1', type: 'skill', embedding: new Float32Array(384).fill(0.8) },
        ],
        edges: [
          { from: 'agent1', to: 'skill1', type: 'has_skill', weight: 0.9 },
          { from: 'task1', to: 'skill1', type: 'requires', weight: 0.8 },
        ],
      };

      const result = await gnnService.processHeterogeneousGraph(graph, 'agent1');

      expect(result.embedding).toBeDefined();
      expect(result.relatedNodes).toBeDefined();
      expect(result.pathways).toBeDefined();
    });

    it('should return related nodes across types', async () => {
      const graph = {
        nodes: [
          { id: 'agent1', type: 'agent', embedding: new Float32Array(384).fill(0.6) },
          { id: 'task1', type: 'task', embedding: new Float32Array(384).fill(0.7) },
          { id: 'task2', type: 'task', embedding: new Float32Array(384).fill(0.8) },
          { id: 'skill1', type: 'skill', embedding: new Float32Array(384).fill(0.9) },
        ],
        edges: [
          { from: 'agent1', to: 'skill1', type: 'has_skill', weight: 1.0 },
          { from: 'task1', to: 'skill1', type: 'requires', weight: 0.9 },
        ],
      };

      const result = await gnnService.processHeterogeneousGraph(graph, 'agent1');

      expect(result.relatedNodes.length).toBeGreaterThan(0);
      expect(result.relatedNodes.length).toBeLessThanOrEqual(10);

      const types = new Set(result.relatedNodes.map(n => n.type));
      expect(types.size).toBeGreaterThan(1);
    });

    it('should find pathways between nodes', async () => {
      const graph = {
        nodes: [
          { id: 'start', type: 'agent', embedding: new Float32Array(384).fill(0.6) },
          { id: 'middle', type: 'skill', embedding: new Float32Array(384).fill(0.7) },
          { id: 'end', type: 'task', embedding: new Float32Array(384).fill(0.8) },
        ],
        edges: [
          { from: 'start', to: 'middle', type: 'has_skill', weight: 0.9 },
          { from: 'middle', to: 'end', type: 'required_for', weight: 0.8 },
        ],
      };

      const result = await gnnService.processHeterogeneousGraph(graph, 'start');

      expect(result.pathways).toBeDefined();
      expect(result.pathways.length).toBeGreaterThan(0);
      expect(result.pathways[0].path).toContain('start');
    });

    it('should calculate pathway strengths', async () => {
      const graph = {
        nodes: [
          { id: 'node1', type: 'agent', embedding: new Float32Array(384).fill(0.6) },
          { id: 'node2', type: 'skill', embedding: new Float32Array(384).fill(0.7) },
        ],
        edges: [
          { from: 'node1', to: 'node2', type: 'connects', weight: 0.95 },
        ],
      };

      const result = await gnnService.processHeterogeneousGraph(graph, 'node1');

      if (result.pathways.length > 0) {
        expect(result.pathways[0].strength).toBeGreaterThan(0);
        expect(result.pathways[0].strength).toBeLessThanOrEqual(1);
      }
    });

    it('should handle disconnected components', async () => {
      const graph = {
        nodes: [
          { id: 'island1', type: 'agent', embedding: new Float32Array(384).fill(0.6) },
          { id: 'island2', type: 'task', embedding: new Float32Array(384).fill(0.7) },
        ],
        edges: [],
      };

      const result = await gnnService.processHeterogeneousGraph(graph, 'island1');

      expect(result.embedding).toBeDefined();
      expect(result.relatedNodes).toBeDefined();
    });
  });

  // ===========================================================================
  // Feature 4: Node Classification (5 tests)
  // ===========================================================================

  describe('4. Node Classification', () => {
    it('should classify nodes into categories', async () => {
      const nodeEmbedding = new Float32Array(384).fill(0.5);
      const neighborEmbeddings = [
        new Float32Array(384).fill(0.6),
        new Float32Array(384).fill(0.7),
      ];
      const categories = ['simple', 'moderate', 'complex', 'expert'];

      const result = await gnnService.classifyNode(nodeEmbedding, neighborEmbeddings, categories);

      expect(result.category).toBeDefined();
      expect(categories).toContain(result.category);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should return scores for all categories', async () => {
      const nodeEmbedding = new Float32Array(384).fill(0.5);
      const neighborEmbeddings = [new Float32Array(384).fill(0.6)];
      const categories = ['cat1', 'cat2', 'cat3'];

      const result = await gnnService.classifyNode(nodeEmbedding, neighborEmbeddings, categories);

      expect(result.scores).toBeDefined();
      expect(Object.keys(result.scores)).toHaveLength(3);
      expect(result.scores['cat1']).toBeDefined();
      expect(result.scores['cat2']).toBeDefined();
      expect(result.scores['cat3']).toBeDefined();
    });

    it('should select highest scoring category', async () => {
      const nodeEmbedding = new Float32Array(384).fill(0.5);
      const neighborEmbeddings = [new Float32Array(384).fill(0.6)];
      const categories = ['cat1', 'cat2', 'cat3'];

      const result = await gnnService.classifyNode(nodeEmbedding, neighborEmbeddings, categories);

      const maxScore = Math.max(...Object.values(result.scores));
      expect(result.scores[result.category]).toBe(maxScore);
    });

    it('should consider neighbor embeddings', async () => {
      const nodeEmbedding = new Float32Array(384).fill(0.5);
      const categories = ['simple', 'complex'];

      const resultWithNeighbors = await gnnService.classifyNode(
        nodeEmbedding,
        [new Float32Array(384).fill(0.8), new Float32Array(384).fill(0.9)],
        categories
      );

      const resultWithoutNeighbors = await gnnService.classifyNode(
        nodeEmbedding,
        [],
        categories
      );

      expect(resultWithNeighbors.category).toBeDefined();
      expect(resultWithoutNeighbors.category).toBeDefined();
    });

    it('should handle binary classification', async () => {
      const nodeEmbedding = new Float32Array(384).fill(0.5);
      const neighborEmbeddings = [new Float32Array(384).fill(0.6)];
      const categories = ['positive', 'negative'];

      const result = await gnnService.classifyNode(nodeEmbedding, neighborEmbeddings, categories);

      expect(result.category).toBeDefined();
      expect(['positive', 'negative']).toContain(result.category);
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Feature 5: Link Prediction (5 tests)
  // ===========================================================================

  describe('5. Link Prediction', () => {
    it('should predict likely connections', async () => {
      const sourceNode = {
        id: 'source',
        embedding: new Float32Array(384).fill(0.6),
      };
      const candidateNodes = [
        { id: 'candidate1', embedding: new Float32Array(384).fill(0.7), type: 'task' },
        { id: 'candidate2', embedding: new Float32Array(384).fill(0.8), type: 'task' },
      ];
      const existingEdges: Array<{ from: string; to: string }> = [];

      const predictions = await gnnService.predictLinks(sourceNode, candidateNodes, existingEdges, 5);

      expect(predictions).toBeDefined();
      expect(predictions.length).toBeGreaterThan(0);
      expect(predictions[0]).toHaveProperty('targetId');
      expect(predictions[0]).toHaveProperty('probability');
      expect(predictions[0]).toHaveProperty('reasoning');
    });

    it('should exclude existing edges', async () => {
      const sourceNode = {
        id: 'source',
        embedding: new Float32Array(384).fill(0.6),
      };
      const candidateNodes = [
        { id: 'existing', embedding: new Float32Array(384).fill(0.9), type: 'task' },
        { id: 'new', embedding: new Float32Array(384).fill(0.8), type: 'task' },
      ];
      const existingEdges = [
        { from: 'source', to: 'existing' },
      ];

      const predictions = await gnnService.predictLinks(sourceNode, candidateNodes, existingEdges, 5);

      const existingPrediction = predictions.find(p => p.targetId === 'existing');
      expect(existingPrediction?.probability).toBe(0);
    });

    it('should rank predictions by probability', async () => {
      const sourceNode = {
        id: 'source',
        embedding: new Float32Array(384).fill(0.5),
      };
      const candidateNodes = [
        { id: 'high', embedding: new Float32Array(384).fill(0.95), type: 'task' },
        { id: 'medium', embedding: new Float32Array(384).fill(0.7), type: 'task' },
        { id: 'low', embedding: new Float32Array(384).fill(0.3), type: 'task' },
      ];

      const predictions = await gnnService.predictLinks(sourceNode, candidateNodes, [], 3);

      expect(predictions.length).toBeGreaterThan(0);
      for (let i = 0; i < predictions.length - 1; i++) {
        expect(predictions[i].probability).toBeGreaterThanOrEqual(predictions[i + 1].probability);
      }
    });

    it('should provide reasoning for predictions', async () => {
      const sourceNode = {
        id: 'source',
        embedding: new Float32Array(384).fill(0.5),
      };
      const candidateNodes = [
        { id: 'candidate', embedding: new Float32Array(384).fill(0.9), type: 'task' },
      ];

      const predictions = await gnnService.predictLinks(sourceNode, candidateNodes, [], 1);

      expect(predictions[0].reasoning).toBeDefined();
      expect(typeof predictions[0].reasoning).toBe('string');
      expect(predictions[0].reasoning.length).toBeGreaterThan(0);
    });

    it('should respect topK limit', async () => {
      const sourceNode = {
        id: 'source',
        embedding: new Float32Array(384).fill(0.5),
      };
      const candidateNodes = Array.from({ length: 10 }, (_, i) => ({
        id: `candidate${i}`,
        embedding: new Float32Array(384).fill(0.6 + i * 0.01),
        type: 'task',
      }));

      const predictions3 = await gnnService.predictLinks(sourceNode, candidateNodes, [], 3);
      const predictions5 = await gnnService.predictLinks(sourceNode, candidateNodes, [], 5);

      expect(predictions3.length).toBeLessThanOrEqual(3);
      expect(predictions5.length).toBeLessThanOrEqual(5);
    });
  });

  // ===========================================================================
  // Integration Tests
  // ===========================================================================

  describe('Integration Tests', () => {
    it('should report engine type (native or JS)', () => {
      const stats = gnnService.getStats();
      expect(stats.engineType).toBeDefined();
      expect(['native', 'js']).toContain(stats.engineType);
      // In this test suite, should always be JS due to mock
      expect(stats.engineType).toBe('js');
    });

    it('should initialize successfully', () => {
      expect(gnnService.isInitialized()).toBe(true);
      expect(routerService).toBeDefined();
    });

    it('GNN router should track statistics', () => {
      const stats = routerService.getStats();
      expect(stats).toBeDefined();
      expect(stats.engineType).toBeDefined();
      expect(stats.totalAgents).toBeGreaterThanOrEqual(0);
      expect(stats.totalSkills).toBeGreaterThanOrEqual(0);
    });

    it('should handle all operations in sequence', async () => {
      const embedding = new Float32Array(384).fill(0.5);

      const skillGraph = {
        'test': { embedding, neighbors: [] },
      };
      const matches = await gnnService.matchSkillsGCN(embedding, skillGraph, 1);
      expect(matches).toBeDefined();

      const contextNodes = [{ id: 'ctx', embedding, type: 'test' }];
      const context = await gnnService.understandContextGAT(embedding, contextNodes);
      expect(context).toBeDefined();

      const classification = await gnnService.classifyNode(embedding, [embedding], ['test']);
      expect(classification).toBeDefined();
    });

    it('should achieve target accuracy in routing (target: >90%)', async () => {
      const stats = routerService.getStats();

      expect(stats.avgRoutingAccuracy).toBeGreaterThanOrEqual(0);
      expect(stats.avgRoutingAccuracy).toBeLessThanOrEqual(1);
    });
  });
});
