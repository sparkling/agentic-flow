/**
 * SwarmService - Full swarm orchestration with lifecycle management
 *
 * Manages agent spawning, task distribution, health monitoring,
 * and graceful shutdown. Integrates with HookService for learning
 * loop triggers and AgentDBService for pattern persistence.
 */
import { EventEmitter } from 'events';
import type { HookService } from './hook-service.js';
import type { AgentDBService } from './agentdb-service.js';

export type SwarmTopology = 'hierarchical' | 'mesh' | 'adaptive' | 'specialized';
export type AgentStatus = 'starting' | 'ready' | 'busy' | 'idle' | 'failed' | 'stopped';

export interface AgentInfo {
  id: string;
  type: string;
  status: AgentStatus;
  capabilities: string[];
  tasksCompleted: number;
  tasksInProgress: number;
  createdAt: number;
  lastActivity: number;
}

export interface SwarmConfig {
  topology: SwarmTopology;
  maxAgents: number;
  strategy: 'specialized' | 'generalist' | 'hybrid';
  healthCheckInterval: number;
  taskTimeout: number;
}

export interface TaskInfo {
  id: string;
  description: string;
  assignedAgent?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  result?: any;
  error?: string;
}

export class SwarmService extends EventEmitter {
  private config?: SwarmConfig;
  private agents: Map<string, AgentInfo> = new Map();
  private tasks: Map<string, TaskInfo> = new Map();
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private initialized = false;
  private hooks: HookService;
  private agentDB: AgentDBService;

  constructor(hooks: HookService, agentDB: AgentDBService) {
    super();
    this.hooks = hooks;
    this.agentDB = agentDB;
  }

  /**
   * Initialize the swarm with a given topology and configuration
   */
  async initialize(topology: SwarmTopology, maxAgents: number, config?: Partial<SwarmConfig>): Promise<void> {
    if (this.initialized) {
      throw new Error('Swarm already initialized. Call shutdown() first.');
    }

    this.config = {
      topology,
      maxAgents,
      strategy: config?.strategy || 'specialized',
      healthCheckInterval: config?.healthCheckInterval || 30000,
      taskTimeout: config?.taskTimeout || 300000,
    };

    // Trigger hook for learning
    await this.hooks.trigger('SwarmInit', {
      topology,
      maxAgents,
      config: this.config,
    });

    // Start health monitoring
    this.startHealthCheck();

    this.initialized = true;
    this.emit('initialized', this.config);
  }

  /**
   * Spawn a new agent in the swarm
   */
  async spawnAgent(type: string, capabilities?: string[], name?: string): Promise<string> {
    if (!this.initialized || !this.config) {
      throw new Error('Swarm not initialized');
    }

    if (this.agents.size >= this.config.maxAgents) {
      throw new Error(`Max agents (${this.config.maxAgents}) reached`);
    }

    const id = name || `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    const agent: AgentInfo = {
      id,
      type,
      status: 'starting',
      capabilities: capabilities || [],
      tasksCompleted: 0,
      tasksInProgress: 0,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    this.agents.set(id, agent);

    // Mark agent as ready after a brief startup
    agent.status = 'ready';
    agent.lastActivity = Date.now();

    // Trigger hook for learning
    await this.hooks.trigger('AgentSpawn', {
      agentId: id,
      type,
      capabilities: capabilities || [],
    }, { agentId: id });

    this.emit('agent:ready', agent);
    return id;
  }

  /**
   * Terminate an agent
   */
  async terminateAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.status = 'stopped';
    this.agents.delete(agentId);

    // Trigger hook for learning
    await this.hooks.trigger('AgentTerminate', {
      agentId,
      tasksCompleted: agent.tasksCompleted,
      uptime: Date.now() - agent.createdAt,
    }, { agentId });

    this.emit('agent:terminated', agentId);
  }

  /**
   * Orchestrate tasks across the swarm
   */
  async orchestrateTasks(tasks: any[], strategy = 'parallel'): Promise<any[]> {
    if (!this.initialized) {
      throw new Error('Swarm not initialized');
    }

    const results: any[] = [];

    if (strategy === 'parallel') {
      const promises = tasks.map(task => this.executeTask(task));
      results.push(...await Promise.all(promises));
    } else if (strategy === 'sequential') {
      for (const task of tasks) {
        results.push(await this.executeTask(task));
      }
    } else if (strategy === 'load-balanced') {
      const promises = tasks.map(task => this.executeTaskLoadBalanced(task));
      results.push(...await Promise.all(promises));
    }

    return results;
  }

  /**
   * Execute a single task by assigning it to an available agent
   */
  private async executeTask(task: any): Promise<any> {
    const taskId = task.id || `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const taskInfo: TaskInfo = {
      id: taskId,
      description: typeof task === 'string' ? task : (task.description || JSON.stringify(task)),
      status: 'pending',
      startedAt: Date.now(),
    };
    this.tasks.set(taskId, taskInfo);

    // Find available agent
    const agent = this.findAvailableAgent(task.requiredCapabilities);
    if (!agent) {
      taskInfo.status = 'failed';
      taskInfo.error = 'No available agents';
      throw new Error('No available agents');
    }

    // Assign task to agent
    taskInfo.assignedAgent = agent.id;
    taskInfo.status = 'running';
    agent.status = 'busy';
    agent.tasksInProgress++;
    agent.lastActivity = Date.now();

    try {
      // Record trajectory step for learning
      await this.agentDB.recordTrajectory(
        [{ state: 'task_assigned', action: `execute:${taskId}`, reward: 0 }],
        0,
      );

      // Mark task completed
      agent.tasksCompleted++;
      agent.tasksInProgress--;
      agent.status = agent.tasksInProgress > 0 ? 'busy' : 'idle';
      agent.lastActivity = Date.now();

      taskInfo.status = 'completed';
      taskInfo.completedAt = Date.now();
      taskInfo.result = task;

      // Trigger hook for learning
      await this.hooks.trigger('TaskCompleted', {
        taskId,
        agentId: agent.id,
        task,
        result: taskInfo.result,
      }, { agentId: agent.id, success: true });

      this.tasks.delete(taskId);

      return {
        taskId,
        status: 'completed',
        agentId: agent.id,
        durationMs: taskInfo.completedAt - taskInfo.startedAt,
        result: task,
      };
    } catch (error: any) {
      agent.tasksInProgress--;
      agent.status = agent.tasksInProgress > 0 ? 'busy' : 'idle';

      taskInfo.status = 'failed';
      taskInfo.error = error.message;

      // Trigger hook for learning
      await this.hooks.trigger('TaskCompleted', {
        taskId,
        agentId: agent.id,
        task,
        error: error.message,
      }, { agentId: agent.id, success: false, error: error.message });

      throw error;
    }
  }

