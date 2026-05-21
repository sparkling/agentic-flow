/**
 * Behavioral tests for RLTrainingService
 *
 * Exercises all public methods, all four RL algorithm paths, trajectory
 * recording, experience-replay buffer behavior, multi-agent training,
 * transfer learning, metrics, and error/edge cases.
 *
 * The inner SonaTrajectoryServiceStub is injected via the constructor so the
 * real orchestration logic runs against deterministic mocks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RLTrainingService,
  type TrainingConfig,
  type RLAlgorithm,
  type TrajectoryStep,
  type StoredTrajectory,
  type RLMetrics,
  type PolicyGradientConfig,
  type ValueFunctionConfig,
  type ExperienceReplayConfig,
  type MultiAgentConfig,
  type TransferConfig,
  type TrainingResult,
} from '../../src/services/rl-training-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStep(state: string, action: string, reward: number, next: string, done = false): TrajectoryStep {
  return { state, action, reward, nextState: next, done };
}

function makeEpisode(
  id: string,
  steps: TrajectoryStep[],
  reward = 1.0
): StoredTrajectory {
  return {
    trajectoryId: id,
    state: steps[0]?.state ?? 's0',
    action: steps[0]?.action ?? 'a0',
    reward,
    nextState: steps[steps.length - 1]?.nextState ?? 's_terminal',
    done: true,
    timestamp: 1000,
    steps,
  };
}

/** Build a minimal ISonaTrajectoryService mock with deterministic behaviour. */
function makeSonaMock(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  const defaultMetrics: RLMetrics = {
    avgReward: 0.5,
    avgLoss: 0.1,
    episodeCount: 1,
    episodeReward: 0.5,
    loss: 0.05,
    epsilon: 0.1,
    iterationCount: 1,
  };

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    storePolicyGradient: vi.fn().mockResolvedValue({ success: true }),
    storeValueFunction: vi.fn().mockResolvedValue({ success: true }),
    storeExperienceReplay: vi.fn().mockResolvedValue({ success: true }),
    getRLMetrics: vi.fn().mockResolvedValue({ ...defaultMetrics }),
    getEngineType: vi.fn().mockReturnValue('mock'),
    estimateValue: vi.fn().mockResolvedValue(0.42),
    trainPolicy: vi.fn().mockResolvedValue(0.25),
    addExperience: vi.fn(),
    sampleExperience: vi.fn().mockReturnValue([]),
    continuousLearn: vi.fn().mockResolvedValue({ ...defaultMetrics }),
    multiAgentLearn: vi.fn().mockResolvedValue({ ...defaultMetrics }),
    transferLearning: vi.fn().mockResolvedValue({ success: true }),
    getPatterns: vi.fn().mockResolvedValue([]),
    resetRL: vi.fn().mockResolvedValue(undefined),
    configureRL: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalExperiences: 0, avgReward: 0 }),
    clear: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// initialize()
// ---------------------------------------------------------------------------

describe('initialize()', () => {
  it('calls sona.initialize() exactly once and returns true', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const result = await svc.initialize();

    expect(result).toBe(true);
    expect(sona.initialize).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — second call returns true without re-calling sona.initialize()', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    await svc.initialize();
    const result = await svc.initialize();

    expect(result).toBe(true);
    expect(sona.initialize).toHaveBeenCalledTimes(1);
  });

  it('auto-initializes on first trainEpisodes() call', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    await svc.trainEpisodes([], { epochs: 1 });

    expect(sona.initialize).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getSonaService()
// ---------------------------------------------------------------------------

describe('getSonaService()', () => {
  it('returns the injected sona instance', () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);
    expect(svc.getSonaService()).toBe(sona);
  });
});

// ---------------------------------------------------------------------------
// trainEpisodes() — config defaults
// ---------------------------------------------------------------------------

