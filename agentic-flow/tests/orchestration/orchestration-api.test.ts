/**
 * Orchestration Runtime API tests (TDD - PR1)
 *
 * Tests the stable programmatic API surface:
 * - createOrchestrator(config)
 * - orchestrateTask(input) -> RunHandle
 * - getRunStatus(runId)
 * - cancelRun(runId)
 * - getRunArtifacts(runId)
 */

import { describe, it, expect } from 'vitest';
import {
  createOrchestrator,
  getRunStatus,
  cancelRun,
  getRunArtifacts,
  type OrchestratorConfig,
  type RunHandle,
  type RunStatus,
  type RunArtifacts,
  type OrchestrateTaskInput,
} from '../../src/orchestration/index.js';

describe('Orchestration API - types and factory', () => {
  it('createOrchestrator returns an orchestrator with orchestrateTask', () => {
    const config: OrchestratorConfig = { backend: 'test' };
    const orchestrator = createOrchestrator(config);
    expect(orchestrator).toBeDefined();
    expect(typeof orchestrator.orchestrateTask).toBe('function');
  });

  it('RunHandle has runId string', async () => {
    const orchestrator = createOrchestrator({ backend: 'test' });
    const input: OrchestrateTaskInput = { description: 'test task' };
    const handle = await orchestrator.orchestrateTask(input);
    expect(handle).toBeDefined();
    expect(typeof handle.runId).toBe('string');
    expect(handle.runId.length).toBeGreaterThan(0);
  });
});

describe('Orchestration API - getRunStatus', () => {
  it('getRunStatus returns RunStatus with phase and progress', async () => {
    const orchestrator = createOrchestrator({ backend: 'test' });
    const handle = await orchestrator.orchestrateTask({ description: 'status test' });
    const status = await getRunStatus(handle.runId);
    expect(status).toBeDefined();
    expect(typeof status.phase).toBe('string');
    expect(typeof status.progress).toBe('number');
    expect(status.progress).toBeGreaterThanOrEqual(0);
    expect(status.progress).toBeLessThanOrEqual(100);
    expect(['pending', 'running', 'completed', 'failed', 'cancelled', 'unknown']).toContain(status.phase);
  });

  it('getRunStatus for unknown runId returns unknown phase', async () => {
    const status = await getRunStatus('nonexistent-run-id-12345');
    expect(status.phase).toBe('unknown');
  });
});

describe('Orchestration API - cancelRun', () => {
  it('cancelRun does not throw', async () => {
    await expect(cancelRun('any-run-id')).resolves.toBeUndefined();
  });
});

describe('Orchestration API - getRunArtifacts', () => {
  it('getRunArtifacts returns RunArtifacts shape', async () => {
    const artifacts = await getRunArtifacts('any-run-id');
    expect(artifacts).toBeDefined();
    expect(Array.isArray(artifacts.commits ?? [])).toBe(true);
    expect(Array.isArray(artifacts.testLogs ?? [])).toBe(true);
    expect(Array.isArray(artifacts.memoryWrites ?? [])).toBe(true);
  });
});
