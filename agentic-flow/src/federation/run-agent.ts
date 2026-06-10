#!/usr/bin/env node
/**
 * Federation ephemeral-agent entry script.
 *
 * Spawned by `agentic-flow federation spawn` (see cli/federation-cli.ts →
 * spawnAgent → spawn('node', [<dist>/federation/run-agent.js])). Connects to
 * the hub via FederationHubClient using a SecurityManager-issued token, runs
 * for its configured lifetime, then disconnects cleanly.
 *
 * ADR-0310 Fix 3: authored into src/federation/ so `tsc` emits
 * dist/federation/run-agent.js (the path federation-cli.ts already
 * references). Upstream has no run-agent source; the docker copy was a
 * 60s collaboration-loop test harness importing ../../src. This is the
 * minimal lifecycle runner the CLI's `spawn` command needs.
 */

import { FederationHubClient } from './FederationHubClient.js';
import { SecurityManager } from './SecurityManager.js';
import { logger } from '../utils/logger.js';

const AGENT_ID = process.env.AGENT_ID || `agent-${Date.now()}`;
const TENANT_ID = process.env.TENANT_ID || process.env.FEDERATION_TENANT_ID || 'default';
const HUB_ENDPOINT = process.env.HUB_ENDPOINT || process.env.FEDERATION_HUB_ENDPOINT || 'ws://localhost:8443';
const LIFETIME_S = parseInt(process.env.AGENT_LIFETIME || '300', 10);
const AGENT_TYPE = process.env.AGENT_TYPE || 'worker';

async function main(): Promise<void> {
  const security = new SecurityManager();
  const token = await security.createAgentToken({
    agentId: AGENT_ID,
    tenantId: TENANT_ID,
    expiresAt: Date.now() + LIFETIME_S * 1000,
  });

  const client = new FederationHubClient({
    endpoint: HUB_ENDPOINT,
    agentId: AGENT_ID,
    tenantId: TENANT_ID,
    token,
  });

  await client.connect();
  logger.info('Ephemeral agent connected', {
    agentId: AGENT_ID, tenantId: TENANT_ID, hub: HUB_ENDPOINT, type: AGENT_TYPE, lifetimeS: LIFETIME_S,
  });
  console.log(`FEDERATION_AGENT_CONNECTED id=${AGENT_ID} tenant=${TENANT_ID}`);

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    logger.info('Ephemeral agent shutting down', { signal, agentId: AGENT_ID });
    try {
      await client.disconnect();
    } catch (err: any) {
      logger.error('Error during agent disconnect', { error: err?.message });
    }
    process.exit(0);
  };

  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

  // Live for the configured lifetime, then disconnect (ephemeral by design).
  setTimeout(() => { void shutdown('lifetime-expired'); }, LIFETIME_S * 1000);
}

main().catch((error: any) => {
  logger.error('Ephemeral agent failed', { error: error?.message });
  console.error('Agent failed:', error);
  process.exit(1);
});
