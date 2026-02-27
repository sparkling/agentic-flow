/**
 * Memory plane API tests (TDD - PR3)
 *
 * Tests explicit methods:
 * - seedMemory(runId, entries[])
 * - recordLearning(runId, learning, score?, provenance?)
 * - searchMemory(scope, query, topK)
 */

import { describe, it, expect } from 'vitest';
import {
  seedMemory,
  recordLearning,
  searchMemory,
} from '../../src/orchestration/index.js';

describe('Memory plane - seedMemory', () => {
  it('seedMemory accepts runId and entries array', async () => {
    await expect(
      seedMemory('run-1', [
        { value: 'context A', key: 'ctx-a' },
        { value: 'context B', metadata: { source: 'dossier' } },
      ])
    ).resolves.toBeUndefined();
  });

  it('seedMemory with empty entries does not throw', async () => {
    await expect(seedMemory('run-2', [])).resolves.toBeUndefined();
  });
});

describe('Memory plane - recordLearning', () => {
  it('recordLearning accepts runId and learning string', async () => {
    await expect(
      recordLearning('run-1', 'Prefer immutable updates in React')
    ).resolves.toBeUndefined();
  });

  it('recordLearning accepts optional score and provenance', async () => {
    await expect(
      recordLearning('run-1', 'Use type guards for narrowing', 0.9, { source: 'lint-fix' })
    ).resolves.toBeUndefined();
  });
});

describe('Memory plane - searchMemory', () => {
  it('searchMemory with run scope returns array of results', async () => {
    await seedMemory('run-search', [{ value: 'authentication patterns', key: 'auth' }]);
    const results = await searchMemory({ runId: 'run-search' }, 'auth', 5);
    expect(Array.isArray(results)).toBe(true);
    results.forEach((r) => {
      expect(typeof r.value === 'string' || r.value != null).toBe(true);
      if (r.score != null) expect(typeof r.score).toBe('number');
    });
  });

  it('searchMemory with global scope returns array', async () => {
    const results = await searchMemory('global', 'any query', 3);
    expect(Array.isArray(results)).toBe(true);
  });

  it('searchMemory respects topK', async () => {
    const results = await searchMemory({ runId: 'run-k' }, 'query', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });
});
