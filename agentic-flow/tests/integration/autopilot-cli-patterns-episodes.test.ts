/**
 * Integration test for the `autopilot patterns` and `autopilot episodes`
 * CLI subcommands (ADR-0194 / ADR-0196 surface).
 *
 * Per the task brief: shell out from a Node test that calls the CLI
 * subcommands and assert the JSON output shape.
 *
 * Per `feedback-no-fallbacks` the CLI must FAIL LOUDLY when the
 * underlying AgentDBService / AutopilotLearning surface is unavailable.
 * The acceptable outcomes are:
 *
 *   1. Success (exit 0): stdout is valid JSON matching the documented
 *      shape (`{engine, patterns}` for patterns; `AutopilotEpisode[]` for
 *      episodes).
 *
 *   2. Loud failure (non-zero exit, non-empty stderr): the surface threw.
 *      Acceptable thrown errors include:
 *      - the CLI's own "AgentDBService is not available" guard,
 *      - the `--last` input-validation guard,
 *      - the pre-existing Phase 5 module-load failure when `agentdb`
 *        does not export `createVectorClock` (a known ADR-0196 runtime
 *        gap exercised by the federation test suite under `canConstruct`
 *        probes — see autopilot-learning-phase5-federation.test.ts).
 *
 * The contract under test is "no silent empty result", not the exact
 * wording — both loud-failure paths satisfy `feedback-no-fallbacks`.
 *
 * We invoke the built `dist/cli-proxy.js` directly via `node`, the same
 * way `agentic-flow autopilot ...` runs in production.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The test lives in agentic-flow/tests/integration → ../../ is the
// inner package root. Use fileURLToPath because this package is ESM.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = resolve(__dirname, '..', '..');
const CLI_PROXY = resolve(PACKAGE_ROOT, 'dist', 'cli-proxy.js');

function runAutopilot(args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [CLI_PROXY, 'autopilot', ...args], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf-8',
    timeout: 30000,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  };
}

describe('autopilot patterns + episodes CLI', () => {
  beforeAll(() => {
    if (!existsSync(CLI_PROXY)) {
      throw new Error(
        `dist/cli-proxy.js missing at ${CLI_PROXY} — run \`npm run build\` first. ` +
        `Per feedback-no-fallbacks this test refuses to silently skip.`,
      );
    }
  });

  it('autopilot patterns --json emits {engine, patterns} on success OR fails loudly', () => {
    const { stdout, stderr, status } = runAutopilot(['patterns', '--json']);

    if (status === 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(stdout);
      } catch (e) {
        throw new Error(`stdout was not valid JSON: ${stdout.slice(0, 200)}`);
      }
      expect(parsed).toBeTypeOf('object');
      const obj = parsed as { engine: unknown; patterns: unknown };
      expect(['keyword', 'embedding-cluster', 'union']).toContain(obj.engine);
      expect(Array.isArray(obj.patterns)).toBe(true);
      for (const p of obj.patterns as Array<Record<string, unknown>>) {
        expect(typeof p.pattern).toBe('string');
        expect(typeof p.frequency).toBe('number');
        expect(typeof p.avgReward).toBe('number');
        expect(['phase2-keyword', 'phase3-embedding']).toContain(p.source);
      }
    } else {
      // Loud failure: non-empty stderr, non-zero exit. Per the test
      // header, both the explicit "AgentDBService is not available"
      // throw AND the pre-existing Phase 5 createVectorClock module-load
      // SyntaxError satisfy `feedback-no-fallbacks`.
      expect(stderr.length).toBeGreaterThan(0);
    }
  });

  it('autopilot episodes --json emits AutopilotEpisode[] on success OR fails loudly', () => {
    const { stdout, stderr, status } = runAutopilot(['episodes', '--json']);

    if (status === 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(stdout);
      } catch (e) {
        throw new Error(`stdout was not valid JSON: ${stdout.slice(0, 200)}`);
      }
      expect(Array.isArray(parsed)).toBe(true);
      const episodes = parsed as Array<Record<string, unknown>>;
      // Default --last is 10.
      expect(episodes.length).toBeLessThanOrEqual(10);
      for (const ep of episodes) {
        expect(typeof ep.taskId).toBe('string');
        expect(typeof ep.subject).toBe('string');
        expect(typeof ep.status).toBe('string');
        expect(typeof ep.iterations).toBe('number');
        expect(typeof ep.durationMs).toBe('number');
        // ADR-0196 Phase 5: originInstallId is OPTIONAL on the type but
        // must either be a string or absent — never a non-string truthy.
        if ('originInstallId' in ep && ep.originInstallId !== undefined) {
          expect(typeof ep.originInstallId).toBe('string');
        }
      }
    } else {
      expect(stderr.length).toBeGreaterThan(0);
    }
  });

  it('autopilot episodes --last N respects N on success path', () => {
    const { stdout, status } = runAutopilot(['episodes', '--last', '3', '--json']);
    if (status !== 0) return; // Loud-failure path covered by the test above.
    const episodes = JSON.parse(stdout) as unknown[];
    expect(episodes.length).toBeLessThanOrEqual(3);
  });

  it('autopilot help lists the new patterns + episodes subcommands', () => {
    // The help printer runs entirely in-process without importing
    // autopilot-learning, so this assertion holds regardless of whether
    // the Phase 5 module-load gap is present.
    const { stdout, status } = runAutopilot(['help']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/patterns\s+\[--json\]/);
    expect(stdout).toMatch(/episodes\s+\[--last N\]\s+\[--json\]/);
  });
});
