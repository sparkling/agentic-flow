// Mock: producer available but no episodes (confidence === 0).
export class AutopilotLearning {
  async initialize() { return true; }
  isAvailable() { return true; }
  async getReEngagementContext() {
    return {
      pastFailures: [],
      pastSuccesses: [],
      patterns: [],
      recommendations: [],
      confidence: 0,
    };
  }
  async getMetrics() {
    return { available: true, episodes: 0, patterns: 0, trajectories: 0 };
  }
}
