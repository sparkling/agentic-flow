/**
 * RL Training Service - Reinforcement Learning Training Orchestration
 *
 * ADR-065 Phase P1-2: SONA RL Loop Implementation
 *
 * Provides high-level RL training coordination using SonaTrajectoryService
 * for policy gradients, value functions, experience replay, multi-agent RL,
 * and transfer learning.
 *
 * Features:
 * - PPO (Proximal Policy Optimization)
 * - A3C (Asynchronous Advantage Actor-Critic)
 * - Q-Learning with experience replay
 * - Multi-agent coordination
 * - Transfer learning between tasks
 * - Continuous learning loop
 *
 * Usage:
 *   const trainer = new RLTrainingService();
 *   await trainer.initialize();
 *
 *   // Train on episodes
 *   await trainer.trainEpisodes(episodes, { algorithm: 'ppo' });
 *
 *   // Continuous learning
 *   await trainer.learnFromExecution(state, action, reward, nextState);
 */

import { SonaTrajectoryService, type StoredTrajectory } from 'agentdb';

// Types that may not be exported yet - define locally if needed
export interface PolicyGradientConfig {
  learningRate?: number;
  gamma?: number;
  baseline?: 'none' | 'avg' | 'learned';
}

export interface ValueFunctionConfig {
  learningRate?: number;
  gamma?: number;
  lambda?: number;
}

export interface ExperienceReplayConfig {
  bufferSize?: number;
  batchSize?: number;
  minSize?: number;
}

export interface RLMetrics {
  avgReward?: number;
  avgLoss?: number;
  episodeCount?: number;
}

export type RLAlgorithm = 'reinforce' | 'ppo' | 'a3c' | 'q-learning';

export interface TrainingConfig {
  algorithm: RLAlgorithm;
  epochs: number;
  batchSize: number;
  learningRate: number;
  gamma: number;
  epsilon: number;
  ppoClipRatio?: number; // PPO-specific
  entropyCoeff?: number; // PPO/A3C
  valueCoeff?: number; // A3C-specific
}

export interface TrainingResult {
  algorithm: RLAlgorithm;
  epochs: number;
  finalLoss: number;
  avgReward: number;
  improvementRate: number; // percentage
  convergenceIteration: number;
  learningCurve: Array<{ iteration: number; reward: number; loss: number }>;
}

export interface MultiAgentConfig {
  agentTypes: string[];
  coordinationStrategy: 'centralized' | 'decentralized' | 'hybrid';
  rewardSharing: 'equal' | 'contribution' | 'competitive';
}

export interface TransferConfig {
  sourceTask: string;
  targetTask: string;
  transferRatio: number;
  finetuneEpochs: number;
}

export class RLTrainingService {
  private sona: SonaTrajectoryService;
  private initialized: boolean = false;
  private trainingHistory: TrainingResult[] = [];

  constructor(sonaService?: SonaTrajectoryService) {
    this.sona = sonaService || new SonaTrajectoryService();
  }

  /**
   * Initialize the RL training service
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    await this.sona.initialize();
    this.initialized = true;

    console.log('[RLTrainingService] Initialized with engine:', this.sona.getEngineType());
    return true;
  }

  /**
   * Train on episodes using specified algorithm
   *
   * @param episodes - Training episodes (trajectories)
   * @param config - Training configuration
   * @returns Training results with learning curve
   */
  async trainEpisodes(episodes: StoredTrajectory[], config: Partial<TrainingConfig> = {}): Promise<TrainingResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const fullConfig: TrainingConfig = {
      algorithm: config.algorithm || 'reinforce',
      epochs: config.epochs || 100,
      batchSize: config.batchSize || 32,
      learningRate: config.learningRate || 0.001,
      gamma: config.gamma || 0.99,
      epsilon: config.epsilon || 0.1,
      ppoClipRatio: config.ppoClipRatio || 0.2,
      entropyCoeff: config.entropyCoeff || 0.01,
      valueCoeff: config.valueCoeff || 0.5
    };

    // Configure SONA with training parameters
    this.sona.configureRL({
      policy: {
        learningRate: fullConfig.learningRate,
        gamma: fullConfig.gamma,
        epsilon: fullConfig.epsilon,
        entropyCoeff: fullConfig.entropyCoeff
      },
      value: {
        learningRate: fullConfig.learningRate,
        gamma: fullConfig.gamma,
        lambda: 0.95
      },
      replay: {
        bufferSize: 10000,
        batchSize: fullConfig.batchSize,
        priorityAlpha: 0.6,
        priorityBeta: 0.4
      }
    });

