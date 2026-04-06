/**
 * ADR-0069 A2: config-chain rate limits
 *
 * Shared rate-limiter defaults that read from the config chain.
 * Lookup order:
 *   1. .claude-flow/config.json  (project-level)
 *   2. ~/.claude-flow/config.json (user-level)
 *   3. Hardcoded fallback values (backward-compatible with pre-A2 defaults)
 *
 * Config shape under `rateLimiter`:
 *   {
 *     "rateLimiter": {
 *       "default": { "maxRequests": 100, "windowMs": 60000 },
 *       "auth":    { "maxRequests": 10,  "windowMs": 60000 },
 *       "tools":   { "maxRequests": 10,  "windowMs": 60000 },
 *       "memory":  { "maxRequests": 100, "windowMs": 60000 },
 *       "files":   { "maxRequests": 50,  "windowMs": 60000 }
 *     }
 *   }
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface RateLimitPreset {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimiterPresets {
  default: RateLimitPreset;
  auth: RateLimitPreset;
  tools: RateLimitPreset;
  memory: RateLimitPreset;
  files: RateLimitPreset;
  [key: string]: RateLimitPreset;
}

/** Hardcoded fallback — identical to pre-A2 values for backward compat */
const FALLBACK_PRESETS: RateLimiterPresets = {
  default: { maxRequests: 100, windowMs: 60000 },
  auth:    { maxRequests: 10,  windowMs: 60000 },
  tools:   { maxRequests: 10,  windowMs: 60000 },
  memory:  { maxRequests: 100, windowMs: 60000 },
  files:   { maxRequests: 50,  windowMs: 60000 },
};

let _cached: RateLimiterPresets | null = null;

/**
 * Try to load `rateLimiter` block from config chain.
 * Returns a merged object: config values override fallback values per-key.
 */
function loadFromConfigChain(): RateLimiterPresets {
  const candidates = [
    join(process.cwd(), '.claude-flow', 'config.json'),
    join(homedir(), '.claude-flow', 'config.json'),
  ];

  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      const raw = JSON.parse(readFileSync(path, 'utf-8'));
      if (raw?.rateLimiter && typeof raw.rateLimiter === 'object') {
        // Merge each preset key: config overrides fallback
        const merged: RateLimiterPresets = { ...FALLBACK_PRESETS };
        for (const [key, value] of Object.entries(raw.rateLimiter)) {
          if (value && typeof value === 'object') {
            const v = value as Partial<RateLimitPreset>;
            merged[key] = {
              maxRequests: typeof v.maxRequests === 'number' ? v.maxRequests : (FALLBACK_PRESETS[key]?.maxRequests ?? 100),
              windowMs:    typeof v.windowMs === 'number'    ? v.windowMs    : (FALLBACK_PRESETS[key]?.windowMs ?? 60000),
            };
          }
        }
        return merged;
      }
    } catch {
      // Malformed JSON or read error — continue to next candidate
    }
  }

  return FALLBACK_PRESETS;
}

/**
 * Get rate-limiter presets from config chain (cached after first call).
 * Safe to call at module init time — never throws.
 */
export function getRateLimiterPresets(): RateLimiterPresets {
  if (!_cached) {
    try {
      _cached = loadFromConfigChain();
    } catch {
      _cached = FALLBACK_PRESETS;
    }
  }
  return _cached;
}

/**
 * Get a single preset by name, with fallback to 'default'.
 */
export function getRateLimitPreset(name: string): RateLimitPreset {
  const presets = getRateLimiterPresets();
  return presets[name] ?? presets.default;
}

/** Reset cache — for testing only. */
export function _resetRateLimiterCache(): void {
  _cached = null;
}
