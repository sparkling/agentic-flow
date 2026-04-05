/**
 * TriggerDetector - Detects background worker triggers in prompts
 * Target: < 5ms detection latency
 */

import {
  WorkerTrigger,
  TriggerConfig,
  DetectedTrigger,
  WorkerPriority
} from './types.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ADR-0069 A3: config-chain worker timeouts
// Canonical timeout defaults — single source of truth for all worker modules.
// Override via .claude-flow/config.json  workers.triggers.<name>.timeout
export const CANONICAL_WORKER_TIMEOUTS: Record<string, number> = {
  ultralearn:   300000,   // 5 minutes
  optimize:     180000,   // 3 minutes
  consolidate:  120000,   // 2 minutes
  predict:       60000,   // 1 minute
  audit:        300000,   // 5 minutes
  map:          240000,   // 4 minutes
  preload:       30000,   // 30 seconds
  deepdive:     600000,   // 10 minutes
  document:     180000,   // 3 minutes
  refactor:     180000,   // 3 minutes
  benchmark:    300000,   // 5 minutes
  testgaps:     180000,   // 3 minutes
};

// ADR-0069 A3: config-chain worker cooldown defaults
export const CANONICAL_WORKER_COOLDOWNS: Record<string, number> = {
  ultralearn:    60000,
  optimize:     120000,
  consolidate:  300000,
  predict:       30000,
  audit:        180000,
  map:          300000,
  preload:       10000,
  deepdive:     300000,
  document:     120000,
  refactor:     120000,
  benchmark:    180000,
  testgaps:     120000,
};

/**
 * ADR-0069 A3: Load worker trigger overrides from config chain.
 * Reads .claude-flow/config.json  workers.triggers block.
 * Returns a map of trigger name -> partial config overrides.
 */
function loadConfigChainOverrides(): Map<string, { timeout?: number; cooldown?: number }> {
  const overrides = new Map<string, { timeout?: number; cooldown?: number }>();
  try {
    const configPath = resolve(process.cwd(), '.claude-flow', 'config.json');
    const raw = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    const triggers = config?.workers?.triggers;
    if (triggers && typeof triggers === 'object') {
      for (const [name, val] of Object.entries(triggers)) {
        if (val && typeof val === 'object') {
          const entry: { timeout?: number; cooldown?: number } = {};
          const v = val as Record<string, unknown>;
          if (typeof v.timeout === 'number') entry.timeout = v.timeout;
          if (typeof v.cooldown === 'number') entry.cooldown = v.cooldown;
          if (Object.keys(entry).length > 0) overrides.set(name, entry);
        }
      }
    }
  } catch {
    // Config file absent or unreadable — use canonical defaults
  }
  return overrides;
}

/**
 * ADR-0069 A3: Resolve timeout for a trigger.
 * Config chain value wins; falls back to canonical default.
 */
export function resolveWorkerTimeout(trigger: string): number {
  const overrides = loadConfigChainOverrides();
  return overrides.get(trigger)?.timeout
    ?? CANONICAL_WORKER_TIMEOUTS[trigger]
    ?? 120000;
}

/**
 * ADR-0069 A3: Resolve cooldown for a trigger.
 */
export function resolveWorkerCooldown(trigger: string): number {
  const overrides = loadConfigChainOverrides();
  return overrides.get(trigger)?.cooldown
    ?? CANONICAL_WORKER_COOLDOWNS[trigger]
    ?? 60000;
}

// Cache config overrides for the lifetime of the TRIGGER_CONFIGS init
const _initOverrides = loadConfigChainOverrides();

function _timeout(trigger: string): number {
  return _initOverrides.get(trigger)?.timeout ?? CANONICAL_WORKER_TIMEOUTS[trigger] ?? 120000;
}
function _cooldown(trigger: string): number {
  return _initOverrides.get(trigger)?.cooldown ?? CANONICAL_WORKER_COOLDOWNS[trigger] ?? 60000;
}

