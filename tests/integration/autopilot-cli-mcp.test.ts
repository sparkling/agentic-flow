/**
 * Tests for Autopilot CLI + MCP tools (ADR-058)
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Test the autopilot-tools registration module
describe('Autopilot MCP Tools (registerAutopilotTools)', () => {
  let registeredTools: Map<string, any>;
  let mockServer: any;

  beforeEach(() => {
    registeredTools = new Map();
    mockServer = {
      addTool: (tool: any) => {
        registeredTools.set(tool.name, tool);
      },
    };
  });

  it('should register 10 tools', async () => {
    const { registerAutopilotTools } = await import(
      '../../agentic-flow/src/mcp/fastmcp/tools/autopilot-tools.js'
    );
    registerAutopilotTools(mockServer);
    expect(registeredTools.size).toBe(10);
  });

  it('should register all expected tool names', async () => {
    const { registerAutopilotTools } = await import(
      '../../agentic-flow/src/mcp/fastmcp/tools/autopilot-tools.js'
    );
    registerAutopilotTools(mockServer);
    const expected = [
      'autopilot_status',
      'autopilot_enable',
      'autopilot_disable',
      'autopilot_config',
      'autopilot_reset',
      'autopilot_log',
      'autopilot_progress',
    ];
    for (const name of expected) {
      expect(registeredTools.has(name), `missing tool: ${name}`).toBe(true);
    }
  });

  it('should have descriptions for all tools', async () => {
    const { registerAutopilotTools } = await import(
      '../../agentic-flow/src/mcp/fastmcp/tools/autopilot-tools.js'
    );
    registerAutopilotTools(mockServer);
    for (const [name, tool] of registeredTools) {
      expect(tool.description, `${name} missing description`).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it('should have execute functions for all tools', async () => {
    const { registerAutopilotTools } = await import(
      '../../agentic-flow/src/mcp/fastmcp/tools/autopilot-tools.js'
    );
    registerAutopilotTools(mockServer);
    for (const [name, tool] of registeredTools) {
      expect(typeof tool.execute, `${name} missing execute`).toBe('function');
    }
  });

  it('autopilot_status should return JSON with success field', async () => {
    const { registerAutopilotTools } = await import(
      '../../agentic-flow/src/mcp/fastmcp/tools/autopilot-tools.js'
    );
    registerAutopilotTools(mockServer);
    const tool = registeredTools.get('autopilot_status');
    const result = await tool.execute({});
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toBeDefined();
    expect(typeof parsed.data.enabled).toBe('boolean');
  });

  it('autopilot_reset should reset iteration counter', async () => {
    const { registerAutopilotTools } = await import(
      '../../agentic-flow/src/mcp/fastmcp/tools/autopilot-tools.js'
    );
    registerAutopilotTools(mockServer);
    const resetTool = registeredTools.get('autopilot_reset');
    const result = await resetTool.execute({});
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.iterations).toBe(0);
  });

  it('autopilot_log should return entries array', async () => {
    const { registerAutopilotTools } = await import(
      '../../agentic-flow/src/mcp/fastmcp/tools/autopilot-tools.js'
    );
    registerAutopilotTools(mockServer);
    const logTool = registeredTools.get('autopilot_log');
    const result = await logTool.execute({ last: 10, clear: false });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.entries).toBeDefined();
    expect(Array.isArray(parsed.data.entries)).toBe(true);
  });

  it('autopilot_progress should return task summary', async () => {
    const { registerAutopilotTools } = await import(
      '../../agentic-flow/src/mcp/fastmcp/tools/autopilot-tools.js'
    );
    registerAutopilotTools(mockServer);
    const progressTool = registeredTools.get('autopilot_progress');
    const result = await progressTool.execute({ source: 'all' });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(typeof parsed.data.total).toBe('number');
    expect(typeof parsed.data.progress).toBe('number');
  });

  it('autopilot_enable should set enabled to true', async () => {
    const { registerAutopilotTools } = await import(
      '../../agentic-flow/src/mcp/fastmcp/tools/autopilot-tools.js'
    );
    registerAutopilotTools(mockServer);
    const tool = registeredTools.get('autopilot_enable');
    const result = await tool.execute({});
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.message).toContain('enabled');
  });

  it('autopilot_disable should set enabled to false', async () => {
    const { registerAutopilotTools } = await import(
      '../../agentic-flow/src/mcp/fastmcp/tools/autopilot-tools.js'
    );
    registerAutopilotTools(mockServer);
    const tool = registeredTools.get('autopilot_disable');
    const result = await tool.execute({});
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.message).toContain('disabled');
  });

  it('autopilot_config should accept valid parameters', async () => {
    const { registerAutopilotTools } = await import(
      '../../agentic-flow/src/mcp/fastmcp/tools/autopilot-tools.js'
    );
    registerAutopilotTools(mockServer);
    const tool = registeredTools.get('autopilot_config');
    const result = await tool.execute({ maxIterations: 100, timeoutMinutes: 60 });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.config.maxIterations).toBe(100);
    expect(parsed.data.config.timeoutMinutes).toBe(60);
  });

  it('autopilot_log clear should succeed', async () => {
    const { registerAutopilotTools } = await import(
      '../../agentic-flow/src/mcp/fastmcp/tools/autopilot-tools.js'
    );
    registerAutopilotTools(mockServer);
    const tool = registeredTools.get('autopilot_log');
    const result = await tool.execute({ last: 20, clear: true });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.data.message).toBe('Log cleared');
  });

  it('all tool responses should include timestamp', async () => {
    const { registerAutopilotTools } = await import(
      '../../agentic-flow/src/mcp/fastmcp/tools/autopilot-tools.js'
    );
    registerAutopilotTools(mockServer);
    const tool = registeredTools.get('autopilot_status');
    const result = await tool.execute({});
    const parsed = JSON.parse(result);
    expect(parsed.timestamp).toBeDefined();
    expect(new Date(parsed.timestamp).getTime()).toBeGreaterThan(0);
  });
});

describe('Autopilot CLI Module (handleAutopilotCommand)', () => {
  it('should export handleAutopilotCommand function', async () => {
    const mod = await import('../../agentic-flow/src/cli/autopilot-cli.js');
    expect(typeof mod.handleAutopilotCommand).toBe('function');
  });

  it('should handle status subcommand without throwing', async () => {
    const { handleAutopilotCommand } = await import('../../agentic-flow/src/cli/autopilot-cli.js');
    await expect(handleAutopilotCommand(['status'])).resolves.not.toThrow();
  });

  it('should handle help/unknown subcommand without throwing', async () => {
    const { handleAutopilotCommand } = await import('../../agentic-flow/src/cli/autopilot-cli.js');
    await expect(handleAutopilotCommand(['help'])).resolves.not.toThrow();
  });

  it('should handle empty args without throwing', async () => {
    const { handleAutopilotCommand } = await import('../../agentic-flow/src/cli/autopilot-cli.js');
    await expect(handleAutopilotCommand([])).resolves.not.toThrow();
  });

  it('should handle reset subcommand without throwing', async () => {
    const { handleAutopilotCommand } = await import('../../agentic-flow/src/cli/autopilot-cli.js');
    await expect(handleAutopilotCommand(['reset'])).resolves.not.toThrow();
  });
});
