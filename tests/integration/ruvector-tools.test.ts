/**
 * RuVector Tools Integration Tests
 *
 * Tests the RuVectorService for vector search, attention mechanisms,
 * graph operations, routing, and benchmarking. Handles graceful fallback
 * when native RuVector packages are unavailable.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RuVectorService } from '../../agentic-flow/src/services/ruvector-service';

describe('RuVector Tools Integration', () => {
  beforeEach(() => {
    RuVectorService.resetInstance();
  });

  describe('availability', () => {
    it('reports availability for all packages', async () => {
      const svc = await RuVectorService.getInstance();
      const avail = svc.getAvailability();
      expect(avail).toHaveProperty('core');
      expect(avail).toHaveProperty('attention');
      expect(avail).toHaveProperty('graphNode');
      expect(avail).toHaveProperty('router');
      expect(avail).toHaveProperty('gnn');
    });
  });

  describe('ruvector_search', () => {
    it('returns results or unavailable message', async () => {
      const svc = await RuVectorService.getInstance();
      const result = await svc.search([0.1, 0.2, 0.3], 5);
      expect(result).toHaveProperty('available');
      if (!result.available) {
        expect(result.reason).toBeTruthy();
      }
    });
  });

  describe('ruvector_attention', () => {
    it('runs attention or returns unavailable', async () => {
      const svc = await RuVectorService.getInstance();
      const result = await svc.runAttention({
        queries: [[1, 0], [0, 1]],
        keys: [[1, 0], [0, 1]],
        values: [[1, 0], [0, 1]],
        mechanism: 'scaled-dot-product',
      });
      expect(result).toHaveProperty('available');
    });
  });

  describe('ruvector_graph_query', () => {
    it('queries graph or returns unavailable', async () => {
      const svc = await RuVectorService.getInstance();
      const result = await svc.graphQuery('MATCH (n) RETURN n LIMIT 5');
      expect(result).toHaveProperty('available');
    });
  });

  describe('ruvector_graph_create', () => {
    it('creates graph elements or returns unavailable', async () => {
      const svc = await RuVectorService.getInstance();
      const result = await svc.graphCreate({
        nodes: [{ id: 'n1', type: 'agent', label: 'Agent 1' }],
        edges: [{ from: 'n1', to: 'n1', type: 'self-ref' }],
      });
      expect(result).toHaveProperty('available');
    });
  });

  describe('ruvector_route', () => {
    it('routes query to best candidate via cosine similarity', async () => {
      const svc = await RuVectorService.getInstance();
      const result = await svc.route(
        [1, 0, 0],
        [
          { id: 'a', vector: [1, 0, 0] },
          { id: 'b', vector: [0, 1, 0] },
          { id: 'c', vector: [0, 0, 1] },
        ],
      );
      if (result.available) {
        expect(result.result!.bestMatch).toBe('a');
        expect(result.result!.score).toBeCloseTo(1.0, 1);
        expect(result.result!.rankings).toHaveLength(3);
      }
    });

    it('returns rankings sorted by score descending', async () => {
      const svc = await RuVectorService.getInstance();
      const result = await svc.route(
        [0.5, 0.5, 0],
        [
          { id: 'x', vector: [1, 0, 0] },
          { id: 'y', vector: [0, 1, 0] },
          { id: 'z', vector: [0.5, 0.5, 0] },
        ],
      );
      if (result.available) {
        const scores = result.result!.rankings.map((r: any) => r.score);
        for (let i = 1; i < scores.length; i++) {
          expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
        }
      }
    });
  });

  describe('ruvector_benchmark', () => {
    it('runs benchmark with default params', async () => {
      const svc = await RuVectorService.getInstance();
      const result = await svc.benchmark({});
      expect(result.available).toBe(true);
      expect(result.result).toHaveProperty('indexSize');
      expect(result.result).toHaveProperty('queryTimeMs');
      expect(result.result).toHaveProperty('recallAt10');
      expect(result.result).toHaveProperty('throughput');
      expect(result.result!.indexSize).toBe(1000);
    });

    it('runs benchmark with custom params', async () => {
      const svc = await RuVectorService.getInstance();
      const result = await svc.benchmark({ dimension: 64, numVectors: 500, numQueries: 50 });
      expect(result.available).toBe(true);
      expect(result.result!.indexSize).toBe(500);
    });
  });
});
