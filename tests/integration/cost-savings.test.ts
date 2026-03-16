/**
 * Integration Tests for Cost Savings Validation
 * ADR-064 Phase 4: End-to-end cost optimization with 90% savings target
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CostOptimizerService } from '../../agentic-flow/src/services/cost-optimizer-service.js';

function createFreshOptimizer(): CostOptimizerService {
  (CostOptimizerService as any).instance = null;
  return CostOptimizerService.getInstance();
}

describe('Cost Savings Integration', () => {
  let optimizer: CostOptimizerService;

  beforeEach(() => {
    optimizer = createFreshOptimizer();
  });

  describe('1000 Operations Mixed Complexity', () => {
    it('should achieve 90%+ savings vs all-Opus baseline', () => {
      // Generate realistic workload distribution:
      // 60% simple (complexity 0-29) -> Agent Booster (free)
      // 25% moderate (complexity 30-69) -> Haiku/value pick
      // 15% complex (complexity 70-100) -> Sonnet/Opus
      const operations = Array.from({ length: 1000 }, (_, i) => {
        let complexity: number;
        if (i < 600) complexity = Math.floor(Math.random() * 30);
        else if (i < 850) complexity = 30 + Math.floor(Math.random() * 40);
        else complexity = 70 + Math.floor(Math.random() * 31);

        return {
          complexity,
          inputTokens: 50 + Math.floor(Math.random() * 450),
          outputTokens: 25 + Math.floor(Math.random() * 225),
        };
      });

      let optimizedTotalCost = 0;
      let opusTotalCost = 0;
      const modelUsage: Record<string, number> = {};

      for (const op of operations) {
        // Optimized selection
        const selection = optimizer.selectOptimalModel(op);
        optimizedTotalCost += selection.estimatedCost;
        modelUsage[selection.modelId] = (modelUsage[selection.modelId] || 0) + 1;

        // Record spend for tracking
        optimizer.recordSpend(
          selection.modelId,
          op.inputTokens,
          op.outputTokens,
        );

        // All-Opus baseline cost
        const opusInput = (op.inputTokens / 1000) * 0.015;
        const opusOutput = (op.outputTokens / 1000) * 0.075;
        opusTotalCost += opusInput + opusOutput;
      }

      const savingsPercent = ((opusTotalCost - optimizedTotalCost) / opusTotalCost) * 100;

      // Core assertion: 90%+ savings
      expect(savingsPercent).toBeGreaterThanOrEqual(90);

      // Agent Booster should handle >50% of operations (it's free)
      expect(modelUsage['agent-booster'] || 0).toBeGreaterThanOrEqual(500);

      // Verify spending report matches
      const report = optimizer.getSpendingReport();
      expect(report.totalSpend).toBeCloseTo(optimizedTotalCost, 2);
    });

    it('should track per-model breakdown accurately', () => {
      const ops = [
        { complexity: 10, inputTokens: 100, outputTokens: 50 },   // -> agent-booster
        { complexity: 50, inputTokens: 500, outputTokens: 200 },   // -> value model
        { complexity: 90, inputTokens: 1000, outputTokens: 500 },  // -> high quality
      ];

      for (const op of ops) {
        const selection = optimizer.selectOptimalModel(op);
        optimizer.recordSpend(selection.modelId, op.inputTokens, op.outputTokens);
      }

      const report = optimizer.getSpendingReport();
      const totalFromBreakdown = Object.values(report.breakdown)
        .reduce((sum, entry) => sum + entry.totalCost, 0);

      expect(totalFromBreakdown).toBeCloseTo(report.totalSpend, 6);
    });
  });

  describe('Budget Alerts at 80%', () => {
    it('should trigger budget alert when crossing 80% threshold', () => {
      optimizer.setBudget(1.0); // $1 budget

      // Spend to just under 80%
      // Haiku cost per op: (1000/1000)*0.00025 + (500/1000)*0.00125 = 0.000875
      // Need ~914 ops to reach $0.80
      const consoleSpy: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: any[]) => {
        consoleSpy.push(args.join(' '));
      };

      try {
        for (let i = 0; i < 920; i++) {
          optimizer.recordSpend('claude-haiku-4', 1000, 500);
        }

        const status = optimizer.getBudgetStatus();
        expect(status.percentUsed).toBeGreaterThanOrEqual(80);

        // Verify budget alert was triggered
        const alertTriggered = consoleSpy.some(msg => msg.includes('Budget alert'));
        expect(alertTriggered).toBe(true);
      } finally {
        console.warn = originalWarn;
      }
    });

    it('should downgrade model selection after budget exceeded', () => {
      optimizer.setBudget(0.01); // Very tight budget: $0.01

      // Spend to exceed budget
      optimizer.recordSpend('claude-sonnet-4', 2000, 1000);

      // Now try to select a model for a complex task
      const selection = optimizer.selectOptimalModel({
        complexity: 80,
        inputTokens: 2000,
        outputTokens: 1000,
      });

      // Should be forced to cheapest option
      expect(selection.reasoning).toContain('Budget limit');
    });
  });

  describe('Model Selection Across Complexity Spectrum', () => {
    it('should use Agent Booster for 0-29 complexity', () => {
      for (let c = 0; c < 30; c += 5) {
        const result = optimizer.selectOptimalModel({
          complexity: c,
          inputTokens: 100,
          outputTokens: 50,
        });
        expect(result.modelId).toBe('agent-booster');
        expect(result.estimatedCost).toBe(0);
      }
    });

    it('should never use Agent Booster for 30+ complexity', () => {
      for (let c = 30; c <= 100; c += 10) {
        const result = optimizer.selectOptimalModel({
          complexity: c,
          inputTokens: 100,
          outputTokens: 50,
        });
        expect(result.modelId).not.toBe('agent-booster');
      }
    });

    it('should select progressively more capable models as complexity increases', () => {
      const lowResult = optimizer.selectOptimalModel({
        complexity: 35,
        inputTokens: 500,
        outputTokens: 200,
      });

      const highResult = optimizer.selectOptimalModel({
        complexity: 95,
        inputTokens: 500,
        outputTokens: 200,
        minQuality: 93,
      });

      // High complexity with quality requirement should pick more expensive model
      expect(highResult.estimatedCost).toBeGreaterThanOrEqual(lowResult.estimatedCost);
    });
  });

  describe('Savings Validation Against Benchmarks', () => {
    it('should reduce cost per 1000 operations to under $0.30', () => {
      // Target from ADR-064: $0.24 per 1000 operations
      // Using typical workload: avg 200 input, 100 output tokens
      let totalCost = 0;

      for (let i = 0; i < 1000; i++) {
        // 70% simple, 20% moderate, 10% complex
        const complexity = i < 700 ? 15 : i < 900 ? 50 : 85;
        const selection = optimizer.selectOptimalModel({
          complexity,
          inputTokens: 200,
          outputTokens: 100,
        });
        totalCost += selection.estimatedCost;
      }

      // ADR-064 target: $0.24 per 1000 ops (allow some margin)
      expect(totalCost).toBeLessThan(0.30);
    });

    it('should compare favorably: optimized vs all-Opus vs all-Haiku', () => {
      const tasks = Array.from({ length: 500 }, (_, i) => ({
        complexity: i < 350 ? 15 : i < 450 ? 50 : 85,
        inputTokens: 200,
        outputTokens: 100,
      }));

      let optimizedCost = 0;
      let opusCost = 0;
      let haikuCost = 0;

      for (const task of tasks) {
        const selection = optimizer.selectOptimalModel(task);
        optimizedCost += selection.estimatedCost;

        opusCost += (task.inputTokens / 1000) * 0.015 + (task.outputTokens / 1000) * 0.075;
        haikuCost += (task.inputTokens / 1000) * 0.00025 + (task.outputTokens / 1000) * 0.00125;
      }

      // Optimized should be cheaper than all-Opus
      expect(optimizedCost).toBeLessThan(opusCost);

      // Optimized should be close to or cheaper than all-Haiku
      // (because Agent Booster is free for simple tasks)
      expect(optimizedCost).toBeLessThanOrEqual(haikuCost * 1.5);
    });
  });

  describe('Concurrent Budget Tracking', () => {
    it('should handle rapid sequential spend recording', () => {
      optimizer.setBudget(10);

      for (let i = 0; i < 10000; i++) {
        optimizer.recordSpend('claude-haiku-4', 100, 50);
      }

      const status = optimizer.getBudgetStatus();
      // Haiku cost per op: 0.1*0.00025 + 0.05*0.00125 = 0.0000875
      // 10000 ops * 0.0000875 = $0.875
      expect(status.spent).toBeCloseTo(0.875, 2);
      expect(status.percentUsed).toBeCloseTo(8.75, 1);
    });
  });
});
