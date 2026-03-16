# Wiring Plan: Connecting Missing Components

**Generated**: 2026-02-25
**Purpose**: Step-by-step instructions to wire disconnected components

## Priority Levels
- 🔥 **P0 Critical**: Blocking issues, must fix immediately
- ⚠️ **P1 High**: High-impact, should fix this week
- 📋 **P2 Medium**: Important but not urgent
- 💡 **P3 Low**: Nice-to-have, future optimization

---

## Phase 1: Critical Wiring (Week 7) 🔥

### 1.1 Create HookService Infrastructure (P0 - 8 hours)

**Gap**: Hooks defined but no runtime triggering system.

**Files to Create**:
```
agentic-flow/src/services/hook-service.ts
agentic-flow/src/services/hook-service.test.ts
```

**Implementation**:

```typescript
// agentic-flow/src/services/hook-service.ts
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface HookConfig {
  type: string;
  matcher?: string;
  handler: string;
  enabled: boolean;
}

export interface HookPayload {
  event: string;
  tool?: string;
  params?: any;
  result?: any;
  error?: any;
  duration?: number;
  timestamp: number;
}

export class HookService {
  private static instance: HookService | null = null;
  private handlers = new Map<string, Function[]>();
  private metrics = new Map<string, { calls: number; errors: number; totalDuration: number }>();

  private constructor() {
    this.loadHooksFromSettings();
  }

  static getInstance(): HookService {
    if (!HookService.instance) {
      HookService.instance = new HookService();
    }
    return HookService.instance;
  }

  /**
   * Load hooks from .claude/settings.json
   */
  private loadHooksFromSettings(): void {
    const settingsPath = join(process.cwd(), '.claude', 'settings.json');
    if (!existsSync(settingsPath)) return;

    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      const hooks = settings.hooks || {};

      for (const [event, config] of Object.entries(hooks)) {
        if (typeof config === 'object' && config.enabled) {
          this.registerFromConfig(event, config as HookConfig);
        }
      }

      console.log(`[HookService] Loaded ${this.handlers.size} hook types`);
    } catch (error) {
      console.warn('[HookService] Failed to load hooks:', error);
    }
  }

  /**
   * Register hook from configuration
   */
  private registerFromConfig(event: string, config: HookConfig): void {
    // Import handler dynamically
    const handlerPath = this.resolveHandlerPath(config.handler);
    if (handlerPath) {
      import(handlerPath).then(module => {
        this.register(event, module.default || module);
      }).catch(err => {
        console.warn(`[HookService] Failed to load handler ${config.handler}:`, err);
      });
    }
  }

  /**
   * Resolve handler path from name
   */
  private resolveHandlerPath(handler: string): string | null {
    // Try built-in handlers first
    const builtinPath = join(__dirname, '..', 'hooks', `${handler}.js`);
    if (existsSync(builtinPath)) return builtinPath;

    // Try user hooks
    const userPath = join(process.cwd(), '.claude-flow', 'hooks', `${handler}.js`);
    if (existsSync(userPath)) return userPath;

    return null;
  }

  /**
   * Register a hook handler
   */
  register(event: string, handler: Function): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  /**
   * Trigger a hook event
   */
  async trigger(event: string, payload: HookPayload): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers || handlers.length === 0) return;

    const startTime = Date.now();
    let errors = 0;

    for (const handler of handlers) {
      try {
        await handler(payload);
      } catch (error) {
        console.error(`[HookService] Error in ${event} handler:`, error);
        errors++;
      }
    }

    // Update metrics
    const metric = this.metrics.get(event) || { calls: 0, errors: 0, totalDuration: 0 };
    metric.calls++;
    metric.errors += errors;
    metric.totalDuration += Date.now() - startTime;
    this.metrics.set(event, metric);
  }

  /**
   * Get hook metrics
   */
  getMetrics(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [event, metric] of this.metrics.entries()) {
      result[event] = {
        totalCalls: metric.calls,
        errors: metric.errors,
        avgDurationMs: metric.calls > 0 ? metric.totalDuration / metric.calls : 0
      };
    }
    return result;
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.metrics.clear();
  }
}
```

**Wiring to MCP Tools**:

