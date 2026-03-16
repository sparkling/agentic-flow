/**
 * CLI Command Module Tests
 *
 * Tests all 8 new CLI command modules added by ADR-052.
 * Validates that each module exists, exports the expected handler function,
 * and contains the expected subcommand routing.
 *
 * These tests use file-content validation (reading source files and checking
 * for expected exports/patterns) to avoid runtime dependency issues.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const CLI_DIR = path.resolve(__dirname, '../../agentic-flow/src/cli');

// -----------------------------------------------------------------------
// Helper: read a CLI module source and assert it exists
// -----------------------------------------------------------------------
function readCliModule(filename: string): string {
  const filePath = path.join(CLI_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`CLI module not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

// =======================================================================
// daemon-cli
// =======================================================================
describe('CLI Command Modules', () => {
  describe('daemon-cli', () => {
    const filename = 'daemon-cli.ts';

    it('file exists', () => {
      expect(fs.existsSync(path.join(CLI_DIR, filename))).toBe(true);
    });

    it('exports handleDaemonCommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain('export async function handleDaemonCommand');
    });

    it('handles start subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'start'");
    });

    it('handles stop subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'stop'");
    });

    it('handles status subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'status'");
    });

    it('handles restart subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'restart'");
    });
  });

  // =====================================================================
  // hivemind-cli
  // =====================================================================
  describe('hivemind-cli', () => {
    const filename = 'hivemind-cli.ts';

    it('file exists', () => {
      expect(fs.existsSync(path.join(CLI_DIR, filename))).toBe(true);
    });

    it('exports handleHiveMindCommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain('export async function handleHiveMindCommand');
    });

    it('handles init subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'init'");
    });

    it('handles join subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'join'");
    });

    it('handles consensus subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'consensus'");
    });

    it('handles leave subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'leave'");
    });

    it('supports raft and pbft topology', () => {
      const content = readCliModule(filename);
      expect(content).toContain('raft');
      expect(content).toContain('pbft');
    });
  });

  // =====================================================================
  // session-cli
  // =====================================================================
  describe('session-cli', () => {
    const filename = 'session-cli.ts';

    it('file exists', () => {
      expect(fs.existsSync(path.join(CLI_DIR, filename))).toBe(true);
    });

    it('exports handleSessionCommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain('export async function handleSessionCommand');
    });

    it('handles save subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'save'");
    });

    it('handles restore subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'restore'");
    });

    it('handles list subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'list'");
    });

    it('handles delete subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'delete'");
    });
  });

  // =====================================================================
  // hooks-cli
  // =====================================================================
  describe('hooks-cli', () => {
    const filename = 'hooks-cli.ts';

    it('file exists', () => {
      expect(fs.existsSync(path.join(CLI_DIR, filename))).toBe(true);
    });

    it('exports handleHooksCommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain('export async function handleHooksCommand');
    });

    it('handles list subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'list'");
    });

    it('handles enable subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'enable'");
    });

    it('handles disable subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'disable'");
    });

    it('handles test subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'test'");
    });

    it('defines known hook events', () => {
      const content = readCliModule(filename);
      expect(content).toContain('PreToolUse');
      expect(content).toContain('PostToolUse');
      expect(content).toContain('SessionStart');
      expect(content).toContain('SessionEnd');
    });
  });

  // =====================================================================
  // swarm-cli
  // =====================================================================
  describe('swarm-cli', () => {
    const filename = 'swarm-cli.ts';

    it('file exists', () => {
      expect(fs.existsSync(path.join(CLI_DIR, filename))).toBe(true);
    });

    it('exports handleSwarmCommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain('export async function handleSwarmCommand');
    });

    it('handles init subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'init'");
    });

    it('handles spawn subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'spawn'");
    });

    it('handles shutdown subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'shutdown'");
    });

    it('supports hierarchical topology', () => {
      const content = readCliModule(filename);
      expect(content).toContain('hierarchical');
    });
  });

  // =====================================================================
  // memory-cli
  // =====================================================================
  describe('memory-cli', () => {
    const filename = 'memory-cli.ts';

    it('file exists', () => {
      expect(fs.existsSync(path.join(CLI_DIR, filename))).toBe(true);
    });

    it('exports handleMemoryCommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain('export async function handleMemoryCommand');
    });

    it('handles store subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'store'");
    });

    it('handles retrieve subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'retrieve'");
    });

    it('handles search subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'search'");
    });

    it('handles delete subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'delete'");
    });

    it('handles stats subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'stats'");
    });

    it('handles migrate subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'migrate'");
    });
  });

  // =====================================================================
  // task-cli
  // =====================================================================
  describe('task-cli', () => {
    const filename = 'task-cli.ts';

    it('file exists', () => {
      expect(fs.existsSync(path.join(CLI_DIR, filename))).toBe(true);
    });

    it('exports handleTaskCommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain('export async function handleTaskCommand');
    });

    it('handles create subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'create'");
    });

    it('handles status subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'status'");
    });

    it('handles cancel subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'cancel'");
    });

    it('handles results subcommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'results'");
    });
  });

  // =====================================================================
  // doctor-cli
  // =====================================================================
  describe('doctor-cli', () => {
    const filename = 'doctor-cli.ts';

    it('file exists', () => {
      expect(fs.existsSync(path.join(CLI_DIR, filename))).toBe(true);
    });

    it('exports handleDoctorCommand', () => {
      const content = readCliModule(filename);
      expect(content).toContain('export async function handleDoctorCommand');
    });

    it('supports --fix flag', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'--fix'");
    });

    it('supports --check flag', () => {
      const content = readCliModule(filename);
      expect(content).toContain("'--check'");
    });

    it('checks MCP subsystem', () => {
      const content = readCliModule(filename);
      expect(content).toContain('checkMCP');
    });

    it('checks AgentDB subsystem', () => {
      const content = readCliModule(filename);
      expect(content).toContain('checkAgentDB');
    });

    it('checks hooks subsystem', () => {
      const content = readCliModule(filename);
      expect(content).toContain('checkHooks');
    });

    it('checks daemon subsystem', () => {
      const content = readCliModule(filename);
      expect(content).toContain('checkDaemon');
    });
  });
});
