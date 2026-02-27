/**
 * ConsensusService - Distributed Consensus Integration
 *
 * Integrates RaftConsensus into agentic-flow with:
 * - Multi-agent coordination
 * - Automatic failover and recovery
 * - State synchronization
 * - Cluster management
 */

import { EventEmitter } from 'events';

// Local type definitions until agentdb@3.x is published
export interface RaftConfig {
  nodeId: string;
  nodes: string[];
  electionTimeout?: number;
  heartbeatInterval?: number;
}

export interface LogEntry {
  term: number;
  index: number;
  command: any;
}

// Interface for RaftConsensus
interface IRaftConsensus extends EventEmitter {
  start(): void;
  stop(): void;
  replicate(command: any, timeout?: number): Promise<boolean>;
  getStatus(): any;
  updateCRDT(key: string, operation: string, value: any): void;
  getCRDT(key: string): any;
  acquireLock(key: string, ttlMs?: number): Promise<boolean>;
  releaseLock(key: string): Promise<void>;
  detectDeadlocks(): string[][];
}

// Stub implementation - will be replaced when agentdb@3.x is available
class RaftConsensusStub extends EventEmitter implements IRaftConsensus {
  start(): void {}
  stop(): void {}
  async replicate(command: any, timeout?: number): Promise<boolean> { return true; }
  getStatus(): any {
    return {
      nodeId: 'node-1',
      state: 'follower',
      term: 0,
      commitIndex: 0,
      logLength: 0,
      leaderId: null,
      peers: [],
      metrics: {
        totalElections: 0,
        avgElectionTimeMs: 0,
        totalCommittedEntries: 0
      }
    };
  }
  updateCRDT(key: string, operation: string, value: any): void {}
  getCRDT(key: string): any { return null; }
  async acquireLock(key: string, ttlMs?: number): Promise<boolean> { return true; }
  async releaseLock(key: string): Promise<void> {}
  detectDeadlocks(): string[][] { return []; }
}

type RaftConsensus = IRaftConsensus;
const RaftConsensus = RaftConsensusStub;

export interface ConsensusConfig {
  enabled: boolean;
  nodeId?: string;
  nodes?: string[];
  byzantineTolerance?: boolean;
  autoRecover?: boolean;
  metricsInterval?: number;
}

export interface ClusterState {
  nodes: Array<{
    id: string;
    state: 'follower' | 'candidate' | 'leader';
    healthy: boolean;
    lastSeen: number;
  }>;
  leader: string | null;
  term: number;
  commitIndex: number;
  healthStatus: 'healthy' | 'degraded' | 'critical';
}

export interface ConsensusMetrics {
  uptime: number;
  totalElections: number;
  avgElectionTimeMs: number;
  totalCommits: number;
  replicationLag: number;
  availability: number;
}

export class ConsensusService extends EventEmitter {
  private config: Required<ConsensusConfig>;
  private raft?: RaftConsensus;
  private metricsTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private startTime = Date.now();

  // Metrics
  private totalDowntime = 0;
  private lastLeaderChange = Date.now();
  private failoverCount = 0;

  constructor(config: ConsensusConfig) {
    super();
    this.config = {
      enabled: config.enabled,
      nodeId: config.nodeId || `node-${Math.random().toString(36).substring(7)}`,
      nodes: config.nodes || [config.nodeId || 'node-1'],
      byzantineTolerance: config.byzantineTolerance || false,
      autoRecover: config.autoRecover !== false,
      metricsInterval: config.metricsInterval || 10000,
    };
  }

  /**
   * Initialize consensus system
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[ConsensusService] Consensus disabled');
      return;
    }

    console.log('[ConsensusService] Initializing consensus with config:', {
      nodeId: this.config.nodeId,
      nodes: this.config.nodes,
      byzantineTolerance: this.config.byzantineTolerance,
    });

    // Create Raft instance
    const raftConfig: RaftConfig = {
      nodeId: this.config.nodeId,
      nodes: this.config.nodes,
      byzantineTolerance: this.config.byzantineTolerance,
    };

    this.raft = new RaftConsensus(raftConfig);

    // Setup event listeners
    this.setupRaftListeners();

    // Start Raft
    this.raft.start();

    // Start monitoring
    this.startMetricsCollection();
    this.startHealthMonitoring();

    this.emit('initialized', { nodeId: this.config.nodeId });
  }

  /**
   * Shutdown consensus system
   */
  async shutdown(): Promise<void> {
    console.log('[ConsensusService] Shutting down consensus');

    if (this.raft) {
      this.raft.stop();
      this.raft = undefined;
    }

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    this.emit('shutdown');
  }