```typescript
// agentic-flow/src/mcp/fastmcp/servers/stdio-full.ts
import { HookService } from '../../../services/hook-service.js';

// Wrap ALL tool executions with hooks:
const originalAddTool = server.addTool.bind(server);
server.addTool = function(config: any) {
  const originalExecute = config.execute;
  config.execute = async (params: any) => {
    const hookSvc = HookService.getInstance();
    const startTime = Date.now();

    // Pre-execution hook
    await hookSvc.trigger('PreToolUse', {
      event: 'PreToolUse',
      tool: config.name,
      params,
      timestamp: startTime
    });

    try {
      const result = await originalExecute(params);

      // Post-execution hook
      await hookSvc.trigger('PostToolUse', {
        event: 'PostToolUse',
        tool: config.name,
        params,
        result,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      });

      return result;
    } catch (error) {
      // Error hook
      await hookSvc.trigger('ToolError', {
        event: 'ToolError',
        tool: config.name,
        params,
        error,
        duration: Date.now() - startTime,
        timestamp: Date.now()
      });

      throw error;
    }
  };

  return originalAddTool(config);
};
```

**Test**:
```bash
npm test -- hook-service.test.ts
```

---

### 1.2 Wire AttentionService to Search Tools (P0 - 4 hours)

**Gap**: AttentionService initialized but not used by any MCP tool.

**Files to Modify**:
- `agentic-flow/src/mcp/fastmcp/servers/stdio-full.ts`

**Add New Tool**:

```typescript
// Tool: attention_weighted_search
server.addTool({
  name: 'attention_weighted_search',
  description: 'Search memory with multi-head attention weighting for better relevance',
  parameters: z.object({
    query: z.string().min(1).describe('Search query'),
    limit: z.number().positive().optional().default(5).describe('Max results'),
    mechanism: z.enum(['multi-head', 'flash', 'linear', 'local', 'global'])
      .optional()
      .default('multi-head')
      .describe('Attention mechanism to use'),
    numHeads: z.number().optional().default(8).describe('Number of attention heads'),
  }),
  execute: async ({ query, limit, mechanism, numHeads }) => {
    try {
      const svc = await AgentDBService.getInstance();
      const attentionSvc = svc.getAttentionService();

      if (!attentionSvc) {
        // Fallback to regular search
        const episodes = await svc.recallEpisodes(query, limit);
        return JSON.stringify({
          success: true,
          data: { episodes, count: episodes.length, attentionUsed: false },
          timestamp: new Date().toISOString()
        }, null, 2);
      }

      // Get candidate episodes
      const candidates = await svc.recallEpisodes(query, limit * 3);

      if (candidates.length === 0) {
        return JSON.stringify({
          success: true,
          data: { episodes: [], count: 0, attentionUsed: false },
          timestamp: new Date().toISOString()
        }, null, 2);
      }

      // Apply attention mechanism
      const embeddings = candidates.map(c => c.embedding || []);
      const queryEmbedding = await svc.getEmbeddingService().embed(query);

      let attentionResult;
      switch (mechanism) {
        case 'flash':
          attentionResult = await attentionSvc.flashAttention(
            [queryEmbedding], embeddings, embeddings
          );
          break;
        case 'linear':
          attentionResult = await attentionSvc.linearAttention(
            [queryEmbedding], embeddings, embeddings
          );
          break;
        case 'local':
          attentionResult = await attentionSvc.localAttention(
            [queryEmbedding], embeddings, embeddings, 5
          );
          break;
        case 'global':
          attentionResult = await attentionSvc.globalAttention(
            [queryEmbedding], embeddings, embeddings
          );
          break;
        default:
          attentionResult = await attentionSvc.multiHeadAttention(
            [queryEmbedding], embeddings, embeddings
          );
      }

      // Weight candidates by attention scores
      const weighted = candidates.map((c, i) => ({
        ...c,
        attentionScore: attentionResult.output[0]?.[i] || 0
      })).sort((a, b) => b.attentionScore - a.attentionScore);

      const episodes = weighted.slice(0, limit);

      return JSON.stringify({
        success: true,
        data: {
          episodes,
          count: episodes.length,
          attentionUsed: true,
          mechanism,
          stats: attentionResult.stats
        },
        timestamp: new Date().toISOString()
      }, null, 2);
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, 2);
    }
  }
});
```

**Enhance Existing Tool**:

```typescript
// Update memory_episode_recall to optionally use attention:
server.addTool({
  name: 'memory_episode_recall',
  parameters: z.object({
    query: z.string().min(1),
    limit: z.number().positive().optional().default(5),
    useAttention: z.boolean().optional().default(false).describe('Use attention weighting'),
    useDiversity: z.boolean().optional().default(false).describe('Use MMR diversity'),
  }),
  execute: async ({ query, limit, useAttention, useDiversity }) => {
    const svc = await AgentDBService.getInstance();

    // Use attention-weighted search if requested
    if (useAttention) {
      const attentionSvc = svc.getAttentionService();
      if (attentionSvc) {
        // ... attention logic from above
      }
    }

    // Use diversity if requested
    if (useDiversity) {
      const episodes = await svc.recallDiverseEpisodes(query, limit);
      return JSON.stringify({ success: true, data: { episodes, diversity: true } }, null, 2);
    }

    // Standard search
    const episodes = await svc.recallEpisodes(query, limit);
    return JSON.stringify({ success: true, data: { episodes } }, null, 2);
  }
});
```

