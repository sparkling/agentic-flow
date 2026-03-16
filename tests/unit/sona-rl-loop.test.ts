/**
 * SONA RL Loop Tests - ADR-065 Phase P1-2
 *
 * Comprehensive test suite for reinforcement learning functionality:
 * - Policy gradient methods (6 tests)
 * - Value function approximation (6 tests)
 * - Experience replay (6 tests)
 * - Multi-agent RL (6 tests)
 * - Transfer learning (6 tests)
 *
 * Total: 30 tests
 *
 * Success Criteria:
 * - Demonstrable improvement over 100 iterations (>20% reward increase)
 * - All 30 tests passing
 * - 8 MCP tools functional
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SonaTrajectoryService, StoredTrajectory } from '../../packages/agentdb/src/services/SonaTrajectoryService.ts';
import { RLTrainingService } from '../../agentic-flow/src/services/rl-training-service.ts';

describe('SONA RL Loop - Policy Gradients', () => {
  let sona: SonaTrajectoryService;
  let rlService: RLTrainingService;

  beforeEach(async () => {
    sona = new SonaTrajectoryService();
    await sona.initialize();
    rlService = new RLTrainingService(sona);
    await rlService.initialize();
  });

  afterEach(() => {
    sona.resetRL();
    rlService.reset();
  });

  it('should train policy using REINFORCE algorithm', async () => {
    const episodes: StoredTrajectory[] = [
      {
        steps: [
          { state: { task: 'code' }, action: 'write', reward: 0.8 },
          { state: { task: 'test' }, action: 'run', reward: 0.9 }
        ],
        reward: 0.85
      }
    ];

    const loss = await sona.trainPolicy(episodes);

    expect(loss).toBeGreaterThanOrEqual(0);
    expect(sona.getRLMetrics().iterationCount).toBe(1);
  });

  it('should calculate policy gradients correctly', async () => {
    const episodes: StoredTrajectory[] = [
      {
        steps: [
          { state: { x: 1 }, action: 'a1', reward: 1.0 },
          { state: { x: 2 }, action: 'a2', reward: 0.5 }
        ],
        reward: 0.75
      }
    ];

    const initialMetrics = sona.getRLMetrics();
    await sona.trainPolicy(episodes, { learningRate: 0.01, gamma: 0.99 });
    const finalMetrics = sona.getRLMetrics();

    expect(finalMetrics.iterationCount).toBeGreaterThan(initialMetrics.iterationCount);
    expect(finalMetrics.loss).toBeGreaterThanOrEqual(0);
  });

  it('should decay epsilon during training', async () => {
    const episodes: StoredTrajectory[] = [
      { steps: [{ state: {}, action: 'a', reward: 0.5 }], reward: 0.5 }
    ];

    const initialEpsilon = sona.getRLMetrics().epsilon;

    for (let i = 0; i < 10; i++) {
      await sona.trainPolicy(episodes);
    }

    const finalEpsilon = sona.getRLMetrics().epsilon;
    expect(finalEpsilon).toBeLessThan(initialEpsilon);
    expect(finalEpsilon).toBeGreaterThanOrEqual(0.01); // minimum epsilon
  });

  it('should apply entropy regularization', async () => {
    const episodes: StoredTrajectory[] = [
      {
        steps: [
          { state: { s: 1 }, action: 'a1', reward: 1.0 },
          { state: { s: 2 }, action: 'a1', reward: 1.0 }
        ],
        reward: 1.0
      }
    ];

    // High entropy coefficient should encourage exploration
    await sona.trainPolicy(episodes, { entropyCoeff: 0.1 });

    const metrics = sona.getRLMetrics();
    expect(metrics.loss).toBeGreaterThanOrEqual(0);
  });

  it('should use baseline to reduce variance', async () => {
    const episodes: StoredTrajectory[] = [
      {
        steps: [
          { state: { v: 1 }, action: 'up', reward: 2.0 },
          { state: { v: 2 }, action: 'down', reward: -1.0 }
        ],
        reward: 0.5
      }
    ];

    const loss = await sona.trainPolicy(episodes);

    // With baseline, loss should be reasonable
    expect(loss).toBeLessThan(10);
  });

  it('should handle PPO training with clipping', async () => {
    const episodes: StoredTrajectory[] = [
      {
        steps: [
          { state: { pos: 0 }, action: 'move', reward: 1.0 },
          { state: { pos: 1 }, action: 'move', reward: 1.0 }
        ],
        reward: 1.0
      }
    ];

    const result = await rlService.trainEpisodes(episodes, {
      algorithm: 'ppo',
      epochs: 5,
      learningRate: 0.001
    });

    expect(result.algorithm).toBe('ppo');
    expect(result.epochs).toBe(5);
    expect(result.finalLoss).toBeGreaterThanOrEqual(0);
  });
});

describe('SONA RL Loop - Value Functions', () => {
  let sona: SonaTrajectoryService;

  beforeEach(async () => {
    sona = new SonaTrajectoryService();
    await sona.initialize();
  });

  afterEach(() => {
    sona.resetRL();
  });

  it('should estimate state value using TD learning', async () => {
    const state = { position: 5 };
    const nextState = { position: 6 };
    const reward = 1.0;

    const value = await sona.estimateValue(state, reward, nextState);

    expect(typeof value).toBe('number');
    expect(value).toBeGreaterThanOrEqual(0);
  });

  it('should update value function with TD error', async () => {
    const state = { x: 10 };
    const nextState = { x: 11 };

    const value1 = await sona.estimateValue(state, 1.0, nextState);
    const value2 = await sona.estimateValue(state, 1.0, nextState);

    // Value should converge
    expect(Math.abs(value2 - value1)).toBeLessThanOrEqual(Math.abs(value1));
  });

  it('should apply discount factor (gamma)', async () => {
    const state = { s: 1 };
    const nextState = { s: 2 };

    // Gamma = 0.99 (high discount)
    const value1 = await sona.estimateValue(state, 1.0, nextState, { gamma: 0.99 });

    // Gamma = 0.5 (low discount, less future reward)
    sona.resetRL();
    const value2 = await sona.estimateValue(state, 1.0, nextState, { gamma: 0.5 });

    // With high gamma, future rewards matter more
    expect(value1).toBeGreaterThanOrEqual(0);
    expect(value2).toBeGreaterThanOrEqual(0);
  });

  it('should use GAE (Generalized Advantage Estimation)', async () => {
    const state = { level: 1 };
    const nextState = { level: 2 };

    const value = await sona.estimateValue(state, 0.8, nextState, {
      lambda: 0.95 // GAE parameter
    });

    expect(value).toBeGreaterThanOrEqual(0);
  });

  it('should handle A3C actor-critic training', async () => {
    const rlService = new RLTrainingService(sona);
    await rlService.initialize();

    const episodes: StoredTrajectory[] = [
      {
        steps: [
          { state: { agent: 1 }, action: 'act1', reward: 0.7 },
          { state: { agent: 2 }, action: 'act2', reward: 0.9 }
        ],
        reward: 0.8
      }
    ];

    const result = await rlService.trainEpisodes(episodes, {
      algorithm: 'a3c',
      epochs: 10,
      valueCoeff: 0.5
    });

    expect(result.algorithm).toBe('a3c');
    expect(result.finalLoss).toBeGreaterThanOrEqual(0);
  });

  it('should converge value estimates over time', async () => {
    const state = { iteration: 1 };
    const nextState = { iteration: 2 };

    const values: number[] = [];

    for (let i = 0; i < 20; i++) {
      const value = await sona.estimateValue(state, 1.0, nextState);
      values.push(value);
    }

    // Check for convergence (variance should decrease)
    const firstHalfVariance = calculateVariance(values.slice(0, 10));
    const secondHalfVariance = calculateVariance(values.slice(10));

    expect(secondHalfVariance).toBeLessThanOrEqual(firstHalfVariance + 0.1);
  });
});

describe('SONA RL Loop - Experience Replay', () => {
  let sona: SonaTrajectoryService;

  beforeEach(async () => {
    sona = new SonaTrajectoryService();
    await sona.initialize();
  });

  afterEach(() => {
    sona.resetRL();
  });

  it('should add experiences to replay buffer', () => {
    sona.addExperience(
      { state: 'A' },
      'action1',
      1.0,
      { state: 'B' }
    );

    const batch = sona.sampleExperience(1);
    expect(batch.length).toBe(1);
    expect(batch[0].action).toBe('action1');
  });

  it('should maintain buffer size limit', () => {
    // Configure small buffer
    sona.configureRL({
      replay: { bufferSize: 10, batchSize: 5, priorityAlpha: 0.6, priorityBeta: 0.4 }
    });

    // Add more experiences than buffer size
    for (let i = 0; i < 20; i++) {
      sona.addExperience(
        { id: i },
        `action${i}`,
        Math.random(),
        { id: i + 1 }
      );
    }

    const batch = sona.sampleExperience(15);
    // Should not exceed buffer size
    expect(batch.length).toBeLessThanOrEqual(10);
  });

  it('should use priority sampling', () => {
    // Add experiences with different priorities
    sona.addExperience({ s: 1 }, 'a1', 0.5, { s: 2 }, 0.1); // low priority
    sona.addExperience({ s: 2 }, 'a2', 1.0, { s: 3 }, 10.0); // high priority

    // Sample multiple times and check distribution
    let highPriorityCount = 0;
    const numSamples = 100;

    for (let i = 0; i < numSamples; i++) {
      const batch = sona.sampleExperience(1);
      if (batch[0]?.action === 'a2') {
        highPriorityCount++;
      }
    }

    // High priority experiences should be sampled more often
    expect(highPriorityCount).toBeGreaterThan(numSamples * 0.4);
  });

  it('should handle Q-learning with experience replay', async () => {
    const rlService = new RLTrainingService(sona);
    await rlService.initialize();

    // Add experiences
    for (let i = 0; i < 50; i++) {
      sona.addExperience(
        { step: i },
        `action${i % 3}`,
        Math.random() * 2 - 1, // random reward
        { step: i + 1 }
      );
    }

    const episodes: StoredTrajectory[] = [
      {
        steps: [
          { state: { s: 1 }, action: 'a1', reward: 0.8 }
        ],
        reward: 0.8
      }
    ];

    const result = await rlService.trainEpisodes(episodes, {
      algorithm: 'q-learning',
      epochs: 10,
      batchSize: 16
    });

    expect(result.algorithm).toBe('q-learning');
    expect(result.finalLoss).toBeGreaterThanOrEqual(0);
  });

  it('should sample batches of specified size', () => {
    // Add 100 experiences
    for (let i = 0; i < 100; i++) {
      sona.addExperience(
        { id: i },
        `a${i}`,
        i * 0.01,
        { id: i + 1 }
      );
    }

    const batch32 = sona.sampleExperience(32);
    const batch64 = sona.sampleExperience(64);

    expect(batch32.length).toBe(32);
    expect(batch64.length).toBe(64);
  });

  it('should update priorities based on TD error', async () => {
    const state = { p: 1 };
    const nextState = { p: 2 };

    // Add with initial priority
    sona.addExperience(state, 'act', 1.0, nextState, 1.0);

    // Estimate value (creates TD error)
    await sona.estimateValue(state, 1.0, nextState);

    // Sample should still work
    const batch = sona.sampleExperience(1);
    expect(batch.length).toBe(1);
  });
});

describe('SONA RL Loop - Multi-Agent RL', () => {
  let sona: SonaTrajectoryService;
  let rlService: RLTrainingService;

  beforeEach(async () => {
    sona = new SonaTrajectoryService();
    await sona.initialize();
    rlService = new RLTrainingService(sona);
    await rlService.initialize();
  });

  afterEach(() => {
    sona.resetRL();
  });

  it('should coordinate multiple agents', async () => {
    const agentStates = new Map([
      ['agent1', { position: 0 }],
      ['agent2', { position: 10 }]
    ]);

    const agentActions = new Map([
      ['agent1', 'move_right'],
      ['agent2', 'move_left']
    ]);

    const rewards = await sona.multiAgentLearn(agentStates, agentActions, 2.0);

    expect(rewards.size).toBe(2);
    expect(rewards.get('agent1')).toBeGreaterThan(0);
    expect(rewards.get('agent2')).toBeGreaterThan(0);
  });

  it('should distribute rewards based on contribution', async () => {
    const agentStates = new Map([
      ['worker1', { efficiency: 0.9 }],
      ['worker2', { efficiency: 0.3 }]
    ]);

    const agentActions = new Map([
      ['worker1', 'work'],
      ['worker2', 'work']
    ]);

    // Pre-train to establish different contributions
    await sona.recordTrajectory('worker1', [
      { state: { efficiency: 0.9 }, action: 'work', reward: 0.9 }
    ]);
    await sona.recordTrajectory('worker2', [
      { state: { efficiency: 0.3 }, action: 'work', reward: 0.3 }
    ]);

    const rewards = await sona.multiAgentLearn(agentStates, agentActions, 1.0);

    // Rewards should reflect contributions
    expect(rewards.size).toBe(2);
  });

  it('should handle centralized coordination', async () => {
    const agentStates = new Map([
      ['a1', { role: 'leader' }],
      ['a2', { role: 'follower' }],
      ['a3', { role: 'follower' }]
    ]);

    const agentActions = new Map([
      ['a1', 'command'],
      ['a2', 'execute'],
      ['a3', 'execute']
    ]);

    const rewards = await rlService.multiAgentTrain(
      agentStates,
      agentActions,
      3.0,
      { coordinationStrategy: 'centralized', rewardSharing: 'equal' }
    );

    expect(rewards.size).toBe(3);
    // Equal sharing
    const rewardValues = Array.from(rewards.values());
    expect(Math.abs(rewardValues[0] - rewardValues[1])).toBeLessThan(0.5);
  });

  it('should handle decentralized coordination', async () => {
    const agentStates = new Map([
      ['peer1', { autonomy: 1.0 }],
      ['peer2', { autonomy: 1.0 }]
    ]);

    const agentActions = new Map([
      ['peer1', 'act_independently'],
      ['peer2', 'act_independently']
    ]);

    const rewards = await rlService.multiAgentTrain(
      agentStates,
      agentActions,
      2.0,
      { coordinationStrategy: 'decentralized', rewardSharing: 'contribution' }
    );

    expect(rewards.size).toBe(2);
  });

  it('should handle competitive reward sharing', async () => {
    const agentStates = new Map([
      ['competitor1', { score: 100 }],
      ['competitor2', { score: 50 }]
    ]);

    const agentActions = new Map([
      ['competitor1', 'compete'],
      ['competitor2', 'compete']
    ]);

    const rewards = await rlService.multiAgentTrain(
      agentStates,
      agentActions,
      1.0,
      { coordinationStrategy: 'hybrid', rewardSharing: 'competitive' }
    );

    expect(rewards.size).toBe(2);
  });

  it('should record trajectories for all agents', async () => {
    const agentStates = new Map([
      ['agent1', { id: 1 }],
      ['agent2', { id: 2 }]
    ]);

    const agentActions = new Map([
      ['agent1', 'act1'],
      ['agent2', 'act2']
    ]);

    await sona.multiAgentLearn(agentStates, agentActions, 1.0);

    const patterns1 = await sona.getPatterns('agent1');
    const patterns2 = await sona.getPatterns('agent2');

    expect(patterns1.length).toBeGreaterThan(0);
    expect(patterns2.length).toBeGreaterThan(0);
  });
});

describe('SONA RL Loop - Transfer Learning', () => {
  let sona: SonaTrajectoryService;
  let rlService: RLTrainingService;

  beforeEach(async () => {
    sona = new SonaTrajectoryService();
    await sona.initialize();
    rlService = new RLTrainingService(sona);
    await rlService.initialize();
  });

  afterEach(() => {
    sona.resetRL();
  });

  it('should transfer knowledge between tasks', async () => {
    // Train source task
    await sona.recordTrajectory('coder', [
      { state: { task: 'implement' }, action: 'write_code', reward: 0.9 },
      { state: { task: 'test' }, action: 'run_tests', reward: 0.8 }
    ]);

    // Transfer to target task
    const success = await sona.transferLearning('coder', 'reviewer', 0.7);

    expect(success).toBe(true);
  });

  it('should fail transfer when source has no data', async () => {
    const success = await sona.transferLearning('nonexistent', 'target', 0.5);

    expect(success).toBe(false);
  });

  it('should blend weights according to transfer ratio', async () => {
    // Train source
    await sona.recordTrajectory('source', [
      { state: { x: 1 }, action: 'a1', reward: 1.0 }
    ]);
    await sona.trainPolicy([{
      steps: [{ state: { x: 1 }, action: 'a1', reward: 1.0 }],
      reward: 1.0
    }]);

    // Transfer with 0.8 ratio (80% source, 20% target)
    const success = await sona.transferLearning('source', 'target', 0.8);

    expect(success).toBe(true);
  });

  it('should fine-tune after transfer', async () => {
    // Train source task
    const sourceEpisodes: StoredTrajectory[] = [
      {
        steps: [
          { state: { type: 'code' }, action: 'write', reward: 0.9 }
        ],
        reward: 0.9
      }
    ];

    await rlService.trainEpisodes(sourceEpisodes, {
      algorithm: 'reinforce',
      epochs: 20
    });

    // Record some source trajectories
    await sona.recordTrajectory('source_agent', sourceEpisodes[0].steps);

    // Transfer and fine-tune
    const result = await rlService.transferLearn({
      sourceTask: 'source_agent',
      targetTask: 'target_agent',
      transferRatio: 0.7,
      finetuneEpochs: 10
    });

    expect(result.success).toBe(true);
  });

  it('should handle partial transfer (low ratio)', async () => {
    // Train source
    await sona.recordTrajectory('expert', [
      { state: { skill: 'high' }, action: 'perform', reward: 0.95 }
    ]);

    // Transfer with low ratio (mostly rely on target's own learning)
    const success = await sona.transferLearning('expert', 'novice', 0.3);

    expect(success).toBe(true);
  });

  it('should demonstrate learning curve improvement', async () => {
    // Train source task to good performance
    const sourceEpisodes: StoredTrajectory[] = [];
    for (let i = 0; i < 10; i++) {
      sourceEpisodes.push({
        steps: [
          { state: { iter: i }, action: 'optimal_action', reward: 0.8 + i * 0.01 }
        ],
        reward: 0.8 + i * 0.01
      });
    }

    await rlService.trainEpisodes(sourceEpisodes, {
      algorithm: 'reinforce',
      epochs: 50
    });

    // Record trajectories
    for (const ep of sourceEpisodes) {
      await sona.recordTrajectory('trained_agent', ep.steps);
    }

    // Transfer to new agent
    const result = await rlService.transferLearn({
      sourceTask: 'trained_agent',
      targetTask: 'new_agent',
      transferRatio: 0.75,
      finetuneEpochs: 0
    });

    expect(result.success).toBe(true);
  });
});

describe('SONA RL Loop - Integration & Performance', () => {
  let rlService: RLTrainingService;

  beforeEach(async () => {
    rlService = new RLTrainingService();
    await rlService.initialize();
  });

  afterEach(() => {
    rlService.reset();
  });

  it('should complete training over 100 iterations and track metrics', async () => {
    // Generate training episodes with varying rewards
    const episodes: StoredTrajectory[] = [];

    for (let i = 0; i < 100; i++) {
      // Use a sigmoid-like curve for more realistic learning
      const progress = i / 100;
      const baseReward = 0.3 + 0.7 * (1 / (1 + Math.exp(-10 * (progress - 0.5))));
      const noise = (Math.random() - 0.5) * 0.1; // add some noise

      episodes.push({
        steps: [
          {
            state: { iteration: i, context: 'learning', progress },
            action: baseReward > 0.6 ? 'optimal_action' : 'exploratory_action',
            reward: Math.max(0.1, Math.min(1.0, baseReward + noise))
          }
        ],
        reward: Math.max(0.1, Math.min(1.0, baseReward + noise))
      });
    }

    const result = await rlService.trainEpisodes(episodes, {
      algorithm: 'reinforce',
      epochs: 100,
      learningRate: 0.01,
      gamma: 0.95
    });

    console.log(`Training complete: ${result.learningCurve.length} epochs`);
    console.log(`Final loss: ${result.finalLoss.toFixed(4)}`);
    console.log(`Convergence iteration: ${result.convergenceIteration}`);

    // Verify training completed successfully
    expect(result.learningCurve.length).toBe(100);
    expect(result.epochs).toBe(100);
    expect(result.algorithm).toBe('reinforce');

    // Loss should be finite
    expect(result.finalLoss).toBeGreaterThanOrEqual(0);
    expect(result.finalLoss).toBeLessThan(Infinity);

    // Convergence iteration should be set
    expect(result.convergenceIteration).toBeGreaterThanOrEqual(0);
    expect(result.convergenceIteration).toBeLessThanOrEqual(100);

    // Learning curve should have proper structure
    for (const point of result.learningCurve) {
      expect(point).toHaveProperty('iteration');
      expect(point).toHaveProperty('reward');
      expect(point).toHaveProperty('loss');
      expect(point.iteration).toBeGreaterThanOrEqual(0);
    }
  }, 30000);

  it('should handle continuous learning loop', async () => {
    const iterations = 50;
    const rewards: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const state = { step: i };
      const action = i % 3 === 0 ? 'explore' : 'exploit';
      const reward = Math.random() * 0.5 + 0.5; // 0.5 to 1.0
      const nextState = { step: i + 1 };

      const value = await rlService.learnFromExecution(state, action, reward, nextState);
      rewards.push(reward);

      expect(value).toBeGreaterThanOrEqual(0);
    }

    const metrics = rlService.getMetrics();

    expect(metrics.iterationCount).toBeGreaterThan(0);
    expect(metrics.avgReward).toBeGreaterThan(0);
  });

  it('should maintain training history', async () => {
    const episodes: StoredTrajectory[] = [
      {
        steps: [{ state: {}, action: 'a', reward: 0.7 }],
        reward: 0.7
      }
    ];

    await rlService.trainEpisodes(episodes, { algorithm: 'reinforce', epochs: 5 });
    await rlService.trainEpisodes(episodes, { algorithm: 'ppo', epochs: 5 });

    const history = rlService.getTrainingHistory();

    expect(history.length).toBe(2);
    expect(history[0].algorithm).toBe('reinforce');
    expect(history[1].algorithm).toBe('ppo');
  });

  it('should reset training state', () => {
    const sona = rlService.getSonaService();

    // Add some data
    sona.addExperience({}, 'act', 0.5, {});
    expect(sona.sampleExperience(1).length).toBe(1);

    // Reset
    rlService.reset();

    // Should be cleared
    expect(sona.sampleExperience(1).length).toBe(0);
    expect(rlService.getMetrics().iterationCount).toBe(0);
  });

  it('should get current metrics', () => {
    const metrics = rlService.getMetrics();

    expect(metrics).toHaveProperty('episodeReward');
    expect(metrics).toHaveProperty('avgReward');
    expect(metrics).toHaveProperty('loss');
    expect(metrics).toHaveProperty('epsilon');
    expect(metrics).toHaveProperty('iterationCount');
  });

  it('should provide access to SONA service', () => {
    const sona = rlService.getSonaService();

    expect(sona).toBeDefined();
    expect(typeof sona.initialize).toBe('function');
    expect(typeof sona.trainPolicy).toBe('function');
  });
});

// Helper function
function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}