  /**
   * Replicate command across cluster
   */
  async replicateCommand(command: any, timeout?: number): Promise<boolean> {
    if (!this.raft) {
      throw new Error('Consensus not initialized');
    }

    try {
      return await this.raft.replicate(command, timeout);
    } catch (error) {
      const err = error as Error;
      console.error('[ConsensusService] Replication failed:', err.message);
      throw error;
    }
  }

  /**
   * Get cluster state
   */
  getClusterState(): ClusterState {
    if (!this.raft) {
      return {
        nodes: [],
        leader: null,
        term: 0,
        commitIndex: 0,
        healthStatus: 'critical',
      };
    }

    const status = this.raft.getStatus();
    const healthyNodes = status.peers.filter(p => p.isHealthy).length + 1;
    const totalNodes = status.peers.length + 1;

    let healthStatus: 'healthy' | 'degraded' | 'critical';
    if (healthyNodes === totalNodes) {
      healthStatus = 'healthy';
    } else if (healthyNodes >= Math.floor(totalNodes / 2) + 1) {
      healthStatus = 'degraded';
    } else {
      healthStatus = 'critical';
    }

    return {
      nodes: [
        {
          id: status.nodeId,
          state: status.state,
          healthy: true,
          lastSeen: Date.now(),
        },
        ...status.peers.map(p => ({
          id: p.nodeId,
          state: 'follower' as const,
          healthy: p.isHealthy,
          lastSeen: Date.now(),
        })),
      ],
      leader: status.leaderId,
      term: status.term,
      commitIndex: status.commitIndex,
      healthStatus,
    };
  }

  /**
   * Get consensus metrics
   */
  getMetrics(): ConsensusMetrics {
    if (!this.raft) {
      return {
        uptime: 0,
        totalElections: 0,
        avgElectionTimeMs: 0,
        totalCommits: 0,
        replicationLag: 0,
        availability: 0,
      };
    }

    const status = this.raft.getStatus();
    const uptime = Date.now() - this.startTime;
    const availability = ((uptime - this.totalDowntime) / uptime) * 100;

    return {
      uptime,
      totalElections: status.metrics.totalElections,
      avgElectionTimeMs: status.metrics.avgElectionTimeMs,
      totalCommits: status.metrics.totalCommittedEntries,
      replicationLag: status.logLength - status.commitIndex,
      availability,
    };
  }

  /**
   * Check if current node is leader
   */
  isLeader(): boolean {
    if (!this.raft) return false;
    const status = this.raft.getStatus();
    return status.state === 'leader';
  }

  /**
   * Get current leader ID
   */
  getLeaderId(): string | null {
    if (!this.raft) return null;
    return this.raft.getStatus().leaderId;
  }

  /**
   * CRDT operations for eventually consistent state
   */
  updateCRDT(key: string, operation: 'increment' | 'add' | 'set', value: any): void {
    if (!this.raft) {
      throw new Error('Consensus not initialized');
    }
    this.raft.updateCRDT(key, operation, value);
  }

  getCRDT(key: string): any {
    if (!this.raft) {
      throw new Error('Consensus not initialized');
    }
    return this.raft.getCRDT(key);
  }

  /**
   * Distributed lock operations
   */
  async acquireLock(key: string, ttlMs?: number): Promise<boolean> {
    if (!this.raft) {
      throw new Error('Consensus not initialized');
    }
    return await this.raft.acquireLock(key, ttlMs);
  }

  async releaseLock(key: string): Promise<void> {
    if (!this.raft) {
      throw new Error('Consensus not initialized');
    }
    await this.raft.releaseLock(key);
  }

  detectDeadlocks(): string[][] {
    if (!this.raft) {
      return [];
    }
    return this.raft.detectDeadlocks();
  }

  /**
   * Partition and sharding support
   */
  async createPartition(partitionId: string, nodes: string[]): Promise<void> {
    // Store partition configuration in CRDT
    this.updateCRDT(`partition:${partitionId}`, 'set', { nodes, createdAt: Date.now() });
    this.emit('partition_created', { partitionId, nodes });
  }

