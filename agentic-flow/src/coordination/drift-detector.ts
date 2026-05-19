/**
 * DriftDetector — autopilot swarm drift detection (ADR-058 Phase 2)
 *
 * Detects four classes of swarm drift signal so the autopilot can mitigate
 * before iteration budget is wasted:
 *
 *   - stall     — no completions for `stallThreshold` consecutive iterations
 *   - cycling   — a single task fails ≥ `cyclingThreshold` times
 *   - thrashing — a single task is reassigned ≥ `thrashingThreshold` times
 *   - decay     — the second half of the completion-rate history drops below
 *                 `decayThreshold` × the first half (rate trending toward zero)
 *
 * Each signal carries a deterministic mitigation suggestion
 * (`suggestMitigation`) so consumers don't need to encode policy.
 *
 * The detector is pure state + observation; it does NOT issue mitigations
 * itself. The owning coordinator (`SwarmCompletionCoordinator`) drives
 * iteration recording via `tick()` and translates task updates into
 * `recordTaskFailure` / `recordAgentReassignment` calls.
 */

export type DriftSignalType = 'stall' | 'cycling' | 'thrashing' | 'decay';
export type DriftSeverity = 'low' | 'medium' | 'high';

export interface DriftSignal {
  type: DriftSignalType;
  severity: DriftSeverity;
  message: string;
  affectedTaskIds?: string[];
  detectedAt: number;
}

export interface DriftConfig {
  stallThreshold: number;
  cyclingThreshold: number;
  thrashingThreshold: number;
  decayHistorySize: number;
  decayThreshold: number;
}

export interface DriftMetrics {
  iterationsSinceLastCompletion: number;
  completionRateHistory: number[];
  totalSignals: number;
  signalsByType: Record<DriftSignalType, number>;
  activeSignals: DriftSignal[];
}

export interface DriftMitigation {
  action: 'escalate' | 'reprioritize' | 'reassign' | 'skip';
  taskIds?: string[];
  reason: string;
}

const DEFAULT_CONFIG: DriftConfig = {
  stallThreshold: 5,
  cyclingThreshold: 3,
  thrashingThreshold: 3,
  decayHistorySize: 10,
  decayThreshold: 0.5,
};

function emptySignalCounts(): Record<DriftSignalType, number> {
  return { stall: 0, cycling: 0, thrashing: 0, decay: 0 };
}

export class DriftDetector {
  private _config: DriftConfig = { ...DEFAULT_CONFIG };
  private _iterationsSinceLastCompletion = 0;
  private _completionRateHistory: number[] = [];
  private _taskFailureCounts = new Map<string, number>();
  private _taskReassignmentCounts = new Map<string, number>();
  private _signalsByType: Record<DriftSignalType, number> = emptySignalCounts();
  private _totalSignals = 0;
  private _activeSignals: DriftSignal[] = [];

  recordIteration(p: { completed: number }): void {
    const n = p.completed;
    this._completionRateHistory.push(n);
    if (n === 0) {
      this._iterationsSinceLastCompletion += 1;
    } else {
      this._iterationsSinceLastCompletion = 0;
    }
  }

  recordTaskFailure(taskId: string): void {
    const prev = this._taskFailureCounts.get(taskId) ?? 0;
    this._taskFailureCounts.set(taskId, prev + 1);
  }

  recordAgentReassignment(taskId: string, _from: string, _to: string): void {
    const prev = this._taskReassignmentCounts.get(taskId) ?? 0;
    this._taskReassignmentCounts.set(taskId, prev + 1);
  }

  detectDrift(): DriftSignal[] {
    const now = Date.now();
    const signals: DriftSignal[] = [];

    // ── Stall ────────────────────────────────────────────────────────
    if (this._iterationsSinceLastCompletion >= this._config.stallThreshold) {
      signals.push({
        type: 'stall',
        severity: 'high',
        message: `No completions for ${this._iterationsSinceLastCompletion} iterations (threshold: ${this._config.stallThreshold})`,
        detectedAt: now,
      });
    }

    // ── Cycling ──────────────────────────────────────────────────────
    for (const [taskId, count] of this._taskFailureCounts) {
      if (count >= this._config.cyclingThreshold) {
        signals.push({
          type: 'cycling',
          severity: 'medium',
          message: `Task ${taskId} has failed ${count} times (threshold: ${this._config.cyclingThreshold})`,
          affectedTaskIds: [taskId],
          detectedAt: now,
        });
      }
    }

    // ── Thrashing ────────────────────────────────────────────────────
    for (const [taskId, count] of this._taskReassignmentCounts) {
      if (count >= this._config.thrashingThreshold) {
        signals.push({
          type: 'thrashing',
          severity: 'medium',
          message: `Task ${taskId} has been reassigned ${count} times (threshold: ${this._config.thrashingThreshold})`,
          affectedTaskIds: [taskId],
          detectedAt: now,
        });
      }
    }

    // ── Decay ────────────────────────────────────────────────────────
    if (this._completionRateHistory.length >= this._config.decayHistorySize) {
      const window = this._completionRateHistory.slice(-this._config.decayHistorySize);
      const half = Math.floor(window.length / 2);
      const firstHalf = window.slice(0, half);
      const secondHalf = window.slice(half);
      const firstSum = firstHalf.reduce((a, b) => a + b, 0);
      const secondSum = secondHalf.reduce((a, b) => a + b, 0);
      if (firstSum > 0 && secondSum < firstSum * this._config.decayThreshold) {
        signals.push({
          type: 'decay',
          severity: 'low',
          message: `Completion rate declining: first half sum=${firstSum}, second half sum=${secondSum} (< ${this._config.decayThreshold * 100}% of first half)`,
          detectedAt: now,
        });
      }
    }

    // Bookkeeping: update cumulative + active signals.
    for (const sig of signals) {
      this._totalSignals += 1;
      this._signalsByType[sig.type] += 1;
    }
    this._activeSignals = signals;

    return signals;
  }

  suggestMitigation(signal: DriftSignal): DriftMitigation {
    switch (signal.type) {
      case 'stall':
        return {
          action: 'escalate',
          reason: 'No completions — escalate to a higher-capability agent or operator',
        };
      case 'cycling':
        return {
          action: 'reprioritize',
          taskIds: signal.affectedTaskIds ?? [],
          reason: 'Task keeps failing — reprioritize or decompose before retrying',
        };
      case 'thrashing':
        return {
          action: 'reassign',
          taskIds: signal.affectedTaskIds ?? [],
          reason: 'Task is bouncing between agents — pin to a single owner',
        };
      case 'decay':
        return {
          action: 'skip',
          reason: 'Completion rate trending to zero — skip stuck items and surface remainder',
        };
    }
  }

  getMetrics(): DriftMetrics {
    return {
      iterationsSinceLastCompletion: this._iterationsSinceLastCompletion,
      completionRateHistory: [...this._completionRateHistory],
      totalSignals: this._totalSignals,
      signalsByType: { ...this._signalsByType },
      activeSignals: [...this._activeSignals],
    };
  }

  reset(): void {
    this._iterationsSinceLastCompletion = 0;
    this._completionRateHistory = [];
    this._taskFailureCounts.clear();
    this._taskReassignmentCounts.clear();
    this._signalsByType = emptySignalCounts();
    this._totalSignals = 0;
    this._activeSignals = [];
  }

  getConfig(): DriftConfig {
    return { ...this._config };
  }

  setConfig(partial: Partial<DriftConfig>): void {
    this._config = { ...this._config, ...partial };
  }
}