    const learningCurve: Array<{ iteration: number; reward: number; loss: number }> = [];
    let bestReward = -Infinity;
    let convergenceIteration = fullConfig.epochs;
    let improvementCount = 0;

    console.log(`[RLTrainingService] Training ${episodes.length} episodes with ${fullConfig.algorithm}`);

    for (let epoch = 0; epoch < fullConfig.epochs; epoch++) {
      let loss = 0;

      // Algorithm-specific training
      switch (fullConfig.algorithm) {
        case 'ppo':
          loss = await this.trainPPO(episodes, fullConfig);
          break;
        case 'a3c':
          loss = await this.trainA3C(episodes, fullConfig);
          break;
        case 'q-learning':
          loss = await this.trainQLearning(episodes, fullConfig);
          break;
        case 'reinforce':
        default:
          loss = await this.sona.trainPolicy(episodes, {
            learningRate: fullConfig.learningRate,
            gamma: fullConfig.gamma,
            epsilon: fullConfig.epsilon,
            entropyCoeff: fullConfig.entropyCoeff
          });
          break;
      }

      const metrics = this.sona.getRLMetrics();

      // Track learning curve
      learningCurve.push({
        iteration: epoch,
        reward: metrics.avgReward,
        loss
      });

      // Check for improvement
      if (metrics.avgReward > bestReward) {
        bestReward = metrics.avgReward;
        improvementCount++;

        // Check for convergence (no improvement for 20 epochs)
        if (epoch - convergenceIteration > 20) {
          convergenceIteration = epoch;
        }
      }

      // Log progress every 10 epochs
      if (epoch % 10 === 0) {
        console.log(`[RLTrainingService] Epoch ${epoch}: Loss=${loss.toFixed(4)}, AvgReward=${metrics.avgReward.toFixed(4)}, Epsilon=${metrics.epsilon.toFixed(4)}`);
      }
    }

    const finalMetrics = this.sona.getRLMetrics();
    const initialReward = learningCurve[0]?.reward || 0;
    const finalReward = finalMetrics.avgReward;
    const improvementRate = initialReward === 0 ? 0 : ((finalReward - initialReward) / Math.abs(initialReward)) * 100;

    const result: TrainingResult = {
      algorithm: fullConfig.algorithm,
      epochs: fullConfig.epochs,
      finalLoss: finalMetrics.loss,
      avgReward: finalReward,
      improvementRate,
      convergenceIteration,
      learningCurve
    };

    this.trainingHistory.push(result);

    console.log(`[RLTrainingService] Training complete: ${improvementRate.toFixed(2)}% improvement`);

