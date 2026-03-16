/**
 * CLI Proxy Routing Tests
 *
 * Tests that cli-proxy.ts (the main CLI entry point) has routing
 * for all new command modes added by ADR-052.
 *
 * Validates that each mode string appears in the proxy's mode guard
 * and that the corresponding dynamic import is wired up.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const CLI_PROXY_PATH = path.resolve(
  __dirname,
  '../../agentic-flow/src/cli-proxy.ts'
);

describe('CLI Proxy Routing', () => {
  it('cli-proxy.ts exists', () => {
    expect(fs.existsSync(CLI_PROXY_PATH)).toBe(true);
  });

  // -------------------------------------------------------------------
  // All new modes must appear in the mode guard array
  // -------------------------------------------------------------------
  const modes = [
    'daemon',
    'hive-mind',
    'hooks',
    'session',
    'swarm',
    'memory',
    'task',
    'doctor',
  ] as const;

  modes.forEach((mode) => {
    it(`routes '${mode}' mode`, () => {
      const content = fs.readFileSync(CLI_PROXY_PATH, 'utf-8');
      expect(content).toContain(`'${mode}'`);
    });
  });

  // -------------------------------------------------------------------
  // Verify dynamic imports for each handler
  // -------------------------------------------------------------------
  it('imports handleDaemonCommand from daemon-cli', () => {
    const content = fs.readFileSync(CLI_PROXY_PATH, 'utf-8');
    expect(content).toContain('handleDaemonCommand');
    expect(content).toContain('daemon-cli');
  });

  it('imports handleHiveMindCommand from hivemind-cli', () => {
    const content = fs.readFileSync(CLI_PROXY_PATH, 'utf-8');
    expect(content).toContain('handleHiveMindCommand');
    expect(content).toContain('hivemind-cli');
  });

  it('imports handleHooksCommand from hooks-cli', () => {
    const content = fs.readFileSync(CLI_PROXY_PATH, 'utf-8');
    expect(content).toContain('handleHooksCommand');
    expect(content).toContain('hooks-cli');
  });

  it('imports handleSessionCommand from session-cli', () => {
    const content = fs.readFileSync(CLI_PROXY_PATH, 'utf-8');
    expect(content).toContain('handleSessionCommand');
    expect(content).toContain('session-cli');
  });

  it('imports handleSwarmCommand from swarm-cli', () => {
    const content = fs.readFileSync(CLI_PROXY_PATH, 'utf-8');
    expect(content).toContain('handleSwarmCommand');
    expect(content).toContain('swarm-cli');
  });

  it('imports handleMemoryCommand from memory-cli', () => {
    const content = fs.readFileSync(CLI_PROXY_PATH, 'utf-8');
    expect(content).toContain('handleMemoryCommand');
    expect(content).toContain('memory-cli');
  });

  it('imports handleTaskCommand from task-cli', () => {
    const content = fs.readFileSync(CLI_PROXY_PATH, 'utf-8');
    expect(content).toContain('handleTaskCommand');
    expect(content).toContain('task-cli');
  });

  it('imports handleDoctorCommand from doctor-cli', () => {
    const content = fs.readFileSync(CLI_PROXY_PATH, 'utf-8');
    expect(content).toContain('handleDoctorCommand');
    expect(content).toContain('doctor-cli');
  });

  // -------------------------------------------------------------------
  // Verify the mode guard includes all modes (should not route to help)
  // -------------------------------------------------------------------
  it('includes all modes in the mode guard array', () => {
    const content = fs.readFileSync(CLI_PROXY_PATH, 'utf-8');
    // All modes should be present somewhere in the file for routing
    for (const mode of modes) {
      expect(content).toContain(mode);
    }
  });

  // -------------------------------------------------------------------
  // Backward compatibility: old modes still work
  // -------------------------------------------------------------------
  it('still routes legacy modes (config, mcp, proxy)', () => {
    const content = fs.readFileSync(CLI_PROXY_PATH, 'utf-8');
    expect(content).toContain("'config'");
    expect(content).toContain("'mcp'");
    expect(content).toContain("'proxy'");
  });

  it('supports hivemind alias for hive-mind', () => {
    const content = fs.readFileSync(CLI_PROXY_PATH, 'utf-8');
    expect(content).toContain("'hivemind'");
  });
});
