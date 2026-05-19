/**
 * SwarmCompletionCoordinator — drives drift detection over a swarm task list
 * (ADR-058 Phase 2)
 *
 * Owns a `DriftDetector` and translates external task-lifecycle events
 * (`addTasks` / `updateTask` / `tick`) into the detector's observation calls:
 *
 *   - `tick()`            → bumps iteration counter + records the per-tick
 *                           completion delta into the drift detector
 *   - `updateTask(...)`   → on status ∈ {blocked, failed} → `recordTaskFailure(id)`
 *                         → on `newOwner !== currentOwner` → `recordAgentReassignment(...)`
 *
 * Also produces the re-engagement prompt the autopilot stop-hook injects
 * back into the swarm, and lazily loads `AutopilotLearning` when AgentDB
 * is available (graceful-unavailable when not — that decision belongs to
 * the consumer; the producer surfaces `available:false`).
 */

import { DriftDetector } from './drift-detector.js';
import type { DriftMetrics } from './drift-detector.js';

export interface SwarmTask {
  id: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'failed' | string;
  owner?: string;
  createdAt?: number;
  completedAt?: number;
}

export interface SwarmCompletionConfig {
  maxIterations: number;
  timeoutMinutes: number;
  enabled?: boolean;
}

export interface CompletionState {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  blocked: number;
  failed: number;
  progress: number;
  isComplete: boolean;
  remainingTasks: SwarmTask[];
  iterations: number;
  elapsedMs: number;
}

export interface CompletionHistoryEntry {
  taskId: string;
  duration: number;
  iterations: number;
}

const FAILURE_STATUSES = new Set(['blocked', 'failed']);
const REMAINING_DISPLAY_LIMIT = 10;
const REMAINING_SORT_ORDER: Record<string, number> = {
  in_progress: 0,
  pending: 1,
  blocked: 2,
  failed: 3,
};

export class SwarmCompletionCoordinator {
  private _config: Required<SwarmCompletionConfig>;
  private readonly _drift = new DriftDetector();
  private _tasks = new Map<string, SwarmTask>();
  private _history: CompletionHistoryEntry[] = [];
  private _iterations = 0;
  private _lastCompletedCount = 0;
  private _startedAt = Date.now();

  constructor(config: SwarmCompletionConfig) {
    this._config = {
      maxIterations: config.maxIterations,
      timeoutMinutes: config.timeoutMinutes,
      enabled: config.enabled ?? true,
    };
  }

  addTask(task: SwarmTask): void {
    this._tasks.set(task.id, {
      ...task,
      createdAt: task.createdAt ?? Date.now(),
    });
  }

  addTasks(tasks: SwarmTask[]): void {
    for (const t of tasks) {
      this.addTask(t);
    }
  }

  removeTask(id: string): void {
    this._tasks.delete(id);
  }

  updateTask(id: string, status: SwarmTask['status'], newOwner?: string): void {
    const task = this._tasks.get(id);
    if (!task) {
      // Per sibling test contract (autopilot.test.ts §updateTask): silently
      // ignore updates for tasks we don't know about. Drift events on
      // unknown tasks would muddy the detector signal.
      return;
    }

    if (newOwner !== undefined && newOwner !== task.owner) {
      this._drift.recordAgentReassignment(id, task.owner ?? '', newOwner);
      task.owner = newOwner;
    }

    if (FAILURE_STATUSES.has(status)) {
      this._drift.recordTaskFailure(id);
    }

    const wasCompleted = task.status === 'completed';
    task.status = status;

    if (status === 'completed' && !wasCompleted) {
      task.completedAt = Date.now();
      const duration = (task.createdAt !== undefined)
        ? task.completedAt - task.createdAt
        : 0;
      this._history.push({
        taskId: id,
        duration,
        iterations: this._iterations,
      });
    }
  }

  tick(): void {
    this._iterations += 1;
    const completedNow = this._countCompleted();
    const delta = Math.max(0, completedNow - this._lastCompletedCount);
    this._lastCompletedCount = completedNow;
    this._drift.recordIteration({ completed: delta });
  }