describe('trainEpisodes() — config defaults', () => {
  it('uses "reinforce" algorithm when none specified', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const result = await svc.trainEpisodes([], { epochs: 1 });

    // reinforce path calls sona.trainPolicy, not a sub-method
    expect(sona.trainPolicy).toHaveBeenCalled();
    expect(result.algorithm).toBe('reinforce');
  });

  it('result includes all required fields', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const result = await svc.trainEpisodes([], { epochs: 3 });

    expect(result).toMatchObject({
      algorithm: expect.any(String),
      epochs: 3,
      finalLoss: expect.any(Number),
      avgReward: expect.any(Number),
      improvementRate: expect.any(Number),
      convergenceIteration: expect.any(Number),
      learningCurve: expect.any(Array),
    });
  });

  it('learningCurve has one entry per epoch', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const result = await svc.trainEpisodes([], { epochs: 7 });

    expect(result.learningCurve).toHaveLength(7);
    // Each entry has the expected shape
    result.learningCurve.forEach((pt, i) => {
      expect(pt.iteration).toBe(i);
      expect(typeof pt.reward).toBe('number');
      expect(typeof pt.loss).toBe('number');
    });
  });

  it('configureRL is called with learningRate, gamma, epsilon derived from config', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    await svc.trainEpisodes([], {
      epochs: 1,
      learningRate: 0.003,
      gamma: 0.95,
      epsilon: 0.05,
    });

    expect(sona.configureRL).toHaveBeenCalledWith(
      expect.objectContaining({
        policy: expect.objectContaining({ learningRate: 0.003, gamma: 0.95, epsilon: 0.05 }),
        value: expect.objectContaining({ learningRate: 0.003, gamma: 0.95 }),
        replay: expect.objectContaining({ bufferSize: 10000 }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// trainEpisodes() — algorithm 'reinforce'
// ---------------------------------------------------------------------------

describe('trainEpisodes() — reinforce algorithm', () => {
  it('calls trainPolicy once per epoch', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);
    const EPOCHS = 5;

    await svc.trainEpisodes([], { algorithm: 'reinforce', epochs: EPOCHS });

    expect(sona.trainPolicy).toHaveBeenCalledTimes(EPOCHS);
  });

  it('passes correct config fields to trainPolicy', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    await svc.trainEpisodes([], {
      algorithm: 'reinforce',
      epochs: 1,
      learningRate: 0.002,
      gamma: 0.98,
      epsilon: 0.2,
      entropyCoeff: 0.005,
    });

    expect(sona.trainPolicy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        learningRate: 0.002,
        gamma: 0.98,
        epsilon: 0.2,
        entropyCoeff: 0.005,
      })
    );
  });

  it('records the loss returned by trainPolicy in learningCurve', async () => {
    const sona = makeSonaMock({ trainPolicy: vi.fn().mockResolvedValue(0.77) });
    const svc = new RLTrainingService(sona);

    const result = await svc.trainEpisodes([], { algorithm: 'reinforce', epochs: 2 });

    expect(result.learningCurve[0].loss).toBe(0.77);
    expect(result.learningCurve[1].loss).toBe(0.77);
  });
});

// ---------------------------------------------------------------------------
// trainEpisodes() — algorithm 'ppo'
// ---------------------------------------------------------------------------

describe('trainEpisodes() — ppo algorithm', () => {
  it('calls trainPolicy 4 times per epoch (PPO inner loop)', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);
    const EPOCHS = 3;

    await svc.trainEpisodes([], { algorithm: 'ppo', epochs: EPOCHS });

    // 4 inner iterations × EPOCHS outer epochs
    expect(sona.trainPolicy).toHaveBeenCalledTimes(4 * EPOCHS);
  });

  it('decays learning rate across PPO inner iterations', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);
    const BASE_LR = 0.01;

    await svc.trainEpisodes([], { algorithm: 'ppo', epochs: 1, learningRate: BASE_LR });

    const calls = (sona.trainPolicy as ReturnType<typeof vi.fn>).mock.calls;
    const lrs = calls.map((c: any[]) => c[1].learningRate as number);

    // Epoch 0: LR * (1 - 0 * 0.1) = LR
    expect(lrs[0]).toBeCloseTo(BASE_LR * 1.0, 6);
    // Epoch 1: LR * (1 - 1 * 0.1) = 0.9 * LR
    expect(lrs[1]).toBeCloseTo(BASE_LR * 0.9, 6);
    // Epoch 2: LR * (1 - 2 * 0.1) = 0.8 * LR
    expect(lrs[2]).toBeCloseTo(BASE_LR * 0.8, 6);
    // Epoch 3: LR * (1 - 3 * 0.1) = 0.7 * LR
    expect(lrs[3]).toBeCloseTo(BASE_LR * 0.7, 6);
  });

  it('epoch loss is average of the 4 inner losses', async () => {
    // Sequence: 0.4, 0.8, 0.4, 0.8 → average 0.6
    let callIdx = 0;
    const innerLosses = [0.4, 0.8, 0.4, 0.8];
    const sona = makeSonaMock({
      trainPolicy: vi.fn().mockImplementation(() => Promise.resolve(innerLosses[callIdx++ % innerLosses.length])),
    });
    const svc = new RLTrainingService(sona);

    const result = await svc.trainEpisodes([], { algorithm: 'ppo', epochs: 1 });

    expect(result.learningCurve[0].loss).toBeCloseTo(0.6, 6);
  });
});

