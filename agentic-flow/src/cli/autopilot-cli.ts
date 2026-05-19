/**
 * Autopilot CLI - Persistent swarm completion management
 * Subcommands: status, enable, disable, config, reset, log, learn, history, predict
 *
 * ADR-058: Autopilot Swarm Completion System
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(process.cwd(), '.claude-flow', 'data');
const STATE_FILE = resolve(DATA_DIR, 'autopilot-state.json');
const LOG_FILE = resolve(DATA_DIR, 'autopilot-log.json');
const SETTINGS_FILE = resolve(process.cwd(), '.claude', 'settings.json');

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadState(): { iterations: number; startTime: number; sessionId: string | null } {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    } catch { /* corrupt */ }
  }
  return { iterations: 0, startTime: Date.now(), sessionId: null };
}

interface AutopilotSettingsBlock {
  enabled?: boolean;
  maxIterations?: number;
  timeoutMinutes?: number;
}

interface ClaudeFlowSettings {
  autopilot?: AutopilotSettingsBlock;
  [key: string]: unknown;
}

interface SettingsFile {
  claudeFlow?: ClaudeFlowSettings;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp?: string;
  event?: string;
  iterations?: number;
  reason?: string;
  progress?: number;
  [key: string]: unknown;
}

function loadSettings(): SettingsFile {
  // ADR-0191 Cluster D: ENOENT-only discrimination. SyntaxError on a state
  // file is a corrupt-state bug and must fail loud, not fall back to "no
  // file". The `existsSync` guard is retained for the common no-config-yet
  // path, but the catch only swallows the post-stat race where the file
  // disappears between existsSync and readFileSync.
  if (existsSync(SETTINGS_FILE)) {
    try {
      return JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')) as SettingsFile;
    } catch (e: unknown) {
      if ((e as { code?: string } | null)?.code === 'ENOENT') return {};
      throw e;
    }
  }
  return {};
}

function saveSettings(settings: SettingsFile): void {
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
}

function loadLog(): LogEntry[] {
  // ADR-0191 Cluster D: ENOENT-only discrimination. See loadSettings comment.
  if (existsSync(LOG_FILE)) {
    try {
      return JSON.parse(readFileSync(LOG_FILE, 'utf-8')) as LogEntry[];
    } catch (e: unknown) {
      if ((e as { code?: string } | null)?.code === 'ENOENT') return [];
      throw e;
    }
  }
  return [];
}

function parseOptions(args: string[]): Record<string, string | boolean> {
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-iterations' && args[i + 1]) {
      opts.maxIterations = args[++i];
    } else if (args[i] === '--timeout' && args[i + 1]) {
      opts.timeout = args[++i];
    } else if (args[i] === '--json') {
      opts.json = true;
    } else if (args[i] === '--last' && args[i + 1]) {
      opts.last = args[++i];
    } else if (args[i] === '--clear') {
      opts.clear = true;
    } else if (args[i] === '--query' && args[i + 1]) {
      opts.query = args[++i];
    } else if (args[i] === '--limit' && args[i + 1]) {
      opts.limit = args[++i];
    } else if (args[i] === '--event' && args[i + 1]) {
      opts.event = args[++i];
    } else if (args[i] === '--human') {
      opts.human = true;
    }
  }
  return opts;
}

