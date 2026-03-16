/**
 * ADR-057 Deep Integration Tests
 *
 * Validates the deep integration layer files created for:
 *   - Phase 1: Persistent Agent Memory (AgentDB integration)
 *   - Phase 3: Attention Coordinator
 *   - Phase 4: Graph State Management
 *   - Phase 5: Self-Improvement Pipeline
 *   - ADR-056: RuVector wiring (SemanticRouter, SonaTrajectoryService)
 *
 * Uses file-content validation to verify that the integration classes
 * exist, export the expected interfaces, and reference the correct
 * AgentDB / RuVector dependencies.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// -----------------------------------------------------------------------
// Helper
// -----------------------------------------------------------------------
function readFile(relPath: string): string {
  const full = path.join(PROJECT_ROOT, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`File not found: ${full}`);
  }
  return fs.readFileSync(full, 'utf-8');
}

// =======================================================================
// Phase 1: Persistent Agent Memory
// =======================================================================
describe('ADR-057 Deep Integration', () => {
  describe('Phase 1: Persistent Agent Memory', () => {
    const filePath = 'src/mcp/agentdb-integration.ts';

    it('agentdb-integration.ts exists', () => {
      expect(fs.existsSync(path.join(PROJECT_ROOT, filePath))).toBe(true);
    });

    it('imports from agentdb', () => {
      const content = readFile(filePath);
      expect(content).toContain('agentdb');
    });

    it('exports AgentDBIntegration class', () => {
      const content = readFile(filePath);
      expect(content).toContain('export class AgentDBIntegration');
    });

    it('provides initialize method', () => {
      const content = readFile(filePath);
      expect(content).toContain('async initialize');
    });

    it('includes in-memory fallback stores', () => {
      const content = readFile(filePath);
      // Should have Maps as fallback when AgentDB is unavailable
      expect(content).toContain('new Map');
    });
  });

  // =====================================================================
  // Phase 3: Attention Coordinator
  // =====================================================================
  describe('Phase 3: Attention Coordinator', () => {
    const filePath = 'agentic-flow/src/coordination/attention-coordinator.ts';

    it('attention-coordinator.ts exists', () => {
      expect(fs.existsSync(path.join(PROJECT_ROOT, filePath))).toBe(true);
    });

    it('exports AttentionCoordinator class', () => {
      const content = readFile(filePath);
      expect(content).toContain('export class AttentionCoordinator');
    });

    it('provides coordinateAgents method', () => {
      const content = readFile(filePath);
      expect(content).toContain('coordinateAgents');
    });

    it('references AgentDB AttentionService', () => {
      const content = readFile(filePath);
      expect(content).toContain('AttentionService');
    });

    it('supports multiple attention mechanisms', () => {
      const content = readFile(filePath);
      expect(content).toContain('multi-head');
      expect(content).toContain('flash');
    });

    it('includes fallback heuristic scoring', () => {
      const content = readFile(filePath);
      // Should have a fallback path when native attention is unavailable
      expect(content).toMatch(/available|fallback|heuristic/i);
    });
  });

  // =====================================================================
  // Phase 4: Graph State Management
  // =====================================================================
  describe('Phase 4: Graph State Management', () => {
    const filePath = 'agentic-flow/src/coordination/graph-state-manager.ts';

    it('graph-state-manager.ts exists', () => {
      expect(fs.existsSync(path.join(PROJECT_ROOT, filePath))).toBe(true);
    });

    it('exports GraphStateManager class', () => {
      const content = readFile(filePath);
      expect(content).toContain('export class GraphStateManager');
    });

    it('has addNode method', () => {
      const content = readFile(filePath);
      expect(content).toContain('addNode');
    });

    it('has addEdge method', () => {
      const content = readFile(filePath);
      expect(content).toContain('addEdge');
    });

    it('has query method', () => {
      const content = readFile(filePath);
      expect(content).toContain('query');
    });

    it('references @ruvector/graph-node', () => {
      const content = readFile(filePath);
      expect(content).toContain('@ruvector/graph-node');
    });

    it('has in-memory fallback with Map', () => {
      const content = readFile(filePath);
      expect(content).toContain('new Map');
    });
  });

  // =====================================================================
  // Phase 5: Self-Improvement Pipeline
  // =====================================================================
  describe('Phase 5: Self-Improvement Pipeline', () => {
    const filePath = 'agentic-flow/src/coordination/self-improvement-pipeline.ts';

    it('self-improvement-pipeline.ts exists', () => {
      expect(fs.existsSync(path.join(PROJECT_ROOT, filePath))).toBe(true);
    });

    it('exports SelfImprovementPipeline class', () => {
      const content = readFile(filePath);
      expect(content).toContain('export class SelfImprovementPipeline');
    });

    it('has runImprovementCycle method', () => {
      const content = readFile(filePath);
      expect(content).toContain('runImprovementCycle');
    });

    it('has explainDecision method', () => {
      const content = readFile(filePath);
      expect(content).toContain('explainDecision');
    });

    it('references AgentDB NightlyLearner', () => {
      const content = readFile(filePath);
      expect(content).toContain('NightlyLearner');
    });

    it('references AgentDB ExplainableRecall', () => {
      const content = readFile(filePath);
      expect(content).toContain('ExplainableRecall');
    });
  });

  // =====================================================================
  // RuVector Wiring (ADR-056)
  // =====================================================================
  describe('RuVector Wiring (ADR-056)', () => {
    it('SemanticRouter.ts exists in agentdb services', () => {
      const filePath = path.join(
        PROJECT_ROOT,
        'packages/agentdb/src/services/SemanticRouter.ts'
      );
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('SemanticRouter references @ruvector/router', () => {
      const content = readFile('packages/agentdb/src/services/SemanticRouter.ts');
      expect(content).toContain('@ruvector/router');
    });

    it('SemanticRouter exports the SemanticRouter class', () => {
      const content = readFile('packages/agentdb/src/services/SemanticRouter.ts');
      expect(content).toContain('export class SemanticRouter');
    });

    it('SonaTrajectoryService.ts exists in agentdb services', () => {
      const filePath = path.join(
        PROJECT_ROOT,
        'packages/agentdb/src/services/SonaTrajectoryService.ts'
      );
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('SonaTrajectoryService references @ruvector/sona', () => {
      const content = readFile('packages/agentdb/src/services/SonaTrajectoryService.ts');
      expect(content).toContain('@ruvector/sona');
    });

    it('SonaTrajectoryService exports the SonaTrajectoryService class', () => {
      const content = readFile('packages/agentdb/src/services/SonaTrajectoryService.ts');
      expect(content).toContain('export class SonaTrajectoryService');
    });

    it('deprecated services/AttentionService.ts is removed or redirected', () => {
      const deprecated = path.join(
        PROJECT_ROOT,
        'packages/agentdb/src/services/AttentionService.ts'
      );
      if (fs.existsSync(deprecated)) {
        const content = fs.readFileSync(deprecated, 'utf-8');
        // If the file still exists, it should be a thin redirect (under 200 bytes)
        // or explicitly marked as deprecated
        const isSmallRedirect = content.length < 200;
        const isMarkedDeprecated = /deprecated/i.test(content);
        expect(isSmallRedirect || isMarkedDeprecated).toBe(true);
      }
      // If the file does not exist, the test passes (it was properly removed)
    });
  });
});
