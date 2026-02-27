/**
 * Memory plane smoke test - runnable with tsx.
 * npx tsx tests/orchestration/memory-plane.smoke.ts
 */

import { seedMemory, recordLearning, searchMemory } from '../../src/orchestration/index.js';

async function main() {
  let passed = 0;
  let failed = 0;
  const assert = (cond: boolean, msg: string) => {
    if (cond) { passed++; console.log('  OK', msg); } else { failed++; console.error('  FAIL', msg); }
  };

  console.log('Memory plane smoke tests\n');

  await seedMemory('run-1', [
    { value: 'context A', key: 'ctx-a' },
    { value: 'authentication patterns', key: 'auth' },
  ]);
  assert(true, 'seedMemory runId + entries');

  await seedMemory('run-2', []);
  assert(true, 'seedMemory empty entries');

  await recordLearning('run-1', 'Prefer immutable updates');
  assert(true, 'recordLearning runId + learning');

  await recordLearning('run-1', 'Use type guards', 0.9, { source: 'lint' });
  assert(true, 'recordLearning with score and provenance');

  const runResults = await searchMemory({ runId: 'run-1' }, 'auth', 5);
  assert(Array.isArray(runResults), 'searchMemory run scope returns array');
  assert(runResults.length <= 5, 'searchMemory respects topK');
  const hasAuth = runResults.some((r) => r.value.toLowerCase().includes('auth'));
  assert(hasAuth, 'searchMemory finds seeded entry');

  const globalResults = await searchMemory('global', 'query', 3);
  assert(Array.isArray(globalResults), 'searchMemory global returns array');

  console.log('\n' + (failed === 0 ? `All ${passed} memory plane smoke tests passed.` : `${failed} failed, ${passed} passed.`));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