// Trigger configuration map
const TRIGGER_CONFIGS: Map<WorkerTrigger, TriggerConfig> = new Map([
  // ADR-0069 A3: all timeout/cooldown values resolved via config chain -> canonical defaults
  ['ultralearn', {
    keyword: 'ultralearn',
    worker: 'research-swarm',
    priority: 'high',
    maxAgents: 5,
    timeout: _timeout('ultralearn'),
    cooldown: _cooldown('ultralearn'),
    topicExtractor: /ultralearn\s+(.+?)(?:\.|$)/i,
    description: 'Deep research swarm for codebase learning'
  }],
  ['optimize', {
    keyword: 'optimize',
    worker: 'perf-analyzer',
    priority: 'medium',
    maxAgents: 2,
    timeout: _timeout('optimize'),
    cooldown: _cooldown('optimize'),
    topicExtractor: /optimize\s+(.+?)(?:\.|$)/i,
    description: 'Performance analyzer and cache optimizer'
  }],
  ['consolidate', {
    keyword: 'consolidate',
    worker: 'memory-optimizer',
    priority: 'low',
    maxAgents: 1,
    timeout: _timeout('consolidate'),
    cooldown: _cooldown('consolidate'),
    topicExtractor: null,
    description: 'Memory compaction and pattern extraction'
  }],
  ['predict', {
    keyword: 'predict',
    worker: 'pattern-matcher',
    priority: 'medium',
    maxAgents: 2,
    timeout: _timeout('predict'),
    cooldown: _cooldown('predict'),
    topicExtractor: /predict\s+(.+?)(?:\.|$)/i,
    description: 'Pre-fetch likely files based on learned patterns'
  }],
  ['audit', {
    keyword: 'audit',
    worker: 'security-scanner',
    priority: 'high',
    maxAgents: 3,
    timeout: _timeout('audit'),
    cooldown: _cooldown('audit'),
    topicExtractor: /audit\s+(.+?)(?:\.|$)/i,
    description: 'Security and code quality scan'
  }],
  ['map', {
    keyword: 'map',
    worker: 'dependency-mapper',
    priority: 'medium',
    maxAgents: 2,
    timeout: _timeout('map'),
    cooldown: _cooldown('map'),
    topicExtractor: /map\s+(.+?)(?:\.|$)/i,
    description: 'Build full dependency graph'
  }],
  ['preload', {
    keyword: 'preload',
    worker: 'context-prefetcher',
    priority: 'low',
    maxAgents: 1,
    timeout: _timeout('preload'),
    cooldown: _cooldown('preload'),
    topicExtractor: /preload\s+(.+?)(?:\.|$)/i,
    description: 'Pre-fetch context for faster access'
  }],
  ['deepdive', {
    keyword: 'deepdive',
    worker: 'call-graph-analyzer',
    priority: 'high',
    maxAgents: 4,
    timeout: _timeout('deepdive'),
    cooldown: _cooldown('deepdive'),
    topicExtractor: /deepdive\s+(.+?)(?:\.|$)/i,
    description: 'Traces call paths 5+ levels deep'
  }],
  ['document', {
    keyword: 'document',
    worker: 'doc-generator',
    priority: 'low',
    maxAgents: 2,
    timeout: _timeout('document'),
    cooldown: _cooldown('document'),
    topicExtractor: /document\s+(.+?)(?:\.|$)/i,
    description: 'Generate documentation for patterns'
  }],
  ['refactor', {
    keyword: 'refactor',
    worker: 'refactor-analyzer',
    priority: 'medium',
    maxAgents: 2,
    timeout: _timeout('refactor'),
    cooldown: _cooldown('refactor'),
    topicExtractor: /refactor\s+(.+?)(?:\.|$)/i,
    description: 'Identify refactoring opportunities'
  }],
  ['benchmark', {
    keyword: 'benchmark',
    worker: 'perf-benchmarker',
    priority: 'medium',
    maxAgents: 2,
    timeout: _timeout('benchmark'),
    cooldown: _cooldown('benchmark'),
    topicExtractor: /benchmark\s+(.+?)(?:\.|$)/i,
    description: 'Run performance benchmarks silently'
  }],
  ['testgaps', {
    keyword: 'testgaps',
    worker: 'coverage-analyzer',
    priority: 'medium',
    maxAgents: 2,
    timeout: _timeout('testgaps'),
    cooldown: _cooldown('testgaps'),
    topicExtractor: /testgaps?\s+(.+?)(?:\.|$)/i,
    description: 'Find untested code paths'
  }]
]);

// Pre-compiled regex for fast matching
const TRIGGER_PATTERN = new RegExp(
  `\\b(${Array.from(TRIGGER_CONFIGS.keys()).join('|')})\\b`,
  'gi'
);

export class TriggerDetector {
  private cooldowns: Map<WorkerTrigger, number> = new Map();