async function showStatus(opts: Record<string, string | boolean>): Promise<void> {
  const state = loadState();
  const settings = loadSettings();
  const config = settings.claudeFlow?.autopilot || {};
  const enabled = config.enabled !== false;
  const maxIterations = config.maxIterations || 50;
  const timeoutMinutes = config.timeoutMinutes || 240;
  const elapsedMs = Date.now() - state.startTime;
  const elapsedMinutes = Math.round(elapsedMs / 60000);

  if (opts.json) {
    console.log(JSON.stringify({
      enabled,
      iterations: state.iterations,
      maxIterations,
      elapsedMinutes,
      timeoutMinutes,
      startTime: new Date(state.startTime).toISOString(),
      sessionId: state.sessionId,
    }, null, 2));
    return;
  }

  console.log('\nAutopilot - Swarm Completion System');
  console.log('='.repeat(50));
  console.log(`  Enabled:        ${enabled ? 'YES' : 'NO'}`);
  console.log(`  Iterations:     ${state.iterations} / ${maxIterations}`);
  console.log(`  Elapsed:        ${elapsedMinutes} / ${timeoutMinutes} minutes`);
  console.log(`  Start Time:     ${new Date(state.startTime).toISOString()}`);
  console.log(`  Session ID:     ${state.sessionId || '(none)'}`);
  console.log(`  State File:     ${STATE_FILE}`);
  console.log(`  Log File:       ${LOG_FILE}`);
  console.log('');

  // Show recent log entries
  const log = loadLog();
  if (log.length > 0) {
    const recent = log.slice(-5);
    console.log('Recent Events:');
    for (const entry of recent) {
      const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '?';
      console.log(`  [${time}] ${entry.event} - iter:${entry.iterations || 0} ${entry.reason || ''}`);
    }
    console.log('');
  }
}

async function enableAutopilot(): Promise<void> {
  const settings = loadSettings();
  if (!settings.claudeFlow) settings.claudeFlow = {};
  if (!settings.claudeFlow.autopilot) settings.claudeFlow.autopilot = {};
  settings.claudeFlow.autopilot.enabled = true;
  saveSettings(settings);
  console.log('\nAutopilot ENABLED.');
  console.log('  Swarms will now run until all tasks are complete.');
  console.log('');
}

async function disableAutopilot(): Promise<void> {
  const settings = loadSettings();
  if (!settings.claudeFlow) settings.claudeFlow = {};
  if (!settings.claudeFlow.autopilot) settings.claudeFlow.autopilot = {};
  settings.claudeFlow.autopilot.enabled = false;
  saveSettings(settings);
  console.log('\nAutopilot DISABLED.');
  console.log('  Agents will stop normally without re-engagement.');
  console.log('');
}

async function configureAutopilot(opts: Record<string, string | boolean>): Promise<void> {
  const settings = loadSettings();
  if (!settings.claudeFlow) settings.claudeFlow = {};
  if (!settings.claudeFlow.autopilot) {
    settings.claudeFlow.autopilot = {
      enabled: true,
      maxIterations: 50,
      timeoutMinutes: 240,
    };
  }

  let changed = false;

  if (opts.maxIterations) {
    const val = parseInt(opts.maxIterations as string, 10);
    if (isNaN(val) || val < 1 || val > 1000) {
      console.error('Error: --max-iterations must be a number between 1 and 1000.');
      return;
    }
    settings.claudeFlow.autopilot.maxIterations = val;
    changed = true;
    console.log(`  maxIterations: ${val}`);
  }

  if (opts.timeout) {
    const val = parseInt(opts.timeout as string, 10);
    if (isNaN(val) || val < 1 || val > 1440) {
      console.error('Error: --timeout must be a number between 1 and 1440 minutes (24h).');
      return;
    }
    settings.claudeFlow.autopilot.timeoutMinutes = val;
    changed = true;
    console.log(`  timeoutMinutes: ${val}`);
  }

  if (changed) {
    saveSettings(settings);
    console.log('\nAutopilot configuration updated.');
  } else {
    console.log('\nAutopilot Configuration');
    console.log('='.repeat(50));
    console.log(JSON.stringify(settings.claudeFlow.autopilot, null, 2));
    console.log('\nUse --max-iterations <n> and/or --timeout <minutes> to update.');
  }
  console.log('');
}

async function resetState(): Promise<void> {
  ensureDataDir();
  const freshState = { iterations: 0, startTime: Date.now(), sessionId: null };
  writeFileSync(STATE_FILE, JSON.stringify(freshState, null, 2));
  console.log('\nAutopilot state reset.');
  console.log(`  Iterations: 0`);
  console.log(`  Start time: ${new Date().toISOString()}`);
  console.log('');
}