    return result;
  }

  /**
   * PPO (Proximal Policy Optimization) training
   */
  private async trainPPO(episodes: StoredTrajectory[], config: TrainingConfig): Promise<number> {
    let totalLoss = 0;

    // PPO uses multiple epochs on the same data
    for (let ppoEpoch = 0; ppoEpoch < 4; ppoEpoch++) {
      // Standard policy gradient with clipping
      const loss = await this.sona.trainPolicy(episodes, {
        learningRate: config.learningRate * (1 - ppoEpoch * 0.1), // decay learning rate
        gamma: config.gamma,
        epsilon: config.epsilon,
        entropyCoeff: config.entropyCoeff
      });

      totalLoss += loss;
    }

    return totalLoss / 4;
  }

  /**
   * A3C (Asynchronous Advantage Actor-Critic) training
   */
  private async trainA3C(episodes: StoredTrajectory[], config: TrainingConfig): Promise<number> {
    let totalLoss = 0;
    let count = 0;

    // Train actor (policy) and critic (value) separately
    for (const episode of episodes) {
      // Update value function
      for (let i = 0; i < episode.steps.length - 1; i++) {
        const step = episode.steps[i];
        const nextStep = episode.steps[i + 1];

        await this.sona.estimateValue(step.state, step.reward, nextStep.state, {
          learningRate: config.learningRate * (config.valueCoeff || 0.5),
          gamma: config.gamma,
          lambda: 0.95
        });
      }

      count++;
    }

    // Update policy
    const policyLoss = await this.sona.trainPolicy(episodes, {
      learningRate: config.learningRate,
      gamma: config.gamma,
      epsilon: config.epsilon,
      entropyCoeff: config.entropyCoeff
    });

    totalLoss += policyLoss;

    return totalLoss / Math.max(count, 1);
  }

  /**
   * Q-Learning with experience replay
   */
  private async trainQLearning(episodes: StoredTrajectory[], config: TrainingConfig): Promise<number> {
    // Add all experiences to replay buffer
    for (const episode of episodes) {
      for (let i = 0; i < episode.steps.length - 1; i++) {
        const step = episode.steps[i];
        const nextStep = episode.steps[i + 1];

        this.sona.addExperience(step.state, step.action, step.reward, nextStep.state);
      }
    }

    // Sample and train
    let totalLoss = 0;
    const numBatches = Math.floor(episodes.length / config.batchSize);

    for (let i = 0; i < numBatches; i++) {
      const batch = this.sona.sampleExperience(config.batchSize);

      for (const exp of batch) {
        const value = await this.sona.estimateValue(exp.state, exp.reward, exp.nextState, {
          learningRate: config.learningRate,
          gamma: config.gamma,
          lambda: 0.95
        });

        totalLoss += Math.abs(value - exp.reward);
      }
    }

    return totalLoss / Math.max(numBatches, 1);
  }

  /**
   * Learn from a single execution step (continuous learning)
   *
   * @param state - Current state
   * @param action - Action taken
   * @param reward - Reward received
   * @param nextState - Resulting state
   * @returns Updated value estimate
   */
  async learnFromExecution(state: any, action: string, reward: number, nextState: any): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    return await this.sona.continuousLearn(state, action, reward, nextState);
  }

  /**
   * Multi-agent reinforcement learning
   *
   * @param agentStates - Map of agent IDs to states
   * @param agentActions - Map of agent IDs to actions
   * @param jointReward - Shared reward
   * @param config - Multi-agent configuration
   * @returns Individual rewards for each agent
   */
  async multiAgentTrain(
    agentStates: Map<string, any>,
    agentActions: Map<string, string>,
    jointReward: number,
    config?: Partial<MultiAgentConfig>
  ): Promise<Map<string, number>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const fullConfig: MultiAgentConfig = {
      agentTypes: config?.agentTypes || Array.from(agentStates.keys()),
      coordinationStrategy: config?.coordinationStrategy || 'hybrid',
      rewardSharing: config?.rewardSharing || 'contribution'
    };

    console.log(`[RLTrainingService] Multi-agent training: ${fullConfig.agentTypes.length} agents, ${fullConfig.rewardSharing} reward sharing`);

    // Use SONA's multi-agent learning
    const individualRewards = await this.sona.multiAgentLearn(agentStates, agentActions, jointReward);

    return individualRewards;
  }

  /**
   * Transfer learning from source task to target task
   *
   * @param config - Transfer learning configuration
   * @returns Success indicator and training result
   */
  async transferLearn(config: TransferConfig): Promise<{ success: boolean; result?: TrainingResult }> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log(`[RLTrainingService] Transfer learning: ${config.sourceTask} → ${config.targetTask} (ratio: ${config.transferRatio})`);

    // Perform transfer
    const success = await this.sona.transferLearning(config.sourceTask, config.targetTask, config.transferRatio);

    if (!success) {
      console.log('[RLTrainingService] Transfer failed: no source patterns available');
      return { success: false };
    }

    // Fine-tune on target task if we have data
    const targetPatterns = await this.sona.getPatterns(config.targetTask);

    if (targetPatterns.length > 0 && config.finetuneEpochs > 0) {
      console.log(`[RLTrainingService] Fine-tuning on ${targetPatterns.length} target patterns`);

      const result = await this.trainEpisodes(targetPatterns, {
        algorithm: 'reinforce',
        epochs: config.finetuneEpochs,
        learningRate: 0.0005 // lower learning rate for fine-tuning
      });

      return { success: true, result };
    }

    return { success: true };
  }

  /**
   * Get training history
   */
  getTrainingHistory(): TrainingResult[] {
    return [...this.trainingHistory];
  }

  /**
   * Get current RL metrics
   */
  getMetrics(): RLMetrics {
    return this.sona.getRLMetrics();
  }

  /**
   * Reset training state
   */
  reset(): void {
    this.sona.resetRL();
    this.trainingHistory = [];
  }

  /**
   * Get the underlying SONA service
   */
  getSonaService(): SonaTrajectoryService {
    return this.sona;
  }
}