// ---------------------------------------------------------------------------
// trainEpisodes() — algorithm 'a3c'
// ---------------------------------------------------------------------------

describe('trainEpisodes() — a3c algorithm', () => {
  it('calls estimateValue for each consecutive step pair across episodes', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const steps = [
      makeStep('s0', 'a', 1, 's1'),
      makeStep('s1', 'b', 2, 's2'),
      makeStep('s2', 'c', 3, 's3'),
    ];
    const episode = makeEpisode('e1', steps);

    await svc.trainEpisodes([episode], { algorithm: 'a3c', epochs: 1 });

    // steps.length - 1 = 2 pairs → 2 estimateValue calls per epoch
    expect(sona.estimateValue).toHaveBeenCalledTimes(2);
    expect(sona.estimateValue).toHaveBeenCalledWith('s0', 1, 's1', expect.objectContaining({ gamma: expect.any(Number) }));
    expect(sona.estimateValue).toHaveBeenCalledWith('s1', 2, 's2', expect.objectContaining({ gamma: expect.any(Number) }));
  });

  it('scales estimateValue learningRate by valueCoeff', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const steps = [makeStep('s0', 'a', 1, 's1'), makeStep('s1', 'b', 2, 's2')];
    const episode = makeEpisode('e1', steps);

    await svc.trainEpisodes([episode], {
      algorithm: 'a3c',
      epochs: 1,
      learningRate: 0.01,
      valueCoeff: 0.5,
    });

    expect(sona.estimateValue).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ learningRate: 0.01 * 0.5 })
    );
  });

  it('calls trainPolicy once per epoch regardless of episode count', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);
    const EPOCHS = 4;
    const episodes = [
      makeEpisode('e1', [makeStep('s0', 'a', 1, 's1'), makeStep('s1', 'b', 2, 's2')]),
      makeEpisode('e2', [makeStep('s0', 'a', 1, 's1'), makeStep('s1', 'b', 2, 's2')]),
    ];

    await svc.trainEpisodes(episodes, { algorithm: 'a3c', epochs: EPOCHS });

    expect(sona.trainPolicy).toHaveBeenCalledTimes(EPOCHS);
  });
});

// ---------------------------------------------------------------------------
// trainEpisodes() — algorithm 'q-learning'
// ---------------------------------------------------------------------------

