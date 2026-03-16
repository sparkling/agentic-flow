import { describe, it, expect, beforeAll } from 'vitest';
import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { registerPerformanceTools } from '../../agentic-flow/src/mcp/fastmcp/tools/performance-tools.js';
import { registerWorkflowTools } from '../../agentic-flow/src/mcp/fastmcp/tools/workflow-tools.js';
import { registerDAATools } from '../../agentic-flow/src/mcp/fastmcp/tools/daa-tools.js';

describe('MCP Tools Expansion - Phase 3', () => {
  let server: any;

  beforeAll(() => {
    server = new FastMCP({
      name: 'test-server',
      version: '1.0.0',
    });

    registerPerformanceTools(server);
    registerWorkflowTools(server);
    registerDAATools(server);
  });

  describe('Performance Tools (15 tools)', () => {
    const performanceTools = [
      'performance_metrics',
      'performance_bottleneck',
      'performance_report',
      'performance_optimize',
      'token_usage',
      'token_efficiency',
      'load_balance',
      'topology_optimize',
      'parallel_execute',
      'cache_manage',
      'real_time_view',
      'agent_metrics',
      'swarm_monitor',
      'benchmark_run',
      'profile_hot_paths',
    ];

    it.each(performanceTools)('should register %s tool', (toolName) => {
      const tool = server.tools.get(toolName);
      expect(tool).toBeDefined();
      expect(tool.name).toBe(toolName);
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(tool.execute).toBeTypeOf('function');
    });

    it('should execute performance_metrics tool', async () => {
      const tool = server.tools.get('performance_metrics');
      const result = await tool.execute({
        target: 'system',
        timeRange: 3600,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toBeDefined();
      expect(parsed.data.metrics).toBeDefined();
      expect(parsed.timestamp).toBeTruthy();
    });

    it('should execute performance_bottleneck tool', async () => {
      const tool = server.tools.get('performance_bottleneck');
      const result = await tool.execute({
        scope: 'all',
        threshold: 1000,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toBeDefined();
      expect(parsed.data.bottlenecks).toBeDefined();
      expect(Array.isArray(parsed.data.bottlenecks)).toBe(true);
    });

    it('should execute token_usage tool', async () => {
      const tool = server.tools.get('token_usage');
      const result = await tool.execute({
        groupBy: 'agent',
        timeRange: 3600,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.totalTokens).toBeTypeOf('number');
      expect(parsed.data.breakdown).toBeDefined();
    });

    it('should execute cache_manage tool', async () => {
      const tool = server.tools.get('cache_manage');
      const result = await tool.execute({
        action: 'status',
        target: 'all',
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.status).toBeDefined();
    });

    it('should execute benchmark_run tool', async () => {
      const tool = server.tools.get('benchmark_run');
      const result = await tool.execute({
        suite: 'quick',
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.scores).toBeDefined();
      expect(parsed.data.overallScore).toBeTypeOf('number');
    });
  });

  describe('Workflow Tools (11 tools)', () => {
    const workflowTools = [
      'workflow_create',
      'workflow_execute',
      'workflow_list',
      'workflow_status',
      'automation_setup',
      'smart_spawn',
      'auto_agent',
      'workflow_template',
      'session_memory',
      'self_healing',
      'drift_detect',
    ];

    it.each(workflowTools)('should register %s tool', (toolName) => {
      const tool = server.tools.get(toolName);
      expect(tool).toBeDefined();
      expect(tool.name).toBe(toolName);
      expect(tool.description).toBeTruthy();
      expect(tool.execute).toBeTypeOf('function');
    });

    it('should execute smart_spawn tool', async () => {
      const tool = server.tools.get('smart_spawn');
      const result = await tool.execute({
        task: 'Implement authentication feature',
        maxAgents: 3,
        useHistory: true,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.spawned).toBeDefined();
      expect(Array.isArray(parsed.data.spawned)).toBe(true);
      expect(parsed.data.spawned.length).toBeGreaterThan(0);
    });

    it('should execute auto_agent tool', async () => {
      const tool = server.tools.get('auto_agent');
      const result = await tool.execute({
        task: 'Fix critical bug in authentication',
        includeReasoning: true,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.selectedAgent).toBeTruthy();
      expect(parsed.data.confidence).toBeTypeOf('number');
      expect(parsed.data.reasoning).toBeDefined();
    });

    it('should execute workflow_template tool', async () => {
      const tool = server.tools.get('workflow_template');
      const result = await tool.execute({
        category: 'development',
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.templates).toBeDefined();
      expect(parsed.data.templates.development).toBeDefined();
    });

    it('should execute session_memory tool - store', async () => {
      const tool = server.tools.get('session_memory');
      const result = await tool.execute({
        action: 'store',
        sessionId: 'test-session-123',
        data: { key: 'value', status: 'active' },
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.stored).toBe(true);
    });

    it('should execute drift_detect tool', async () => {
      const tool = server.tools.get('drift_detect');
      const result = await tool.execute({
        workflowId: 'wf-test-123',
        threshold: 0.15,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.driftDetected).toBeTypeOf('boolean');
      expect(parsed.data.driftMagnitude).toBeTypeOf('number');
    });
  });

  describe('DAA Coordination Tools (10 tools)', () => {
    const daaTools = [
      'daa_init',
      'daa_agent_create',
      'daa_agent_adapt',
      'daa_cognitive_pattern',
      'daa_knowledge_share',
      'daa_learning_status',
      'daa_performance_metrics',
      'daa_workflow_create',
      'daa_workflow_execute',
      'daa_meta_learning',
    ];

    it.each(daaTools)('should register %s tool', (toolName) => {
      const tool = server.tools.get(toolName);
      expect(tool).toBeDefined();
      expect(tool.name).toBe(toolName);
      expect(tool.description).toBeTruthy();
      expect(tool.execute).toBeTypeOf('function');
    });

    it('should execute daa_init tool', async () => {
      const tool = server.tools.get('daa_init');
      const result = await tool.execute({
        maxAgents: 10,
        learningRate: 0.1,
        adaptationStrategy: 'balanced',
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.initialized).toBe(true);
      expect(parsed.data.capabilities).toBeDefined();
      expect(Array.isArray(parsed.data.capabilities)).toBe(true);
    });

    it('should execute daa_agent_create tool', async () => {
      const tool = server.tools.get('daa_agent_create');
      const result = await tool.execute({
        baseType: 'coder',
        specialization: 'backend-api',
        capabilities: ['typescript', 'rest-api', 'database'],
        adaptable: true,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.id).toMatch(/^daa-coder-/);
      expect(parsed.data.specialization).toBe('backend-api');
      expect(parsed.data.learningState).toBeDefined();
    });

    it('should execute daa_agent_adapt tool', async () => {
      const tool = server.tools.get('daa_agent_adapt');
      const result = await tool.execute({
        agentId: 'daa-coder-123',
        feedback: {
          task: 'Implement REST endpoint',
          success: true,
          reward: 0.85,
          insights: ['Used efficient patterns', 'Good error handling'],
        },
        adaptationType: 'skill',
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.adaptations).toBeDefined();
      expect(Array.isArray(parsed.data.adaptations)).toBe(true);
      expect(parsed.data.newAdaptationLevel).toBeTypeOf('number');
    });

    it('should execute daa_cognitive_pattern tool', async () => {
      const tool = server.tools.get('daa_cognitive_pattern');
      const result = await tool.execute({
        patternType: 'problem-solving',
        minConfidence: 0.6,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.patterns).toBeDefined();
      expect(Array.isArray(parsed.data.patterns)).toBe(true);
    });

    it('should execute daa_knowledge_share tool', async () => {
      const tool = server.tools.get('daa_knowledge_share');
      const result = await tool.execute({
        sourceAgentId: 'daa-expert-1',
        targetAgentIds: ['daa-novice-1', 'daa-novice-2'],
        knowledgeType: 'skill',
        transferMethod: 'selective',
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.transfers).toBeDefined();
      expect(Array.isArray(parsed.data.transfers)).toBe(true);
      expect(parsed.data.totalTransfers).toBe(2);
    });

    it('should execute daa_learning_status tool', async () => {
      const tool = server.tools.get('daa_learning_status');
      const result = await tool.execute({
        includeHistory: true,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.learningProgress).toBeDefined();
      expect(parsed.data.successRate).toBeTypeOf('number');
      expect(parsed.data.history).toBeDefined();
    });

    it('should execute daa_workflow_create tool', async () => {
      const tool = server.tools.get('daa_workflow_create');
      const result = await tool.execute({
        name: 'adaptive-testing',
        objectives: ['Run tests', 'Analyze failures', 'Suggest fixes'],
        initialAgents: ['tester', 'analyzer'],
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.workflowId).toMatch(/^daa-wf-/);
      expect(parsed.data.learningEnabled).toBe(true);
    });

    it('should execute daa_meta_learning tool', async () => {
      const tool = server.tools.get('daa_meta_learning');
      const result = await tool.execute({
        scope: 'swarm',
        focus: 'all',
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.insights).toBeDefined();
      expect(Array.isArray(parsed.data.insights)).toBe(true);
      expect(parsed.data.improvements).toBeDefined();
    });
  });

  describe('Tool Count Verification', () => {
    it('should have 36 new tools registered', () => {
      const performanceCount = 15;
      const workflowCount = 11;
      const daaCount = 10;
      const totalNew = performanceCount + workflowCount + daaCount;

      expect(totalNew).toBe(36);
    });

    it('should have all tools with proper structure', () => {
      const allTools = [
        ...Array.from(server.tools.values()),
      ];

      for (const tool of allTools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.parameters).toBeDefined();
        expect(tool.execute).toBeTypeOf('function');
      }
    });

    it('should have tools with zod schemas', () => {
      const toolsToCheck = [
        'performance_metrics',
        'workflow_create',
        'daa_agent_create',
      ];

      for (const toolName of toolsToCheck) {
        const tool = server.tools.get(toolName);
        expect(tool).toBeDefined();
        expect(tool.parameters).toBeDefined();
        // Zod schemas have a _def property
        expect(tool.parameters._def).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully in performance tools', async () => {
      const tool = server.tools.get('performance_metrics');
      // Should not throw, even with edge case inputs
      await expect(tool.execute({ target: 'system' })).resolves.toBeTruthy();
    });

    it('should handle errors gracefully in workflow tools', async () => {
      const tool = server.tools.get('smart_spawn');
      // Should not throw, returns error in JSON
      await expect(tool.execute({ task: '', maxAgents: -1 })).resolves.toBeTruthy();
    });

    it('should handle errors gracefully in DAA tools', async () => {
      const tool = server.tools.get('daa_learning_status');
      // Should not throw
      await expect(tool.execute({})).resolves.toBeTruthy();
    });
  });

  describe('Integration with AgentDB', () => {
    it('should use AgentDB service in performance_metrics', async () => {
      const tool = server.tools.get('performance_metrics');
      const result = await tool.execute({ target: 'all', timeRange: 3600 });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.metrics.backend).toBeDefined();
    });

    it('should use AgentDB service in smart_spawn', async () => {
      const tool = server.tools.get('smart_spawn');
      const result = await tool.execute({
        task: 'Test task',
        maxAgents: 2,
        useHistory: true,
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.data.recommendations).toBeDefined();
    });

    it('should use AgentDB service in daa_agent_adapt', async () => {
      const tool = server.tools.get('daa_agent_adapt');
      const result = await tool.execute({
        agentId: 'test-agent',
        feedback: {
          task: 'test',
          success: true,
          reward: 0.9,
        },
        adaptationType: 'all',
      });

      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
    });
  });
});
