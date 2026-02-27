/**
 * Integration Test: SwarmService
 *
 * Tests full swarm orchestration with lifecycle management,
 * agent spawning, task distribution, and health monitoring.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';

describe('SwarmService Integration', () => {
  let SwarmService: any;
  let HookService: any;
  let AgentDBService: any;
  let hooks: any;
  let agentDB: any;
  let swarm: any;

  beforeAll(async () => {
    const swarmMod = await import('../../agentic-flow/src/services/swarm-service.js');
    SwarmService = swarmMod.SwarmService;
    const hookMod = await import('../../agentic-flow/src/services/hook-service.js');
    HookService = hookMod.HookService;
    const agentDBMod = await import('../../agentic-flow/src/services/agentdb-service.js');
    AgentDBService = agentDBMod.AgentDBService;

    agentDB = await AgentDBService.getInstance();
    hooks = new HookService(agentDB);
  });

  afterAll(async () => {
    await agentDB.shutdown();
    AgentDBService.resetInstance();
  });

  afterEach(async () => {
    if (swarm && swarm.isInitialized) {
      await swarm.shutdown();
    }
  });

  it('should construct SwarmService', () => {
    swarm = new SwarmService(hooks, agentDB);
    expect(swarm).toBeDefined();
    expect(swarm.isInitialized).toBe(false);
  });

  it('should initialize with topology and max agents', async () => {
    swarm = new SwarmService(hooks, agentDB);
    await swarm.initialize('hierarchical', 5);

    expect(swarm.isInitialized).toBe(true);
    const status = swarm.getStatus();
    expect(status.config.topology).toBe('hierarchical');
    expect(status.config.maxAgents).toBe(5);
  });

  it('should reject double initialization', async () => {
    swarm = new SwarmService(hooks, agentDB);
    await swarm.initialize('mesh', 3);

    await expect(swarm.initialize('mesh', 3)).rejects.toThrow('Swarm already initialized');
  });

  it('should spawn agents', async () => {
    swarm = new SwarmService(hooks, agentDB);
    await swarm.initialize('hierarchical', 5);

    const agentId = await swarm.spawnAgent('coder', ['typescript', 'testing']);
    expect(agentId).toBeDefined();
    expect(swarm.agentCount).toBe(1);

    const agent = swarm.getAgent(agentId);
    expect(agent).toBeDefined();
    expect(agent.type).toBe('coder');
    expect(agent.status).toBe('ready');
    expect(agent.capabilities).toContain('typescript');
  });

  it('should enforce max agents limit', async () => {
    swarm = new SwarmService(hooks, agentDB);
    await swarm.initialize('hierarchical', 2);

    await swarm.spawnAgent('coder');
    await swarm.spawnAgent('tester');

    await expect(swarm.spawnAgent('reviewer')).rejects.toThrow('Max agents');
  });

  it('should terminate agents', async () => {
    swarm = new SwarmService(hooks, agentDB);
    await swarm.initialize('hierarchical', 5);

    const agentId = await swarm.spawnAgent('coder');
    expect(swarm.agentCount).toBe(1);

    await swarm.terminateAgent(agentId);
    expect(swarm.agentCount).toBe(0);
  });

  it('should reject termination of nonexistent agent', async () => {
    swarm = new SwarmService(hooks, agentDB);
    await swarm.initialize('hierarchical', 5);

    await expect(swarm.terminateAgent('nonexistent')).rejects.toThrow('not found');
  });

  it('should list agents', async () => {
    swarm = new SwarmService(hooks, agentDB);
    await swarm.initialize('hierarchical', 5);

    await swarm.spawnAgent('coder', ['ts']);
    await swarm.spawnAgent('tester', ['vitest']);

    const agents = swarm.listAgents();
    expect(agents.length).toBe(2);
    expect(agents[0].type).toBe('coder');
    expect(agents[1].type).toBe('tester');
  });

  it('should orchestrate tasks in parallel', async () => {
    swarm = new SwarmService(hooks, agentDB);
    await swarm.initialize('hierarchical', 5);

    await swarm.spawnAgent('coder', ['ts']);
    await swarm.spawnAgent('tester', ['vitest']);

    const tasks = [
      { description: 'task-1' },
      { description: 'task-2' },
    ];

    const results = await swarm.orchestrateTasks(tasks, 'parallel');
    expect(results.length).toBe(2);
    expect(results[0].status).toBe('completed');
    expect(results[1].status).toBe('completed');
  });

  it('should orchestrate tasks sequentially', async () => {
    swarm = new SwarmService(hooks, agentDB);
    await swarm.initialize('hierarchical', 5);

    await swarm.spawnAgent('coder');

    const results = await swarm.orchestrateTasks(
      [{ description: 'sequential-1' }, { description: 'sequential-2' }],
      'sequential',
    );

    expect(results.length).toBe(2);
  });

  it('should report full swarm status', async () => {
    swarm = new SwarmService(hooks, agentDB);
    await swarm.initialize('hierarchical', 5);

    await swarm.spawnAgent('coder');
    await swarm.spawnAgent('tester');

    const status = swarm.getStatus();
    expect(status.initialized).toBe(true);
    expect(status.stats.totalAgents).toBe(2);
    expect(status.stats.readyAgents).toBeGreaterThanOrEqual(0);
  });

  it('should trigger hooks on lifecycle events', async () => {
    let swarmInitTriggered = false;
    let agentSpawnTriggered = false;
    let shutdownTriggered = false;

    hooks.register('SwarmInit', async () => { swarmInitTriggered = true; });
    hooks.register('AgentSpawn', async () => { agentSpawnTriggered = true; });
    hooks.register('SwarmShutdown', async () => { shutdownTriggered = true; });

    swarm = new SwarmService(hooks, agentDB);
    await swarm.initialize('hierarchical', 3);
    expect(swarmInitTriggered).toBe(true);

    await swarm.spawnAgent('coder');
    expect(agentSpawnTriggered).toBe(true);

    await swarm.shutdown();
    expect(shutdownTriggered).toBe(true);
  });

  it('should gracefully shutdown', async () => {
    swarm = new SwarmService(hooks, agentDB);
    await swarm.initialize('hierarchical', 5);

    await swarm.spawnAgent('coder');
    await swarm.spawnAgent('tester');
    expect(swarm.agentCount).toBe(2);

    await swarm.shutdown();
    expect(swarm.isInitialized).toBe(false);
    expect(swarm.agentCount).toBe(0);
  });

  it('should support load-balanced orchestration', async () => {
    swarm = new SwarmService(hooks, agentDB);
    await swarm.initialize('hierarchical', 5);

    await swarm.spawnAgent('coder');
    await swarm.spawnAgent('tester');

    const tasks = [
      { description: 'balanced-1' },
      { description: 'balanced-2' },
    ];

    const results = await swarm.orchestrateTasks(tasks, 'load-balanced');
    expect(results.length).toBe(2);
  });
});