describe('trainEpisodes() — q-learning algorithm', () => {
  it('adds an experience for every consecutive step pair', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const steps = [
      makeStep('s0', 'a0', 1, 's1'),
      makeStep('s1', 'a1', 2, 's2'),
      makeStep('s2', 'a2', 3, 's3'),
    ];
    const episode = makeEpisode('e1', steps);

    await svc.trainEpisodes([episode], { algorithm: 'q-learning', epochs: 1, batchSize: 2 });

    // 3 steps → 2 pairs
    expect(sona.addExperience).toHaveBeenCalledTimes(2);
    expect(sona.addExperience).toHaveBeenCalledWith('s0', 'a0', 1, 's1');
    expect(sona.addExperience).toHaveBeenCalledWith('s1', 'a1', 2, 's2');
  });

  it('does NOT add a duplicate last-step (boundary: step[n-1] → step[n])', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const steps = [makeStep('s0', 'a', 1, 's1')];
    const episode = makeEpisode('e1', steps);

    await svc.trainEpisodes([episode], { algorithm: 'q-learning', epochs: 1 });

    // Only 1 step → no pairs → 0 addExperience calls
    expect(sona.addExperience).not.toHaveBeenCalled();
  });

  it('calls sampleExperience once per batch derived from floor(episodes/batchSize)', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    // 6 episodes, batchSize=2 → 3 batches per epoch
    const episodes = Array.from({ length: 6 }, (_, i) =>
      makeEpisode(`e${i}`, [makeStep('s0', 'a', 1, 's1'), makeStep('s1', 'b', 2, 's2')])
    );

    await svc.trainEpisodes(episodes, { algorithm: 'q-learning', epochs: 1, batchSize: 2 });

    expect(sona.sampleExperience).toHaveBeenCalledTimes(3);
    expect(sona.sampleExperience).toHaveBeenCalledWith(2);
  });

  it('accumulates TD error via estimateValue on sampled experiences', async () => {
    // sampleExperience returns one fake experience; estimateValue returns 0.9
    const fakeExp = { state: 'sA', action: 'a', reward: 0.5, nextState: 'sB' };
    const sona = makeSonaMock({
      sampleExperience: vi.fn().mockReturnValue([fakeExp]),
      estimateValue: vi.fn().mockResolvedValue(0.9),
    });
    const svc = new RLTrainingService(sona);

    const episodes = Array.from({ length: 2 }, (_, i) =>
      makeEpisode(`e${i}`, [makeStep('s0', 'a', 1, 's1'), makeStep('s1', 'b', 2, 's2')])
    );

    // 2 episodes, batchSize=1 → 2 batches, 1 sample each → 2 estimateValue calls
    const result = await svc.trainEpisodes(episodes, { algorithm: 'q-learning', epochs: 1, batchSize: 1 });

    expect(sona.estimateValue).toHaveBeenCalledTimes(2);
    // TD error = |0.9 - 0.5| = 0.4 per call, 2 calls / 2 batches → avg 0.4
    expect(result.learningCurve[0].loss).toBeCloseTo(0.4, 6);
  });
});

// ---------------------------------------------------------------------------
// trainEpisodes() — TrainingResult accumulation
// ---------------------------------------------------------------------------

describe('trainEpisodes() — TrainingResult and trainingHistory', () => {
  it('appends result to trainingHistory after each call', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    await svc.trainEpisodes([], { epochs: 1, algorithm: 'reinforce' });
    await svc.trainEpisodes([], { epochs: 2, algorithm: 'ppo' });

    const history = svc.getTrainingHistory();
    expect(history).toHaveLength(2);
    expect(history[0].algorithm).toBe('reinforce');
    expect(history[1].algorithm).toBe('ppo');
  });

  it('getTrainingHistory returns a copy — mutating it does not corrupt internal state', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    await svc.trainEpisodes([], { epochs: 1 });
    const copy = svc.getTrainingHistory();
    copy.push({} as TrainingResult);

    expect(svc.getTrainingHistory()).toHaveLength(1);
  });

  it('improvementRate is 0 when initial reward is zero (no division by zero)', async () => {
    // stub returns avgReward:0 always → initial=0, final=0
    const sona = makeSonaMock({
      getRLMetrics: vi.fn().mockResolvedValue({
        avgReward: 0,
        avgLoss: 0,
        loss: 0,
        epsilon: 0.1,
        episodeCount: 0,
        episodeReward: 0,
        iterationCount: 0,
      }),
    });
    const svc = new RLTrainingService(sona);

    const result = await svc.trainEpisodes([], { epochs: 2 });

    expect(result.improvementRate).toBe(0);
  });

  it('improvementRate is positive when reward increases', async () => {
    let callCount = 0;
    const rewards = [0.1, 0.1, 0.5]; // first epoch baseline, per-epoch, final
    const sona = makeSonaMock({
      getRLMetrics: vi.fn().mockImplementation(() =>
        Promise.resolve({
          avgReward: rewards[Math.min(callCount++, rewards.length - 1)],
          loss: 0.01,
          epsilon: 0.1,
          avgLoss: 0.01,
          episodeCount: 1,
          episodeReward: 0.1,
          iterationCount: 1,
        })
      ),
    });
    const svc = new RLTrainingService(sona);

    const result = await svc.trainEpisodes([], { epochs: 2 });

    // Final avgReward > initial → improvementRate > 0
    expect(result.improvementRate).toBeGreaterThan(0);
  });

  it('finalLoss comes from metrics.loss of the post-training getRLMetrics() call', async () => {
    // The last getRLMetrics call determines finalLoss
    const sona = makeSonaMock({
      getRLMetrics: vi.fn().mockResolvedValue({ loss: 0.123, avgReward: 0, epsilon: 0.1 }),
    });
    const svc = new RLTrainingService(sona);

    const result = await svc.trainEpisodes([], { epochs: 1 });

    expect(result.finalLoss).toBe(0.123);
  });
});

