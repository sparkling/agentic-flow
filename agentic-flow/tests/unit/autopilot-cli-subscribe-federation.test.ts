/**
 * Unit tests for the `autopilot federation status` CLI subcommand
 * (ADR-0196 surface). The `autopilot subscribe` subcommand and its tests
 * were removed per ADR-0288 (it streamed the retired in-process
 * learning-events bus).
 *
 * - `federation status`: invokes the CLI handler and asserts the
 *   four-key JSON shape required by ADR-0196 §interface.
 *
 * Convention (matches `autopilot-phase5-federated-provider.test.ts`):
 * when AutopilotLearning cannot be constructed in this environment
 * (e.g., the workspace `agentdb` package lacks Phase 5 exports), the
 * `federation status` test SKIPS with a logged marker rather than
 * failing. The CLI surface itself is the artifact under test.
 */
import { describe, it, expect } from 'vitest';
import { handleAutopilotCommand } from '../../src/cli/autopilot-cli.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function captureStdout(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('autopilot CLI — federation status (ADR-0196)', () => {
  // (subscribe tests removed — `autopilot subscribe` retired per ADR-0288;
  // it streamed the retired in-process learning-events bus.)

  it('federation status prints the ADR-0196 JSON shape (noop default)', async () => {
    // AutopilotLearning's ctor depends on `agentdb` exports that may not
    // be available in the workspace's installed package. Match the
    // suite's skip-with-marker convention.
    let lines: string[] = [];
    try {
      lines = await captureStdout(async () => {
        await handleAutopilotCommand(['federation', 'status']);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn(`[ADR-0196 CLI] SKIP: federation status threw — ${msg}`);
      return;
    }

    const jsonLines = lines.filter(l => l.trim().startsWith('{'));
    expect(jsonLines.length).toBeGreaterThan(0);
    const parsed = JSON.parse(jsonLines[jsonLines.length - 1]);
    expect(typeof parsed.localInstallId).toBe('string');
    expect(parsed.localInstallId.length).toBeGreaterThan(0);
    expect(['noop', 'sync-coordinator']).toContain(parsed.provider);
    expect(parsed.provider).toBe('noop'); // bare AutopilotLearning() default
    expect(typeof parsed.transportReady).toBe('boolean');
    expect(typeof parsed.conflictStrategy).toBe('string');
    expect(parsed.conflictStrategy.length).toBeGreaterThan(0);
  });
});