  getState(): CompletionState {
    const total = this._tasks.size;
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    let blocked = 0;
    let failed = 0;
    for (const t of this._tasks.values()) {
      switch (t.status) {
        case 'pending': pending += 1; break;
        case 'in_progress': inProgress += 1; break;
        case 'completed': completed += 1; break;
        case 'blocked': blocked += 1; break;
        case 'failed': failed += 1; break;
      }
    }
    const progress = total === 0 ? 100 : Math.round((completed / total) * 100);
    return {
      total,
      pending,
      inProgress,
      completed,
      blocked,
      failed,
      progress,
      isComplete: total === 0 || completed === total,
      remainingTasks: this.getRemainingTasks(),
      iterations: this._iterations,
      elapsedMs: Date.now() - this._startedAt,
    };
  }

  getRemainingTasks(): SwarmTask[] {
    const remaining = [...this._tasks.values()].filter(t => t.status !== 'completed');
    remaining.sort((a, b) => {
      const sa = REMAINING_SORT_ORDER[a.status] ?? 99;
      const sb = REMAINING_SORT_ORDER[b.status] ?? 99;
      return sa - sb;
    });
    return remaining;
  }

  getCompletionHistory(): CompletionHistoryEntry[] {
    return this._history.map(h => ({ ...h }));
  }

  getAverageCompletionTime(): number {
    if (this._history.length === 0) return 0;
    const total = this._history.reduce((sum, h) => sum + h.duration, 0);
    return total / this._history.length;
  }

  shouldContinue(): boolean {
    if (!this._config.enabled) return false;
    if (this.getState().isComplete) return false;
    if (this._iterations >= this._config.maxIterations) return false;
    return true;
  }

  getDriftMetrics(): DriftMetrics {
    return this._drift.getMetrics();
  }

  async generateReEngagementPrompt(): Promise<string> {
    const state = this.getState();

    if (state.isComplete) {
      return `All ${state.total} tasks complete`;
    }

    const remaining = state.remainingTasks;
    const lines: string[] = [];
    lines.push(`Progress: ${state.completed}/${state.total}`);
    lines.push(`Continue working on the remaining ${remaining.length} task${remaining.length === 1 ? '' : 's'}:`);

    const shown = remaining.slice(0, REMAINING_DISPLAY_LIMIT);
    for (const t of shown) {
      lines.push(`  - [${t.status}] ${t.id}: ${t.subject}`);
    }
    if (remaining.length > REMAINING_DISPLAY_LIMIT) {
      lines.push(`  ... and ${remaining.length - REMAINING_DISPLAY_LIMIT} more`);
    }

    const signals = this._drift.detectDrift();
    if (signals.length > 0) {
      lines.push('');
      for (const sig of signals) {
        lines.push(`⚠ Drift detected: ${sig.type} (${sig.severity}): ${sig.message}`);
      }
    }

    return lines.join('\n');
  }

  async initializeLearning(): Promise<boolean> {
    // Graceful-unavailable here is correct (ADR-0193 §C audit note: the
    // PRODUCER side has already done absence-not-accepted logging — see
    // AutopilotLearning.initialize(). The CONSUMER side should fall back
    // to "no learning available" rather than crash the swarm.)
    try {
      const mod = await import('./autopilot-learning.js');
      const learning = new mod.AutopilotLearning();
      return await learning.initialize();
    } catch (err) {
      console.error(`[SwarmCompletionCoordinator] initializeLearning failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  reset(): void {
    this._tasks.clear();
    this._history = [];
    this._iterations = 0;
    this._lastCompletedCount = 0;
    this._startedAt = Date.now();
    this._drift.reset();
  }

  getConfig(): Required<SwarmCompletionConfig> {
    return { ...this._config };
  }

  setConfig(partial: Partial<SwarmCompletionConfig>): void {
    this._config = { ...this._config, ...partial };
  }

  private _countCompleted(): number {
    let n = 0;
    for (const t of this._tasks.values()) {
      if (t.status === 'completed') n += 1;
    }
    return n;
  }
}