// ---------------------------------------------------------------------------
// learnFromExecution()
// ---------------------------------------------------------------------------

describe('learnFromExecution()', () => {
  it('delegates to sona.continuousLearn with correct arguments', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);
    await svc.initialize();

    await svc.learnFromExecution('stateX', 'actionY', 0.8, 'stateZ');

    expect(sona.continuousLearn).toHaveBeenCalledWith('stateX', 'actionY', 0.8, 'stateZ');
  });

  it('returns the metrics object from sona.continuousLearn', async () => {
    const metrics: RLMetrics = { avgReward: 0.9, epsilon: 0.05 };
    const sona = makeSonaMock({ continuousLearn: vi.fn().mockResolvedValue(metrics) });
    const svc = new RLTrainingService(sona);

    const result = await svc.learnFromExecution('s', 'a', 1, 'sNext');

    expect(result).toStrictEqual(metrics);
  });

  it('auto-initializes if not yet initialized', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    await svc.learnFromExecution('s', 'a', 1, 'sNext');

    expect(sona.initialize).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// multiAgentTrain()
// ---------------------------------------------------------------------------

describe('multiAgentTrain()', () => {
  it('calls sona.multiAgentLearn once with correct agentEpisodes map', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const states = new Map([['alpha', { pos: 0 }], ['beta', { pos: 1 }]]);
    const actions = new Map([['alpha', 'move'], ['beta', 'stay']]);

    await svc.multiAgentTrain(states, actions, 10);

    expect(sona.multiAgentLearn).toHaveBeenCalledTimes(1);
    const [episodesMap] = (sona.multiAgentLearn as ReturnType<typeof vi.fn>).mock.calls[0] as [Map<string, StoredTrajectory[]>, any];
    expect(episodesMap.has('alpha')).toBe(true);
    expect(episodesMap.has('beta')).toBe(true);
  });

  it('distributes jointReward equally across agents', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const states = new Map([['a1', {}], ['a2', {}], ['a3', {}]]);
    const actions = new Map([['a1', 'x'], ['a2', 'y'], ['a3', 'z']]);

    const rewards = await svc.multiAgentTrain(states, actions, 30);

    expect(rewards.get('a1')).toBe(10);
    expect(rewards.get('a2')).toBe(10);
    expect(rewards.get('a3')).toBe(10);
  });

  it('returns a reward for every agent in agentStates', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const states = new Map([['agent1', {}], ['agent2', {}]]);
    const actions = new Map([['agent1', 'a'], ['agent2', 'b']]);

    const rewards = await svc.multiAgentTrain(states, actions, 20);

    expect(rewards.size).toBe(2);
    expect(rewards.has('agent1')).toBe(true);
    expect(rewards.has('agent2')).toBe(true);
  });

  it('derives agentTypes from state keys when config.agentTypes is absent', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const states = new Map([['robot1', {}], ['robot2', {}]]);
    const actions = new Map([['robot1', 'go'], ['robot2', 'stop']]);

    await svc.multiAgentTrain(states, actions, 5);

    const [, configArg] = (sona.multiAgentLearn as ReturnType<typeof vi.fn>).mock.calls[0] as [any, MultiAgentConfig];
    expect(configArg.agentTypes).toEqual(expect.arrayContaining(['robot1', 'robot2']));
  });

  it('respects explicit coordinationStrategy and rewardSharing overrides', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const states = new Map([['agentX', {}]]);
    const actions = new Map([['agentX', 'act']]);

    await svc.multiAgentTrain(states, actions, 5, {
      coordinationStrategy: 'centralized',
      rewardSharing: 'competitive',
    });

    const [, configArg] = (sona.multiAgentLearn as ReturnType<typeof vi.fn>).mock.calls[0] as [any, MultiAgentConfig];
    expect(configArg.coordinationStrategy).toBe('centralized');
    expect(configArg.rewardSharing).toBe('competitive');
  });
});

