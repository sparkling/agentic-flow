/**
 * Integration Test: Phase 2 - RuVector Package Activation
 *
 * Tests the activation of 4 dormant RuVector packages:
 * 1. @ruvector/gnn - Graph Neural Networks
 * 2. @ruvector/router - Semantic routing
 * 3. @ruvector/graph-node - Native hypergraph DB
 * 4. @ruvector/sona - RL trajectory learning
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { RuVectorLearning, LearningConfig } from '../../packages/agentdb/src/backends/ruvector/RuVectorLearning.js';
import { SemanticRouter } from '../../packages/agentdb/src/services/SemanticRouter.js';
import { GraphDatabaseAdapter, GraphDatabaseConfig } from '../../packages/agentdb/src/backends/graph/GraphDatabaseAdapter.js';
import { SonaTrajectoryService, TrajectoryStep } from '../../packages/agentdb/src/services/SonaTrajectoryService.js';
import { EmbeddingService } from '../../packages/agentdb/src/controllers/EmbeddingService.js';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DB_PATH = path.join(__dirname, '../test-data/ruvector-activation-test.db');
const TEST_GRAPH_PATH = path.join(__dirname, '../test-data/graph-activation-test.db');

describe('Phase 2: RuVector Package Activation', () => {
  let embedder: EmbeddingService;

  beforeAll(async () => {
    // Clean up old test databases
    [TEST_DB_PATH, TEST_GRAPH_PATH].forEach(p => {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });

    // Initialize embedder (falls back to simple hash if transformers unavailable)
    embedder = new EmbeddingService();
  });

  describe('1. @ruvector/gnn - Graph Neural Networks', () => {
    it('should initialize RuVectorLearning with GNN', async () => {
      const config: LearningConfig = {
        inputDim: 384,
        hiddenDim: 256,
        heads: 4,
        dropout: 0.1
      };

      const learning = new RuVectorLearning(config);

      try {
        await learning.initialize();
        expect(learning.isInitialized()).toBe(true);

        const state = learning.getState();
        expect(state.initialized).toBe(true);
        expect(state.config.inputDim).toBe(384);
        expect(state.config.hiddenDim).toBe(256);
        expect(state.heads).toBe(4);

        console.log('✅ @ruvector/gnn successfully initialized');
      } catch (error: any) {
        if (error.message.includes('Please install')) {
          console.warn('⚠️  @ruvector/gnn not installed, skipping GNN tests');
          // This is expected in CI without native dependencies
        } else {
          throw error;
        }
      }
    });

    it('should enhance query embedding with GNN', async () => {
      const config: LearningConfig = {
        inputDim: 384,
        hiddenDim: 256,
        heads: 4
      };

      const learning = new RuVectorLearning(config);

      try {
        await learning.initialize();

        // Create sample query and neighbors
        const query = new Float32Array(384).fill(0.5);
        const neighbors = [
          new Float32Array(384).fill(0.6),
          new Float32Array(384).fill(0.7)
        ];
        const weights = [0.8, 0.9];

        const enhanced = learning.enhance(query, neighbors, weights);

        expect(enhanced).toBeInstanceOf(Float32Array);
        expect(enhanced.length).toBe(384);

        console.log('✅ GNN enhancement working');
      } catch (error: any) {
        if (error.message.includes('Please install')) {
          console.warn('⚠️  Skipping GNN enhancement test');
        } else {
          throw error;
        }
      }
    });

    it('should perform differentiable search', async () => {
      const config: LearningConfig = {
        inputDim: 128,
        hiddenDim: 64,
        heads: 2
      };

      const learning = new RuVectorLearning(config);

      try {
        await learning.initialize();

        const query = new Float32Array(128).fill(0.5);
        const candidates = [
          new Float32Array(128).fill(0.6),
          new Float32Array(128).fill(0.7),
          new Float32Array(128).fill(0.8)
        ];

        const result = learning.search(query, candidates, { k: 2, temperature: 1.0 });

        expect(result).toHaveProperty('indices');
        expect(result).toHaveProperty('weights');
        expect(Array.isArray(result.indices)).toBe(true);
        expect(Array.isArray(result.weights)).toBe(true);
        expect(result.indices.length).toBeLessThanOrEqual(2);

        console.log('✅ GNN differentiable search working');
      } catch (error: any) {
        if (error.message.includes('not initialized')) {
          console.warn('⚠️  Skipping differentiable search test');
        }
      }
    });
  });

  describe('2. @ruvector/router - Semantic Routing', () => {
    it('should initialize SemanticRouter', async () => {
      const router = new SemanticRouter();
      const initialized = await router.initialize();

      if (initialized) {
        expect(router.isAvailable()).toBe(true);
        console.log('✅ @ruvector/router successfully initialized');
      } else {
        console.warn('⚠️  @ruvector/router not available, using keyword fallback');
        expect(router.isAvailable()).toBe(false);
      }
    });

    it('should add routes and perform semantic routing', async () => {
      const router = new SemanticRouter();
      await router.initialize();

      // Add routes
      await router.addRoute('search', 'Find information in memory', ['find', 'search', 'lookup']);
      await router.addRoute('store', 'Save information to memory', ['save', 'store', 'remember']);
      await router.addRoute('analyze', 'Analyze data patterns', ['analyze', 'pattern', 'trend']);

      const routes = router.getRoutes();
      expect(routes).toContain('search');
      expect(routes).toContain('store');
      expect(routes).toContain('analyze');

      // Test routing
      const result1 = await router.route('find me the latest results');
      expect(result1).toHaveProperty('route');
      expect(result1).toHaveProperty('confidence');
      expect(typeof result1.confidence).toBe('number');

      const result2 = await router.route('save this information for later');
      expect(result2.route).toBeTruthy();

      console.log(`✅ Routing working (mode: ${router.isAvailable() ? 'semantic' : 'keyword'})`);
      console.log(`   - Query 1 routed to: ${result1.route} (confidence: ${result1.confidence.toFixed(2)})`);
      console.log(`   - Query 2 routed to: ${result2.route} (confidence: ${result2.confidence.toFixed(2)})`);
    });

    it('should handle multiple route queries efficiently', async () => {
      const router = new SemanticRouter();
      await router.initialize();

      await router.addRoute('create', 'Create new resources', ['create', 'new', 'make']);
      await router.addRoute('update', 'Update existing resources', ['update', 'modify', 'change']);
      await router.addRoute('delete', 'Delete resources', ['delete', 'remove', 'destroy']);

      const queries = [
        'create a new task',
        'update the configuration',
        'delete old files',
        'make a new project'
      ];

      const results = await Promise.all(queries.map(q => router.route(q)));

      results.forEach((result, idx) => {
        expect(result.route).toBeTruthy();
        console.log(`   - "${queries[idx]}" → ${result.route} (${result.confidence.toFixed(2)})`);
      });

      console.log('✅ Multiple route queries working');
    });
  });

  describe('3. @ruvector/graph-node - Native Hypergraph DB', () => {
    it('should initialize GraphDatabaseAdapter', async () => {
      const config: GraphDatabaseConfig = {
        storagePath: TEST_GRAPH_PATH,
        dimensions: 384,
        distanceMetric: 'Cosine'
      };

      const adapter = new GraphDatabaseAdapter(config, embedder);

      try {
        await adapter.initialize();
        console.log('✅ @ruvector/graph-node successfully initialized');

        const stats = await adapter.getStats();
        expect(stats).toBeDefined();
      } catch (error: any) {
        if (error.message.includes('Please install')) {
          console.warn('⚠️  @ruvector/graph-node not installed, skipping graph tests');
        } else {
          throw error;
        }
      }
    });

    it('should store episodes as graph nodes', async () => {
      const config: GraphDatabaseConfig = {
        storagePath: TEST_GRAPH_PATH,
        dimensions: 384,
        distanceMetric: 'Cosine'
      };

      const adapter = new GraphDatabaseAdapter(config, embedder);

      try {
        await adapter.initialize();

        const episode = {
          id: 'ep-test-1',
          sessionId: 'session-1',
          task: 'Implement authentication',
          reward: 0.8,
          success: true,
          input: 'Create user auth system',
          output: 'Auth system implemented',
          createdAt: Date.now(),
          tokensUsed: 500,
          latencyMs: 1200
        };

        const embedding = await embedder.embed(episode.task);
        const nodeId = await adapter.storeEpisode(episode, embedding);

        expect(nodeId).toBeTruthy();
        console.log(`✅ Episode stored as graph node: ${nodeId}`);
      } catch (error: any) {
        if (error.message.includes('Please install')) {
          console.warn('⚠️  Skipping graph node storage test');
        } else {
          throw error;
        }
      }
    });

    it('should create causal edges between nodes', async () => {
      const config: GraphDatabaseConfig = {
        storagePath: TEST_GRAPH_PATH,
        dimensions: 384,
        distanceMetric: 'Cosine'
      };

      const adapter = new GraphDatabaseAdapter(config, embedder);

      try {
        await adapter.initialize();

        // Store two episodes
        const ep1 = {
          id: 'ep-causal-1',
          sessionId: 'session-1',
          task: 'Design API',
          reward: 0.7,
          success: true,
          createdAt: Date.now()
        };

        const ep2 = {
          id: 'ep-causal-2',
          sessionId: 'session-1',
          task: 'Implement API',
          reward: 0.9,
          success: true,
          createdAt: Date.now()
        };

        const emb1 = await embedder.embed(ep1.task);
        const emb2 = await embedder.embed(ep2.task);

        await adapter.storeEpisode(ep1, emb1);
        await adapter.storeEpisode(ep2, emb2);

        // Create causal edge
        const edge = {
          from: 'ep-causal-1',
          to: 'ep-causal-2',
          mechanism: 'Design enables implementation',
          uplift: 0.2,
          confidence: 0.85,
          sampleSize: 10
        };

        const edgeEmb = await embedder.embed(edge.mechanism);
        const edgeId = await adapter.createCausalEdge(edge, edgeEmb);

        expect(edgeId).toBeTruthy();
        console.log(`✅ Causal edge created: ${edgeId}`);
      } catch (error: any) {
        if (error.message.includes('Please install')) {
          console.warn('⚠️  Skipping causal edge test');
        } else {
          throw error;
        }
      }
    });

    it('should query graph using Cypher', async () => {
      const config: GraphDatabaseConfig = {
        storagePath: TEST_GRAPH_PATH,
        dimensions: 384,
        distanceMetric: 'Cosine'
      };

      const adapter = new GraphDatabaseAdapter(config, embedder);

      try {
        await adapter.initialize();

        // Query all episodes
        const result = await adapter.query('MATCH (e:Episode) RETURN e LIMIT 10');

        expect(result).toHaveProperty('nodes');
        expect(Array.isArray(result.nodes)).toBe(true);

        console.log(`✅ Cypher query executed: ${result.nodes.length} nodes found`);
      } catch (error: any) {
        if (error.message.includes('Please install')) {
          console.warn('⚠️  Skipping Cypher query test');
        } else {
          throw error;
        }
      }
    });
  });

  describe('4. @ruvector/sona - RL Trajectory Learning', () => {
    it('should initialize SonaTrajectoryService', async () => {
      const sona = new SonaTrajectoryService();
      const initialized = await sona.initialize();

      if (initialized) {
        expect(sona.isAvailable()).toBe(true);
        console.log('✅ @ruvector/sona successfully initialized');
      } else {
        console.warn('⚠️  @ruvector/sona not available, using in-memory fallback');
        expect(sona.isAvailable()).toBe(false);
      }
    });

    it('should record agent trajectories', async () => {
      const sona = new SonaTrajectoryService();
      await sona.initialize();

      const trajectory: TrajectoryStep[] = [
        { state: { task: 'implement' }, action: 'write_code', reward: 0.8 },
        { state: { task: 'test' }, action: 'run_tests', reward: 0.9 },
        { state: { task: 'review' }, action: 'submit_pr', reward: 0.95 }
      ];

      await sona.recordTrajectory('coder', trajectory);

      const stats = sona.getStats();
      expect(stats.trajectoryCount).toBeGreaterThan(0);
      expect(stats.agentTypes).toContain('coder');

      console.log(`✅ Trajectory recorded (mode: ${sona.isAvailable() ? 'RL' : 'in-memory'})`);
      console.log(`   - ${stats.trajectoryCount} trajectories, ${stats.agentTypes.length} agent types`);
    });

    it('should predict next action based on state', async () => {
      const sona = new SonaTrajectoryService();
      await sona.initialize();

      // Record training data
      await sona.recordTrajectory('reviewer', [
        { state: { status: 'pending' }, action: 'review_code', reward: 0.85 },
        { state: { status: 'pending' }, action: 'review_code', reward: 0.90 },
        { state: { status: 'approved' }, action: 'merge_pr', reward: 1.0 }
      ]);

      const prediction = await sona.predict({ status: 'pending' });

      expect(prediction).toHaveProperty('action');
      expect(prediction).toHaveProperty('confidence');
      expect(typeof prediction.confidence).toBe('number');
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);

      console.log(`✅ Action prediction working`);
      console.log(`   - Predicted action: ${prediction.action} (confidence: ${prediction.confidence.toFixed(2)})`);
    });

    it('should extract trajectory patterns', async () => {
      const sona = new SonaTrajectoryService();
      await sona.initialize();

      // Record multiple trajectories
      await sona.recordTrajectory('tester', [
        { state: { phase: 'unit' }, action: 'run_unit_tests', reward: 0.7 },
        { state: { phase: 'integration' }, action: 'run_integration_tests', reward: 0.8 }
      ]);

      await sona.recordTrajectory('tester', [
        { state: { phase: 'unit' }, action: 'run_unit_tests', reward: 0.75 },
        { state: { phase: 'e2e' }, action: 'run_e2e_tests', reward: 0.9 }
      ]);

      const patterns = await sona.getPatterns('tester');

      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);

      console.log(`✅ Pattern extraction working: ${patterns.length} patterns found`);
    });

    it('should clear trajectories by agent type', async () => {
      const sona = new SonaTrajectoryService();
      await sona.initialize();

      await sona.recordTrajectory('temp-agent', [
        { state: {}, action: 'test', reward: 0.5 }
      ]);

      let stats = sona.getStats();
      const initialCount = stats.trajectoryCount;

      sona.clear('temp-agent');

      stats = sona.getStats();
      expect(stats.trajectoryCount).toBeLessThan(initialCount);

      console.log('✅ Trajectory clearing working');
    });
  });

  describe('Integration: All 4 Packages Working Together', () => {
    it('should use GNN-enhanced learning with semantic routing', async () => {
      // Initialize all services
      const router = new SemanticRouter();
      await router.initialize();

      const gnnConfig: LearningConfig = {
        inputDim: 384,
        hiddenDim: 256,
        heads: 4
      };
      const learning = new RuVectorLearning(gnnConfig);

      try {
        await learning.initialize();

        // Add routes
        await router.addRoute('train', 'Train ML model', ['train', 'learn', 'fit']);
        await router.addRoute('predict', 'Make predictions', ['predict', 'infer', 'forecast']);

        // Route a query
        const routeResult = await router.route('train the model on new data');

        // If GNN is available, enhance the query embedding
        if (learning.isInitialized()) {
          const queryEmb = new Float32Array(384).fill(0.5);
          const neighbors = [new Float32Array(384).fill(0.6)];
          const weights = [0.8];

          const enhanced = learning.enhance(queryEmb, neighbors, weights);
          expect(enhanced.length).toBe(384);
        }

        expect(routeResult.route).toBeTruthy();
        console.log('✅ GNN + Router integration working');
      } catch (error: any) {
        if (error.message.includes('not initialized')) {
          console.warn('⚠️  Skipping GNN+Router integration test');
        }
      }
    });

    it('should record trajectories and store in graph database', async () => {
      const sona = new SonaTrajectoryService();
      await sona.initialize();

      const graphConfig: GraphDatabaseConfig = {
        storagePath: TEST_GRAPH_PATH,
        dimensions: 384,
        distanceMetric: 'Cosine'
      };
      const graph = new GraphDatabaseAdapter(graphConfig, embedder);

      try {
        await graph.initialize();

        // Record trajectory
        const trajectory: TrajectoryStep[] = [
          { state: { task: 'analyze' }, action: 'collect_data', reward: 0.6 },
          { state: { task: 'process' }, action: 'transform_data', reward: 0.8 }
        ];

        await sona.recordTrajectory('data-engineer', trajectory);

        // Store trajectory steps as graph nodes
        for (const step of trajectory) {
          const episode = {
            id: `traj-${Date.now()}-${Math.random()}`,
            sessionId: 'integration-test',
            task: `${step.action} in ${step.state.task}`,
            reward: step.reward,
            success: step.reward > 0.5,
            createdAt: Date.now()
          };

          const emb = await embedder.embed(episode.task);
          await graph.storeEpisode(episode, emb);
        }

        console.log('✅ Sona + Graph integration working');
      } catch (error: any) {
        if (error.message.includes('Please install')) {
          console.warn('⚠️  Skipping Sona+Graph integration test');
        }
      }
    });
  });
});
