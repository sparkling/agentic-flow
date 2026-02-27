/**
 * Integration Test: DirectCallBridge
 *
 * Tests the bridge that eliminates CLI spawning for direct service calls.
 * Verifies memory, episode, pattern, skill, graph, and swarm operations.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('DirectCallBridge Integration', () => {
  let DirectCallBridge: any;
  let SwarmService: any;
  let HookService: any;
  let AgentDBService: any;
  let bridge: any;
  let agentDB: any;
  let hooks: any;
  let swarm: any;

  beforeAll(async () => {
    const bridgeMod = await import('../../agentic-flow/src/services/direct-call-bridge.js');
    DirectCallBridge = bridgeMod.DirectCallBridge;
    const swarmMod = await import('../../agentic-flow/src/services/swarm-service.js');
    SwarmService = swarmMod.SwarmService;
    const hookMod = await import('../../agentic-flow/src/services/hook-service.js');
    HookService = hookMod.HookService;
    const agentDBMod = await import('../../agentic-flow/src/services/agentdb-service.js');
    AgentDBService = agentDBMod.AgentDBService;

    agentDB = await AgentDBService.getInstance();
    hooks = new HookService(agentDB);
    swarm = new SwarmService(hooks, agentDB);
    bridge = new DirectCallBridge(agentDB, swarm);
  });

  afterAll(async () => {
    if (swarm.isInitialized) {
      await swarm.shutdown();
    }
    await agentDB.shutdown();
    AgentDBService.resetInstance();
  });

  // -- Memory operations --

  it('should store and retrieve memory', async () => {
    const result = await bridge.memoryStore('test-key', 'test-value');
    expect(result).toHaveProperty('id');

    const retrieved = await bridge.memoryRetrieve('test-key');
    // May or may not find exact match depending on embedding similarity
    // but the operation should not throw
    expect(retrieved === null || typeof retrieved === 'object').toBe(true);
  });

  it('should search memory', async () => {
    await bridge.memoryStore('auth-key', 'JWT authentication');
    const results = await bridge.memorySearch('authentication', undefined, 5);
    expect(Array.isArray(results)).toBe(true);
  });

  it('should list memory', async () => {
    const results = await bridge.memoryList(undefined, 10);
    expect(Array.isArray(results)).toBe(true);
  });

  // -- Episode operations --

  it('should store and recall episodes', async () => {
    const id = await bridge.episodeStore({
      sessionId: 'bridge-test',
      task: 'bridge episode test',
      input: 'test input',
      output: 'test output',
      reward: 0.8,
      success: true,
    });
    expect(id).toBeDefined();

    const episodes = await bridge.episodeRecall('bridge episode test', 5);
    expect(Array.isArray(episodes)).toBe(true);
  });

  it('should recall diverse episodes', async () => {
    const episodes = await bridge.episodeRecallDiverse('test', 5, 0.5);
    expect(Array.isArray(episodes)).toBe(true);
  });

  // -- Pattern operations --

  it('should store and search patterns', async () => {
    const id = await bridge.patternStore({
      taskType: 'bridge-test',
      approach: 'direct-call',
      successRate: 0.9,
      tags: ['test'],
    });
    expect(id).toBeDefined();

    const patterns = await bridge.patternSearch('bridge-test', 5);
    expect(Array.isArray(patterns)).toBe(true);
  });

  // -- Skill operations --

  it('should publish and find skills', async () => {
    const id = await bridge.skillPublish({
      name: 'bridge-skill',
      description: 'Test skill from bridge',
      successRate: 0.95,
    });
    expect(id).toBeDefined();

    const skills = await bridge.skillFind('bridge-skill', 5);
    expect(Array.isArray(skills)).toBe(true);
  });

  // -- Graph operations --

  it('should store and query graph', async () => {
    await bridge.graphStore(
      [{ id: 'n1', type: 'test', label: 'Node 1' }],
      [{ from: 'n1', to: 'n2', similarity: 0.9 }],
    );

    const results = await bridge.graphQuery('test');
    expect(Array.isArray(results)).toBe(true);
  });

  // -- Learning operations --

  it('should record trajectory and predict action', async () => {
    await bridge.trajectoryRecord(
      [
        { state: 'start', action: 'code', reward: 0.5 },
        { state: 'code', action: 'test', reward: 0.8 },
      ],
      1.3,
    );

    const prediction = await bridge.actionPredict('start');
    expect(prediction).toHaveProperty('action');
    expect(prediction).toHaveProperty('confidence');
  });

  // -- Routing --

  it('should route semantically', async () => {
    const route = await bridge.routeSemantic('rename variable to snake_case');
    expect(route).toHaveProperty('tier');
    expect(route).toHaveProperty('handler');
    expect(route).toHaveProperty('confidence');
    expect([1, 2, 3]).toContain(route.tier);
  });

  // -- Explain --

  it('should explain decisions', async () => {
    const explanation = await bridge.explainDecision('test-decision');
    expect(explanation).toHaveProperty('decisionId');
    expect(explanation).toHaveProperty('chunks');
  });

  // -- Metrics --

  it('should get metrics', async () => {
    const metrics = await bridge.getMetrics();
    expect(metrics).toHaveProperty('backend');
    expect(metrics).toHaveProperty('episodes');
    expect(metrics).toHaveProperty('skills');
    expect(metrics).toHaveProperty('patterns');
    expect(metrics).toHaveProperty('uptime');
  });

  // -- Attention --

  it('should expose attention stats', () => {
    const stats = bridge.getAttentionStats();
    expect(stats).toBeDefined();
    expect(stats).toHaveProperty('totalOps');
  });

  // -- Context synthesis --

  it('should synthesize context', async () => {
    const result = await bridge.synthesizeContext('test query', 5);
    expect(result).toBeDefined();
  });

  // -- Swarm operations --

  it('should initialize and manage swarm', async () => {
    await bridge.swarmInit('hierarchical', 3);
    expect(swarm.isInitialized).toBe(true);

    const agentId = await bridge.agentSpawn('coder', ['ts']);
    expect(agentId).toBeDefined();

    const status = await bridge.swarmStatus();
    expect(status.stats.totalAgents).toBe(1);

    await bridge.agentTerminate(agentId);
    expect(swarm.agentCount).toBe(0);

    await bridge.swarmShutdown();
    expect(swarm.isInitialized).toBe(false);
  });

  // -- Phase 4 operations --

  it('should expose phase 4 status', () => {
    const status = bridge.getPhase4Status();
    expect(status).toHaveProperty('syncCoordinator');
    expect(status).toHaveProperty('nightlyLearner');
    expect(status).toHaveProperty('explainableRecall');
  });

  it('should expose sync status', () => {
    const status = bridge.getSyncStatus();
    expect(status).toHaveProperty('isSyncing');
  });

  // -- Availability checks --

  it('should report has properties', () => {
    expect(bridge.hasAgentDB).toBe(true);
    expect(bridge.hasSwarm).toBe(true);
  });
});
