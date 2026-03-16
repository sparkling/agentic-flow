/**
 * SONA+RVF Tools Integration Tests
 *
 * Tests the SonaRvfService for SONA trajectory management (begin, step, end,
 * learn, patterns, stats) and RVF vector database operations (create, ingest,
 * query, compact, status).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SonaRvfService } from '../../agentic-flow/src/services/sona-rvf-service';

describe('SONA+RVF Tools Integration', () => {
  beforeEach(() => {
    SonaRvfService.resetInstance();
  });

  // -- SONA Tests --

  describe('sona_trajectory_begin', () => {
    it('begins a new trajectory', async () => {
      const svc = await SonaRvfService.getInstance();
      const traj = svc.beginTrajectory();
      expect(traj.id).toBeTruthy();
      expect(traj.status).toBe('active');
      expect(traj.steps).toEqual([]);
    });
  });

  describe('sona_trajectory_step', () => {
    it('adds a step to active trajectory', async () => {
      const svc = await SonaRvfService.getInstance();
      const traj = svc.beginTrajectory();
      const step = svc.addStep(traj.id, { state: 'init', action: 'plan', reward: 0.5 });
      expect(step).not.toBeNull();
      expect(step!.state).toBe('init');
      expect(step!.action).toBe('plan');
      expect(step!.timestamp).toBeTruthy();
    });

    it('returns null for non-existent trajectory', async () => {
      const svc = await SonaRvfService.getInstance();
      const step = svc.addStep('fake-id', { state: 's', action: 'a', reward: 0 });
      expect(step).toBeNull();
    });

    it('returns null for completed trajectory', async () => {
      const svc = await SonaRvfService.getInstance();
      const traj = svc.beginTrajectory();
      svc.endTrajectory(traj.id);
      const step = svc.addStep(traj.id, { state: 's', action: 'a', reward: 0 });
      expect(step).toBeNull();
    });
  });

  describe('sona_trajectory_end', () => {
    it('ends trajectory and extracts patterns', async () => {
      const svc = await SonaRvfService.getInstance();
      const traj = svc.beginTrajectory();
      svc.addStep(traj.id, { state: 'a', action: 'x', reward: 0.5 });
      svc.addStep(traj.id, { state: 'b', action: 'y', reward: 0.8 });
      const ended = svc.endTrajectory(traj.id);
      expect(ended!.status).toBe('completed');
      expect(ended!.steps).toHaveLength(2);
    });

    it('returns null for non-existent trajectory', async () => {
      const svc = await SonaRvfService.getInstance();
      expect(svc.endTrajectory('fake')).toBeNull();
    });
  });

  describe('sona_learn', () => {
    it('processes active trajectories', async () => {
      const svc = await SonaRvfService.getInstance();
      const t1 = svc.beginTrajectory();
      svc.addStep(t1.id, { state: 'a', action: 'x', reward: 0.5 });
      svc.addStep(t1.id, { state: 'b', action: 'y', reward: 0.8 });
      const result = svc.forceLearn();
      expect(result.trajectoriesProcessed).toBeGreaterThanOrEqual(1);
      expect(result.patternsUpdated).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sona_patterns', () => {
    it('returns discovered patterns', async () => {
      const svc = await SonaRvfService.getInstance();
      const t = svc.beginTrajectory();
      svc.addStep(t.id, { state: 'a', action: 'plan', reward: 0.5 });
      svc.addStep(t.id, { state: 'b', action: 'execute', reward: 0.9 });
      svc.endTrajectory(t.id);
      const patterns = svc.findPatterns(10);
      expect(patterns.length).toBeGreaterThanOrEqual(1);
      expect(patterns[0]).toHaveProperty('pattern');
      expect(patterns[0]).toHaveProperty('frequency');
    });

    it('returns empty array when no patterns', async () => {
      const svc = await SonaRvfService.getInstance();
      const patterns = svc.findPatterns(10);
      expect(patterns).toEqual([]);
    });
  });

  describe('sona_stats', () => {
    it('returns statistics', async () => {
      const svc = await SonaRvfService.getInstance();
      const stats = svc.getStats();
      expect(stats).toHaveProperty('totalTrajectories');
      expect(stats).toHaveProperty('totalSteps');
      expect(stats).toHaveProperty('avgReward');
      expect(stats).toHaveProperty('patternsFound');
    });
  });

  // -- RVF Tests --

  describe('rvf_create', () => {
    it('creates a new vector database', async () => {
      const svc = await SonaRvfService.getInstance();
      const db = svc.createDatabase('test-db', 384);
      expect(db.id).toBeTruthy();
      expect(db.name).toBe('test-db');
      expect(db.dimension).toBe(384);
      expect(db.vectorCount).toBe(0);
    });
  });

  describe('rvf_ingest', () => {
    it('ingests vectors into a database', async () => {
      const svc = await SonaRvfService.getInstance();
      const db = svc.createDatabase('ingest-test', 3);
      const result = svc.ingestBatch(db.id, [
        { id: 'v1', vector: [1, 0, 0], metadata: { label: 'first' } },
        { id: 'v2', vector: [0, 1, 0], metadata: { label: 'second' } },
      ]);
      expect(result).not.toBeNull();
      expect(result!.ingested).toBe(2);
    });

    it('returns null for non-existent database', async () => {
      const svc = await SonaRvfService.getInstance();
      expect(svc.ingestBatch('fake-db', [{ id: 'v1', vector: [1] }])).toBeNull();
    });
  });

  describe('rvf_query', () => {
    it('queries database and returns ranked results', async () => {
      const svc = await SonaRvfService.getInstance();
      const db = svc.createDatabase('query-test', 3);
      svc.ingestBatch(db.id, [
        { id: 'a', vector: [1, 0, 0] },
        { id: 'b', vector: [0, 1, 0] },
        { id: 'c', vector: [0, 0, 1] },
      ]);
      const results = svc.query(db.id, [1, 0, 0], 3);
      expect(results).not.toBeNull();
      expect(results!.length).toBe(3);
      expect(results![0].id).toBe('a');
      expect(results![0].score).toBeCloseTo(1.0, 1);
    });

    it('returns null for non-existent database', async () => {
      const svc = await SonaRvfService.getInstance();
      expect(svc.query('fake-db', [1, 0, 0], 5)).toBeNull();
    });
  });

  describe('rvf_compact', () => {
    it('removes duplicate vectors', async () => {
      const svc = await SonaRvfService.getInstance();
      const db = svc.createDatabase('compact-test', 3);
      svc.ingestBatch(db.id, [
        { id: 'v1', vector: [1, 0, 0] },
        { id: 'v2', vector: [1, 0, 0] },
        { id: 'v3', vector: [0, 1, 0] },
      ]);
      const result = svc.compact(db.id);
      expect(result).not.toBeNull();
      expect(result!.compacted).toBe(true);
      expect(result!.vectorCount).toBe(2);
    });
  });

  describe('rvf_status', () => {
    it('returns database status', async () => {
      const svc = await SonaRvfService.getInstance();
      const db = svc.createDatabase('status-test', 128);
      const status = svc.getDatabaseStatus(db.id);
      expect(status).not.toBeNull();
      expect(status!.name).toBe('status-test');
      expect(status!.dimension).toBe(128);
    });

    it('returns null for non-existent database', async () => {
      const svc = await SonaRvfService.getInstance();
      expect(svc.getDatabaseStatus('fake')).toBeNull();
    });
  });
});