// ---------------------------------------------------------------------------
// transferLearn()
// ---------------------------------------------------------------------------

describe('transferLearn()', () => {
  it('returns { success: false } when transferLearning resolves to falsy', async () => {
    const sona = makeSonaMock({ transferLearning: vi.fn().mockResolvedValue(null) });
    const svc = new RLTrainingService(sona);

    const outcome = await svc.transferLearn({
      sourceTask: 'taskA',
      targetTask: 'taskB',
      transferRatio: 0.8,
      finetuneEpochs: 5,
    });

    expect(outcome.success).toBe(false);
    expect(outcome.result).toBeUndefined();
  });

  it('returns { success: true } without a result when getPatterns is empty', async () => {
    const sona = makeSonaMock({
      transferLearning: vi.fn().mockResolvedValue({ success: true }),
      getPatterns: vi.fn().mockResolvedValue([]),
    });
    const svc = new RLTrainingService(sona);

    const outcome = await svc.transferLearn({
      sourceTask: 'src',
      targetTask: 'tgt',
      transferRatio: 0.5,
      finetuneEpochs: 3,
    });

    expect(outcome.success).toBe(true);
    expect(outcome.result).toBeUndefined();
  });

  it('fine-tunes via trainEpisodes when patterns exist and finetuneEpochs > 0', async () => {
    const patterns = [makeEpisode('p1', [makeStep('s', 'a', 1, 'sn')])];
    const sona = makeSonaMock({
      transferLearning: vi.fn().mockResolvedValue({ success: true }),
      getPatterns: vi.fn().mockResolvedValue(patterns),
    });
    const svc = new RLTrainingService(sona);

    const outcome = await svc.transferLearn({
      sourceTask: 'src',
      targetTask: 'tgt',
      transferRatio: 0.7,
      finetuneEpochs: 2,
    });

    expect(outcome.success).toBe(true);
    expect(outcome.result).toBeDefined();
    expect(outcome.result!.epochs).toBe(2);
    expect(outcome.result!.algorithm).toBe('reinforce');
  });

  it('skips fine-tuning when finetuneEpochs is 0', async () => {
    const patterns = [makeEpisode('p1', [makeStep('s', 'a', 1, 'sn')])];
    const sona = makeSonaMock({
      transferLearning: vi.fn().mockResolvedValue({ success: true }),
      getPatterns: vi.fn().mockResolvedValue(patterns),
    });
    const svc = new RLTrainingService(sona);

    const outcome = await svc.transferLearn({
      sourceTask: 'src',
      targetTask: 'tgt',
      transferRatio: 0.5,
      finetuneEpochs: 0,
    });

    expect(outcome.success).toBe(true);
    expect(outcome.result).toBeUndefined();
  });

  it('passes sourceTask and targetTask and transferRatio to sona.transferLearning', async () => {
    const sona = makeSonaMock({ transferLearning: vi.fn().mockResolvedValue({ success: true }) });
    const svc = new RLTrainingService(sona);

    await svc.transferLearn({ sourceTask: 'S', targetTask: 'T', transferRatio: 0.3, finetuneEpochs: 0 });

    expect(sona.transferLearning).toHaveBeenCalledWith('S', 'T', 0.3);
  });
});

// ---------------------------------------------------------------------------
// getMetrics()
// ---------------------------------------------------------------------------

