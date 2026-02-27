/**
 * Orchestration API smoke test - runnable with tsx (no vitest).
 * Usage: npx tsx tests/orchestration/orchestration-api.smoke.ts
 */

import {
  createOrchestrator,
  getRunStatus,
  cancelRun,
  getRunArtifacts,
  type OrchestratorConfig,
  type OrchestrateTaskInput,
} from '../../src/orchestration/index.js';

async function main() {
  let passed = 0;
  let failed = 0;

  const assert = (cond: boolean, msg: string) => {
    if (cond) {
      passed++;
      console.log('  OK', msg);
    } else {
      failed++;
      console.error('  FAIL', msg);
    }
  };

  console.log('Orchestration API smoke tests (backend: test)\n');

  const config: OrchestratorConfig = { backend: 'test' };
  const orchestrator = createOrchestrator(config);
  assert(orchestrator != null && typeof orchestrator.orchestrateTask === 'function', 'createOrchestrator returns orchestrator with orchestrateTask');

  const input: OrchestrateTaskInput = { description: 'smoke task' };
  const handle = await orchestrator.orchestrateTask(input);
  assert(typeof handle.runId === 'string' && handle.runId.length > 0, 'orchestrateTask returns RunHandle with runId');

  const status = await getRunStatus(handle.runId);
  assert(typeof status.phase === 'string', 'getRunStatus returns phase');
  assert(typeof status.progress === 'number' && status.progress >= 0 && status.progress <= 100, 'getRunStatus returns progress 0-100');
  assert(['pending', 'running', 'completed', 'failed', 'cancelled', 'unknown'].includes(status.phase), 'getRunStatus phase is valid');

  const unknownStatus = await getRunStatus('nonexistent-run-id');
  assert(unknownStatus.phase === 'unknown', 'getRunStatus(unknown) returns unknown');

  await cancelRun('any-run-id');
  assert(true, 'cancelRun does not throw');

  const artifacts = await getRunArtifacts(handle.runId);
  assert(Array.isArray(artifacts.commits ?? []), 'getRunArtifacts has commits array');
  assert(Array.isArray(artifacts.testLogs ?? []), 'getRunArtifacts has testLogs array');
  assert(Array.isArray(artifacts.memoryWrites ?? []), 'getRunArtifacts has memoryWrites array');

  console.log('\n' + (failed === 0 ? `All ${passed} smoke tests passed.` : `${failed} failed, ${passed} passed.`));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