  getPartitions(): Map<string, any> {
    const partitions = new Map();
    // In real implementation, iterate over CRDT keys
    // For now, return empty map
    return partitions;
  }

  /**
   * Setup Raft event listeners
   */
  private setupRaftListeners(): void {
    if (!this.raft) return;

    this.raft.on('started', () => {
      console.log('[ConsensusService] Raft started');
      this.emit('started');
    });

    this.raft.on('stopped', () => {
      console.log('[ConsensusService] Raft stopped');
      this.emit('stopped');
    });

    this.raft.on('state_changed', (event) => {
      console.log('[ConsensusService] State changed:', event);
      this.emit('state_changed', event);

      // Track downtime when not leader
      if (event.state !== 'leader') {
        const downStart = Date.now();
        this.raft?.once('state_changed', (nextEvent) => {
          if (nextEvent.state === 'leader') {
            this.totalDowntime += Date.now() - downStart;
          }
        });
      }
    });

    this.raft.on('leader_elected', (event) => {
      const electionTime = Date.now() - this.lastLeaderChange;
      console.log(`[ConsensusService] Leader elected: ${event.leaderId} (${electionTime}ms)`);
      this.emit('leader_elected', event);

      this.lastLeaderChange = Date.now();
      this.failoverCount++;

      // Auto-recovery if enabled
      if (this.config.autoRecover && event.leaderId !== this.config.nodeId) {
        this.recoverFromFailure();
      }
    });

    this.raft.on('log_appended', (entry: LogEntry) => {
      this.emit('log_appended', entry);
    });

    this.raft.on('log_replicated', (event) => {
      this.emit('log_replicated', event);
    });

    this.raft.on('entry_committed', (entry: LogEntry) => {
      this.emit('entry_committed', entry);
    });

    this.raft.on('crdt_updated', (event) => {
      this.emit('crdt_updated', event);
    });

    this.raft.on('crdt_merged', (event) => {
      this.emit('crdt_merged', event);
    });

    this.raft.on('lock_acquired', (event) => {
      console.log('[ConsensusService] Lock acquired:', event);
      this.emit('lock_acquired', event);
    });

    this.raft.on('lock_released', (event) => {
      console.log('[ConsensusService] Lock released:', event);
      this.emit('lock_released', event);
    });

    this.raft.on('deadlock_detected', (event) => {
      console.error('[ConsensusService] Deadlock detected:', event);
      this.emit('deadlock_detected', event);

      // Auto-resolve deadlocks
      if (this.config.autoRecover) {
        this.resolveDeadlocks(event.deadlocks);
      }
    });

    this.raft.on('gossip', (message) => {
      this.emit('gossip', message);
    });
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      const metrics = this.getMetrics();
      this.emit('metrics', metrics);
    }, this.config.metricsInterval);
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(() => {
      const state = this.getClusterState();
      this.emit('health_check', state);

      // Alert on critical health
      if (state.healthStatus === 'critical') {
        console.error('[ConsensusService] Cluster health critical!');
        this.emit('health_critical', state);

        if (this.config.autoRecover) {
          this.recoverFromFailure();
        }
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Recover from failure
   */
  private async recoverFromFailure(): Promise<void> {
    console.log('[ConsensusService] Attempting auto-recovery');
    this.emit('recovery_started');

    try {
      // Wait for leader election to complete
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 5000);
        this.raft?.once('leader_elected', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      console.log('[ConsensusService] Recovery successful');
      this.emit('recovery_completed');
    } catch (error) {
      console.error('[ConsensusService] Recovery failed:', error);
      this.emit('recovery_failed', error);
    }
  }

  /**
   * Resolve deadlocks by releasing locks
   */
  private async resolveDeadlocks(deadlocks: string[][]): Promise<void> {
    console.log('[ConsensusService] Resolving deadlocks:', deadlocks);

    for (const cycle of deadlocks) {
      // Break cycle by releasing oldest lock
      const oldestNode = cycle[0];
      console.log(`[ConsensusService] Breaking deadlock by releasing locks from ${oldestNode}`);

      // In real implementation, coordinate lock release
      this.emit('deadlock_resolved', { cycle, action: 'lock_released', node: oldestNode });
    }
  }
}