  /**
   * Detect all triggers in a prompt
   * Target: < 5ms latency
   */
  detect(prompt: string): DetectedTrigger[] {
    const startTime = performance.now();
    const triggers: DetectedTrigger[] = [];
    const seen = new Set<WorkerTrigger>();

    // Fast regex match
    let match: RegExpExecArray | null;
    TRIGGER_PATTERN.lastIndex = 0;

    while ((match = TRIGGER_PATTERN.exec(prompt)) !== null) {
      const keyword = match[1].toLowerCase() as WorkerTrigger;

      // Skip duplicates
      if (seen.has(keyword)) continue;
      seen.add(keyword);

      // Check cooldown
      if (this.isOnCooldown(keyword)) continue;

      const config = TRIGGER_CONFIGS.get(keyword);
      if (!config) continue;

      // Extract topic if extractor exists
      let topic: string | null = null;
      if (config.topicExtractor) {
        const topicMatch = prompt.match(config.topicExtractor);
        if (topicMatch && topicMatch[1]) {
          topic = topicMatch[1].trim();
        }
      }

      triggers.push({
        keyword,
        topic,
        config,
        detectedAt: Date.now()
      });

      // Set cooldown
      this.setCooldown(keyword);
    }

    const elapsed = performance.now() - startTime;
    if (elapsed > 5) {
      console.warn(`TriggerDetector: detection took ${elapsed.toFixed(2)}ms (target: 5ms)`);
    }

    return triggers;
  }

  /**
   * Check if a trigger is on cooldown
   */
  isOnCooldown(trigger: WorkerTrigger): boolean {
    const lastUsed = this.cooldowns.get(trigger);
    if (!lastUsed) return false;

    const config = TRIGGER_CONFIGS.get(trigger);
    if (!config) return false;

    return Date.now() - lastUsed < config.cooldown;
  }

  /**
   * Set cooldown for a trigger
   */
  private setCooldown(trigger: WorkerTrigger): void {
    this.cooldowns.set(trigger, Date.now());
  }

  /**
   * Clear cooldown for a trigger (for testing)
   */
  clearCooldown(trigger: WorkerTrigger): void {
    this.cooldowns.delete(trigger);
  }

  /**
   * Clear all cooldowns
   */
  clearAllCooldowns(): void {
    this.cooldowns.clear();
  }

  /**
   * Get remaining cooldown time for a trigger
   */
  getCooldownRemaining(trigger: WorkerTrigger): number {
    const lastUsed = this.cooldowns.get(trigger);
    if (!lastUsed) return 0;

    const config = TRIGGER_CONFIGS.get(trigger);
    if (!config) return 0;

    const remaining = config.cooldown - (Date.now() - lastUsed);
    return Math.max(0, remaining);
  }

  /**
   * Get config for a specific trigger
   */
  getConfig(trigger: WorkerTrigger): TriggerConfig | undefined {
    return TRIGGER_CONFIGS.get(trigger);
  }

  /**
   * Get all trigger configs
   */
  getAllConfigs(): Map<WorkerTrigger, TriggerConfig> {
    return new Map(TRIGGER_CONFIGS);
  }

  /**
   * Register a custom trigger dynamically
   */
  registerTrigger(config: {
    keyword: string;
    priority?: WorkerPriority;
    description?: string;
    timeout?: number;
    cooldown?: number;
    topicExtractor?: RegExp;
  }): void {
    const keyword = config.keyword as WorkerTrigger;
    const triggerConfig: TriggerConfig = {
      keyword,
      worker: config.keyword,
      priority: config.priority || 'medium',
      maxAgents: 2,
      timeout: config.timeout || 120000,
      cooldown: config.cooldown || 5000,
      topicExtractor: config.topicExtractor || null,
      description: config.description || `Custom trigger: ${config.keyword}`
    };
    TRIGGER_CONFIGS.set(keyword, triggerConfig);
  }

  /**
   * Check if a string contains any trigger keywords
   * Faster than full detect() when you just need boolean check
   */
  hasTriggers(prompt: string): boolean {
    TRIGGER_PATTERN.lastIndex = 0;
    return TRIGGER_PATTERN.test(prompt);
  }

  /**
   * Get trigger stats
   */
  getStats(): { triggers: WorkerTrigger[]; cooldowns: Record<string, number> } {
    const cooldowns: Record<string, number> = {};
    for (const [trigger, time] of this.cooldowns) {
      cooldowns[trigger] = this.getCooldownRemaining(trigger);
    }
    return {
      triggers: Array.from(TRIGGER_CONFIGS.keys()),
      cooldowns
    };
  }
}

// Singleton instance
let instance: TriggerDetector | null = null;

export function getTriggerDetector(): TriggerDetector {
  if (!instance) {
    instance = new TriggerDetector();
  }
  return instance;
}

export { TRIGGER_CONFIGS };