---

### 1.3 Replace CLI Spawns with Direct Service Calls (P0 - 10 hours)

**Gap**: 10+ MCP tools spawn CLI processes instead of calling services directly.

**Files to Modify**:
- `agentic-flow/src/mcp/fastmcp/servers/stdio-full.ts`

**Tools to Update**:
1. `memory_store` (line 40)
2. `memory_retrieve` (line 75)
3. `memory_search` (line 103)
4. `swarm_init` (line 220)
5. `agent_spawn` (line 251)

**Pattern for Each Tool**:

```typescript
// BEFORE (memory_store):
execute: async ({ key, value, namespace, ttl }) => {
  const cmd = [
    'npx claude-flow@alpha memory store',
    `"${key}"`,
    `"${value}"`,
    `--namespace "${namespace}"`,
    ttl ? `--ttl ${ttl}` : ''
  ].filter(Boolean).join(' ');

  const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  // ...
}

// AFTER:
execute: async ({ key, value, namespace, ttl }) => {
  try {
    const svc = await AgentDBService.getInstance();

    // Store in ReflexionMemory (treating key-value as episode)
    const id = await svc.storeEpisode({
      sessionId: namespace || 'default',
      task: key,
      input: value,
      output: value,
      critique: '',
      reward: 1,
      success: true,
      metadata: { ttl, storageType: 'key-value' }
    });

    return JSON.stringify({
      success: true,
      id,
      key,
      namespace,
      timestamp: new Date().toISOString()
    }, null, 2);
  } catch (error: any) {
    throw new Error(`Failed to store memory: ${error.message}`);
  }
}
```

**For Swarm Tools** (create SwarmService first - see 1.4):

```typescript
// BEFORE (swarm_init):
execute: async ({ topology, maxAgents, strategy }) => {
  const cmd = `npx claude-flow@alpha swarm init --topology ${topology} --max-agents ${maxAgents} --strategy ${strategy}`;
  const result = execSync(cmd, { encoding: 'utf-8' });
  // ...
}

// AFTER:
execute: async ({ topology, maxAgents, strategy }) => {
  const svc = SwarmService.getInstance();
  const swarmId = await svc.initialize({ topology, maxAgents, strategy });

  return JSON.stringify({
    success: true,
    swarmId,
    topology,
    maxAgents,
    strategy,
    timestamp: new Date().toISOString()
  }, null, 2);
}
```

---

### 1.4 Create SwarmService Facade (P1 - 8 hours)

**Gap**: No centralized swarm coordination service.

**Files to Create**:
```
agentic-flow/src/services/swarm-service.ts
agentic-flow/src/services/swarm-service.test.ts
```

**Implementation**:

