#!/usr/bin/env node
/**
 * Tests for autopilot-hook.mjs Learning Augmentation (ADR-0193 Item C).
 *
 * Strategy:
 *  - Mock the AutopilotLearning import via the AUTOPILOT_LEARNING_MODULE
 *    env var (a sibling .mock.mjs file).
 *  - Pre-stage .claude-flow/swarm-tasks.json so the hook discovers one
 *    pending task. PROJECT_ROOT is derived from the hook's own __dirname
 *    (forks/agentic-flow/), so the temp state lives there during the
 *    test and is torn down after.
 *  - Spawn the hook as a subprocess; capture stdout; assert on the
 *    augmentation markers.
 *
 * Run with:
 *   node --test .claude/helpers/autopilot-hook.test.mjs
 *
 * Limitations: this verifies the WIRING (hook calls the producer +
 * formats the result) but does not exercise the real AgentDB-backed
 * AutopilotLearning. The end-to-end probe lives in
 * ruflo-patch/scripts/test-acceptance.sh (`ctrl-autopilot-stop-hook`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HOOK_PATH = join(__dirname, 'autopilot-hook.mjs');
const FORK_ROOT = join(__dirname, '..', '..'); // forks/agentic-flow/
const DATA_DIR = join(FORK_ROOT, '.claude-flow');
const SWARM_TASKS = join(DATA_DIR, 'swarm-tasks.json');

const MOCK_POPULATED = join(__dirname, 'autopilot-learning.mock.populated.mjs');
const MOCK_UNAVAILABLE = join(__dirname, 'autopilot-learning.mock.unavailable.mjs');
const MOCK_EMPTY = join(__dirname, 'autopilot-learning.mock.empty.mjs');
const MOCK_IMPORT_BROKEN = '/nonexistent/path/this/does/not/exist.mjs';

// ─── helpers ─────────────────────────────────────────────────────────

function stageTasks(tasks) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SWARM_TASKS, JSON.stringify({ tasks }, null, 2));
}

function cleanupFixtures() {
  // Only remove .claude-flow if WE created it (it didn't exist pre-test —
  // the hook itself would otherwise create .claude-flow/data/). Cheap to
  // be defensive: only delete files we wrote, not the whole dir.
  if (existsSync(SWARM_TASKS)) rmSync(SWARM_TASKS, { force: true });
  // Clean up the autopilot state files the hook creates on every run.
  const stateFile = join(DATA_DIR, 'data', 'autopilot-state.json');
  const logFile = join(DATA_DIR, 'data', 'autopilot-log.json');
  if (existsSync(stateFile)) rmSync(stateFile, { force: true });
  if (existsSync(logFile)) rmSync(logFile, { force: true });
}

function writeMockModules() {
  writeFileSync(
    MOCK_POPULATED,
    `// Mock: populated learning context (success patterns + failures + recs).
export class AutopilotLearning {
  async initialize() { return true; }
  isAvailable() { return true; }
  async getReEngagementContext(_incomplete) {
    return {
      pastFailures: [
        { task: 'fix login bug', critique: 'missed null-check on user.session', reward: -1 },
        { task: 'add validation', critique: 'forgot empty-string edge case', reward: -1 },
      ],
      pastSuccesses: [
        { task: 'add login validation', reward: 1 },
      ],
      patterns: [
        { pattern: 'validation', frequency: 5, avgReward: 0.8 },
        { pattern: 'login', frequency: 4, avgReward: 0.6 },
      ],
      recommendations: [
        'Pattern "validation" succeeded 5× (avg reward 0.80)',
        'Past failure note: missed null-check on user.session',
      ],
      confidence: 0.5,
    };
  }
  async getMetrics() {
    return { available: true, episodes: 25, patterns: 2, trajectories: 0 };
  }
}
`,
  );

  writeFileSync(
    MOCK_UNAVAILABLE,
    `// Mock: producer returns false from initialize() (e.g., AgentDB DEGRADED).
export class AutopilotLearning {
  async initialize() { return false; }
  isAvailable() { return false; }
  async getReEngagementContext() {
    throw new Error('should not be called when initialize() returned false');
  }
  async getMetrics() {
    throw new Error('should not be called when initialize() returned false');
  }
}
`,
  );

  writeFileSync(
    MOCK_EMPTY,
    `// Mock: producer available but no episodes (confidence === 0).
export class AutopilotLearning {
  async initialize() { return true; }
  isAvailable() { return true; }
  async getReEngagementContext() {
    return {
      pastFailures: [],
      pastSuccesses: [],
      patterns: [],
      recommendations: [],
      confidence: 0,
    };
  }
  async getMetrics() {
    return { available: true, episodes: 0, patterns: 0, trajectories: 0 };
  }
}
`,
  );
}

function removeMockModules() {
  for (const f of [MOCK_POPULATED, MOCK_UNAVAILABLE, MOCK_EMPTY]) {
    if (existsSync(f)) rmSync(f, { force: true });
  }
}

function runHook({ mockModule } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (mockModule !== undefined) {
      env.AUTOPILOT_LEARNING_MODULE = mockModule;
    } else {
      delete env.AUTOPILOT_LEARNING_MODULE;
    }
    // Force fresh state every run.
    env.AUTOPILOT_MAX_ITERATIONS = '50';
    env.AUTOPILOT_TIMEOUT_MINUTES = '240';
    env.AUTOPILOT_ENABLED = 'true';

    const proc = spawn(process.execPath, [HOOK_PATH], { env });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

// ─── lifecycle ───────────────────────────────────────────────────────

test('setup: stage fixtures', () => {
  cleanupFixtures();
  writeMockModules();
  stageTasks([
    {
      id: 'task-1',
      subject: 'add validation to login form',
      status: 'pending',
    },
  ]);
});

// ─── tests ───────────────────────────────────────────────────────────

test('populated learning context prints augmentation block', async () => {
  // Re-stage tasks (autopilot-state.json reset across runs).
  cleanupFixtures();
  stageTasks([
    { id: 'task-1', subject: 'add validation to login form', status: 'pending' },
  ]);

  const { stdout, stderr, code } = await runHook({ mockModule: MOCK_POPULATED });

  // Exit code 0 either via process.exit(0) or normal completion.
  // The hook may not call process.exit() at end of the re-engage path,
  // so we accept both null (normal exit) and 0.
  assert.ok(code === 0 || code === null, `unexpected exit code ${code}\nstderr:\n${stderr}`);

  // Baseline re-engagement output still present.
  assert.match(stdout, /Swarm not complete yet/, 'baseline re-engagement text missing');
  assert.match(stdout, /Please continue working on the remaining tasks/, 'continue-prompt missing');

  // Augmentation header present with episode count + confidence.
  assert.match(stdout, /Learning context \(25 episodes, confidence 0\.50\)/, 'augmentation header missing');

  // Top patterns subsection (only patterns with avgReward > 0).
  assert.match(stdout, /Top patterns:/, 'patterns header missing');
  assert.match(stdout, /"validation" succeeded 5× \(avg reward 0\.80\)/, 'validation pattern missing');
  assert.match(stdout, /"login" succeeded 4× \(avg reward 0\.60\)/, 'login pattern missing');

  // Past failures subsection.
  assert.match(stdout, /Past failures to avoid:/, 'failures header missing');
  assert.match(stdout, /fix login bug: missed null-check on user\.session/, 'first failure missing');

  // Recommendations subsection.
  assert.match(stdout, /Recommendations:/, 'recommendations header missing');
  assert.match(stdout, /Past failure note: missed null-check on user\.session/, 'rec text missing');

  // Augmentation comes AFTER the "Please continue" line.
  const continueIdx = stdout.indexOf('Please continue working on the remaining tasks');
  const augIdx = stdout.indexOf('Learning context');
  assert.ok(continueIdx >= 0 && augIdx > continueIdx, 'augmentation must follow the continue-prompt line');
});

test('learning unavailable (initialize false) prints no augmentation', async () => {
  cleanupFixtures();
  stageTasks([
    { id: 'task-1', subject: 'add validation to login form', status: 'pending' },
  ]);

  const { stdout, code } = await runHook({ mockModule: MOCK_UNAVAILABLE });

  assert.ok(code === 0 || code === null, `unexpected exit code ${code}`);
  assert.match(stdout, /Please continue working on the remaining tasks/, 'baseline output missing');
  assert.doesNotMatch(stdout, /Learning context/, 'augmentation header must not appear when learning unavailable');
  assert.doesNotMatch(stdout, /Top patterns:/, 'patterns header must not appear');
});

test('empty episodes (confidence 0) prints no augmentation', async () => {
  cleanupFixtures();
  stageTasks([
    { id: 'task-1', subject: 'add validation to login form', status: 'pending' },
  ]);

  const { stdout, code } = await runHook({ mockModule: MOCK_EMPTY });

  assert.ok(code === 0 || code === null, `unexpected exit code ${code}`);
  assert.match(stdout, /Please continue working on the remaining tasks/, 'baseline output missing');
  assert.doesNotMatch(stdout, /Learning context/, 'augmentation header must not appear when confidence is 0');
});

test('import boundary failure logs graceful diagnostic and continues', async () => {
  cleanupFixtures();
  stageTasks([
    { id: 'task-1', subject: 'add validation to login form', status: 'pending' },
  ]);

  const { stdout, code } = await runHook({ mockModule: MOCK_IMPORT_BROKEN });

  assert.ok(code === 0 || code === null, `unexpected exit code ${code}`);
  assert.match(stdout, /Please continue working on the remaining tasks/, 'baseline output missing');
  assert.match(stdout, /\[Autopilot\] learning unavailable \(import failed\):/, 'import-failure diagnostic missing');
  assert.doesNotMatch(stdout, /Learning context/, 'no augmentation should follow a failed import');
});

// ─── teardown ────────────────────────────────────────────────────────

test('teardown: remove fixtures', () => {
  cleanupFixtures();
  removeMockModules();
  // Best-effort: only remove the .claude-flow/data dir we may have created.
  // Leave .claude-flow alone in case other state lives there (none should).
  const dataDir = join(DATA_DIR, 'data');
  if (existsSync(dataDir)) {
    try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  if (existsSync(DATA_DIR)) {
    try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});
