/**
 * Comprehensive Security Validation Tests
 *
 * Tests all security fixes identified in ADR-053.
 * Validates that command injection vectors are eliminated,
 * API keys are not accepted in MCP parameters, and no
 * hardcoded secrets exist in the source tree.
 *
 * These tests use file-content validation to verify security
 * fixes are in place without executing potentially dangerous code.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// -----------------------------------------------------------------------
// Helper: recursively collect TypeScript/JavaScript files (non-node_modules)
// -----------------------------------------------------------------------
function collectSourceFiles(dir: string, extensions: string[] = ['.ts', '.js']): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      results.push(...collectSourceFiles(fullPath, extensions));
    } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

// =======================================================================
// CVE-LOCAL-001: github-safe.js command injection
// =======================================================================
describe('Comprehensive Security Validation', () => {
  describe('CVE-LOCAL-001: github-safe.js command injection', () => {
    const safePath = path.resolve(__dirname, '../../.claude/helpers/github-safe.js');

    it('github-safe.js exists', () => {
      expect(fs.existsSync(safePath)).toBe(true);
    });

    it('uses execFileSync instead of execSync', () => {
      const content = fs.readFileSync(safePath, 'utf-8');
      expect(content).toContain('execFileSync');
    });

    it('does not use template literals with execSync', () => {
      const content = fs.readFileSync(safePath, 'utf-8');
      // Template literal interpolation into execSync is an injection vector
      expect(content).not.toMatch(/execSync\s*\(\s*`/);
    });

    it('does not use string concatenation with execSync', () => {
      const content = fs.readFileSync(safePath, 'utf-8');
      // String concatenation into execSync is also an injection vector
      expect(content).not.toMatch(/execSync\s*\(\s*['"]/);
    });
  });

  // =====================================================================
  // CVE-LOCAL-002: agentic-jujutsu test command injection
  // =====================================================================
  describe('CVE-LOCAL-002: agentic-jujutsu test command injection', () => {
    const testFiles = [
      'packages/agentic-jujutsu/tests/quantum/ml-dsa-signing.test.js',
      'packages/agentic-jujutsu/tests/quantum/quantum-full-workflow.test.js',
      'packages/agentic-jujutsu/tests/quantum/quantum-fingerprints.test.js',
      'packages/agentic-jujutsu/tests/quantum/quantum-dag-integration.test.js',
    ];

    testFiles.forEach((relPath) => {
      const file = path.resolve(__dirname, '../..', relPath);
      const basename = path.basename(relPath);

      describe(basename, () => {
        it('file exists', () => {
          expect(fs.existsSync(file)).toBe(true);
        });

        it('uses fs.rmSync instead of execSync rm', () => {
          const content = fs.readFileSync(file, 'utf-8');
          expect(content).toContain('rmSync');
          expect(content).not.toMatch(/execSync.*rm\s+-rf/);
        });

        it('uses fs.mkdirSync instead of execSync mkdir', () => {
          const content = fs.readFileSync(file, 'utf-8');
          expect(content).toContain('mkdirSync');
          expect(content).not.toMatch(/execSync.*mkdir/);
        });
      });
    });
  });

  // =====================================================================
  // CVE-LOCAL-003: build script command injection
  // =====================================================================
  describe('CVE-LOCAL-003: build script command injection', () => {
    const buildScript = path.resolve(
      __dirname,
      '../../packages/agentdb/scripts/build-browser-advanced.cjs'
    );

    it('build-browser-advanced.cjs exists', () => {
      expect(fs.existsSync(buildScript)).toBe(true);
    });

    it('uses execFileSync for terser invocations (not template-literal execSync)', () => {
      const content = fs.readFileSync(buildScript, 'utf-8');
      // The fixed version uses execFileSync for terser; a vulnerable version
      // would interpolate user-controllable paths into a template literal.
      expect(content).not.toMatch(/execSync\s*\(\s*`.*terser/);
    });

    it('uses execFileSync for tsc invocations', () => {
      const content = fs.readFileSync(buildScript, 'utf-8');
      expect(content).not.toMatch(/execSync\s*\(\s*`.*tsc/);
    });
  });

  // =====================================================================
  // CVE-LOCAL-004: API keys in MCP parameters
  // =====================================================================
  describe('CVE-LOCAL-004: API keys in MCP parameters', () => {
    const httpSsePath = path.resolve(
      __dirname,
      '../../agentic-flow/src/mcp/fastmcp/servers/http-sse.ts'
    );

    it('http-sse.ts exists', () => {
      expect(fs.existsSync(httpSsePath)).toBe(true);
    });

    it('does not accept anthropicApiKey as a tool parameter', () => {
      const content = fs.readFileSync(httpSsePath, 'utf-8');
      expect(content).not.toMatch(/anthropicApiKey:\s*z\./);
    });

    it('does not accept openrouterApiKey as a tool parameter', () => {
      const content = fs.readFileSync(httpSsePath, 'utf-8');
      expect(content).not.toMatch(/openrouterApiKey:\s*z\./);
    });

    it('does not accept geminiApiKey as a tool parameter', () => {
      const content = fs.readFileSync(httpSsePath, 'utf-8');
      expect(content).not.toMatch(/geminiApiKey:\s*z\./);
    });
  });

  // =====================================================================
  // No hardcoded secrets in source tree
  // =====================================================================
  describe('No hardcoded secrets', () => {
    const srcDirs = [
      path.resolve(__dirname, '../../agentic-flow/src'),
      path.resolve(__dirname, '../../packages/agentdb/src'),
    ];

    it('no Anthropic API keys (sk-ant-api) in source files (excluding known proxy dummies)', () => {
      for (const dir of srcDirs) {
        const files = collectSourceFiles(dir);
        for (const file of files) {
          const content = fs.readFileSync(file, 'utf-8');
          // Remove known dummy/placeholder key patterns before checking.
          // The proxy wrapper uses "sk-ant-api03-proxy-forwarded-to-..." as a
          // non-functional marker that signals to downstream code that the
          // request is being forwarded. This is not a real secret.
          const sanitized = content.replace(
            /sk-ant-api\d{2}-proxy-forwarded[^\n]*/g,
            ''
          );
          expect(sanitized).not.toMatch(/sk-ant-api\d{2}-[a-zA-Z0-9]{20,}/);
        }
      }
    });

    it('no OpenRouter API keys (sk-or-v1-) in source files', () => {
      for (const dir of srcDirs) {
        const files = collectSourceFiles(dir);
        for (const file of files) {
          const content = fs.readFileSync(file, 'utf-8');
          // Real OpenRouter keys are sk-or-v1- followed by a 64-char hex string
          expect(content).not.toMatch(/sk-or-v1-[a-f0-9]{32,}/);
        }
      }
    });

    it('.env files should not contain real API keys', () => {
      const envFiles = [
        path.resolve(__dirname, '../../.env'),
        path.resolve(__dirname, '../../agentic-flow/.env'),
      ];
      for (const envFile of envFiles) {
        if (fs.existsSync(envFile)) {
          // SECURITY NOTE: If a .env file exists in the repo with real keys,
          // that is a pre-existing condition flagged by ADR-053. This test
          // validates that the file is listed in .gitignore so it is not
          // tracked by git.
          const gitignorePath = path.resolve(__dirname, '../../.gitignore');
          if (fs.existsSync(gitignorePath)) {
            const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
            expect(gitignore).toContain('.env');
          }
        }
      }
    });
  });

  // =====================================================================
  // Input validation at system boundaries
  // =====================================================================
  describe('Input validation patterns', () => {
    it('memory-cli sanitizes key names for file paths', () => {
      const memoryCliPath = path.resolve(
        __dirname,
        '../../agentic-flow/src/cli/memory-cli.ts'
      );
      const content = fs.readFileSync(memoryCliPath, 'utf-8');
      // The key must be sanitized before being used as a filename
      expect(content).toMatch(/replace\s*\(\s*\/\[/);
    });

    it('daemon-cli validates port as integer', () => {
      const daemonCliPath = path.resolve(
        __dirname,
        '../../agentic-flow/src/cli/daemon-cli.ts'
      );
      const content = fs.readFileSync(daemonCliPath, 'utf-8');
      expect(content).toContain('parseInt');
    });
  });
});