```typescript
// agentic-flow/src/services/swarm-service.ts
import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';

export type SwarmTopology = 'mesh' | 'hierarchical' | 'ring' | 'star';
export type AgentStrategy = 'balanced' | 'specialized' | 'adaptive';
export type AgentType = 'researcher' | 'coder' | 'analyst' | 'optimizer' | 'coordinator';

export interface SwarmConfig {
  topology: SwarmTopology;
  maxAgents: number;
  strategy: AgentStrategy;
}

export interface Agent {
  id: string;
  type: AgentType;
  capabilities: string[];
  status: 'idle' | 'busy' | 'error';
  tasksCompleted: number;
  createdAt: number;
}

export interface Swarm {
  id: string;
  config: SwarmConfig;
  agents: Map<string, Agent>;
  status: 'initializing' | 'active' | 'paused' | 'shutdown';
  createdAt: number;
}

export class SwarmService extends EventEmitter {
  private static instance: SwarmService | null = null;
  private swarms = new Map<string, Swarm>();
  private activeSwarm: string | null = null;

  private constructor() {
    super();
  }

  static getInstance(): SwarmService {
    if (!SwarmService.instance) {
      SwarmService.instance = new SwarmService();
    }
    return SwarmService.instance;
  }

  /**
   * Initialize a new swarm
   */
  async initialize(config: SwarmConfig): Promise<string> {
    const swarmId = uuid();
    const swarm: Swarm = {
      id: swarmId,
      config,
      agents: new Map(),
      status: 'initializing',
      createdAt: Date.now()
    };

    this.swarms.set(swarmId, swarm);
    this.activeSwarm = swarmId;

    // Initialize topology-specific coordination
    await this.setupTopology(swarmId, config.topology);

    swarm.status = 'active';
    this.emit('swarm:initialized', { swarmId, config });

    return swarmId;
  }

  /**
   * Setup topology-specific coordination
   */
  private async setupTopology(swarmId: string, topology: SwarmTopology): Promise<void> {
    // Load topology coordinator
    switch (topology) {
      case 'hierarchical':
        // Import hierarchical coordinator
        break;
      case 'mesh':
        // Import mesh coordinator
        break;
      case 'ring':
        // Import ring coordinator
        break;
      case 'star':
        // Import star coordinator
        break;
    }
  }

  /**
   * Spawn a new agent
   */
  async spawn(
    type: AgentType,
    capabilities: string[] = [],
    swarmId?: string
  ): Promise<string> {
    const targetSwarmId = swarmId || this.activeSwarm;
    if (!targetSwarmId) {
      throw new Error('No active swarm. Initialize a swarm first.');
    }

    const swarm = this.swarms.get(targetSwarmId);
    if (!swarm) {
      throw new Error(`Swarm ${targetSwarmId} not found`);
    }

    if (swarm.agents.size >= swarm.config.maxAgents) {
      throw new Error(`Swarm at capacity (${swarm.config.maxAgents} agents)`);
    }

    const agentId = uuid();
    const agent: Agent = {
      id: agentId,
      type,
      capabilities: capabilities.length > 0 ? capabilities : this.getDefaultCapabilities(type),
      status: 'idle',
      tasksCompleted: 0,
      createdAt: Date.now()
    };

    swarm.agents.set(agentId, agent);
    this.emit('agent:spawned', { swarmId: targetSwarmId, agentId, agent });

    return agentId;
  }

  /**
   * Get default capabilities for agent type
   */
  private getDefaultCapabilities(type: AgentType): string[] {
    const defaults: Record<AgentType, string[]> = {
      researcher: ['search', 'analyze', 'summarize'],
      coder: ['write-code', 'refactor', 'debug'],
      analyst: ['data-analysis', 'visualization', 'reporting'],
      optimizer: ['performance', 'profiling', 'optimization'],
      coordinator: ['orchestration', 'planning', 'coordination']
    };
    return defaults[type] || [];
  }

  /**
   * Orchestrate a task across the swarm
   */
  async orchestrate(
    task: string,
    strategy: 'parallel' | 'sequential' | 'adaptive' = 'adaptive',
    swarmId?: string
  ): Promise<any> {
    const targetSwarmId = swarmId || this.activeSwarm;
    if (!targetSwarmId) {
      throw new Error('No active swarm');
    }

    const swarm = this.swarms.get(targetSwarmId);
    if (!swarm) {
      throw new Error(`Swarm ${targetSwarmId} not found`);
    }

    // Select agents based on strategy
    const agents = this.selectAgents(swarm, task, strategy);

    // Distribute task
    const subtasks = this.decomposeTask(task, agents.length);

    // Execute based on strategy
    let results: any[];
    if (strategy === 'parallel') {
      results = await Promise.all(
        subtasks.map((subtask, i) => this.executeAgentTask(agents[i], subtask))
      );
    } else if (strategy === 'sequential') {
      results = [];
      for (let i = 0; i < subtasks.length; i++) {
        const result = await this.executeAgentTask(agents[i], subtasks[i]);
        results.push(result);
      }
    } else {
      // Adaptive: decide at runtime
      results = await this.adaptiveExecution(agents, subtasks);
    }

    return this.aggregateResults(results);
  }

  /**
   * Select agents for task
   */
  private selectAgents(swarm: Swarm, task: string, strategy: string): Agent[] {
    const agents = Array.from(swarm.agents.values()).filter(a => a.status === 'idle');

    if (agents.length === 0) {
      throw new Error('No idle agents available');
    }

    // For now, return all idle agents
    // TODO: Implement capability matching
    return agents;
  }

  /**
   * Decompose task into subtasks
   */
  private decomposeTask(task: string, numAgents: number): string[] {
    // Simple decomposition for now
    return Array(numAgents).fill(task);
  }

  /**
   * Execute task on agent
   */
  private async executeAgentTask(agent: Agent, task: string): Promise<any> {
    agent.status = 'busy';

    try {
      // TODO: Actual agent execution logic
      // For now, simulate work
      await new Promise(resolve => setTimeout(resolve, 100));

      agent.tasksCompleted++;
      agent.status = 'idle';

      return { agentId: agent.id, task, result: 'completed' };
    } catch (error) {
      agent.status = 'error';
      throw error;
    }
  }

  /**
   * Adaptive execution strategy
   */
  private async adaptiveExecution(agents: Agent[], subtasks: string[]): Promise<any[]> {
    // Start with parallel, fall back to sequential on errors
    try {
      return await Promise.all(
        subtasks.map((subtask, i) => this.executeAgentTask(agents[i], subtask))
      );
    } catch (error) {
      // Fallback to sequential
      const results = [];
      for (let i = 0; i < subtasks.length; i++) {
        try {
          const result = await this.executeAgentTask(agents[i], subtasks[i]);
          results.push(result);
        } catch (err) {
          results.push({ error: err, agentId: agents[i].id });
        }
      }
      return results;
    }
  }

  /**
   * Aggregate results from multiple agents
   */
  private aggregateResults(results: any[]): any {
    return {
      results,
      totalAgents: results.length,
      successCount: results.filter(r => !r.error).length,
      timestamp: Date.now()
    };
  }

  /**
   * Get swarm status
   */
  getStatus(swarmId?: string): Swarm | null {
    const targetSwarmId = swarmId || this.activeSwarm;
    if (!targetSwarmId) return null;
    return this.swarms.get(targetSwarmId) || null;
  }

  /**
   * List all swarms
   */
  listSwarms(): Swarm[] {
    return Array.from(this.swarms.values());
  }

  /**
   * Shutdown swarm
   */
  async shutdown(swarmId?: string): Promise<void> {
    const targetSwarmId = swarmId || this.activeSwarm;
    if (!targetSwarmId) return;

    const swarm = this.swarms.get(targetSwarmId);
    if (!swarm) return;

    swarm.status = 'shutdown';
    this.emit('swarm:shutdown', { swarmId: targetSwarmId });

    if (this.activeSwarm === targetSwarmId) {
      this.activeSwarm = null;
    }
  }
}
```

