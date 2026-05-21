/**
 * ConsensusService — behavioral unit tests
 *
 * The service is fully self-contained (no external agentdb import).
 * It orchestrates a RaftConsensusStub (no-op) internally, so we exercise:
 *   - initialization and shutdown lifecycle
 *   - leader-status and cluster-state derivation from stub status
 *   - metrics computation (uptime, availability, replication lag)
 *   - timer-driven intervals (metrics collection, health checks)
 *   - event re-emission from the internal raft stub to the service
 *   - CRDT delegation, lock delegation, deadlock detection
 *   - partition helpers
 *   - error paths (uninitialized guard)
 *   - cluster health status derivation (healthy / degraded / critical)
 *   - auto-recovery and deadlock-resolution code paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ConsensusService,
  type RaftConfig,
  type ConsensusConfig,
} from '../../src/services/consensus-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a ConsensusService with sensible defaults.
 * `overrides` are shallow-merged over the base config.
 */
function makeService(overrides: Partial<ConsensusConfig> = {}): ConsensusService {
  return new ConsensusService({
    enabled: true,
    nodeId: 'node-1',
    nodes: ['node-1'],
    metricsInterval: 10000, // 10 s — driven by fake timers
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ConsensusService', () => {
  let svc: ConsensusService;

  beforeEach(() => {
    vi.useFakeTimers();
    svc = makeService();
  });

  afterEach(async () => {
    // Always shut down any started service so timers are cleared
    await svc.shutdown();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. Lifecycle — initialize + shutdown
  // -------------------------------------------------------------------------

  describe('initialize()', () => {
    it('emits "initialized" with the configured nodeId after init', async () => {
      const events: any[] = [];
      svc.on('initialized', (e) => events.push(e));

      await svc.initialize();

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ nodeId: 'node-1' });
    });

    it('does NOT emit "initialized" when enabled=false', async () => {
      const disabledSvc = makeService({ enabled: false });
      const events: any[] = [];
      disabledSvc.on('initialized', (e) => events.push(e));

      await disabledSvc.initialize();
      await disabledSvc.shutdown();

      expect(events).toHaveLength(0);
    });

    it('calling initialize twice does not throw', async () => {
      await svc.initialize();
      await expect(svc.initialize()).resolves.toBeUndefined();
    });

    it('emits "shutdown" event on shutdown', async () => {
      await svc.initialize();
      const events: any[] = [];
      svc.on('shutdown', () => events.push(true));

      await svc.shutdown();

      expect(events).toHaveLength(1);
    });

    it('shutdown when not yet initialized does not throw', async () => {
      const fresh = makeService();
      await expect(fresh.shutdown()).resolves.toBeUndefined();
      // no real timers to clean up — shutdown is safe
    });

    it('shutdown clears the metricsTimer so no further metrics events fire', async () => {
      await svc.initialize();

      const metricsEvents: any[] = [];
      svc.on('metrics', (m) => metricsEvents.push(m));

      // Advance past one metrics tick
      vi.advanceTimersByTime(10001);
      expect(metricsEvents).toHaveLength(1);

      await svc.shutdown();

      // After shutdown, no more ticks should fire
      const countAfterShutdown = metricsEvents.length;
      vi.advanceTimersByTime(50000);
      expect(metricsEvents).toHaveLength(countAfterShutdown);
    });

    it('shutdown clears the healthCheckTimer so no further health events fire', async () => {
      await svc.initialize();

      const healthEvents: any[] = [];
      svc.on('health_check', (s) => healthEvents.push(s));

      vi.advanceTimersByTime(5001);
      expect(healthEvents).toHaveLength(1);

      await svc.shutdown();
      const countAfterShutdown = healthEvents.length;

      vi.advanceTimersByTime(50000);
      expect(healthEvents).toHaveLength(countAfterShutdown);
    });
  });

  // -------------------------------------------------------------------------
  // 2. getClusterState() — before and after init
  // -------------------------------------------------------------------------

  describe('getClusterState()', () => {
    it('returns critical/empty state when not initialized', () => {
      const state = svc.getClusterState();

      expect(state.nodes).toEqual([]);
      expect(state.leader).toBeNull();
      expect(state.term).toBe(0);
      expect(state.commitIndex).toBe(0);
      expect(state.healthStatus).toBe('critical');
    });

    it('returns a node entry for self after initialization (single-node cluster)', async () => {
      await svc.initialize();
      const state = svc.getClusterState();

      expect(state.nodes).toHaveLength(1); // self; stub returns peers:[]
      expect(state.nodes[0].id).toBe('node-1');
      expect(state.nodes[0].healthy).toBe(true);
      // state from stub is 'follower'
      expect(state.nodes[0].state).toBe('follower');
    });

    it('reports health as "healthy" when all nodes are healthy (single-node)', async () => {
      await svc.initialize();
      const state = svc.getClusterState();

      // 1 healthy out of 1 total → all healthy
      expect(state.healthStatus).toBe('healthy');
    });

    it('includes stub term and commitIndex in cluster state', async () => {
      await svc.initialize();
      const state = svc.getClusterState();

      expect(typeof state.term).toBe('number');
      expect(typeof state.commitIndex).toBe('number');
    });

    it('leader comes from stub status.leaderId', async () => {
      await svc.initialize();
      const state = svc.getClusterState();

      // Stub returns leaderId: null
      expect(state.leader).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Health status derivation — degraded / critical thresholds
  //    These tests override the stub's getStatus() by replacing it post-init.
  // -------------------------------------------------------------------------

  describe('getClusterState() health thresholds', () => {
    it('is "healthy" when all peers are healthy', async () => {
      await svc.initialize();

      // Replace internal raft stub's getStatus
      (svc as any).raft.getStatus = vi.fn().mockReturnValue({
        nodeId: 'node-1',
        state: 'leader',
        term: 2,
        commitIndex: 5,
        logLength: 5,
        leaderId: 'node-1',
        peers: [
          { nodeId: 'node-2', isHealthy: true },
          { nodeId: 'node-3', isHealthy: true },
        ],
        metrics: { totalElections: 1, avgElectionTimeMs: 50, totalCommittedEntries: 5 },
      });

      const state = svc.getClusterState();
      // 3 healthy / 3 total → healthy
      expect(state.healthStatus).toBe('healthy');
      expect(state.nodes).toHaveLength(3);
    });

    it('is "degraded" when majority healthy but not all', async () => {
      await svc.initialize();

      (svc as any).raft.getStatus = vi.fn().mockReturnValue({
        nodeId: 'node-1',
        state: 'leader',
        term: 3,
        commitIndex: 10,
        logLength: 12,
        leaderId: 'node-1',
        peers: [
          { nodeId: 'node-2', isHealthy: true },
          { nodeId: 'node-3', isHealthy: false },
          { nodeId: 'node-4', isHealthy: true },
        ],
        metrics: { totalElections: 2, avgElectionTimeMs: 80, totalCommittedEntries: 10 },
      });

      const state = svc.getClusterState();
      // 3 healthy (self + node-2 + node-4) / 4 total → majority (3 >= floor(4/2)+1=3) → degraded
      expect(state.healthStatus).toBe('degraded');
    });

    it('is "critical" when fewer than quorum are healthy', async () => {
      await svc.initialize();

      (svc as any).raft.getStatus = vi.fn().mockReturnValue({
        nodeId: 'node-1',
        state: 'follower',
        term: 5,
        commitIndex: 2,
        logLength: 5,
        leaderId: null,
        peers: [
          { nodeId: 'node-2', isHealthy: false },
          { nodeId: 'node-3', isHealthy: false },
          { nodeId: 'node-4', isHealthy: false },
          { nodeId: 'node-5', isHealthy: false },
        ],
        metrics: { totalElections: 3, avgElectionTimeMs: 150, totalCommittedEntries: 2 },
      });

      const state = svc.getClusterState();
      // 1 healthy (self) / 5 total → quorum is 3; 1 < 3 → critical
      expect(state.healthStatus).toBe('critical');
    });
  });

  // -------------------------------------------------------------------------
  // 4. isLeader() and getLeaderId()
  // -------------------------------------------------------------------------

  describe('isLeader() / getLeaderId()', () => {
    it('isLeader() returns false when not initialized', () => {
      expect(svc.isLeader()).toBe(false);
    });

    it('getLeaderId() returns null when not initialized', () => {
      expect(svc.getLeaderId()).toBeNull();
    });

    it('isLeader() returns false for follower state (stub default)', async () => {
      await svc.initialize();
      expect(svc.isLeader()).toBe(false);
    });

    it('isLeader() returns true when stub reports leader state', async () => {
      await svc.initialize();
      (svc as any).raft.getStatus = vi.fn().mockReturnValue({
        nodeId: 'node-1',
        state: 'leader',
        term: 1,
        commitIndex: 0,
        logLength: 0,
        leaderId: 'node-1',
        peers: [],
        metrics: { totalElections: 1, avgElectionTimeMs: 30, totalCommittedEntries: 0 },
      });

      expect(svc.isLeader()).toBe(true);
    });

    it('getLeaderId() reflects stub leaderId', async () => {
      await svc.initialize();
      (svc as any).raft.getStatus = vi.fn().mockReturnValue({
        nodeId: 'node-1',
        state: 'follower',
        term: 2,
        commitIndex: 3,
        logLength: 3,
        leaderId: 'node-2',
        peers: [],
        metrics: { totalElections: 1, avgElectionTimeMs: 40, totalCommittedEntries: 3 },
      });

      expect(svc.getLeaderId()).toBe('node-2');
    });
  });

  // -------------------------------------------------------------------------
  // 5. getMetrics()
  // -------------------------------------------------------------------------

  describe('getMetrics()', () => {
    it('returns zero-metrics when not initialized', () => {
      const m = svc.getMetrics();

      expect(m.uptime).toBe(0);
      expect(m.totalElections).toBe(0);
      expect(m.avgElectionTimeMs).toBe(0);
      expect(m.totalCommits).toBe(0);
      expect(m.replicationLag).toBe(0);
      expect(m.availability).toBe(0);
    });

    it('computes uptime as elapsed time since instantiation', async () => {
      await svc.initialize();

      vi.advanceTimersByTime(5000);
      const m = svc.getMetrics();

      // uptime = Date.now() - startTime; we advanced 5000ms
      expect(m.uptime).toBeGreaterThanOrEqual(5000);
    });

    it('maps totalCommittedEntries to totalCommits', async () => {
      await svc.initialize();
      (svc as any).raft.getStatus = vi.fn().mockReturnValue({
        nodeId: 'node-1',
        state: 'follower',
        term: 1,
        commitIndex: 7,
        logLength: 9,
        leaderId: null,
        peers: [],
        metrics: { totalElections: 3, avgElectionTimeMs: 55, totalCommittedEntries: 7 },
      });

      const m = svc.getMetrics();

      expect(m.totalElections).toBe(3);
      expect(m.avgElectionTimeMs).toBe(55);
      expect(m.totalCommits).toBe(7);
    });

    it('computes replicationLag as logLength minus commitIndex', async () => {
      await svc.initialize();
      (svc as any).raft.getStatus = vi.fn().mockReturnValue({
        nodeId: 'node-1',
        state: 'follower',
        term: 1,
        commitIndex: 6,
        logLength: 10,
        leaderId: null,
        peers: [],
        metrics: { totalElections: 1, avgElectionTimeMs: 30, totalCommittedEntries: 6 },
      });

      const m = svc.getMetrics();

      // replicationLag = 10 - 6 = 4
      expect(m.replicationLag).toBe(4);
    });

    it('availability is 100% when there has been no downtime', async () => {
      await svc.initialize();

      vi.advanceTimersByTime(1000);
      const m = svc.getMetrics();

      // totalDowntime starts at 0; availability = (uptime - 0) / uptime * 100
      expect(m.availability).toBeCloseTo(100, 1);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Timer-driven events — metrics and health check intervals
  // -------------------------------------------------------------------------

  describe('timer-driven intervals', () => {
    it('emits "metrics" event on each metricsInterval tick', async () => {
      const metricsEvents: any[] = [];
      svc.on('metrics', (m) => metricsEvents.push(m));

      await svc.initialize();

      vi.advanceTimersByTime(10001);
      expect(metricsEvents).toHaveLength(1);

      vi.advanceTimersByTime(10000);
      expect(metricsEvents).toHaveLength(2);
    });

    it('metrics events carry ConsensusMetrics shape', async () => {
      let captured: any = null;
      svc.on('metrics', (m) => { captured = m; });

      await svc.initialize();
      vi.advanceTimersByTime(10001);

      expect(captured).not.toBeNull();
      expect(typeof captured.uptime).toBe('number');
      expect(typeof captured.totalElections).toBe('number');
      expect(typeof captured.totalCommits).toBe('number');
      expect(typeof captured.availability).toBe('number');
    });

    it('emits "health_check" every 5 seconds', async () => {
      const healthEvents: any[] = [];
      svc.on('health_check', (s) => healthEvents.push(s));

      await svc.initialize();

      vi.advanceTimersByTime(5001);
      expect(healthEvents).toHaveLength(1);

      vi.advanceTimersByTime(5000);
      expect(healthEvents).toHaveLength(2);
    });

    it('health_check events include healthStatus field', async () => {
      let captured: any = null;
      svc.on('health_check', (s) => { captured = s; });

      await svc.initialize();
      vi.advanceTimersByTime(5001);

      expect(captured).not.toBeNull();
      expect(['healthy', 'degraded', 'critical']).toContain(captured.healthStatus);
    });

    it('emits "health_critical" when healthStatus is critical', async () => {
      const criticalEvents: any[] = [];
      svc.on('health_critical', (s) => criticalEvents.push(s));

      await svc.initialize();

      // Force critical state
      (svc as any).raft.getStatus = vi.fn().mockReturnValue({
        nodeId: 'node-1',
        state: 'follower',
        term: 1,
        commitIndex: 0,
        logLength: 0,
        leaderId: null,
        peers: [
          { nodeId: 'node-2', isHealthy: false },
          { nodeId: 'node-3', isHealthy: false },
          { nodeId: 'node-4', isHealthy: false },
          { nodeId: 'node-5', isHealthy: false },
        ],
        metrics: { totalElections: 0, avgElectionTimeMs: 0, totalCommittedEntries: 0 },
      });

      vi.advanceTimersByTime(5001);

      expect(criticalEvents).toHaveLength(1);
      expect(criticalEvents[0].healthStatus).toBe('critical');
    });

    it('custom metricsInterval is respected', async () => {
      const shortSvc = makeService({ metricsInterval: 2000 });
      const events: any[] = [];
      shortSvc.on('metrics', (m) => events.push(m));

      await shortSvc.initialize();

      vi.advanceTimersByTime(2001);
      expect(events).toHaveLength(1);

      await shortSvc.shutdown();
    });
  });

  // -------------------------------------------------------------------------
  // 7. replicateCommand()
  // -------------------------------------------------------------------------

  describe('replicateCommand()', () => {
    it('throws "Consensus not initialized" when raft is absent', async () => {
      await expect(svc.replicateCommand({ type: 'noop' })).rejects.toThrow(
        'Consensus not initialized'
      );
    });

    it('returns true from stub replicate (default stub behaviour)', async () => {
      await svc.initialize();
      const result = await svc.replicateCommand({ type: 'test-cmd' });
      expect(result).toBe(true);
    });

    it('propagates errors thrown by raft.replicate()', async () => {
      await svc.initialize();
      (svc as any).raft.replicate = vi.fn().mockRejectedValue(new Error('leader stepped down'));

      await expect(svc.replicateCommand({ type: 'risky' })).rejects.toThrow(
        'leader stepped down'
      );
    });

    it('passes optional timeout to raft.replicate()', async () => {
      await svc.initialize();
      const spy = vi.spyOn((svc as any).raft, 'replicate');

      await svc.replicateCommand({ type: 'timed' }, 3000);

      expect(spy).toHaveBeenCalledWith({ type: 'timed' }, 3000);
    });
  });

  // -------------------------------------------------------------------------
  // 8. CRDT operations
  // -------------------------------------------------------------------------

  describe('updateCRDT() / getCRDT()', () => {
    it('updateCRDT throws "Consensus not initialized" when raft absent', () => {
      expect(() => svc.updateCRDT('key', 'set', 42)).toThrow('Consensus not initialized');
    });

    it('getCRDT throws "Consensus not initialized" when raft absent', () => {
      expect(() => svc.getCRDT('key')).toThrow('Consensus not initialized');
    });

    it('updateCRDT delegates to raft.updateCRDT()', async () => {
      await svc.initialize();
      const spy = vi.spyOn((svc as any).raft, 'updateCRDT');

      svc.updateCRDT('counter', 'increment', 1);

      expect(spy).toHaveBeenCalledWith('counter', 'increment', 1);
    });

    it('getCRDT delegates to raft.getCRDT() and returns its value', async () => {
      await svc.initialize();
      (svc as any).raft.getCRDT = vi.fn().mockReturnValue({ count: 5 });

      const result = svc.getCRDT('counter');

      expect(result).toEqual({ count: 5 });
    });

    it('all CRDT operation types are accepted without throw', async () => {
      await svc.initialize();
      const ops: Array<'increment' | 'add' | 'set'> = ['increment', 'add', 'set'];

      for (const op of ops) {
        expect(() => svc.updateCRDT('k', op, 1)).not.toThrow();
      }
    });
  });

  // -------------------------------------------------------------------------
  // 9. Distributed locks
  // -------------------------------------------------------------------------

  describe('acquireLock() / releaseLock()', () => {
    it('acquireLock throws when not initialized', async () => {
      await expect(svc.acquireLock('resource-1')).rejects.toThrow('Consensus not initialized');
    });

    it('releaseLock throws when not initialized', async () => {
      await expect(svc.releaseLock('resource-1')).rejects.toThrow('Consensus not initialized');
    });

    it('acquireLock returns true (stub behaviour)', async () => {
      await svc.initialize();
      const result = await svc.acquireLock('resource-1', 5000);
      expect(result).toBe(true);
    });

    it('releaseLock resolves without error', async () => {
      await svc.initialize();
      await expect(svc.releaseLock('resource-1')).resolves.toBeUndefined();
    });

    it('acquireLock delegates ttlMs to raft.acquireLock()', async () => {
      await svc.initialize();
      const spy = vi.spyOn((svc as any).raft, 'acquireLock');

      await svc.acquireLock('db-write', 10000);

      expect(spy).toHaveBeenCalledWith('db-write', 10000);
    });

    it('releaseLock delegates key to raft.releaseLock()', async () => {
      await svc.initialize();
      const spy = vi.spyOn((svc as any).raft, 'releaseLock');

      await svc.releaseLock('db-write');

      expect(spy).toHaveBeenCalledWith('db-write');
    });
  });

  // -------------------------------------------------------------------------
  // 10. Deadlock detection
  // -------------------------------------------------------------------------

  describe('detectDeadlocks()', () => {
    it('returns empty array when not initialized', () => {
      expect(svc.detectDeadlocks()).toEqual([]);
    });

    it('returns empty array from stub (no deadlocks)', async () => {
      await svc.initialize();
      expect(svc.detectDeadlocks()).toEqual([]);
    });

    it('returns deadlock cycles from raft.detectDeadlocks()', async () => {
      await svc.initialize();
      const cycles = [['node-1', 'node-2'], ['node-3', 'node-4', 'node-1']];
      (svc as any).raft.detectDeadlocks = vi.fn().mockReturnValue(cycles);

      expect(svc.detectDeadlocks()).toEqual(cycles);
    });
  });

  // -------------------------------------------------------------------------
  // 11. Partition helpers
  // -------------------------------------------------------------------------

  describe('createPartition() / getPartitions()', () => {
    it('createPartition throws when raft not initialized (via updateCRDT guard)', async () => {
      // createPartition calls updateCRDT which guards against missing raft
      await expect(svc.createPartition('p1', ['node-1', 'node-2'])).rejects.toThrow(
        'Consensus not initialized'
      );
    });

    it('createPartition emits "partition_created" event', async () => {
      await svc.initialize();
      const events: any[] = [];
      svc.on('partition_created', (e) => events.push(e));

      await svc.createPartition('shard-0', ['node-1', 'node-2']);

      expect(events).toHaveLength(1);
      expect(events[0].partitionId).toBe('shard-0');
      expect(events[0].nodes).toEqual(['node-1', 'node-2']);
    });

    it('createPartition stores partition in CRDT with "set" operation', async () => {
      await svc.initialize();
      const spy = vi.spyOn((svc as any).raft, 'updateCRDT');

      await svc.createPartition('shard-1', ['node-3', 'node-4']);

      expect(spy).toHaveBeenCalledWith(
        'partition:shard-1',
        'set',
        expect.objectContaining({ nodes: ['node-3', 'node-4'] })
      );
    });

    it('getPartitions returns an empty Map (stub behaviour)', async () => {
      await svc.initialize();
      const partitions = svc.getPartitions();

      expect(partitions).toBeInstanceOf(Map);
      expect(partitions.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 12. Event re-emission from internal raft stub
  // -------------------------------------------------------------------------

  describe('event forwarding from internal raft', () => {
    it('forwards "started" event from raft', async () => {
      const events: any[] = [];
      svc.on('started', () => events.push(true));

      await svc.initialize();
      (svc as any).raft.emit('started');

      expect(events).toHaveLength(1);
    });

    it('forwards "stopped" event from raft', async () => {
      const events: any[] = [];
      svc.on('stopped', () => events.push(true));

      await svc.initialize();
      (svc as any).raft.emit('stopped');

      expect(events).toHaveLength(1);
    });

    it('forwards "state_changed" event from raft', async () => {
      await svc.initialize();
      const events: any[] = [];
      svc.on('state_changed', (e) => events.push(e));

      (svc as any).raft.emit('state_changed', { state: 'candidate', term: 2 });

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ state: 'candidate', term: 2 });
    });

    it('forwards "leader_elected" event from raft', async () => {
      await svc.initialize();
      const events: any[] = [];
      svc.on('leader_elected', (e) => events.push(e));

      (svc as any).raft.emit('leader_elected', { leaderId: 'node-2', term: 3 });

      expect(events).toHaveLength(1);
      expect(events[0].leaderId).toBe('node-2');
    });

    it('forwards "log_appended" entry from raft', async () => {
      await svc.initialize();
      const entries: any[] = [];
      svc.on('log_appended', (e) => entries.push(e));

      const entry = { term: 1, index: 1, command: { op: 'write' } };
      (svc as any).raft.emit('log_appended', entry);

      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(entry);
    });

    it('forwards "log_replicated" event from raft', async () => {
      await svc.initialize();
      const events: any[] = [];
      svc.on('log_replicated', (e) => events.push(e));

      (svc as any).raft.emit('log_replicated', { index: 1, term: 1 });

      expect(events).toHaveLength(1);
    });

    it('forwards "entry_committed" entry from raft', async () => {
      await svc.initialize();
      const entries: any[] = [];
      svc.on('entry_committed', (e) => entries.push(e));

      const entry = { term: 2, index: 5, command: { key: 'x', value: 42 } };
      (svc as any).raft.emit('entry_committed', entry);

      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(entry);
    });

    it('forwards "crdt_updated" event from raft', async () => {
      await svc.initialize();
      const events: any[] = [];
      svc.on('crdt_updated', (e) => events.push(e));

      (svc as any).raft.emit('crdt_updated', { key: 'hits', op: 'increment', value: 1 });

      expect(events).toHaveLength(1);
    });

    it('forwards "crdt_merged" event from raft', async () => {
      await svc.initialize();
      const events: any[] = [];
      svc.on('crdt_merged', (e) => events.push(e));

      (svc as any).raft.emit('crdt_merged', { key: 'state' });

      expect(events).toHaveLength(1);
    });

    it('forwards "lock_acquired" event from raft', async () => {
      await svc.initialize();
      const events: any[] = [];
      svc.on('lock_acquired', (e) => events.push(e));

      (svc as any).raft.emit('lock_acquired', { key: 'db-write' });

      expect(events).toHaveLength(1);
    });

    it('forwards "lock_released" event from raft', async () => {
      await svc.initialize();
      const events: any[] = [];
      svc.on('lock_released', (e) => events.push(e));

      (svc as any).raft.emit('lock_released', { key: 'db-write' });

      expect(events).toHaveLength(1);
    });

    it('forwards "gossip" event from raft', async () => {
      await svc.initialize();
      const events: any[] = [];
      svc.on('gossip', (m) => events.push(m));

      (svc as any).raft.emit('gossip', { from: 'node-2', payload: {} });

      expect(events).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 13. Deadlock auto-resolution via event
  // -------------------------------------------------------------------------

  describe('deadlock_detected auto-resolution', () => {
    it('emits "deadlock_detected" when raft fires the event', async () => {
      await svc.initialize();
      const events: any[] = [];
      svc.on('deadlock_detected', (e) => events.push(e));

      const payload = { deadlocks: [['node-1', 'node-2']] };
      (svc as any).raft.emit('deadlock_detected', payload);

      expect(events).toHaveLength(1);
      expect(events[0].deadlocks).toEqual([['node-1', 'node-2']]);
    });

    it('emits "deadlock_resolved" for each cycle when autoRecover=true', async () => {
      // Default makeService has autoRecover: true (autoRecover !== false → true)
      await svc.initialize();
      const resolvedEvents: any[] = [];
      svc.on('deadlock_resolved', (e) => resolvedEvents.push(e));

      const cycles = [['node-1', 'node-2'], ['node-3', 'node-4', 'node-5']];
      (svc as any).raft.emit('deadlock_detected', { deadlocks: cycles });

      // resolveDeadlocks is async but emits synchronously in its loop
      // Give the microtask queue one tick
      await Promise.resolve();

      expect(resolvedEvents).toHaveLength(2);
      expect(resolvedEvents[0]).toMatchObject({
        cycle: ['node-1', 'node-2'],
        action: 'lock_released',
        node: 'node-1',
      });
      expect(resolvedEvents[1]).toMatchObject({
        cycle: ['node-3', 'node-4', 'node-5'],
        action: 'lock_released',
        node: 'node-3',
      });
    });

    it('does NOT emit "deadlock_resolved" when autoRecover=false', async () => {
      const noRecoverSvc = makeService({ autoRecover: false });
      await noRecoverSvc.initialize();
      const resolvedEvents: any[] = [];
      noRecoverSvc.on('deadlock_resolved', (e) => resolvedEvents.push(e));

      (noRecoverSvc as any).raft.emit('deadlock_detected', { deadlocks: [['node-1', 'node-2']] });

      await Promise.resolve();
      expect(resolvedEvents).toHaveLength(0);

      await noRecoverSvc.shutdown();
    });
  });

  // -------------------------------------------------------------------------
  // 14. Auto-recovery via leader_elected
  // -------------------------------------------------------------------------

  describe('auto-recovery on leader_elected', () => {
    it('emits "recovery_started" when a different node is elected leader and autoRecover=true', async () => {
      // node-1 is our nodeId; when node-2 wins, autoRecover triggers
      await svc.initialize();
      const events: any[] = [];
      svc.on('recovery_started', () => events.push(true));

      (svc as any).raft.emit('leader_elected', { leaderId: 'node-2', term: 2 });

      expect(events).toHaveLength(1);
    });

    it('does NOT emit "recovery_started" when this node wins the election', async () => {
      await svc.initialize();
      const events: any[] = [];
      svc.on('recovery_started', () => events.push(true));

      (svc as any).raft.emit('leader_elected', { leaderId: 'node-1', term: 1 });

      expect(events).toHaveLength(0);
    });

    it('increments failoverCount on each leader_elected event', async () => {
      await svc.initialize();

      // Initial value is 0
      expect((svc as any).failoverCount).toBe(0);

      (svc as any).raft.emit('leader_elected', { leaderId: 'node-1', term: 1 });
      expect((svc as any).failoverCount).toBe(1);

      (svc as any).raft.emit('leader_elected', { leaderId: 'node-2', term: 2 });
      expect((svc as any).failoverCount).toBe(2);
    });

    it('emits "recovery_completed" when raft fires leader_elected during recovery', async () => {
      await svc.initialize();
      const events: any[] = [];
      svc.on('recovery_completed', () => events.push(true));

      // Trigger recovery (node-2 elected, autoRecover=true)
      (svc as any).raft.emit('leader_elected', { leaderId: 'node-2', term: 2 });

      // Fire leader_elected again to satisfy the inner once() listener
      (svc as any).raft.emit('leader_elected', { leaderId: 'node-1', term: 3 });

      // Flush microtasks/promises
      await Promise.resolve();
      await Promise.resolve();

      expect(events).toHaveLength(1);
    });

    it('emits "recovery_completed" via timeout when no leader elected within 5s', async () => {
      await svc.initialize();
      const events: any[] = [];
      svc.on('recovery_completed', () => events.push(true));

      // Trigger recovery
      (svc as any).raft.emit('leader_elected', { leaderId: 'node-2', term: 2 });

      // Advance past the 5-second recovery timeout
      vi.advanceTimersByTime(5001);
      await Promise.resolve();
      await Promise.resolve();

      expect(events).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 15. Config defaults and nodeId generation
  // -------------------------------------------------------------------------

  describe('ConsensusConfig defaults', () => {
    it('auto-generates nodeId when not provided', () => {
      const svcNoId = new ConsensusService({ enabled: true });
      expect((svcNoId as any).config.nodeId).toMatch(/^node-[a-z0-9]+$/);
    });

    it('uses provided nodeId', () => {
      const svcWithId = new ConsensusService({ enabled: true, nodeId: 'my-node' });
      expect((svcWithId as any).config.nodeId).toBe('my-node');
    });

    it('defaults autoRecover to true when not specified', () => {
      const svcDefault = new ConsensusService({ enabled: true });
      expect((svcDefault as any).config.autoRecover).toBe(true);
    });

    it('honours autoRecover: false', () => {
      const svcNoRecover = new ConsensusService({ enabled: true, autoRecover: false });
      expect((svcNoRecover as any).config.autoRecover).toBe(false);
    });

    it('defaults byzantineTolerance to false', () => {
      const svcDefault = new ConsensusService({ enabled: true });
      expect((svcDefault as any).config.byzantineTolerance).toBe(false);
    });

    it('defaults metricsInterval to 10000ms', () => {
      const svcDefault = new ConsensusService({ enabled: true });
      expect((svcDefault as any).config.metricsInterval).toBe(10000);
    });

    it('seeds nodes array with single nodeId when nodes not provided', () => {
      const svcNoNodes = new ConsensusService({ enabled: true, nodeId: 'solo' });
      expect((svcNoNodes as any).config.nodes).toEqual(['solo']);
    });
  });

  // -------------------------------------------------------------------------
  // 16. Edge cases / error paths
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('replicateCommand with empty command object succeeds', async () => {
      await svc.initialize();
      const result = await svc.replicateCommand({});
      expect(result).toBe(true);
    });

    it('replicateCommand with null command succeeds (stub accepts any)', async () => {
      await svc.initialize();
      const result = await svc.replicateCommand(null);
      expect(result).toBe(true);
    });

    it('multiple shutdowns are idempotent', async () => {
      await svc.initialize();
      await svc.shutdown();
      await expect(svc.shutdown()).resolves.toBeUndefined();
    });

    it('getClusterState after shutdown returns critical state', async () => {
      await svc.initialize();
      await svc.shutdown();

      const state = svc.getClusterState();
      expect(state.healthStatus).toBe('critical');
    });

    it('isLeader() after shutdown returns false', async () => {
      await svc.initialize();
      await svc.shutdown();
      expect(svc.isLeader()).toBe(false);
    });

    it('getLeaderId() after shutdown returns null', async () => {
      await svc.initialize();
      await svc.shutdown();
      expect(svc.getLeaderId()).toBeNull();
    });

    it('detectDeadlocks() after shutdown returns empty array', async () => {
      await svc.initialize();
      await svc.shutdown();
      expect(svc.detectDeadlocks()).toEqual([]);
    });

    it('state_changed event tracking does not throw when raft is stopped mid-flight', async () => {
      await svc.initialize();

      // Emit state_changed which registers an inner once() listener
      (svc as any).raft.emit('state_changed', { state: 'candidate', term: 1 });

      // Now shut down — the inner once() is dangling but should not throw
      await expect(svc.shutdown()).resolves.toBeUndefined();
    });

    it('ConsensusService is an EventEmitter', async () => {
      expect(svc).toBeInstanceOf(require('node:events').EventEmitter);
    });
  });
});
