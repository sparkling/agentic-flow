/**
 * DirectCallBridge - Eliminates CLI spawning anti-pattern
 *
 * Provides direct method calls instead of execSync('npx agentic-flow ...')
 * Performance improvement: 100-200ms CLI spawn -> <1ms direct call
 *
 * This bridge wraps AgentDBService and SwarmService with a simplified
 * interface that mirrors the CLI command structure, making it easy to
 * replace execSync calls in MCP tools.
 */
import type { AgentDBService, EpisodeData, SkillData, PatternData, TrajectoryStep } from './agentdb-service.js';
import type { SwarmService, SwarmTopology } from './swarm-service.js';

export class DirectCallBridge {
  private agentDB: AgentDBService;
  private swarm: SwarmService | null;

  constructor(agentDB: AgentDBService, swarm?: SwarmService) {
    this.agentDB = agentDB;
    this.swarm = swarm || null;
  }

  // -- Memory operations (replace CLI memory commands) -----------------------

  /**
   * Store an episode in memory (replaces `npx agentic-flow memory store`)
   */
  async memoryStore(key: string, value: string, namespace = 'default', ttl?: number): Promise<{ id: string }> {
    const id = await this.agentDB.storeEpisode({
      sessionId: namespace,
      task: key,
      output: value,
      reward: 0.5,
      success: true,
      metadata: { namespace, ttl, storedAt: Date.now() },
    });
    return { id };
  }

  /**
   * Search memory (replaces `npx agentic-flow memory search`)
   */
  async memorySearch(query: string, namespace?: string, limit = 10): Promise<any[]> {
    const episodes = await this.agentDB.recallEpisodes(query, limit);
    if (namespace) {
      return episodes.filter(ep => ep.sessionId === namespace);
    }
    return episodes;
  }

  /**
   * Retrieve a specific memory by key (replaces `npx agentic-flow memory retrieve`)
   */
  async memoryRetrieve(key: string, namespace = 'default'): Promise<any | null> {
    const results = await this.agentDB.recallEpisodes(key, 1);
    if (results.length > 0 && results[0].sessionId === namespace) {
      return results[0];
    }
    return null;
  }

  /**
   * List memories in a namespace (replaces `npx agentic-flow memory list`)
   */
  async memoryList(namespace?: string, limit = 100): Promise<any[]> {
    const query = namespace || '*';
    return this.agentDB.recallEpisodes(query, limit);
  }

  // -- Episode operations (direct AgentDB) -----------------------------------

  async episodeStore(episode: EpisodeData): Promise<string> {
    return this.agentDB.storeEpisode(episode);
  }

  async episodeRecall(query: string, limit = 5): Promise<any[]> {
    return this.agentDB.recallEpisodes(query, limit);
  }

  async episodeRecallDiverse(query: string, limit = 5, lambda = 0.5): Promise<any[]> {
    return this.agentDB.recallDiverseEpisodes(query, limit, lambda);
  }

  // -- Pattern operations (direct AgentDB) -----------------------------------

  async patternStore(pattern: PatternData): Promise<string> {
    return this.agentDB.storePattern(pattern);
  }

  async patternSearch(query: string, limit = 10, diverse = false): Promise<any[]> {
    return this.agentDB.searchPatterns(query, limit, diverse);
  }

  // -- Skill operations (direct AgentDB) -------------------------------------

  async skillPublish(skill: SkillData): Promise<string> {
    return this.agentDB.publishSkill(skill);
  }

  async skillFind(description: string, limit = 10): Promise<any[]> {
    return this.agentDB.findSkills(description, limit);
  }

  // -- Causal graph operations -----------------------------------------------

  async causalEdgeRecord(from: string, to: string, metadata: unknown): Promise<void> {
    return this.agentDB.recordCausalEdge(from, to, metadata);
  }

  async causalPathQuery(from: string, to: string): Promise<any[]> {
    return this.agentDB.queryCausalPath(from, to);
  }

  // -- Graph operations ------------------------------------------------------

  async graphStore(nodes: any[], edges: any[]): Promise<void> {
    return this.agentDB.storeGraphState(nodes, edges);
  }

  async graphQuery(query: string): Promise<any[]> {
    return this.agentDB.queryGraph(query);
  }

  // -- Learning operations ---------------------------------------------------

  async trajectoryRecord(steps: TrajectoryStep[], reward: number): Promise<void> {
    return this.agentDB.recordTrajectory(steps, reward);
  }

  async actionPredict(state: any): Promise<any> {
    return this.agentDB.predictAction(state);
  }

  // -- Routing operations ----------------------------------------------------

  async routeSemantic(taskDescription: string): Promise<any> {
    return this.agentDB.routeSemantic(taskDescription);
  }

  // -- Explain operations ----------------------------------------------------

  async explainDecision(decisionId: string): Promise<any> {
    return this.agentDB.explainDecision(decisionId);
  }

  // -- Metrics ---------------------------------------------------------------

  async getMetrics(): Promise<any> {
    return this.agentDB.getMetrics();
  }

  // -- Attention operations --------------------------------------------------

  getAttentionService(): any {
    return this.agentDB.getAttentionService();
  }

  getAttentionStats(): any {
    return this.agentDB.getAttentionStats();
  }

  // -- Context synthesis -----------------------------------------------------

  async synthesizeContext(query: string, limit = 10): Promise<any> {
    const episodes = await this.agentDB.recallEpisodes(query, limit);
    return this.agentDB.synthesizeContext(episodes);
  }

  // -- Swarm operations (if SwarmService available) --------------------------

  async swarmInit(topology: SwarmTopology, maxAgents: number, config?: any): Promise<void> {
    if (!this.swarm) throw new Error('SwarmService not available');
    return this.swarm.initialize(topology, maxAgents, config);
  }

  async agentSpawn(type: string, capabilities?: string[], name?: string): Promise<string> {
    if (!this.swarm) throw new Error('SwarmService not available');
    return this.swarm.spawnAgent(type, capabilities, name);
  }

  async agentTerminate(agentId: string): Promise<void> {
    if (!this.swarm) throw new Error('SwarmService not available');
    return this.swarm.terminateAgent(agentId);
  }

  async taskOrchestrate(tasks: any[], strategy = 'parallel'): Promise<any[]> {
    if (!this.swarm) throw new Error('SwarmService not available');
    return this.swarm.orchestrateTasks(tasks, strategy);
  }

  async swarmStatus(): Promise<any> {
    if (!this.swarm) throw new Error('SwarmService not available');
    return this.swarm.getStatus();
  }

  async swarmShutdown(): Promise<void> {
    if (!this.swarm) throw new Error('SwarmService not available');
    return this.swarm.shutdown();
  }

  // -- Phase 4 operations ----------------------------------------------------

  async runNightlyLearner(): Promise<any> {
    return this.agentDB.runNightlyLearner();
  }

  async consolidateEpisodes(sessionId?: string): Promise<any> {
    return this.agentDB.consolidateEpisodes(sessionId);
  }

  async syncWithRemote(onProgress?: (progress: any) => void): Promise<any> {
    return this.agentDB.syncWithRemote(onProgress);
  }

  getSyncStatus(): any {
    return this.agentDB.getSyncStatus();
  }

  getPhase4Status(): any {
    return this.agentDB.getPhase4Status();
  }

  // -- Convenience: check availability ---------------------------------------

  get hasSwarm(): boolean {
    return this.swarm !== null;
  }

  get hasAgentDB(): boolean {
    return this.agentDB !== null;
  }

  /**
   * Attach a SwarmService after construction
   */
  setSwarmService(swarm: SwarmService): void {
    this.swarm = swarm;
  }
}
