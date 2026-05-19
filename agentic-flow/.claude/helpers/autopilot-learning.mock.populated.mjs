// Mock: populated learning context (success patterns + failures + recs).
export class AutopilotLearning {
  async initialize() { return true; }
  isAvailable() { return true; }
  async getReEngagementContext(_incomplete) {
    return {
      pastFailures: [
        { task: 'fix login bug', critique: 'missed null-check on user.session', reward: -1 },
        { task: 'add validation', critique: 'forgot empty-string edge case', reward: -1 },
      ],
      pastSuccesses: [
        { task: 'add login validation', reward: 1 },
      ],
      patterns: [
        { pattern: 'validation', frequency: 5, avgReward: 0.8 },
        { pattern: 'login', frequency: 4, avgReward: 0.6 },
      ],
      recommendations: [
        'Pattern "validation" succeeded 5× (avg reward 0.80)',
        'Past failure note: missed null-check on user.session',
      ],
      confidence: 0.5,
    };
  }
  async getMetrics() {
    return { available: true, episodes: 25, patterns: 2, trajectories: 0 };
  }
}
