/**
 * Phase 4 Controller Methods for AgentDBService
 * This file contains methods to be added to the AgentDBService class
 */

// -- Phase 4 Controller Methods -------------------------------------------

/**
 * Run nightly learner for automated causal discovery
 */
export async function runNightlyLearner(this: any): Promise<any> {
  if (!this.nightlyLearner) {
    throw new Error('NightlyLearner not available');
  }
  return this.nightlyLearner.run();
}

/**
 * Consolidate episodes using FlashAttention
 */
export async function consolidateEpisodes(this: any, sessionId?: string): Promise<any> {
  if (!this.nightlyLearner) {
    throw new Error('NightlyLearner not available');
  }
  return this.nightlyLearner.consolidateEpisodes(sessionId);
}

/**
 * Synchronize with remote AgentDB instance
 */
export async function syncWithRemote(this: any, onProgress?: (progress: any) => void): Promise<any> {
  if (!this.syncCoordinator) {
    throw new Error('SyncCoordinator not available');
  }
  return this.syncCoordinator.sync(onProgress);
}

/**
 * Get synchronization status
 */
export function getSyncStatus(this: any): any {
  if (!this.syncCoordinator) {
    return {
      isSyncing: false,
      autoSyncEnabled: false,
      state: {
        lastSyncAt: 0,
        lastEpisodeSync: 0,
        lastSkillSync: 0,
        lastEdgeSync: 0,
        totalItemsSynced: 0,
        totalBytesSynced: 0,
        syncCount: 0,
      },
    };
  }
  return this.syncCoordinator.getStatus();
}

/**
 * Create explainable recall certificate for a retrieval
 */
export async function createRecallCertificate(this: any, params: {
  queryId: string;
  queryText: string;
  chunks: Array<{ id: string; type: string; content: string; relevance: number }>;
  requirements: string[];
  accessLevel?: string;
}): Promise<any> {
  if (!this.explainableRecall) {
    throw new Error('ExplainableRecall not available');
  }
  return this.explainableRecall.createCertificate(params);
}

/**
 * Verify a recall certificate
 */
export function verifyRecallCertificate(this: any, certificateId: string): any {
  if (!this.explainableRecall) {
    throw new Error('ExplainableRecall not available');
  }
  return this.explainableRecall.verifyCertificate(certificateId);
}

/**
 * Get justification for a chunk in a recall certificate
 */
export function getRecallJustification(this: any, certificateId: string, chunkId: string): any {
  if (!this.explainableRecall) {
    throw new Error('ExplainableRecall not available');
  }
  return this.explainableRecall.getJustification(certificateId, chunkId);
}

/**
 * Trace provenance lineage for a certificate
 */
export function traceProvenance(this: any, certificateId: string): any {
  if (!this.explainableRecall) {
    throw new Error('ExplainableRecall not available');
  }
  return this.explainableRecall.traceProvenance(certificateId);
}

/**
 * Audit a recall certificate
 */
export function auditCertificate(this: any, certificateId: string): any {
  if (!this.explainableRecall) {
    throw new Error('ExplainableRecall not available');
  }
  return this.explainableRecall.auditCertificate(certificateId);
}

/**
 * Start QUIC server for distributed sync
 */
export async function startQUICServer(this: any): Promise<void> {
  if (!this.quicServer) {
    throw new Error('QUICServer not available');
  }
  return this.quicServer.start();
}

/**
 * Stop QUIC server
 */
export async function stopQUICServer(this: any): Promise<void> {
  if (!this.quicServer) {
    throw new Error('QUICServer not available');
  }
  return this.quicServer.stop();
}

/**
 * Get Phase 4 controller availability status
 */
export function getPhase4Status(this: any): {
  syncCoordinator: boolean;
  nightlyLearner: boolean;
  explainableRecall: boolean;
  quicClient: boolean;
  quicServer: boolean;
} {
  return {
    syncCoordinator: this.syncCoordinator !== null,
    nightlyLearner: this.nightlyLearner !== null,
    explainableRecall: this.explainableRecall !== null,
    quicClient: this.quicClient !== null,
    quicServer: this.quicServer !== null,
  };
}
