/**
 * Security Fixes Validation Tests
 *
 * Validates that security fixes are in place:
 * - CVE-LOCAL-004: API key parameters removed from http-sse.ts
 * - CVE-LOCAL-001: Command injection prevention in github-service.ts
 * - Tool registration modules exist
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Security Fixes Validation', () => {
  const httpSsePath = path.join(__dirname, '../../agentic-flow/src/mcp/fastmcp/servers/http-sse.ts');
  const githubServicePath = path.join(__dirname, '../../agentic-flow/src/services/github-service.ts');

  describe('CVE-LOCAL-004: API key parameters removed from http-sse.ts', () => {
    it('does not contain anthropicApiKey in tool schema', () => {
      const content = fs.readFileSync(httpSsePath, 'utf-8');
      // Should not have anthropicApiKey in the z.object schema
      expect(content).not.toMatch(/anthropicApiKey:\s*z\./);
    });

    it('does not contain openrouterApiKey in tool schema', () => {
      const content = fs.readFileSync(httpSsePath, 'utf-8');
      expect(content).not.toMatch(/openrouterApiKey:\s*z\./);
    });

    it('does not set API keys from parameters into env', () => {
      const content = fs.readFileSync(httpSsePath, 'utf-8');
      expect(content).not.toMatch(/env\.ANTHROPIC_API_KEY\s*=\s*anthropicApiKey/);
      expect(content).not.toMatch(/env\.OPENROUTER_API_KEY\s*=\s*openrouterApiKey/);
    });
  });

  describe('CVE-LOCAL-001: Command injection prevention', () => {
    it('github-service.ts uses execFileSync not execSync', () => {
      const content = fs.readFileSync(githubServicePath, 'utf-8');
      expect(content).toContain('execFileSync');
      expect(content).not.toMatch(/\bexecSync\b/);
    });

    it('github-service.ts does not use shell: true', () => {
      const content = fs.readFileSync(githubServicePath, 'utf-8');
      expect(content).not.toContain('shell: true');
      expect(content).not.toContain('shell:true');
    });
  });

  describe('Tool registration modules exist', () => {
    const toolsDir = path.join(__dirname, '../../agentic-flow/src/mcp/fastmcp/tools');

    it('session-tools.ts exists', () => {
      expect(fs.existsSync(path.join(toolsDir, 'session-tools.ts'))).toBe(true);
    });

    it('github-tools.ts exists', () => {
      expect(fs.existsSync(path.join(toolsDir, 'github-tools.ts'))).toBe(true);
    });

    it('neural-tools.ts exists', () => {
      expect(fs.existsSync(path.join(toolsDir, 'neural-tools.ts'))).toBe(true);
    });

    it('ruvector-tools.ts exists', () => {
      expect(fs.existsSync(path.join(toolsDir, 'ruvector-tools.ts'))).toBe(true);
    });

    it('sona-rvf-tools.ts exists', () => {
      expect(fs.existsSync(path.join(toolsDir, 'sona-rvf-tools.ts'))).toBe(true);
    });

    it('infrastructure-tools.ts exists', () => {
      expect(fs.existsSync(path.join(toolsDir, 'infrastructure-tools.ts'))).toBe(true);
    });
  });
});
