/**
 * Documentation Parity Tests
 *
 * Tests that documentation matches the actual codebase state.
 * Validates ADR-055 (documentation-implementation parity) requirements:
 *   - No references to @claude-flow/cli (which does not exist as a package)
 *   - All 7 ADR files (051-057) exist
 *   - CLAUDE.md contains accurate CLI references
 *
 * These tests catch documentation drift and stale references.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

// -----------------------------------------------------------------------
// Helper
// -----------------------------------------------------------------------
function readProjectFile(relPath: string): string {
  const full = path.join(PROJECT_ROOT, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`File not found: ${full}`);
  }
  return fs.readFileSync(full, 'utf-8');
}

// =======================================================================
// ADR file existence
// =======================================================================
describe('Documentation Parity', () => {
  describe('ADR files', () => {
    const adrDir = path.join(PROJECT_ROOT, 'docs/adr');

    it('ADR directory exists', () => {
      expect(fs.existsSync(adrDir)).toBe(true);
    });

    const expectedADRs = [
      { number: '051', title: 'mcp-tool-implementation-gap' },
      { number: '052', title: 'cli-tool-gap-remediation' },
      { number: '053', title: 'security-review-remediation' },
      { number: '054', title: 'agentdb-v3-architecture-review' },
      { number: '055', title: 'documentation-implementation-parity' },
      { number: '056', title: 'rvf-ruvector-integration-roadmap' },
      { number: '057', title: 'agentdb-ruvector-v2-integration' },
    ];

    expectedADRs.forEach(({ number, title }) => {
      it(`ADR-${number} (${title}) exists`, () => {
        const files = fs.readdirSync(adrDir).filter(
          (f) => f.startsWith(`ADR-${number}`) && f.endsWith('.md')
        );
        expect(files.length).toBeGreaterThan(0);
      });
    });
  });

  // =====================================================================
  // Root CLAUDE.md validation
  // =====================================================================
  describe('Root CLAUDE.md', () => {
    const claudeMdPath = path.join(PROJECT_ROOT, 'CLAUDE.md');

    it('CLAUDE.md exists', () => {
      expect(fs.existsSync(claudeMdPath)).toBe(true);
    });

    it('references agentic-flow CLI (npx agentic-flow)', () => {
      const content = readProjectFile('CLAUDE.md');
      // CLAUDE.md should reference the actual CLI entry point
      expect(content).toMatch(/npx\s+agentic-flow|agentic-flow/);
    });

    it('documents the daemon command', () => {
      const content = readProjectFile('CLAUDE.md');
      expect(content).toContain('daemon');
    });

    it('documents the doctor command', () => {
      const content = readProjectFile('CLAUDE.md');
      expect(content).toContain('doctor');
    });
  });

  // =====================================================================
  // docs/CLAUDE.md validation
  // =====================================================================
  describe('docs/CLAUDE.md', () => {
    const docsClaude = path.join(PROJECT_ROOT, 'docs/CLAUDE.md');

    it('docs/CLAUDE.md exists', () => {
      expect(fs.existsSync(docsClaude)).toBe(true);
    });

    it('references Task tool for agent execution', () => {
      const content = readProjectFile('docs/CLAUDE.md');
      expect(content).toContain('Task');
    });
  });

  // =====================================================================
  // Package name consistency
  // =====================================================================
  describe('Package name consistency', () => {
    it('package.json uses correct package name', () => {
      const pkgJson = readProjectFile('agentic-flow/package.json');
      const pkg = JSON.parse(pkgJson);
      // The actual package name should be agentic-flow, not @claude-flow/cli
      expect(pkg.name).not.toBe('@claude-flow/cli');
    });

    it('package.json has a bin entry for CLI', () => {
      const pkgJson = readProjectFile('agentic-flow/package.json');
      const pkg = JSON.parse(pkgJson);
      // Should have a bin entry for CLI execution
      expect(pkg.bin || pkg.main).toBeDefined();
    });
  });

  // =====================================================================
  // CLI module cross-references
  // =====================================================================
  describe('CLI module cross-references', () => {
    const cliDir = path.join(PROJECT_ROOT, 'agentic-flow/src/cli');

    it('all 8 new CLI modules exist', () => {
      const expected = [
        'daemon-cli.ts',
        'hivemind-cli.ts',
        'session-cli.ts',
        'hooks-cli.ts',
        'swarm-cli.ts',
        'memory-cli.ts',
        'task-cli.ts',
        'doctor-cli.ts',
      ];

      for (const file of expected) {
        expect(
          fs.existsSync(path.join(cliDir, file)),
          `Missing CLI module: ${file}`
        ).toBe(true);
      }
    });

    it('cli-proxy.ts references all 8 new modules', () => {
      const proxyContent = readProjectFile('agentic-flow/src/cli-proxy.ts');
      const modules = [
        'daemon-cli',
        'hivemind-cli',
        'session-cli',
        'hooks-cli',
        'swarm-cli',
        'memory-cli',
        'task-cli',
        'doctor-cli',
      ];

      for (const mod of modules) {
        expect(
          proxyContent.includes(mod),
          `cli-proxy.ts missing reference to ${mod}`
        ).toBe(true);
      }
    });
  });
});