---

## Phase 2: High-Value Wiring (Week 8) ⚠️

### 2.1 Expose NightlyLearner MCP Tools (P1 - 3 hours)

**Gap**: NightlyLearner initialized but no MCP exposure.

**Add to stdio-full.ts**:

```typescript
// Tool: nightly_learn
server.addTool({
  name: 'nightly_learn',
  description: 'Run automated causal discovery to learn patterns from episodes',
  parameters: z.object({
    minSimilarity: z.number().optional().default(0.7).describe('Min similarity threshold'),
    minSampleSize: z.number().optional().default(30).describe('Min sample size for patterns'),
  }),
  execute: async ({ minSimilarity, minSampleSize }) => {
    try {
      const svc = await AgentDBService.getInstance();
      const report = await svc.runNightlyLearner();

      return JSON.stringify({
        success: true,
        data: report,
        timestamp: new Date().toISOString()
      }, null, 2);
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, 2);
    }
  }
});

// Tool: consolidate_episodes
server.addTool({
  name: 'consolidate_episodes',
  description: 'Consolidate episodes using FlashAttention for memory efficiency',
  parameters: z.object({
    sessionId: z.string().optional().describe('Session ID to consolidate (all sessions if not specified)'),
  }),
  execute: async ({ sessionId }) => {
    try {
      const svc = await AgentDBService.getInstance();
      const result = await svc.consolidateEpisodes(sessionId);

      return JSON.stringify({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      }, null, 2);
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, 2);
    }
  }
});
```

---

### 2.2 Expose ExplainableRecall MCP Tools (P1 - 3 hours)

**Add to stdio-full.ts**:

```typescript
// Tool: recall_create_certificate
server.addTool({
  name: 'recall_create_certificate',
  description: 'Create an explainable Merkle-proof certificate for a memory recall',
  parameters: z.object({
    queryId: z.string().describe('Unique query identifier'),
    queryText: z.string().describe('The search query text'),
    chunks: z.array(z.object({
      id: z.string(),
      type: z.string(),
      content: z.string(),
      relevance: z.number()
    })).describe('Retrieved chunks'),
    requirements: z.array(z.string()).describe('Query requirements'),
  }),
  execute: async ({ queryId, queryText, chunks, requirements }) => {
    try {
      const svc = await AgentDBService.getInstance();
      const certificate = await svc.createRecallCertificate({
        queryId,
        queryText,
        chunks,
        requirements
      });

      return JSON.stringify({
        success: true,
        data: certificate,
        timestamp: new Date().toISOString()
      }, null, 2);
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, 2);
    }
  }
});

// Tool: recall_verify_certificate
server.addTool({
  name: 'recall_verify_certificate',
  description: 'Verify a recall certificate using Merkle proofs',
  parameters: z.object({
    certificateId: z.string().describe('Certificate ID to verify'),
  }),
  execute: async ({ certificateId }) => {
    try {
      const svc = await AgentDBService.getInstance();
      const verification = svc.verifyRecallCertificate(certificateId);

      return JSON.stringify({
        success: true,
        data: verification,
        timestamp: new Date().toISOString()
      }, null, 2);
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, 2);
    }
  }
});
```

