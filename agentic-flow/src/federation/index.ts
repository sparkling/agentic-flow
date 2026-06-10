/**
 * Federated AgentDB - Main exports
 *
 * Provides secure federated memory for ephemeral agents with:
 * - QUIC-based synchronization
 * - Zero-trust security (mTLS + JWT + AES-256)
 * - Tenant isolation
 * - Vector clock conflict resolution
 */

export { EphemeralAgent, type EphemeralAgentConfig, type AgentContext } from './EphemeralAgent.js';
export { FederationHub, type FederationHubConfig, type SyncMessage } from './FederationHub.js';
export { SecurityManager, type AgentTokenPayload, type EncryptionKeys } from './SecurityManager.js';
// ADR-0310 Fix 4: surface the working hub server/client (the most complete
// cross-process shared store in the tree) through the package exports.
export { FederationHubServer, type HubConfig, type AgentConnection } from './FederationHubServer.js';
export { FederationHubClient, type HubClientConfig } from './FederationHubClient.js';
