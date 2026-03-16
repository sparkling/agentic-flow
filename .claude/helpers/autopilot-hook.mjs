#!/usr/bin/env node
/**
 * Autopilot Swarm Completion Hook (ADR-058)
 *
 * Stop hook that keeps agents running until all tasks are complete.
 * Intercepts agent exit events, checks task completion state, and
 * re-injects remaining task context if work is still pending.
 *
 * Based on the "Ralph Wiggum" persistent loop pattern.
 *
 * Usage (in .claude/settings.json Stop hook):
 *   node .claude/helpers/autopilot-hook.mjs
 *
 * Environment:
 *   AUTOPILOT_MAX_ITERATIONS  - Max re-engagement loops (default: 50)
 *   AUTOPILOT_TIMEOUT_MINUTES - Wall-clock timeout (default: 240)
 *   AUTOPILOT_TASK_DIR        - Override task directory path
 *   AUTOPILOT_ENABLED         - Set to "false" to disable (default: "true")
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');
const DATA_DIR = join(PROJECT_ROOT, '.claude-flow', 'data');
const STATE_FILE = join(DATA_DIR, 'autopilot-state.json');
const LOG_FILE = join(DATA_DIR, 'autopilot-log.json');

// Configuration
const MAX_ITERATIONS = parseInt(process.env.AUTOPILOT_MAX_ITERATIONS || '50', 10);
const TIMEOUT_MINUTES = parseInt(process.env.AUTOPILOT_TIMEOUT_MINUTES || '240', 10);
const ENABLED = process.env.AUTOPILOT_ENABLED !== 'false';

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ============================================================================
// State Management
// ============================================================================

function loadState() {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    } catch { /* corrupted, reset */ }
  }
  return { iterations: 0, startTime: Date.now(), sessionId: null };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function appendLog(entry) {
  let logs = [];
  if (existsSync(LOG_FILE)) {
    try {
      logs = JSON.parse(readFileSync(LOG_FILE, 'utf-8'));
    } catch { logs = []; }
  }
  logs.push({ ...entry, timestamp: new Date().toISOString() });
  // Keep last 200 entries
  if (logs.length > 200) logs = logs.slice(-200);
  writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
}

// ============================================================================
// Task Discovery
// ============================================================================

/**
 * Find all task sources and return combined task list.
 * Searches: ~/.claude/tasks/{team}/, .claude-flow/swarm-tasks.json, .claude-flow/data/
 */
function discoverTasks() {
  const tasks = [];

  // 1. Team task directories (~/.claude/tasks/*)
  const teamsBase = join(homedir(), '.claude', 'tasks');
  if (existsSync(teamsBase)) {
    try {
      const teamDirs = readdirSync(teamsBase, { withFileTypes: true });
      for (const dir of teamDirs) {
        if (!dir.isDirectory()) continue;
        const teamDir = join(teamsBase, dir.name);
        const files = readdirSync(teamDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          try {
            const data = JSON.parse(readFileSync(join(teamDir, file), 'utf-8'));
            if (data.subject && data.status) {
              tasks.push({ ...data, source: `team:${dir.name}` });
            }
          } catch { /* skip corrupt file */ }
        }
      }
    } catch { /* no teams dir */ }
  }

  // 2. Swarm tasks file (.claude-flow/swarm-tasks.json)
  const swarmFile = join(PROJECT_ROOT, '.claude-flow', 'swarm-tasks.json');
  if (existsSync(swarmFile)) {
    try {
      const data = JSON.parse(readFileSync(swarmFile, 'utf-8'));
      const taskList = Array.isArray(data) ? data : (data.tasks || []);
      for (const t of taskList) {
        if (t.subject && t.status) {
          tasks.push({ ...t, source: 'swarm-tasks' });
        }
      }
    } catch { /* skip */ }
  }

  // 3. Checklist file (.claude-flow/data/checklist.json)
  const checklistFile = join(DATA_DIR, 'checklist.json');
  if (existsSync(checklistFile)) {
    try {
      const data = JSON.parse(readFileSync(checklistFile, 'utf-8'));
      const items = Array.isArray(data) ? data : (data.items || []);
      for (const item of items) {
        if (item.subject || item.title) {
          tasks.push({
            subject: item.subject || item.title,
            status: item.status || (item.done ? 'completed' : 'pending'),
            source: 'checklist',
          });
        }
      }
    } catch { /* skip */ }
  }

  return tasks;
}