---

### 2.3 Implement GitHub Service Methods (P1 - 6 hours)

**Gap**: GitHubService is all stubs.

**Files to Modify**:
- `agentic-flow/src/services/github-service.ts`

**Implementation**:

```typescript
// agentic-flow/src/services/github-service.ts
import { execFileSync } from 'child_process';

export class GitHubService {
  // ... existing code ...

  /**
   * Create a pull request
   */
  createPR(params: { title: string; body: string; base?: string; head?: string }): PRInfo {
    const args = ['pr', 'create', '--title', params.title, '--body', params.body];
    if (params.base) args.push('--base', params.base);
    if (params.head) args.push('--head', params.head);
    args.push('--json', 'number,title,state,url,author');

    try {
      const result = execFileSync('gh', args, { encoding: 'utf-8' });
      const data = JSON.parse(result);
      return {
        number: data.number,
        title: data.title,
        state: data.state,
        url: data.url,
        author: data.author.login
      };
    } catch (error: any) {
      throw new Error(`Failed to create PR: ${error.message}`);
    }
  }

  /**
   * List pull requests
   */
  listPRs(params: { state?: string; limit?: number }): PRInfo[] {
    const args = ['pr', 'list'];
    if (params.state && params.state !== 'all') args.push('--state', params.state);
    if (params.limit) args.push('--limit', String(params.limit));
    args.push('--json', 'number,title,state,url,author');

    try {
      const result = execFileSync('gh', args, { encoding: 'utf-8' });
      const data = JSON.parse(result);
      return data.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        url: pr.url,
        author: pr.author.login
      }));
    } catch (error: any) {
      throw new Error(`Failed to list PRs: ${error.message}`);
    }
  }

  /**
   * Review a pull request
   */
  reviewPR(params: { number: number; body: string; event?: string }): any {
    const args = ['pr', 'review', String(params.number), '--body', params.body];
    if (params.event) {
      if (params.event === 'approve') args.push('--approve');
      else if (params.event === 'request-changes') args.push('--request-changes');
      else args.push('--comment');
    }

    try {
      execFileSync('gh', args, { encoding: 'utf-8' });
      return { success: true, number: params.number };
    } catch (error: any) {
      throw new Error(`Failed to review PR: ${error.message}`);
    }
  }

  /**
   * Merge a pull request
   */
  mergePR(params: { number: number; method?: string }): any {
    const args = ['pr', 'merge', String(params.number)];
    if (params.method === 'squash') args.push('--squash');
    else if (params.method === 'rebase') args.push('--rebase');
    else args.push('--merge');

    try {
      execFileSync('gh', args, { encoding: 'utf-8' });
      return { success: true, number: params.number };
    } catch (error: any) {
      throw new Error(`Failed to merge PR: ${error.message}`);
    }
  }

  /**
   * Create an issue
   */
  createIssue(params: { title: string; body: string; labels?: string[] }): IssueInfo {
    const args = ['issue', 'create', '--title', params.title, '--body', params.body];
    if (params.labels && params.labels.length > 0) {
      args.push('--label', params.labels.join(','));
    }
    args.push('--json', 'number,title,state,url,labels');

    try {
      const result = execFileSync('gh', args, { encoding: 'utf-8' });
      const data = JSON.parse(result);
      return {
        number: data.number,
        title: data.title,
        state: data.state,
        url: data.url,
        labels: data.labels.map((l: any) => l.name)
      };
    } catch (error: any) {
      throw new Error(`Failed to create issue: ${error.message}`);
    }
  }

  // Implement remaining methods (listIssues, getRepoInfo, getWorkflowStatus) similarly...
}
```

---

## Phase 3: Activation Wiring (Week 9) 📋

### 3.1 Enable Native Flash Attention Bindings (P2 - 4 hours)

**Gap**: @ruvector/attention installed but using JS fallback.

**Files to Modify**:
- `packages/agentdb/src/controllers/AttentionService.ts`

**Implementation**:

