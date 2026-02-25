/**
 * Generic orchestration client tests.
 */

import { describe, it, expect } from 'vitest';
import {
  createOrchestrationClient,
  type StartRunInput,
} from '../../src/orchestration/index.js';

describe('OrchestrationClient', () => {
  it('startRun returns runId and getStatus returns client shape', async () => {
    const client = createOrchestrationClient({ config: { backend: 'test' } });

    const input: StartRunInput = {
      taskDescription: 'Test task',
      cwd: '/tmp/repo',
      acceptanceCriteria: ['Tests pass'],
      allowedPaths: ['src/'],
      provenance: { runId: 'r1', cardId: 'c1' },
    };

    const { runId } = await client.startRun(input);
    expect(runId).toBeDefined();
    expect(typeof runId).toBe('string');

    const status = await client.getStatus(runId);
    expect(status.runId).toBe(runId);
    expect(status.status).toBe('completed');
    expect(typeof status.progress).toBe('number');
    expect(['queued', 'running', 'completed', 'failed', 'cancelled', 'unknown']).toContain(
      status.status
    );
  });

  it('cancel returns success', async () => {
    const client = createOrchestrationClient({ config: { backend: 'test' } });
    const { runId } = await client.startRun({ taskDescription: 'Task' });
    const result = await client.cancel(runId);
    expect(result.success).toBe(true);
  });

  it('startRun accepts loopPolicy and passes it through', async () => {
    const client = createOrchestrationClient({ config: { backend: 'test' } });
    const { runId } = await client.startRun({
      taskDescription: 'Task with loop policy',
      loopPolicy: {
        maxIterations: 3,
        successCriteria: { tests: true, lint: true },
        retryPolicy: { maxAttempts: 2, backoffMs: 100 },
        budgetLimits: { timeMs: 60_000 },
      },
    });
    expect(runId).toBeDefined();
    const status = await client.getStatus(runId);
    expect(status.runId).toBe(runId);
  });

  it('seed, search, and harvest work for a run', async () => {
    const client = createOrchestrationClient({ config: { backend: 'test' } });
    const { runId } = await client.startRun({
      taskDescription: 'Task',
      memorySeed: [{ key: 'k1', value: 'initial context', metadata: {} }],
    });

    await client.seed(runId, [
      { key: 'k2', value: 'extra context for run', metadata: { source: 'test' } },
    ]);

    const runScope = { runId };
    const results = await client.search(runScope, 'context', 10);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.value.includes('context'))).toBe(true);

    const harvested = await client.harvest(runId);
    expect(harvested.entries.length).toBeGreaterThanOrEqual(1);
    expect(harvested.learnings).toBeDefined();
    expect(Array.isArray(harvested.learnings)).toBe(true);
  });
});