// ============================================================================
// Completion Analysis
// ============================================================================

function analyzeCompletion(tasks) {
  const completed = tasks.filter(t => t.status === 'completed');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const pending = tasks.filter(t => t.status === 'pending');
  const blocked = tasks.filter(t => t.status === 'blocked');
  const remaining = [...inProgress, ...pending, ...blocked];

  return {
    total: tasks.length,
    completed: completed.length,
    inProgress: inProgress.length,
    pending: pending.length,
    blocked: blocked.length,
    remaining,
    isComplete: remaining.length === 0,
    progress: tasks.length > 0 ? (completed.length / tasks.length) * 100 : 100,
  };
}

// ============================================================================
// Main Hook Logic
// ============================================================================

function main() {
  if (!ENABLED) {
    process.exit(0);
  }

  const state = loadState();
  state.iterations++;
  const elapsedMs = Date.now() - state.startTime;
  const elapsedMinutes = elapsedMs / 60000;

  // Safety: check iteration limit
  if (state.iterations > MAX_ITERATIONS) {
    appendLog({
      event: 'limit-reached',
      reason: 'max-iterations',
      iterations: state.iterations,
      maxIterations: MAX_ITERATIONS,
    });
    console.log(`[Autopilot] Max iterations reached (${MAX_ITERATIONS}). Allowing stop.`);
    saveState({ iterations: 0, startTime: Date.now(), sessionId: null });
    process.exit(0);
  }

  // Safety: check timeout
  if (elapsedMinutes > TIMEOUT_MINUTES) {
    appendLog({
      event: 'limit-reached',
      reason: 'timeout',
      elapsedMinutes: Math.round(elapsedMinutes),
      timeoutMinutes: TIMEOUT_MINUTES,
    });
    console.log(`[Autopilot] Timeout reached (${TIMEOUT_MINUTES}min). Allowing stop.`);
    saveState({ iterations: 0, startTime: Date.now(), sessionId: null });
    process.exit(0);
  }

  // Discover and analyze tasks
  const tasks = discoverTasks();
  const analysis = analyzeCompletion(tasks);

  // If no tasks found, allow stop (nothing to track)
  if (tasks.length === 0) {
    appendLog({ event: 'no-tasks', iterations: state.iterations });
    saveState(state);
    process.exit(0);
  }

  // If all complete, allow stop
  if (analysis.isComplete) {
    appendLog({
      event: 'all-complete',
      iterations: state.iterations,
      total: analysis.total,
      elapsedMinutes: Math.round(elapsedMinutes),
    });
    console.log(`[Autopilot] All ${analysis.total} tasks complete after ${state.iterations} iterations. Good work!`);
    saveState({ iterations: 0, startTime: Date.now(), sessionId: null });
    process.exit(0);
  }

  // Tasks remain — re-engage the agent
  saveState(state);
  appendLog({
    event: 're-engage',
    iterations: state.iterations,
    completed: analysis.completed,
    remaining: analysis.remaining.length,
    progress: Math.round(analysis.progress),
  });

  // Build re-engagement prompt
  const remainingList = analysis.remaining
    .slice(0, 10) // Show max 10 to avoid overwhelming context
    .map((t, i) => `  ${i + 1}. [${t.status}] ${t.subject}${t.source ? ` (${t.source})` : ''}`)
    .join('\n');

  const moreCount = analysis.remaining.length > 10 ? analysis.remaining.length - 10 : 0;
  const moreText = moreCount > 0 ? `\n  ... and ${moreCount} more tasks` : '';

  console.log(`[Autopilot] Swarm not complete yet. Progress: ${Math.round(analysis.progress)}% (${analysis.completed}/${analysis.total}).`);
  console.log(`Iteration ${state.iterations}/${MAX_ITERATIONS}, elapsed ${Math.round(elapsedMinutes)}/${TIMEOUT_MINUTES} minutes.`);
  console.log(`\nRemaining tasks:\n${remainingList}${moreText}`);
  console.log(`\nPlease continue working on the remaining tasks. Do not stop until all tasks are completed.`);
}

try {
  main();
} catch (err) {
  console.error(`[Autopilot] Hook error: ${err.message || err}`);
  process.exit(0); // Allow agent to stop on hook failure
}