```typescript
// packages/agentdb/src/controllers/AttentionService.ts
import type { AttentionConfig, AttentionResult } from '../types/attention.js';

export class AttentionService {
  private config: AttentionConfig;
  private nativeAttention: any = null;
  private nativeAvailable = false;

  constructor(config: AttentionConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    // Try to load native @ruvector/attention bindings
    try {
      const { createAttention } = await import('@ruvector/attention');
      this.nativeAttention = await createAttention({
        numHeads: this.config.numHeads,
        headDim: this.config.headDim,
        embedDim: this.config.embedDim,
        useFlash: this.config.useFlash,
        dropout: this.config.dropout
      });
      this.nativeAvailable = true;
      console.log('[AttentionService] Native bindings activated');
    } catch (error) {
      console.warn('[AttentionService] Native bindings unavailable, using JS fallback:', error);
      this.nativeAvailable = false;
    }
  }

  async multiHeadAttention(
    queries: Float32Array[],
    keys: Float32Array[],
    values: Float32Array[]
  ): Promise<AttentionResult> {
    const startTime = Date.now();

    // Use native if available
    if (this.nativeAvailable && this.nativeAttention?.multiHeadAttentionNative) {
      try {
        const result = await this.nativeAttention.multiHeadAttentionNative(queries, keys, values);
        return {
          output: result.output,
          stats: {
            mechanism: 'multi-head',
            runtime: 'native',
            executionTimeMs: Date.now() - startTime,
            memoryBytes: result.memoryBytes || 0
          }
        };
      } catch (error) {
        console.warn('[AttentionService] Native multi-head failed, falling back to JS:', error);
      }
    }

    // Fallback to JS
    return this.fallbackMultiHeadAttention(queries, keys, values, startTime);
  }

  async flashAttention(
    queries: Float32Array[],
    keys: Float32Array[],
    values: Float32Array[]
  ): Promise<AttentionResult> {
    const startTime = Date.now();

    // Use native if available
    if (this.nativeAvailable && this.nativeAttention?.flashAttentionNative) {
      try {
        const result = await this.nativeAttention.flashAttentionNative(queries, keys, values);
        return {
          output: result.output,
          stats: {
            mechanism: 'flash',
            runtime: 'native',
            executionTimeMs: Date.now() - startTime,
            memoryBytes: result.memoryBytes || 0
          }
        };
      } catch (error) {
        console.warn('[AttentionService] Native flash attention failed, falling back to JS:', error);
      }
    }

    // Fallback to JS
    return this.fallbackFlashAttention(queries, keys, values, startTime);
  }

  // Add similar changes to linearAttention, localAttention, globalAttention...
}
```

---

### 3.2 Integrate GNN Learning into Routing Pipeline (P2 - 6 hours)

**Gap**: GNN Learning initialized but not used in routing.

**Files to Modify**:
- `agentic-flow/src/services/agentdb-service.ts`

**Enhancement**:

```typescript
// In AgentDBService.routeSemantic():
async routeSemantic(taskDescription: string): Promise<RouteResult> {
  // Phase 2: Try semantic router with GNN-enhanced embeddings
  if (this.routerEnabled && this.semanticRouter) {
    try {
      let embedding;

      // Use GNN-enhanced embeddings if available
      if (this.gnnEnabled && this.gnnLearning) {
        const baseEmbedding = await this.embeddingService.embed(taskDescription);
        embedding = await this.gnnLearning.enhance(baseEmbedding);
      } else {
        embedding = await this.embeddingService.embed(taskDescription);
      }

      const routeResult = await this.semanticRouter.routeWithEmbedding(embedding);

      // ... rest of routing logic
    } catch (error) {
      console.warn('[AgentDBService] GNN-enhanced routing failed:', error);
    }
  }

  // Fallback logic...
}
```

**Add to RuVectorLearning**:

```typescript
// packages/agentdb/src/backends/ruvector/RuVectorLearning.ts
export class RuVectorLearning {
  /**
   * Enhance embedding using GNN
   */
  async enhance(embedding: Float32Array): Promise<Float32Array> {
    if (!this.gnn) {
      return embedding; // Return original if GNN not available
    }

    try {
      // Apply GNN transformation
      const enhanced = await this.gnn.transform(embedding);
      return enhanced;
    } catch (error) {
      console.warn('[RuVectorLearning] GNN enhancement failed:', error);
      return embedding;
    }
  }
}
```

---

## Phase 4: Hook Integration (Week 10) 💡

### 4.1 Add Hook Triggering to All MCP Tools (P3 - 8 hours)

**Already covered in 1.1** with the wrapper approach. This phase focuses on:

1. **Built-in Hook Handlers**:

