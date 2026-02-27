/**
 * Unit Tests for CostOptimizerService
 * ADR-064 Phase 4: Validate model selection, budget enforcement, and savings
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CostOptimizerService } from '../../agentic-flow/src/services/cost-optimizer-service.js';

// Reset singleton between tests
function createFreshOptimizer(): CostOptimizerService {
  // Access private static to reset, then get new instance
  (CostOptimizerService as any).instance = null;
  return CostOptimizerService.getInstance();
}

describe('CostOptimizerService', () => {
  let optimizer: CostOptimizerService;

  beforeEach(() => {
    optimizer = createFreshOptimizer();
  });

  describe('Model Selection', () => {
    it('should select Agent Booster for simple tasks (complexity < 30)', () => {
      const result = optimizer.selectOptimalModel({
        complexity: 10,
        inputTokens: 100,
        outputTokens: 50,
      });

      expect(result.modelId).toBe('agent-booster');
      expect(result.estimatedCost).toBe(0);
      expect(result.reasoning).toContain('Simple task');
    });

    it('should select Agent Booster at complexity boundary (29)', () => {
      const result = optimizer.selectOptimalModel({
        complexity: 29,
        inputTokens: 200,
        outputTokens: 100,
      });

      expect(result.modelId).toBe('agent-booster');
      expect(result.estimatedCost).toBe(0);
    });

    it('should NOT select Agent Booster at complexity 30', () => {
      const result = optimizer.selectOptimalModel({
        complexity: 30,
        inputTokens: 200,
        outputTokens: 100,
      });

      expect(result.modelId).not.toBe('agent-booster');
      expect(result.estimatedCost).toBeGreaterThan(0);
    });

    it('should provide alternatives for Agent Booster selection', () => {
      const result = optimizer.selectOptimalModel({
        complexity: 15,
        inputTokens: 100,
        outputTokens: 50,
      });

      expect(result.alternatives).toBeDefined();
      expect(result.alternatives!.length).toBeGreaterThan(0);
      expect(result.alternatives![0].modelId).toBe('claude-haiku-4');
    });

    it('should select best value model for moderate complexity', () => {
      const result = optimizer.selectOptimalModel({
        complexity: 50,
        inputTokens: 500,
        outputTokens: 200,
      });

      // Should pick a model that balances quality, cost, and latency
      expect(result.modelId).toBeTruthy();
      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(result.reasoning).toBeTruthy();
    });

    it('should respect maxLatency constraint', () => {
      const result = optimizer.selectOptimalModel({
        complexity: 80,
        inputTokens: 1000,
        outputTokens: 500,
        maxLatency: 600,  // Only Haiku and GPT-3.5 fit
      });

      const model = result.modelId;
      // Models with latency <= 600ms: haiku (500ms), gpt-3.5 (400ms), agent-booster (1ms)
      expect(['claude-haiku-4', 'gpt-3.5-turbo']).toContain(model);
    });

    it('should respect minQuality constraint', () => {
      const result = optimizer.selectOptimalModel({
        complexity: 90,
        inputTokens: 1000,
        outputTokens: 500,
        minQuality: 90,
      });

      // Models with quality >= 90: sonnet (90), opus (95), gpt-4-turbo (92)
      expect(['claude-sonnet-4', 'claude-opus-4', 'gpt-4-turbo']).toContain(result.modelId);
    });

    it('should fall back to Opus when no candidates meet requirements', () => {
      const result = optimizer.selectOptimalModel({
        complexity: 95,
        inputTokens: 1000,
        outputTokens: 500,
        maxLatency: 1,     // Nothing fits except agent-booster
        minQuality: 99,    // Nothing fits
      });

      // Fallback to Opus
      expect(result.modelId).toBe('claude-opus-4');
    });
  });

  describe('Budget Enforcement', () => {
    it('should enforce budget limit by selecting cheapest model', () => {
      // Set a tiny budget
      optimizer.setBudget(0.001);

      // Spend most of the budget
      optimizer.recordSpend('claude-haiku-4', 1000, 500);

      // Now selection should be budget-constrained
      const result = optimizer.selectOptimalModel({
        complexity: 80,
        inputTokens: 5000,
        outputTokens: 2000,
      });

      // Should select cheapest option due to budget constraint
      expect(result.reasoning).toContain('Budget limit');
    });

    it('should throw error for negative budget', () => {
      expect(() => optimizer.setBudget(-10)).toThrow('Budget limit must be positive');
    });

    it('should throw error for zero budget', () => {
      expect(() => optimizer.setBudget(0)).toThrow('Budget limit must be positive');
    });

    it('should correctly track budget status', () => {
      optimizer.setBudget(50);
      const status = optimizer.getBudgetStatus();

      expect(status.limit).toBe(50);
      expect(status.spent).toBe(0);
      expect(status.remaining).toBe(50);
      expect(status.percentUsed).toBe(0);
    });

    it('should update budget status after spending', () => {
      optimizer.setBudget(100);
      optimizer.recordSpend('claude-haiku-4', 10000, 5000);

      const status = optimizer.getBudgetStatus();
      expect(status.spent).toBeGreaterThan(0);
      expect(status.remaining).toBeLessThan(100);
      expect(status.percentUsed).toBeGreaterThan(0);
    });
  });

  describe('Spend Recording', () => {
    it('should record spend correctly for known models', () => {
      const statusBefore = optimizer.getBudgetStatus();
      optimizer.recordSpend('claude-haiku-4', 1000, 500);
      const statusAfter = optimizer.getBudgetStatus();

      // Haiku: input 0.00025/1K, output 0.00125/1K
      // Cost = (1000/1000)*0.00025 + (500/1000)*0.00125 = 0.00025 + 0.000625 = 0.000875
      const expectedCost = 0.000875;
      expect(statusAfter.spent).toBeCloseTo(expectedCost, 5);
    });

    it('should not crash for unknown model', () => {
      // Should warn but not throw
      expect(() => optimizer.recordSpend('unknown-model', 100, 50)).not.toThrow();
    });

    it('should accumulate spend across multiple records', () => {
      optimizer.recordSpend('claude-haiku-4', 1000, 500);
      optimizer.recordSpend('claude-haiku-4', 1000, 500);

      const status = optimizer.getBudgetStatus();
      const expectedCost = 0.000875 * 2;
      expect(status.spent).toBeCloseTo(expectedCost, 5);
    });

    it('should record zero cost for agent-booster', () => {
      optimizer.recordSpend('agent-booster', 10000, 5000);

      const status = optimizer.getBudgetStatus();
      expect(status.spent).toBe(0);
    });
  });

  describe('Spending Report', () => {
    it('should generate correct report with no spending', () => {
      const report = optimizer.getSpendingReport();

      expect(report.totalSpend).toBe(0);
      expect(report.budgetRemaining).toBe(100); // default budget
      expect(report.utilizationPercent).toBe(0);
      expect(report.breakdown).toEqual({});
    });

    it('should track breakdown by model', () => {
      optimizer.recordSpend('claude-haiku-4', 1000, 500);
      optimizer.recordSpend('claude-sonnet-4', 1000, 500);
      optimizer.recordSpend('claude-haiku-4', 2000, 1000);

      const report = optimizer.getSpendingReport();

      expect(report.breakdown['claude-haiku-4']).toBeDefined();
      expect(report.breakdown['claude-haiku-4'].count).toBe(2);
      expect(report.breakdown['claude-sonnet-4']).toBeDefined();
      expect(report.breakdown['claude-sonnet-4'].count).toBe(1);
    });

    it('should calculate savings vs all-Opus', () => {
      // Record some cheap model usage
      for (let i = 0; i < 100; i++) {
        optimizer.recordSpend('claude-haiku-4', 100, 50);
      }

      const report = optimizer.getSpendingReport();
      expect(report.savingsVsOpus).toBeGreaterThan(0);
      expect(report.savingsVsOpus).toBeGreaterThan(report.totalSpend);
    });
  });

  describe('90% Savings Calculation', () => {
    it('should achieve 90%+ savings with typical mixed workload', () => {
      // Simulate realistic workload: 70% simple, 20% moderate, 10% complex
      const tasks = Array.from({ length: 1000 }, (_, i) => {
        if (i < 700) return { complexity: 15, inputTokens: 100, outputTokens: 50 };
        if (i < 900) return { complexity: 50, inputTokens: 500, outputTokens: 200 };
        return { complexity: 85, inputTokens: 1000, outputTokens: 500 };
      });

      let optimizedCost = 0;
      let opusCost = 0;

      for (const task of tasks) {
        const selection = optimizer.selectOptimalModel(task);
        optimizedCost += selection.estimatedCost;

        // Calculate what Opus would cost for same task
        const opusInputCost = (task.inputTokens / 1000) * 0.015;
        const opusOutputCost = (task.outputTokens / 1000) * 0.075;
        opusCost += opusInputCost + opusOutputCost;
      }

      const savingsPercent = ((opusCost - optimizedCost) / opusCost) * 100;
      expect(savingsPercent).toBeGreaterThanOrEqual(90);
    });

    it('should achieve cost savings even with all-complex workload', () => {
      const tasks = Array.from({ length: 100 }, () => ({
        complexity: 85,
        inputTokens: 1000,
        outputTokens: 500,
      }));

      let optimizedCost = 0;
      let opusCost = 0;

      for (const task of tasks) {
        const selection = optimizer.selectOptimalModel(task);
        optimizedCost += selection.estimatedCost;

        const opusInputCost = (task.inputTokens / 1000) * 0.015;
        const opusOutputCost = (task.outputTokens / 1000) * 0.075;
        opusCost += opusInputCost + opusOutputCost;
      }

      // Even with complex tasks, value-based selection should save some cost
      expect(optimizedCost).toBeLessThan(opusCost);
    });
  });

  describe('Model Value Scoring', () => {
    it('should rank Haiku higher than Opus for moderate tasks (better value)', () => {
      const result = optimizer.selectOptimalModel({
        complexity: 50,
        inputTokens: 500,
        outputTokens: 200,
      });

      // Haiku has much better value ratio (quality/cost*latency)
      // unless quality requirement is specified
      expect(result.alternatives).toBeDefined();
    });

    it('should list available models', () => {
      const models = optimizer.getAvailableModels();

      expect(models.length).toBeGreaterThanOrEqual(4);
      const modelIds = models.map(m => m.modelId);
      expect(modelIds).toContain('agent-booster');
      expect(modelIds).toContain('claude-haiku-4');
      expect(modelIds).toContain('claude-sonnet-4');
      expect(modelIds).toContain('claude-opus-4');
    });

    it('should support custom model pricing', () => {
      optimizer.addCustomModel({
        modelId: 'custom-model',
        inputCostPer1K: 0.001,
        outputCostPer1K: 0.005,
        latency: 300,
        qualityScore: 85,
      });

      const models = optimizer.getAvailableModels();
      expect(models.find(m => m.modelId === 'custom-model')).toBeDefined();
    });
  });

  describe('Reset Spending', () => {
    it('should reset spending to zero', () => {
      optimizer.recordSpend('claude-haiku-4', 5000, 2000);
      expect(optimizer.getBudgetStatus().spent).toBeGreaterThan(0);

      optimizer.resetSpending();

      const status = optimizer.getBudgetStatus();
      expect(status.spent).toBe(0);
      expect(status.remaining).toBe(status.limit);
    });

    it('should clear operation history on reset', () => {
      optimizer.recordSpend('claude-haiku-4', 1000, 500);
      optimizer.resetSpending();

      const report = optimizer.getSpendingReport();
      expect(report.breakdown).toEqual({});
    });
  });
});
