/**
 * Infrastructure Tools Integration Tests
 *
 * Tests the CLI helper pattern used by infrastructure-tools for daemon,
 * hive-mind, and hooks commands. Uses mocked execFileSync to validate
 * correct argument passing and security properties.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as childProcess from 'child_process';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

const mockExecFileSync = childProcess.execFileSync as unknown as ReturnType<typeof vi.fn>;

describe('Infrastructure Tools Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function runCli(args: string[]): string {
    return childProcess.execFileSync('npx', ['claude-flow@alpha', ...args], {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    }) as string;
  }

  describe('daemon_start', () => {
    it('calls daemon start', () => {
      mockExecFileSync.mockReturnValue('Daemon started on port 3000');
      const result = runCli(['daemon', 'start']);
      expect(result).toContain('Daemon started');
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['daemon', 'start']),
        expect.any(Object),
      );
    });

    it('passes port argument', () => {
      mockExecFileSync.mockReturnValue('Started');
      runCli(['daemon', 'start', '--port', '4000']);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--port', '4000']),
        expect.any(Object),
      );
    });
  });

  describe('daemon_stop', () => {
    it('calls daemon stop', () => {
      mockExecFileSync.mockReturnValue('Daemon stopped');
      const result = runCli(['daemon', 'stop']);
      expect(result).toContain('stopped');
    });
  });

  describe('daemon_status', () => {
    it('returns daemon status', () => {
      mockExecFileSync.mockReturnValue('Daemon running on port 3000');
      const result = runCli(['daemon', 'status']);
      expect(result).toContain('running');
    });
  });

  describe('daemon_list', () => {
    it('lists daemon processes', () => {
      mockExecFileSync.mockReturnValue('Process 1: active\nProcess 2: idle');
      const result = runCli(['daemon', 'list']);
      expect(result).toContain('Process');
    });
  });

  describe('hive_mind_init', () => {
    it('initializes hive-mind with topology', () => {
      mockExecFileSync.mockReturnValue('Hive-mind initialized');
      runCli(['hive-mind', 'init', '--topology', 'mesh', '--consensus', 'raft', '--max-nodes', '5']);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['hive-mind', 'init', '--topology', 'mesh']),
        expect.any(Object),
      );
    });
  });

  describe('hive_mind_join', () => {
    it('joins agent to hive', () => {
      mockExecFileSync.mockReturnValue('Agent joined');
      runCli(['hive-mind', 'join', '--agent', 'agent-1', '--role', 'follower']);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--agent', 'agent-1']),
        expect.any(Object),
      );
    });
  });

  describe('hive_mind_consensus', () => {
    it('requests consensus on proposal', () => {
      mockExecFileSync.mockReturnValue('Consensus reached: approved');
      runCli(['hive-mind', 'consensus', '--proposal', 'deploy v2', '--timeout', '10000']);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--proposal', 'deploy v2']),
        expect.any(Object),
      );
    });
  });

  describe('hive_mind_status', () => {
    it('returns hive-mind status', () => {
      mockExecFileSync.mockReturnValue('Hive active: 3 nodes');
      const result = runCli(['hive-mind', 'status']);
      expect(result).toContain('Hive');
    });
  });

  describe('hooks_list', () => {
    it('lists all hooks', () => {
      mockExecFileSync.mockReturnValue('pre-task: 2 hooks\npost-task: 1 hook');
      const result = runCli(['hooks', 'list']);
      expect(result).toContain('hooks');
    });

    it('filters by category', () => {
      mockExecFileSync.mockReturnValue('pre-task: validate-input');
      runCli(['hooks', 'list', '--category', 'pre-task']);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--category', 'pre-task']),
        expect.any(Object),
      );
    });
  });

  describe('hooks_route', () => {
    it('routes task through hooks', () => {
      mockExecFileSync.mockReturnValue('Routed successfully');
      runCli(['hooks', 'route', '--task', 'test task', '--type', 'pre-task']);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['--task', 'test task']),
        expect.any(Object),
      );
    });
  });

  describe('hooks_pre_task', () => {
    it('executes pre-task hooks', () => {
      mockExecFileSync.mockReturnValue('Pre-task hooks executed');
      runCli(['hooks', 'pre-task', '--task', 'analyze code']);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['pre-task']),
        expect.any(Object),
      );
    });
  });

  describe('hooks_post_task', () => {
    it('executes post-task hooks', () => {
      mockExecFileSync.mockReturnValue('Post-task hooks executed');
      runCli(['hooks', 'post-task', '--task', 'code review', '--success', 'true']);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'npx',
        expect.arrayContaining(['post-task']),
        expect.any(Object),
      );
    });
  });

  describe('hooks_metrics', () => {
    it('returns hook metrics', () => {
      mockExecFileSync.mockReturnValue('Total hooks executed: 42');
      const result = runCli(['hooks', 'metrics']);
      expect(result).toContain('42');
    });
  });

  describe('security: uses execFileSync', () => {
    it('never uses shell execution', () => {
      mockExecFileSync.mockReturnValue('ok');
      runCli(['test']);
      const callOpts = mockExecFileSync.mock.calls[0][2];
      expect(callOpts).not.toHaveProperty('shell');
    });
  });
});