async function showLog(opts: Record<string, string | boolean>): Promise<void> {
  if (opts.clear) {
    if (existsSync(LOG_FILE)) {
      unlinkSync(LOG_FILE);
    }
    console.log('\nAutopilot log cleared.');
    console.log('');
    return;
  }

  const log = loadLog();
  const count = opts.last ? parseInt(opts.last as string, 10) : 20;
  const entries = log.slice(-count);

  if (opts.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log(`\nAutopilot Log (last ${entries.length} of ${log.length} entries)`);
  console.log('='.repeat(60));

  if (entries.length === 0) {
    console.log('  (no log entries)');
  } else {
    for (const entry of entries) {
      const ts = entry.timestamp || '?';
      const event = entry.event || '?';
      const iter = entry.iterations != null ? `iter:${entry.iterations}` : '';
      const extra = entry.reason ? `reason:${entry.reason}` : '';
      const progress = entry.progress != null ? `progress:${entry.progress}%` : '';
      const parts = [iter, progress, extra].filter(Boolean).join(' ');
      console.log(`  [${ts}] ${event} ${parts}`);
    }
  }
  console.log('');
}

async function showLearn(opts: Record<string, string | boolean>): Promise<void> {
  try {
    const { AutopilotLearning } = await import('../coordination/autopilot-learning.js');
    const learning = new AutopilotLearning();
    const available = await learning.initialize();

    if (!available) {
      if (opts.json) {
        console.log(JSON.stringify({ available: false, patterns: [], metrics: {} }, null, 2));
      } else {
        console.log('\nAutopilot Learning');
        console.log('='.repeat(50));
        console.log('  AgentDB not available — no learning data.');
        console.log('');
      }
      return;
    }

    const patterns = await learning.discoverSuccessPatterns();
    const metrics = await learning.getMetrics();

    if (opts.json) {
      console.log(JSON.stringify({
        available: true,
        patterns: patterns.map(p => ({
          pattern: p.pattern,
          frequency: p.frequency,
          avgReward: p.avgReward,
        })),
        metrics: {
          episodes: metrics.episodes, patterns: metrics.patterns,
          trajectories: metrics.trajectories,
        },
      }, null, 2));
      return;
    }

    console.log('\nAutopilot Learning - Discovered Patterns');
    console.log('='.repeat(50));
    console.log(`  Episodes: ${metrics.episodes}`);
    console.log(`  Patterns: ${metrics.patterns}`);
    console.log(`  Trajectories: ${metrics.trajectories}`);
    console.log('');

    if (patterns.length === 0) {
      console.log('  No patterns discovered yet.');
    } else {
      for (const p of patterns) {
        console.log(`  ${p.pattern} — frequency:${p.frequency} avgReward:${p.avgReward.toFixed(2)}`);
      }
    }
    console.log('');
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function showHistory(opts: Record<string, string | boolean>): Promise<void> {
  const query = opts.query as string;
  if (!query) {
    console.error('Error: --query is required for the history command.');
    console.error('Usage: npx agentic-flow autopilot history --query "task description" [--limit N] [--json]');
    return;
  }

  const limit = opts.limit ? parseInt(opts.limit as string, 10) : 5;

  try {
    const { AutopilotLearning } = await import('../coordination/autopilot-learning.js');
    const learning = new AutopilotLearning();
    const available = await learning.initialize();

    if (!available) {
      if (opts.json) {
        console.log(JSON.stringify({ available: false, episodes: [] }, null, 2));
      } else {
        console.log('\nAutopilot History');
        console.log('='.repeat(50));
        console.log('  AgentDB not available — no history.');
        console.log('');
      }
      return;
    }

    const episodes = await learning.recallSimilarTasks(query, limit);

    if (opts.json) {
      console.log(JSON.stringify({
        available: true, query, count: episodes.length,
        episodes: episodes.map(ep => ({
          taskId: ep.taskId,
          subject: ep.subject,
          status: ep.status,
          reward: ep.reward,
          iterations: ep.iterations,
          durationMs: ep.durationMs,
        })),
      }, null, 2));
      return;
    }

    console.log(`\nAutopilot History — query: "${query}"`);
    console.log('='.repeat(50));

    if (episodes.length === 0) {
      console.log('  No matching episodes found.');
    } else {
      for (const ep of episodes) {
        const icon = ep.status === 'completed' ? '+' : '-';
        console.log(`  [${icon}] ${ep.subject} reward:${ep.reward ?? '?'} status:${ep.status}`);
      }
    }
    console.log('');
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function showPredict(opts: Record<string, string | boolean>): Promise<void> {
  try {
    const { AutopilotLearning } = await import('../coordination/autopilot-learning.js');
    const learning = new AutopilotLearning();
    const available = await learning.initialize();

    if (!available) {
      if (opts.json) {
        console.log(JSON.stringify({ available: false, action: 'continue', confidence: 0 }, null, 2));
      } else {
        console.log('\nAutopilot Prediction');
        console.log('='.repeat(50));
        console.log('  AgentDB not available — using default prediction.');
        console.log('  Recommended action: continue');
        console.log('');
      }
      return;
    }

    const prediction = await learning.predictNextAction({ context: 'cli-predict' });

    if (opts.json) {
      console.log(JSON.stringify({
        available: true,
        action: prediction.action,
        confidence: prediction.confidence,
      }, null, 2));
      return;
    }

    console.log('\nAutopilot Prediction');
    console.log('='.repeat(50));
    console.log(`  Action:     ${prediction.action}`);
    console.log(`  Confidence: ${Math.round(prediction.confidence * 100)}%`);
    console.log('');
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// === SUBSCRIBE+FEDERATION BEGIN (ADR-0195/0196 CLI surface) ===
const VALID_SUBSCRIBE_EVENTS = new Set([
  'episode:recorded',
  'pattern:discovered',
  'trajectory:opened',
  'trajectory:step',
  'trajectory:closed',
]);

/**
 * `autopilot subscribe --event <name> [--limit N] [--human]`
 *
 * Subscribes to one of the AutopilotLearning cross-controller events on
 * AgentDBService's long-lived `learningEvents` EventEmitter (ADR-0195
 * Phase 4) and prints one JSON line per delivered event. Exits after
 * `--limit N` deliveries (default 1) or on SIGINT.
 *
 * JSON is the default output (events are structured); `--human` pretty-
 * prints with a 2-space indent.
 *
 * Per `feedback-no-fallbacks`: when AgentDBService is missing or
 * `getLearningEvents()` is unavailable, this THROWS — no silent degrade.
 */
async function subscribeEvents(opts: Record<string, string | boolean>): Promise<void> {
  const event = opts.event as string | undefined;
  if (!event) {
    console.error('Error: --event <name> is required.');
    console.error(`  Valid events: ${[...VALID_SUBSCRIBE_EVENTS].join(', ')}`);
    process.exit(2);
  }
  if (!VALID_SUBSCRIBE_EVENTS.has(event)) {
    console.error(`Error: unknown event "${event}".`);
    console.error(`  Valid events: ${[...VALID_SUBSCRIBE_EVENTS].join(', ')}`);
    process.exit(2);
  }

  const limit = opts.limit ? parseInt(opts.limit as string, 10) : 1;
  if (isNaN(limit) || limit < 1) {
    console.error('Error: --limit must be a positive integer.');
    process.exit(2);
  }

  const svc = await import('../services/agentdb-service.js');
  const getInstance = (svc as { getAgentDBService?: () => Promise<unknown> }).getAgentDBService;
  if (typeof getInstance !== 'function') {
    throw new Error('AgentDBService unavailable: getAgentDBService export missing');
  }
  type EventBus = {
    on: (event: string, handler: (payload: unknown) => void) => void;
    off: (event: string, handler: (payload: unknown) => void) => void;
  };
  const agentdb = await getInstance() as {
    getLearningEvents?: () => EventBus;
  } | null;
  if (!agentdb) {
    throw new Error('AgentDBService unavailable: getAgentDBService returned null');
  }
  if (typeof agentdb.getLearningEvents !== 'function') {
    throw new Error('AgentDBService.getLearningEvents() unavailable on this build');
  }
  const bus = agentdb.getLearningEvents();
  if (!bus) {
    throw new Error('AgentDBService.getLearningEvents() returned falsy');
  }

  const human = Boolean(opts.human);
  let count = 0;

  await new Promise<void>((resolve) => {
    const onEvent = (payload: unknown) => {
      const line = { event, payload, timestamp: new Date().toISOString() };
      console.log(human ? JSON.stringify(line, null, 2) : JSON.stringify(line));
      count += 1;
      if (count >= limit) {
        bus.off(event, onEvent);
        resolve();
      }
    };
    bus.on(event, onEvent);

    process.once('SIGINT', () => {
      bus.off(event, onEvent);
      resolve();
    });
  });
}

/**
 * `autopilot federation status [--human]`
 *
 * Reports the configured FederatedSyncProvider state (ADR-0196 Phase 5).
 * Output shape:
 *   { localInstallId, provider: "noop" | "sync-coordinator",
 *     transportReady, conflictStrategy }
 *
 * Per `feedback-no-fallbacks`: an unwired provider IS the no-op default
 * — that's an honest single-install state, not a fallback. If
 * AutopilotLearning.getSyncProvider is missing entirely (older build),
 * we THROW rather than fabricate a shape.
 */
async function showFederationStatus(opts: Record<string, string | boolean>): Promise<void> {
  const { AutopilotLearning } = await import('../coordination/autopilot-learning.js');
  const { NoopFederatedSyncProvider } = await import('../services/federated-sync-provider.js');

  const learning = new AutopilotLearning();
  const getProvider = (learning as { getSyncProvider?: () => unknown }).getSyncProvider;
  if (typeof getProvider !== 'function') {
    throw new Error('AutopilotLearning.getSyncProvider() unavailable on this build');
  }
  const provider = getProvider.call(learning) as {
    status: () => { available: boolean };
    conflictStrategy: () => string;
    getLocalInstallId: () => string;
  };

  const status = provider.status();
  const kind = provider instanceof NoopFederatedSyncProvider ? 'noop' : 'sync-coordinator';
  const shape = {
    localInstallId: provider.getLocalInstallId(),
    provider: kind,
    transportReady: Boolean(status.available),
    conflictStrategy: provider.conflictStrategy(),
  };

  if (opts.human) {
    console.log('\nAutopilot Federation Status');
    console.log('='.repeat(50));
    console.log(`  localInstallId:   ${shape.localInstallId}`);
    console.log(`  provider:         ${shape.provider}`);
    console.log(`  transportReady:   ${shape.transportReady}`);
    console.log(`  conflictStrategy: ${shape.conflictStrategy}`);
    console.log('');
    return;
  }

  console.log(JSON.stringify(shape));
}

async function handleFederationCommand(args: string[]): Promise<void> {
  const sub = args[0];
  const opts = parseOptions(args.slice(1));
  switch (sub) {
    case 'status':
      await showFederationStatus(opts);
      break;
    default:
      console.error(`Unknown federation subcommand: ${sub ?? '(none)'}`);
      console.error('Usage: npx agentic-flow autopilot federation status [--json|--human]');
      process.exit(2);
  }
}
// === SUBSCRIBE+FEDERATION END ===

// === PATTERNS+EPISODES BEGIN (ADR-0194/0196 CLI surface) ===

/**
 * `autopilot patterns` — discover success patterns from past episodes.
 *
 * Wraps `AutopilotLearning.discoverSuccessPatterns()`, which internally
 * unions Phase 2 keyword aggregation with Phase 3 embedding-cluster
 * results (ADR-0194). Each `DiscoveredPattern` carries a `source` tag
 * (`'phase2-keyword'` or `'phase3-embedding'`); the `engine` field on
 * the JSON output summarises which producers contributed.
 *
 * Per `feedback-no-fallbacks`: when AgentDBService is unavailable this
 * throws with a clear message rather than emitting an empty list.
 */
async function showPatterns(opts: Record<string, string | boolean>): Promise<void> {
  const { AutopilotLearning } = await import('../coordination/autopilot-learning.js');
  const learning = new AutopilotLearning();
  const available = await learning.initialize();

  if (!available) {
    throw new Error(
      'AgentDBService is not available — cannot discover patterns. ' +
      'Initialize agentic-flow with AgentDB (see `agentic-flow doctor`).',
    );
  }

  const patterns = await learning.discoverSuccessPatterns();
  const sources = new Set(patterns.map(p => p.source));
  // engine = union of observed producers; when both contributed we tag
  // it as 'union' so consumers don't need to inspect every row.
  const engine: 'keyword' | 'embedding-cluster' | 'union' =
    sources.has('phase2-keyword') && sources.has('phase3-embedding') ? 'union'
    : sources.has('phase3-embedding') ? 'embedding-cluster'
    : 'keyword';

  if (opts.json) {
    console.log(JSON.stringify({ engine, patterns }, null, 2));
    return;
  }

  console.log('\nAutopilot Patterns');
  console.log('='.repeat(60));
  console.log(`  engine: ${engine}   patterns: ${patterns.length}`);
  console.log('');

  if (patterns.length === 0) {
    console.log('  (no patterns discovered yet)');
    console.log('');
    return;
  }

  // Columns: pattern | source | frequency | avgReward
  const colP = Math.max(20, ...patterns.map(p => p.pattern.length));
  const colS = Math.max(8, ...patterns.map(p => p.source.length));
  const head =
    'pattern'.padEnd(colP) + '  ' +
    'source'.padEnd(colS)  + '  ' +
    'freq'.padStart(6)     + '  ' +
    'avgReward'.padStart(10);
  console.log('  ' + head);
  console.log('  ' + '-'.repeat(head.length));
  for (const p of patterns) {
    console.log(
      '  ' +
      p.pattern.padEnd(colP) + '  ' +
      p.source.padEnd(colS)  + '  ' +
      String(p.frequency).padStart(6) + '  ' +
      p.avgReward.toFixed(3).padStart(10),
    );
  }
  console.log('');
}

/**
 * `autopilot episodes` — list the last N autopilot episodes, newest-first.
 *
 * Reads from the `autopilot:phase1` session in AgentDB via
 * `AutopilotLearning.listRecentEpisodes(N)`, which wraps the
 * `_listEpisodes` / `recallEpisodes` read path in autopilot-learning.ts.
 * Default N = 10.
 *
 * JSON output preserves the full `AutopilotEpisode` shape including the
 * ADR-0196 Phase 5 `originInstallId` field (read from persisted
 * metadata). `vectorClock` is NOT persisted (per `_record`: peers
 * reconstruct causality via SyncCoordinator CRDT merge), so it stays
 * `undefined` on read — surfaced honestly rather than fabricated.
 *
 * Per `feedback-no-fallbacks`: throws on AgentDBService unavailability.
 */
async function showEpisodes(opts: Record<string, string | boolean>): Promise<void> {
  const lastRaw = opts.last as string | undefined;
  const limit = lastRaw !== undefined ? parseInt(lastRaw, 10) : 10;
  if (!Number.isFinite(limit) || limit < 1 || limit > 10000) {
    throw new Error('--last must be a positive integer ≤ 10000');
  }

  const { AutopilotLearning } = await import('../coordination/autopilot-learning.js');
  const learning = new AutopilotLearning();
  const available = await learning.initialize();

  if (!available) {
    throw new Error(
      'AgentDBService is not available — cannot list episodes. ' +
      'Initialize agentic-flow with AgentDB (see `agentic-flow doctor`).',
    );
  }

  const episodes = await learning.listRecentEpisodes(limit);

  if (opts.json) {
    console.log(JSON.stringify(episodes, null, 2));
    return;
  }

  console.log(`\nAutopilot Episodes (last ${episodes.length})`);
  console.log('='.repeat(70));

  if (episodes.length === 0) {
    console.log('  (no episodes recorded)');
    console.log('');
    return;
  }

  // Columns: taskId | subject | status | reward | timestamp
  const truncatedSubjects = episodes.map(ep => ep.subject.length > 40
    ? ep.subject.slice(0, 37) + '...'
    : ep.subject);
  const colT = Math.max(8, ...episodes.map(ep => ep.taskId.length));
  const colS = Math.max(12, ...truncatedSubjects.map(s => s.length));
  const head =
    'taskId'.padEnd(colT) + '  ' +
    'subject'.padEnd(colS) + '  ' +
    'status'.padEnd(10) + '  ' +
    'reward'.padStart(8) + '  ' +
    'timestamp';
  console.log('  ' + head);
  console.log('  ' + '-'.repeat(head.length));
  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i];
    const reward = typeof ep.reward === 'number' ? ep.reward.toFixed(3) : '?';
    const ts = typeof ep.timestamp === 'number'
      ? new Date(ep.timestamp).toISOString()
      : '?';
    console.log(
      '  ' +
      ep.taskId.padEnd(colT) + '  ' +
      truncatedSubjects[i].padEnd(colS) + '  ' +
      ep.status.padEnd(10) + '  ' +
      reward.padStart(8) + '  ' +
      ts,
    );
  }
  console.log('');
}

// === PATTERNS+EPISODES END ===

function printHelp(): void {
  console.log(`
Autopilot - Persistent Swarm Completion (ADR-058)

Keeps agent swarms running until ALL tasks are complete.
Uses Stop hooks to intercept exit and re-engage agents.

USAGE: npx agentic-flow autopilot <command> [options]

COMMANDS:
  status [--json]                             Show current state
  enable                                      Enable persistent completion
  disable                                     Disable persistent completion
  config [--max-iterations N] [--timeout M]   View/update configuration
  reset                                       Reset iteration counter
  log [--last N] [--json] [--clear]           View/clear event log
  learn [--json]                              Discover success patterns from AgentDB
  history --query <text> [--limit N] [--json] Search past task episodes
  predict [--json]                            Predict optimal next action
  subscribe --event <name> [--limit N] [--human]
                                              Stream cross-controller events (ADR-0195)
  federation status [--human]                 Show FederatedSyncProvider state (ADR-0196)
  patterns [--json]                           Discover unioned Phase 2 + Phase 3 patterns (ADR-0194)
  episodes [--last N] [--json]                List recent autopilot episodes (ADR-0196 Phase 5 fields)

EXAMPLES:
  npx agentic-flow autopilot status
  npx agentic-flow autopilot config --max-iterations 100 --timeout 120
  npx agentic-flow autopilot log --last 50 --json
  npx agentic-flow autopilot enable
  npx agentic-flow autopilot learn --json
  npx agentic-flow autopilot history --query "authentication" --limit 10
  npx agentic-flow autopilot predict --json
  npx agentic-flow autopilot patterns --json
  npx agentic-flow autopilot episodes --last 20 --json

ENVIRONMENT:
  AUTOPILOT_MAX_ITERATIONS   Override max iterations (default: 50)
  AUTOPILOT_TIMEOUT_MINUTES  Override timeout in minutes (default: 240)
  AUTOPILOT_ENABLED          Set to "false" to disable (default: "true")
`);
}

export async function handleAutopilotCommand(args: string[]): Promise<void> {
  const command = args[0];
  const opts = parseOptions(args.slice(1));

  switch (command) {
    case undefined:
    case 'help':
      printHelp();
      break;
    case 'status':
      await showStatus(opts);
      break;
    case 'enable':
      await enableAutopilot();
      break;
    case 'disable':
      await disableAutopilot();
      break;
    case 'config':
      await configureAutopilot(opts);
      break;
    case 'reset':
      await resetState();
      break;
    case 'log':
      await showLog(opts);
      break;
    case 'learn':
      await showLearn(opts);
      break;
    case 'history':
      await showHistory(opts);
      break;
    case 'predict':
      await showPredict(opts);
      break;
    // === SUBSCRIBE+FEDERATION DISPATCH BEGIN ===
    case 'subscribe':
      await subscribeEvents(opts);
      break;
    case 'federation':
      await handleFederationCommand(args.slice(1));
      break;
    // === SUBSCRIBE+FEDERATION DISPATCH END ===
    // === PATTERNS+EPISODES DISPATCH BEGIN ===
    case 'patterns':
      await showPatterns(opts);
      break;
    case 'episodes':
      await showEpisodes(opts);
      break;
    // === PATTERNS+EPISODES DISPATCH END ===
    default:
      console.log(`\nUnknown command: ${command}`);
      console.log('Use "npx agentic-flow autopilot help" for usage.\n');
  }
}
