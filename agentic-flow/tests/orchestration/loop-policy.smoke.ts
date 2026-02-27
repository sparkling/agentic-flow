/**
 * Loop policy smoke test - runnable with tsx.
 * npx tsx tests/orchestration/loop-policy.smoke.ts
 */

import {
  createOrchestrator,
  type OrchestrateTaskInput,
  type LoopPolicy,
  type SuccessCriteria,
  type RetryPolicy,
  type BudgetLimits,
} from '../../src/orchestration/index.js';

async function main() {
  let passed = 0;
  let failed = 0;
  const assert = (cond: boolean, msg: string) => {
    if (cond) { passed++; console.log('  OK', msg); } else { failed++; console.error('  FAIL', msg); }
  };

  console.log('Loop policy smoke tests\n');

  const criteria: SuccessCriteria = { tests: true, lint: true, custom: (_: unknown) => true };
  assert(criteria.tests === true && criteria.custom?.(null) === true, 'SuccessCriteria');

  const retry: RetryPolicy = { maxAttempts: 3, backoffMs: 1000, onFailureClass: 'transient' };
  assert(retry.onFailureClass === 'transient', 'RetryPolicy');

  const budget: BudgetLimits = { tokens: 100_000, timeMs: 60_000, costUsd: 1.0 };
  assert(budget.costUsd === 1.0, 'BudgetLimits');

  const loop: LoopPolicy = {
    maxIterations: 10,
    successCriteria: { tests: true },
    retryPolicy: { onFailureClass: 'permanent' },
    budgetLimits: { tokens: 50_000 },
  };
  assert(loop.maxIterations === 10 && loop.retryPolicy?.onFailureClass === 'permanent', 'LoopPolicy');

  const orchestrator = createOrchestrator({ backend: 'test' });
  const input: OrchestrateTaskInput = {
    description: 'task with loop policy',
    loopPolicy: { maxIterations: 5, successCriteria: { lint: true }, budgetLimits: { timeMs: 30_000 } },
  };
  const handle = await orchestrator.orchestrateTask(input);
  assert(typeof handle.runId === 'string' && handle.runId.length > 0, 'orchestrateTask with loopPolicy');

  console.log('\n' + (failed === 0 ? `All ${passed} loop policy smoke tests passed.` : `${failed} failed, ${passed} passed.`));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
