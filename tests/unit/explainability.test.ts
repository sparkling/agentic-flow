/**
 * Explainability Service Tests
 *
 * 25 comprehensive tests covering:
 * - Attention visualization (4 tests)
 * - Decision trees (4 tests)
 * - Counterfactuals (4 tests)
 * - Feature importance (4 tests)
 * - Trace debugging (5 tests)
 * - Compliance reports (4 tests)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ExplainabilityService,
  AttentionHead,
  DecisionNode,
  TraceStep,
  ExecutionTrace,
} from '../../agentic-flow/src/services/explainability-service.js';

describe('ExplainabilityService', () => {
  let service: ExplainabilityService;

  beforeEach(() => {
    service = ExplainabilityService.getInstance();
    service.clearAll();
  });

  // ============================================================================
  // Attention Visualization (4 tests)
  // ============================================================================

  describe('Attention Visualization', () => {
    it('should capture attention weights and identify focus tokens', () => {
      const heads: AttentionHead[] = [
        {
          headId: 0,
          layer: 0,
          weights: [
            { token: 'hello', weight: 0.8, position: 0 },
            { token: 'world', weight: 0.2, position: 1 },
          ],
          topK: ['hello', 'world'],
        },
        {
          headId: 1,
          layer: 0,
          weights: [
            { token: 'hello', weight: 0.5, position: 0 },
            { token: 'world', weight: 0.5, position: 1 },
          ],
          topK: ['hello', 'world'],
        },
      ];

      const viz = service.captureAttention('trace-1', 'hello world', 'Hello World!', heads);

      expect(viz.traceId).toBe('trace-1');
      expect(viz.inputText).toBe('hello world');
      expect(viz.outputText).toBe('Hello World!');
      expect(viz.heads.length).toBe(2);
      expect(viz.focusTokens[0]).toBe('hello'); // Highest total weight
      expect(viz.aggregatedWeights.get('hello')).toBe(1.3);
      expect(viz.aggregatedWeights.get('world')).toBe(0.7);
    });

    it('should retrieve attention visualization by trace ID', () => {
      const heads: AttentionHead[] = [
        {
          headId: 0,
          layer: 0,
          weights: [{ token: 'test', weight: 1.0, position: 0 }],
          topK: ['test'],
        },
      ];

      service.captureAttention('trace-2', 'test input', 'test output', heads);
      const viz = service.getAttentionVisualization('trace-2');

      expect(viz).not.toBeNull();
      expect(viz?.traceId).toBe('trace-2');
    });

    it('should return null for non-existent attention visualization', () => {
      const viz = service.getAttentionVisualization('non-existent');
      expect(viz).toBeNull();
    });

    it('should aggregate weights correctly across multiple heads', () => {
      const heads: AttentionHead[] = [
        {
          headId: 0,
          layer: 0,
          weights: [
            { token: 'important', weight: 0.9, position: 0 },
            { token: 'less', weight: 0.1, position: 1 },
          ],
          topK: ['important', 'less'],
        },
        {
          headId: 1,
          layer: 1,
          weights: [
            { token: 'important', weight: 0.7, position: 0 },
            { token: 'less', weight: 0.3, position: 1 },
          ],
          topK: ['important', 'less'],
        },
        {
          headId: 2,
          layer: 2,
          weights: [
            { token: 'important', weight: 0.6, position: 0 },
            { token: 'less', weight: 0.4, position: 1 },
          ],
          topK: ['important', 'less'],
        },
      ];

      const viz = service.captureAttention('trace-3', 'input', 'output', heads);

      expect(viz.aggregatedWeights.get('important')).toBe(2.2);
      expect(viz.aggregatedWeights.get('less')).toBe(0.8);
      expect(viz.focusTokens[0]).toBe('important');
    });
  });

  // ============================================================================
  // Decision Trees (4 tests)
  // ============================================================================

  describe('Decision Trees', () => {
    it('should build decision tree and calculate depth', () => {
      const rootNode: DecisionNode = {
        nodeId: 'root',
        decision: 'Use Haiku',
        reasoning: 'Task complexity is low',
        confidence: 0.9,
        alternatives: [
          { decision: 'Use Sonnet', confidence: 0.7, reasoning: 'Higher quality' },
        ],
        children: [
          {
            nodeId: 'child-1',
            decision: 'Execute task',
            reasoning: 'Model selected',
            confidence: 0.95,
            alternatives: [],
            children: [],
          },
        ],
      };

      const tree = service.buildDecisionTree('trace-4', rootNode);

      expect(tree.traceId).toBe('trace-4');
      expect(tree.depth).toBe(1);
      expect(tree.totalNodes).toBe(2);
      expect(tree.criticalPath).toEqual(['root', 'child-1']);
    });

    it('should calculate depth correctly for deep trees', () => {
      const rootNode: DecisionNode = {
        nodeId: 'root',
        decision: 'Level 0',
        reasoning: 'Start',
        confidence: 0.9,
        alternatives: [],
        children: [
          {
            nodeId: 'level-1',
            decision: 'Level 1',
            reasoning: 'Middle',
            confidence: 0.8,
            alternatives: [],
            children: [
              {
                nodeId: 'level-2',
                decision: 'Level 2',
                reasoning: 'Deep',
                confidence: 0.7,
                alternatives: [],
                children: [],
              },
            ],
          },
        ],
      };

      const tree = service.buildDecisionTree('trace-5', rootNode);

      expect(tree.depth).toBe(2);
      expect(tree.totalNodes).toBe(3);
    });

    it('should find critical path based on highest confidence', () => {
      const rootNode: DecisionNode = {
        nodeId: 'root',
        decision: 'Choose path',
        reasoning: 'Fork',
        confidence: 0.9,
        alternatives: [],
        children: [
          {
            nodeId: 'path-a',
            decision: 'Path A',
            reasoning: 'Low confidence',
            confidence: 0.5,
            alternatives: [],
            children: [],
          },
          {
            nodeId: 'path-b',
            decision: 'Path B',
            reasoning: 'High confidence',
            confidence: 0.95,
            alternatives: [],
            children: [],
          },
        ],
      };

      const tree = service.buildDecisionTree('trace-6', rootNode);

      expect(tree.criticalPath).toEqual(['root', 'path-b']);
    });

    it('should retrieve decision tree by trace ID', () => {
      const rootNode: DecisionNode = {
        nodeId: 'root',
        decision: 'Test',
        reasoning: 'Testing',
        confidence: 0.9,
        alternatives: [],
        children: [],
      };

      service.buildDecisionTree('trace-7', rootNode);
      const tree = service.getDecisionTree('trace-7');

      expect(tree).not.toBeNull();
      expect(tree?.rootNode.decision).toBe('Test');
    });
  });

  // ============================================================================
  // Counterfactuals (4 tests)
  // ============================================================================

  describe('Counterfactual Explanations', () => {
    it('should generate counterfactual with outcome change', () => {
      const original = { complexity: 20, requiresReasoning: false };
      const modifications = { complexity: 70 };

      const scenario = service.generateCounterfactual('trace-8', original, modifications);

      expect(scenario.changedKeys).toEqual(['complexity']);
      expect(scenario.outcomeChanged).toBe(true);
      expect(scenario.originalOutcome).toBe('agent-booster');
      expect(scenario.counterfactualOutcome).toBe('claude-sonnet-4');
    });

    it('should generate counterfactual without outcome change', () => {
      const original = { complexity: 25 };
      const modifications = { complexity: 28 };

      const scenario = service.generateCounterfactual('trace-9', original, modifications);

      expect(scenario.outcomeChanged).toBe(false);
      expect(scenario.originalOutcome).toBe(scenario.counterfactualOutcome);
    });

    it('should track multiple changed keys', () => {
      const original = { complexity: 20, requiresReasoning: false, multiStep: false };
      const modifications = { requiresReasoning: true, multiStep: true };

      const scenario = service.generateCounterfactual('trace-10', original, modifications);

      expect(scenario.changedKeys).toContain('requiresReasoning');
      expect(scenario.changedKeys).toContain('multiStep');
      expect(scenario.changedKeys.length).toBe(2);
    });

    it('should provide clear explanation for outcome change', () => {
      const original = { complexity: 10 };
      const modifications = { complexity: 90 };

      const scenario = service.generateCounterfactual('trace-11', original, modifications);

      expect(scenario.explanation).toContain('complexity');
      expect(scenario.explanation).toContain('agent-booster');
      expect(scenario.explanation).toContain('claude-opus-4');
    });
  });

  // ============================================================================
  // Feature Importance (4 tests)
  // ============================================================================

  describe('Feature Importance', () => {
    it('should analyze feature importance and sort by importance', () => {
      const inputs = {
        shortKey: 'short',
        longKey: 'a'.repeat(500),
        mediumKey: 'medium value',
      };

      const features = service.analyzeFeatureImportance('trace-12', inputs, 'output mentions longKey');

      expect(features.length).toBe(3);
      expect(features[0].feature).toBe('longKey'); // Highest importance
      expect(features[0].importance).toBeGreaterThan(features[1].importance);
    });

    it('should detect when output mentions feature', () => {
      const inputs = { apiKey: 'secret', endpoint: '/api/users' };
      const output = 'Using endpoint /api/users';

      const features = service.analyzeFeatureImportance('trace-13', inputs, output);

      const endpointFeature = features.find(f => f.feature === 'endpoint');
      expect(endpointFeature).toBeDefined();
      expect(endpointFeature!.importance).toBeGreaterThan(0.3);
    });

    it('should determine impact based on value type', () => {
      const inputs = {
        enabled: true,
        disabled: false,
        neutral: 'value',
      };

      const features = service.analyzeFeatureImportance('trace-14', inputs, 'output');

      const enabledFeature = features.find(f => f.feature === 'enabled');
      const disabledFeature = features.find(f => f.feature === 'disabled');

      expect(enabledFeature?.impact).toBe('positive');
      expect(disabledFeature?.impact).toBe('negative');
    });

    it('should retrieve feature importance by trace ID', () => {
      const inputs = { test: 'value' };
      service.analyzeFeatureImportance('trace-15', inputs, 'output');

      const features = service.getFeatureImportance('trace-15');
      expect(features).not.toBeNull();
      expect(features?.length).toBe(1);
    });
  });

  // ============================================================================
  // Trace Debugging (5 tests)
  // ============================================================================

  describe('Trace Debugging', () => {
    it('should start and track execution trace', () => {
      const trace = service.startTrace('trace-16');

      expect(trace.traceId).toBe('trace-16');
      expect(trace.startTime).toBeGreaterThan(0);
      expect(trace.steps).toEqual([]);
      expect(trace.success).toBe(false);
    });

    it('should add trace steps with metadata', () => {
      service.startTrace('trace-17');
      service.addTraceStep('trace-17', {
        type: 'input',
        description: 'Received user input',
        metadata: { userId: 'user-123' },
      });

      const trace = service.getTrace('trace-17');
      expect(trace?.steps.length).toBe(1);
      expect(trace?.steps[0].type).toBe('input');
      expect(trace?.steps[0].metadata?.userId).toBe('user-123');
    });

    it('should complete trace with success status', () => {
      service.startTrace('trace-18');
      service.addTraceStep('trace-18', {
        type: 'processing',
        description: 'Processing task',
      });
      service.endTrace('trace-18', 'claude-haiku-4', 0.001, true);

      const trace = service.getTrace('trace-18');
      expect(trace?.success).toBe(true);
      expect(trace?.modelUsed).toBe('claude-haiku-4');
      expect(trace?.totalCost).toBe(0.001);
      expect(trace?.durationMs).toBeGreaterThan(0);
    });

    it('should complete trace with error', () => {
      service.startTrace('trace-19');
      service.endTrace('trace-19', 'claude-opus-4', 0.01, false, 'API timeout');

      const trace = service.getTrace('trace-19');
      expect(trace?.success).toBe(false);
      expect(trace?.error).toBe('API timeout');
    });

    it('should retrieve all traces', () => {
      service.startTrace('trace-20');
      service.startTrace('trace-21');
      service.startTrace('trace-22');

      const traces = service.getAllTraces();
      expect(traces.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ============================================================================
  // Compliance Reports (4 tests)
  // ============================================================================

  describe('Compliance Reports', () => {
    it('should generate compliance report with summary', () => {
      service.startTrace('trace-23');
      service.endTrace('trace-23', 'claude-haiku-4', 0.001, true);

      service.startTrace('trace-24');
      service.endTrace('trace-24', 'claude-sonnet-4', 0.005, false);

      const report = service.generateComplianceReport();

      expect(report.summary.totalRequests).toBe(2);
      expect(report.summary.successRate).toBe(0.5);
      expect(report.summary.totalCost).toBe(0.006);
      expect(report.summary.modelsUsed['claude-haiku-4']).toBe(1);
      expect(report.summary.modelsUsed['claude-sonnet-4']).toBe(1);
    });

    it('should filter compliance report by trace IDs', () => {
      service.startTrace('trace-25');
      service.endTrace('trace-25', 'claude-haiku-4', 0.001, true);

      service.startTrace('trace-26');
      service.endTrace('trace-26', 'claude-sonnet-4', 0.005, true);

      const report = service.generateComplianceReport(['trace-25']);

      expect(report.traceIds).toEqual(['trace-25']);
      expect(report.summary.totalRequests).toBe(1);
    });

    it('should include audit log in compliance report', () => {
      service.startTrace('trace-27');
      service.endTrace('trace-27', 'claude-haiku-4', 0.001, true);

      const report = service.generateComplianceReport();

      expect(report.auditLog.length).toBeGreaterThan(0);
      expect(report.auditLog[report.auditLog.length - 1].traceId).toBe('trace-27');
      expect(report.auditLog[report.auditLog.length - 1].result).toBe('success');
    });

    it('should include data handling compliance info', () => {
      const report = service.generateComplianceReport();

      expect(report.dataHandling.piiDetected).toBe(false);
      expect(report.dataHandling.dataRetentionCompliant).toBe(true);
      expect(report.dataHandling.encryptionUsed).toBe(true);
    });
  });

  // ============================================================================
  // Additional Tests (2 tests for configuration and metrics)
  // ============================================================================

  describe('Configuration and Metrics', () => {
    it('should enable/disable tracing', () => {
      service.setEnabled(false);
      expect(service.shouldSample()).toBe(false);

      service.setEnabled(true);
      service.setSamplingRate(1.0);
      expect(service.shouldSample()).toBe(true);
    });

    it('should track metrics and overhead', () => {
      service.startTrace('trace-28');
      service.endTrace('trace-28', 'claude-haiku-4', 0.001, true);

      const metrics = service.getMetrics();

      expect(metrics.tracesCollected).toBeGreaterThan(0);
      expect(metrics.overheadPercentage).toBeLessThan(5); // <5% overhead requirement
      expect(metrics.storageUsedMB).toBeGreaterThan(0);
    });
  });
});