Create these files:
```
agentic-flow/src/hooks/built-in/log-tool-usage.ts
agentic-flow/src/hooks/built-in/store-task-outcome.ts
agentic-flow/src/hooks/built-in/summarize-session.ts
agentic-flow/src/hooks/built-in/validate-command.ts
```

**Example**: `log-tool-usage.ts`

```typescript
export default async function logToolUsage(payload: any): Promise<void> {
  const { tool, params, result, duration } = payload;

  // Store usage in AgentDB
  const svc = await import('../../services/agentdb-service.js').then(m => m.AgentDBService.getInstance());
  await svc.storePattern({
    taskType: 'tool-usage',
    approach: tool,
    successRate: result?.success ? 1 : 0,
    tags: ['tool-usage', tool],
    metadata: { params, duration }
  });
}
```

2. **Hook Metrics MCP Tool**:

```typescript
// Add to stdio-full.ts:
server.addTool({
  name: 'hooks_metrics',
  description: 'Get hook execution metrics',
  execute: async () => {
    const hookSvc = HookService.getInstance();
    const metrics = hookSvc.getMetrics();

    return JSON.stringify({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    }, null, 2);
  }
});
```

---

## Testing & Validation

### Unit Tests

```bash
# Test hook service
npm test -- hook-service.test.ts

# Test swarm service
npm test -- swarm-service.test.ts

# Test attention integration
npm test -- attention-integration.test.ts
```

### Integration Tests

```bash
# Test end-to-end flow with hooks
npm test -- e2e-hooks.test.ts

# Test swarm orchestration
npm test -- swarm-orchestration.test.ts

# Test GitHub service
npm test -- github-service.test.ts
```

### Performance Benchmarks

```bash
# Benchmark CLI spawn vs direct call
npm run bench -- cli-vs-direct

# Benchmark JS vs native attention
npm run bench -- attention

# Benchmark WASM vector search
npm run bench -- wasm-search
```

---

## Migration Checklist

### Phase 1 (Week 7) 🔥
- [ ] Create HookService with settings integration
- [ ] Wire HookService to MCP tool wrapper
- [ ] Add attention_weighted_search MCP tool
- [ ] Enhance memory_episode_recall with attention
- [ ] Replace 5 CLI spawns with direct service calls
- [ ] Create SwarmService facade
- [ ] Wire swarm tools to SwarmService
- [ ] Unit tests for HookService
- [ ] Unit tests for SwarmService
- [ ] Integration test: hooks + memory search

### Phase 2 (Week 8) ⚠️
- [ ] Add nightly_learn MCP tool
- [ ] Add consolidate_episodes MCP tool
- [ ] Add recall_create_certificate MCP tool
- [ ] Add recall_verify_certificate MCP tool
- [ ] Implement GitHubService.createPR()
- [ ] Implement GitHubService.listPRs()
- [ ] Implement GitHubService.reviewPR()
- [ ] Implement GitHubService.mergePR()
- [ ] Implement GitHubService.createIssue()
- [ ] Integration test: nightly learner
- [ ] Integration test: GitHub workflows

### Phase 3 (Week 9) 📋
- [ ] Enable native attention bindings in AttentionService
- [ ] Add GNN enhancement to routing pipeline
- [ ] Add WASMVectorSearch MCP tool
- [ ] Wire SONA trajectory recording to MCP
- [ ] Performance benchmark: native vs JS attention
- [ ] Performance benchmark: GNN-enhanced routing
- [ ] Integration test: attention mechanisms
- [ ] Integration test: GNN routing

### Phase 4 (Week 10) 💡
- [ ] Create built-in hook handlers (4 handlers)
- [ ] Add hooks_metrics MCP tool
- [ ] Add hooks_list MCP tool
- [ ] Add hooks_enable/disable MCP tools
- [ ] Complete remaining CLI-MCP parity tools
- [ ] End-to-end integration tests
- [ ] Performance profiling
- [ ] Documentation updates

---

## Success Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| **Controller MCP Exposure** | 5/19 (26%) | 16/19 (84%) | Count tools |
| **CLI Spawn Elimination** | 10 spawns | 0 spawns | Grep execSync |
| **Hook Trigger Coverage** | 0/10 (0%) | 8/10 (80%) | Hook metrics |
| **Native Binding Activation** | 0/5 (0%) | 5/5 (100%) | Runtime check |
| **Search Latency** | 150-300ms | 5-20ms | Benchmark |
| **Connection Health Score** | 28% (F) | 80% (B) | Matrix calculation |

---

**Next**: Review END-TO-END-FLOWS.md for verified integration paths.
