/**
 * ADR-0069 A6: config-chain ports
 *
 * Shared port defaults read from the config chain.
 * Lookup order per port:
 *   1. Explicit argument (e.g. CLI flag / constructor option) if provided
 *   2. Environment variable (e.g. MCP_PORT, ONNX_PROXY_PORT)
 *   3. .claude-flow/config.json  (project-level, key `ports.*`)
 *   4. ~/.claude-flow/config.json (user-level, key `ports.*`)
 *   5. Hardcoded fallback (backward-compatible with pre-A6 values)
 *
 * Config shape under `ports`:
 *   {
 *     "ports": {
 *       "mcp":        3000,
 *       "mcpSse":     8080,
 *       "daemon":     3000,
 *       "onnxProxy":  3001
 *     }
 *   }
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export type PortName = 'mcp' | 'mcpSse' | 'daemon' | 'onnxProxy';

/** Hardcoded fallback — identical to pre-A6 values for backward compat */
const FALLBACK_PORTS: Record<PortName, number> = {
  mcp:       3000,
  mcpSse:    8080,
  daemon:    3000,
  onnxProxy: 3001,
};

let _cached: Partial<Record<PortName, number>> | null = null;

function loadFromConfigChain(): Partial<Record<PortName, number>> {
  const candidates = [
    join(process.cwd(), '.claude-flow', 'config.json'),
    join(homedir(), '.claude-flow', 'config.json'),
  ];

  const merged: Partial<Record<PortName, number>> = {};
  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      const raw = JSON.parse(readFileSync(path, 'utf-8'));
      if (raw?.ports && typeof raw.ports === 'object') {
        for (const name of Object.keys(FALLBACK_PORTS) as PortName[]) {
          if (merged[name] !== undefined) continue; // earlier (project) wins over later (user)
          const v = (raw.ports as Record<string, unknown>)[name];
          if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 65536) {
            merged[name] = v;
          }
        }
      }
    } catch {
      // Malformed JSON or read error — continue to next candidate
    }
  }
  return merged;
}

function getConfigPorts(): Partial<Record<PortName, number>> {
  if (!_cached) {
    try {
      _cached = loadFromConfigChain();
    } catch {
      _cached = {};
    }
  }
  return _cached;
}

function parseEnvPort(envName: string): number | undefined {
  const raw = process.env[envName];
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : undefined;
}

/**
 * Resolve a port via the ADR-0069 A6 config chain.
 *
 * @param name     Canonical port name (key under `ports.*` in config.json).
 * @param envNames Environment variable name(s) to check, in priority order.
 * @param explicit Explicit value (e.g. CLI flag or constructor arg). If a
 *                 positive finite number, it wins over env/config/fallback.
 * @returns The resolved port number.
 */
export function resolvePort(
  name: PortName,
  envNames: string | string[],
  explicit?: number | string | null
): number {
  // 1. Explicit argument
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0 && explicit < 65536) {
    return explicit;
  }
  if (typeof explicit === 'string' && explicit.length > 0) {
    const n = parseInt(explicit, 10);
    if (Number.isFinite(n) && n > 0 && n < 65536) return n;
  }

  // 2. Environment variable(s), in the order supplied
  const envList = Array.isArray(envNames) ? envNames : [envNames];
  for (const envName of envList) {
    const v = parseEnvPort(envName);
    if (v !== undefined) return v;
  }

  // 3-4. Config chain
  const cfg = getConfigPorts();
  if (cfg[name] !== undefined) return cfg[name] as number;

  // 5. Fallback
  return FALLBACK_PORTS[name];
}

/** Reset cache — for testing only. */
export function _resetPortsCache(): void {
  _cached = null;
}
