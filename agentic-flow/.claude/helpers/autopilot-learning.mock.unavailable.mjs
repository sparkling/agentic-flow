// Mock: producer returns false from initialize() (e.g., AgentDB DEGRADED).
export class AutopilotLearning {
  async initialize() { return false; }
  isAvailable() { return false; }
  async getReEngagementContext() {
    throw new Error('should not be called when initialize() returned false');
  }
  async getMetrics() {
    throw new Error('should not be called when initialize() returned false');
  }
}
