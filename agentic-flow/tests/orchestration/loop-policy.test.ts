/**
 * Loop policy primitives tests (TDD - PR2)
 *
 * Tests:
 * - LoopPolicy type and OrchestrateTaskInput.loopPolicy
 * - Pass-through of loop policy on orchestrateTask
 */

import { describe, it, expect } from 'vitest';
import {
  createOrchestrator,
  type OrchestrateTaskInput,
  type LoopPolicy,
  type SuccessCriteria,
  type RetryPolicy,
  type BudgetLimits,
} from '../../src/orchestration/index.js';

describe('Loop policy - types', () => {
  it('SuccessCriteria allows tests, lint, typecheck, custom', () => {
    const criteria: SuccessCriteria = {
      tests: true,
      lint: true,
      typecheck: false,
      custom: (_result: unknown) => true,
    };
    expect(criteria.tests).toBe(true);
    expect(criteria.custom?.(null)).toBe(true);
  });

  it('RetryPolicy allows maxAttempts, backoffMs, onFailureClass', () => {
    const policy: RetryPolicy = {
      maxAttempts: 3,
      backoffMs: 1000,
      onFailureClass: 'transient',
    };
    expect(policy.onFailureClass).toBe('transient');
  });

  it('BudgetLimits allows tokens, timeMs, costUsd', () => {
    const limits: BudgetLimits = {
      tokens: 100_000,
      timeMs: 60_000,
      costUsd: 1.0,
    };
    expect(limits.costUsd).toBe(1.0);
  });

  it('LoopPolicy aggregates maxIterations, successCriteria, retryPolicy, budgetLimits', () => {
    const loop: LoopPolicy = {
      maxIterations: 10,
      successCriteria: { tests: true },
      retryPolicy: { maxAttempts: 2, onFailureClass: 'permanent' },
      budgetLimits: { tokens: 50_000 },
    };
    expect(loop.maxIterations).toBe(10);
    expect(loop.successCriteria?.tests).toBe(true);
    expect(loop.retryPolicy?.onFailureClass).toBe('permanent');
  });
});

describe('Loop policy - pass-through on orchestrateTask', () => {
  it('OrchestrateTaskInput accepts optional loopPolicy', async () => {
    const orchestrator = createOrchestrator({ backend: 'test' });
    const input: OrchestrateTaskInput = {
      description: 'task with loop policy',
      loopPolicy: {
        maxIterations: 5,
        successCriteria: { lint: true, typecheck: true },
        retryPolicy: { backoffMs: 500 },
        budgetLimits: { timeMs: 30_000 },
      },
    };
    const handle = await orchestrator.orchestrateTask(input);
    expect(handle.runId).toBeDefined();
  });
});
