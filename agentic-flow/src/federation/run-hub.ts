#!/usr/bin/env node
/**
 * Federation Hub entry script.
 *
 * Spawned by `agentic-flow federation start` (see cli/federation-cli.ts →
 * startHub → spawn('node', [<dist>/federation/run-hub.js])). Reads the hub
 * configuration from the environment the CLI sets (FEDERATION_HUB_PORT /
 * FEDERATION_DB_PATH / FEDERATION_MAX_AGENTS), starts the WebSocket hub, and
 * keeps the process alive until SIGINT/SIGTERM.
 *
 * ADR-0310 Fix 3: authored into src/federation/ so `tsc` emits
 * dist/federation/run-hub.js (the path federation-cli.ts already references).
 * Upstream has no run-hub source; the only prior copy lived under
 * docker/federation-test/ (imports ../../src, compiled nowhere). This is the
 * minimal standalone runner — no docker-only express health server.
 */

import { FederationHubServer } from './FederationHubServer.js';
import { logger } from '../utils/logger.js';

const PORT = parseInt(process.env.FEDERATION_HUB_PORT || process.env.FEDERATION_PORT || '8443', 10);
const DB_PATH = process.env.FEDERATION_DB_PATH || ':memory:';
const MAX_AGENTS = parseInt(process.env.FEDERATION_MAX_AGENTS || '1000', 10);

async function main(): Promise<void> {
  const hub = new FederationHubServer({
    port: PORT,
    dbPath: DB_PATH,
    maxAgents: MAX_AGENTS,
    syncInterval: 5000,
  });

  await hub.start();

  logger.info('Federation hub ready', { port: PORT, dbPath: DB_PATH, maxAgents: MAX_AGENTS });
  // Machine-readable readiness line for tooling/tests that spawn the hub and
  // wait for "listening" before connecting. ADR-0310 T4 relies on this.
  console.log(`FEDERATION_HUB_LISTENING port=${PORT}`);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('Federation hub shutting down', { signal });
    try {
      await hub.stop();
    } catch (err: any) {
      logger.error('Error during hub shutdown', { error: err?.message });
    }
    process.exit(0);
  };

  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}

main().catch((error: any) => {
  logger.error('Federation hub failed to start', { error: error?.message });
  console.error('Hub server failed:', error);
  process.exit(1);
});