describe('getMetrics()', () => {
  it('delegates to sona.getRLMetrics and returns the result', async () => {
    const expected: RLMetrics = { avgReward: 0.77, epsilon: 0.02, iterationCount: 42 };
    const sona = makeSonaMock({ getRLMetrics: vi.fn().mockResolvedValue(expected) });
    const svc = new RLTrainingService(sona);

    const result = await svc.getMetrics();

    expect(result).toStrictEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// reset()
// ---------------------------------------------------------------------------

describe('reset()', () => {
  it('calls sona.resetRL()', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    await svc.reset();

    expect(sona.resetRL).toHaveBeenCalledTimes(1);
  });

  it('clears trainingHistory', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    await svc.trainEpisodes([], { epochs: 1 });
    expect(svc.getTrainingHistory()).toHaveLength(1);

    await svc.reset();

    expect(svc.getTrainingHistory()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('trainEpisodes with zero epochs produces an empty learningCurve', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const result = await svc.trainEpisodes([], { epochs: 0 });

    expect(result.learningCurve).toHaveLength(0);
    expect(sona.trainPolicy).not.toHaveBeenCalled();
  });

  it('zero-reward episode: improvementRate is 0 (no NaN/Infinity)', async () => {
    const sona = makeSonaMock({
      getRLMetrics: vi.fn().mockResolvedValue({ avgReward: 0, loss: 0, epsilon: 0.1 }),
    });
    const svc = new RLTrainingService(sona);

    const result = await svc.trainEpisodes(
      [makeEpisode('e1', [makeStep('s', 'a', 0, 'sn')])],
      { epochs: 3 }
    );

    expect(Number.isFinite(result.improvementRate)).toBe(true);
    expect(result.improvementRate).toBe(0);
  });

  it('empty episode steps in a3c: no estimateValue calls, no crash', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const emptyEpisode = makeEpisode('empty', []);

    await expect(
      svc.trainEpisodes([emptyEpisode], { algorithm: 'a3c', epochs: 1 })
    ).resolves.not.toThrow();

    expect(sona.estimateValue).not.toHaveBeenCalled();
  });

  it('empty episodes in q-learning: no addExperience, no crash', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    await expect(
      svc.trainEpisodes([], { algorithm: 'q-learning', epochs: 1, batchSize: 32 })
    ).resolves.not.toThrow();

    expect(sona.addExperience).not.toHaveBeenCalled();
  });

  it('a3c with single-step episode (no consecutive pair): no estimateValue call', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const episode = makeEpisode('e1', [makeStep('s0', 'a', 1, 's1')]);

    await svc.trainEpisodes([episode], { algorithm: 'a3c', epochs: 1 });

    expect(sona.estimateValue).not.toHaveBeenCalled();
  });

  it('multiAgentTrain with single agent distributes full jointReward to that agent', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const states = new Map([['solo', {}]]);
    const actions = new Map([['solo', 'act']]);

    const rewards = await svc.multiAgentTrain(states, actions, 99);

    expect(rewards.get('solo')).toBe(99);
  });

  it('multiAgentTrain: episode stored per-agent uses agentId as trajectoryId', async () => {
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const states = new Map([['agentFoo', { x: 1 }]]);
    const actions = new Map([['agentFoo', 'jump']]);

    await svc.multiAgentTrain(states, actions, 5);

    const [episodesMap] = (sona.multiAgentLearn as ReturnType<typeof vi.fn>).mock.calls[0] as [Map<string, StoredTrajectory[]>, any];
    const eps = episodesMap.get('agentFoo')!;
    expect(eps[0].trajectoryId).toBe('agentFoo');
    expect(eps[0].action).toBe('jump');
  });

  it('q-learning loss is 0 when sampleExperience returns empty array', async () => {
    const sona = makeSonaMock({ sampleExperience: vi.fn().mockReturnValue([]) });
    const svc = new RLTrainingService(sona);

    // Need ≥1 episode and batchSize=1 to get at least one batch iteration
    const episodes = [makeEpisode('e1', [makeStep('s', 'a', 1, 'sn'), makeStep('sn', 'b', 2, 'st')])];
    const result = await svc.trainEpisodes(episodes, { algorithm: 'q-learning', epochs: 1, batchSize: 1 });

    // 0 experiences sampled → totalLoss=0, numBatches=1 → loss=0
    expect(result.learningCurve[0].loss).toBe(0);
    expect(sona.estimateValue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Determinism: Math.random / timers
// ---------------------------------------------------------------------------

describe('determinism', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.42);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('multiAgentTrain timestamp uses Date.now(), which is controllable with fake timers', async () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    const sona = makeSonaMock();
    const svc = new RLTrainingService(sona);

    const states = new Map([['agent', {}]]);
    const actions = new Map([['agent', 'noop']]);

    await svc.multiAgentTrain(states, actions, 1);

    const [episodesMap] = (sona.multiAgentLearn as ReturnType<typeof vi.fn>).mock.calls[0] as [Map<string, StoredTrajectory[]>, any];
    const ep = episodesMap.get('agent')![0];
    expect(ep.timestamp).toBe(new Date('2024-01-01T00:00:00.000Z').getTime());
  });
});