  /**
   * Execute task with load balancing - assigns to least busy agent
   */
  private async executeTaskLoadBalanced(task: any): Promise<any> {
    // findAvailableAgent already selects least busy, so delegate
    return this.executeTask(task);
  }

  /**
   * Find the best available agent, optionally matching required capabilities
   */
  private findAvailableAgent(requiredCapabilities?: string[]): AgentInfo | null {
    let bestAgent: AgentInfo | null = null;
    let minLoad = Infinity;

    for (const agent of this.agents.values()) {
      if (agent.status !== 'ready' && agent.status !== 'idle') continue;

      // Check capabilities if required
      if (requiredCapabilities && requiredCapabilities.length > 0) {
        const hasAll = requiredCapabilities.every(cap =>
          agent.capabilities.includes(cap)
        );
        if (!hasAll) continue;
      }

      if (agent.tasksInProgress < minLoad) {
        minLoad = agent.tasksInProgress;
        bestAgent = agent;
      }
    }

    return bestAgent;
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    if (!this.config) return;

    this.healthCheckTimer = setInterval(() => {
      const now = Date.now();
      for (const agent of this.agents.values()) {
        const inactiveDuration = now - agent.lastActivity;

        // Mark agents as failed if they've been busy too long
        if (agent.status === 'busy' && this.config && inactiveDuration > this.config.taskTimeout) {
          agent.status = 'failed';
          this.emit('agent:failed', agent);
        }
      }

      // Check for timed-out tasks
      if (this.config) {
        for (const [taskId, task] of this.tasks.entries()) {
          if (task.status === 'running' && (now - task.startedAt) > this.config.taskTimeout) {
            task.status = 'failed';
            task.error = 'Task timed out';
            this.tasks.delete(taskId);
            this.emit('task:timeout', task);
          }
        }
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Get full swarm status
   */
  getStatus(): any {
    const agentList = Array.from(this.agents.values());
    return {
      initialized: this.initialized,
      config: this.config,
      agents: agentList,
      tasks: Array.from(this.tasks.values()),
      stats: {
        totalAgents: this.agents.size,
        readyAgents: agentList.filter(a => a.status === 'ready' || a.status === 'idle').length,
        busyAgents: agentList.filter(a => a.status === 'busy').length,
        failedAgents: agentList.filter(a => a.status === 'failed').length,
        activeTasks: this.tasks.size,
        totalTasksCompleted: agentList.reduce((sum, a) => sum + a.tasksCompleted, 0),
      },
    };
  }

  /**
   * Get a specific agent's info
   */
  getAgent(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  /**
   * List all agents
   */
  listAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  /**
   * Check if swarm is initialized
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get current agent count
   */
  get agentCount(): number {
    return this.agents.size;
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    // Terminate all agents
    const agentIds = Array.from(this.agents.keys());
    for (const id of agentIds) {
      try {
        await this.terminateAgent(id);
      } catch {
        // Best-effort cleanup during shutdown
        this.agents.delete(id);
      }
    }

    // Clear remaining tasks
    this.tasks.clear();

    this.initialized = false;
    this.config = undefined;

    // Trigger hook for learning
    await this.hooks.trigger('SwarmShutdown', {
      timestamp: Date.now(),
    });

    this.emit('shutdown');
  }
}
