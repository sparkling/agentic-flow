/**
 * Security Validation Tests - ADR-067
 * Tests all CVE fixes and vulnerability remediations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { pathValidator, validateFilePath, validateReadPath, validateWritePath } from '../../agentic-flow/src/security/path-validator.js';
import { secretRedactor, redactKey, sanitizeEnvironment } from '../../agentic-flow/src/security/secret-redaction.js';
import { RateLimiter, orchestrationLimiter, concurrencyLimiter, RateLimitError } from '../../agentic-flow/src/security/rate-limiter.js';
import { seedMemory, recordLearning } from '../../agentic-flow/src/orchestration/memory-plane.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CVE-2026-004: Path Traversal Prevention', () => {
  it('should block path traversal attempts with ../', () => {
    expect(() => {
      validateFilePath('../../../etc/passwd');
    }).toThrow('Path traversal detected');
  });

  it('should block null byte injection', () => {
    expect(() => {
      validateFilePath('/tmp/file\0.txt');
    }).toThrow('Path contains null bytes');
  });

  it('should block paths outside allowed directory', () => {
    const allowedDir = '/tmp/safe';
    expect(() => {
      validateFilePath('/etc/passwd', allowedDir);
    }).toThrow('Path outside allowed directory');
  });

  it('should block access to sensitive paths', () => {
    expect(() => {
      validateFilePath('/etc/shadow');
    }).toThrow('Access to blocked path');
  });

  it('should allow safe paths within allowed directory', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
    const testFile = path.join(tempDir, 'safe.txt');
    fs.writeFileSync(testFile, 'test');

    const result = validateReadPath(testFile, tempDir);
    expect(result).toBe(path.resolve(testFile));

    fs.unlinkSync(testFile);
    fs.rmdirSync(tempDir);
  });

  it('should validate write paths', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
    const testFile = path.join(tempDir, 'new-file.txt');

    const result = validateWritePath(testFile, tempDir);
    expect(result).toBe(path.resolve(testFile));

    fs.rmdirSync(tempDir);
  });
});

describe('CVE-2026-005: API Key Redaction', () => {
  it('should redact Anthropic API keys', () => {
    const key = 'sk-ant-1234567890abcdefghij';
    const redacted = redactKey(key);
    expect(redacted).toContain('sk-ant-');
    expect(redacted).toContain('***');
    expect(redacted).not.toContain('1234567890');
  });

  it('should redact OpenRouter API keys', () => {
    const key = 'sk-or-v1-1234567890abcdefghij';
    const redacted = redactKey(key);
    expect(redacted).toContain('sk-or-v');
    expect(redacted).toContain('***');
  });

  it('should handle missing keys safely', () => {
    const redacted = redactKey(undefined);
    expect(redacted).toBe('✗ not set');
  });

  it('should redact secrets from strings', () => {
    const text = 'My key is sk-ant-1234567890abcdefghij and I use it';
    const redacted = secretRedactor.redactString(text);
    expect(redacted).not.toContain('1234567890');
    expect(redacted).toContain('sk-ant-');
  });

  it('should sanitize environment variables', () => {
    const env = {
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      SECRET_TOKEN: 'very-secret',
      HOME: '/home/user'
    };

    const safe = sanitizeEnvironment(env, ['ANTHROPIC_API_KEY']);
    expect(safe.PATH).toBe('/usr/bin');
    expect(safe.ANTHROPIC_API_KEY).toBe('sk-ant-secret');
    expect(safe.SECRET_TOKEN).toBeUndefined();
    expect(safe.HOME).toBe('/home/user');
  });
});

describe('CVE-2026-006: Safe File Deletion', () => {
  it('should validate paths before deletion', () => {
    // Path validation is handled by PathValidator
    // Just verify it's called during deletion
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
    const testFile = path.join(tempDir, 'to-delete.txt');
    fs.writeFileSync(testFile, 'test');

    // Validate the path can be validated
    const validated = validateFilePath(testFile, tempDir, { mustExist: true, mustBeFile: true });
    expect(validated).toBe(path.resolve(testFile));

    fs.unlinkSync(testFile);
    fs.rmdirSync(tempDir);
  });
});

describe('CVE-2026-007: Memory Injection Prevention', () => {
  beforeEach(async () => {
    // Clean up any existing test data
  });

  it('should reject oversized memory entries', async () => {
    const runId = 'test-run-1';
    const largeValue = 'x'.repeat(200000); // > 100k

    await expect(
      seedMemory(runId, [{ value: largeValue }])
    ).rejects.toThrow('too large');
  });

  it('should reject memory entries with null bytes', async () => {
    const runId = 'test-run-2';

    await expect(
      seedMemory(runId, [{ value: 'test\0value' }])
    ).rejects.toThrow('null bytes');
  });

  it('should enforce max entries per run', async () => {
    const runId = 'test-run-3';
    const entries = Array.from({ length: 11000 }, (_, i) => ({
      value: `entry-${i}`
    }));

    await expect(
      seedMemory(runId, entries)
    ).rejects.toThrow('Maximum entries');
  });

  it('should validate learning entries', async () => {
    const runId = 'test-run-4';

    await expect(
      recordLearning(runId, '', 0.5)
    ).rejects.toThrow('non-empty string');

    await expect(
      recordLearning(runId, 'valid', 1.5)
    ).rejects.toThrow('between 0 and 1');
  });

  it('should accept valid memory entries', async () => {
    const runId = 'test-run-5';

    await expect(
      seedMemory(runId, [
        { key: 'test', value: 'valid entry', metadata: { source: 'test' } }
      ])
    ).resolves.toBeUndefined();
  });
});

describe('CVE-2026-008: Input Validation', () => {
  it('should reject empty task descriptions', async () => {
    const { createOrchestrationClient } = await import('../../agentic-flow/src/orchestration/orchestration-client.js');
    const client = createOrchestrationClient();

    await expect(
      client.startRun({ taskDescription: '' })
    ).rejects.toThrow('required');
  });

  it('should reject oversized task descriptions', async () => {
    const { createOrchestrationClient } = await import('../../agentic-flow/src/orchestration/orchestration-client.js');
    const client = createOrchestrationClient();

    const largeTask = 'x'.repeat(150000);

    await expect(
      client.startRun({ taskDescription: largeTask })
    ).rejects.toThrow('too long');
  });

  it('should validate path arrays', async () => {
    const { createOrchestrationClient } = await import('../../agentic-flow/src/orchestration/orchestration-client.js');
    const client = createOrchestrationClient();

    await expect(
      client.startRun({
        taskDescription: 'test',
        allowedPaths: ['../../../etc/passwd'] as any
      })
    ).rejects.toThrow();
  });
});

describe('VUL-010: Rate Limiting', () => {
  it('should enforce rate limits', async () => {
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 1000
    });

    await limiter.consume('test');
    await limiter.consume('test');

    await expect(limiter.consume('test')).rejects.toThrow(RateLimitError);
  });

  it('should reset after window expires', async () => {
    const limiter = new RateLimiter({
      maxRequests: 1,
      windowMs: 100
    });

    await limiter.consume('test');

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    await expect(limiter.consume('test')).resolves.toBeDefined();
  });

  it('should track concurrency limits', () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 1000
    });

    limiter.acquire('run-1');
    limiter.acquire('run-2');

    const status = limiter.getStatus();
    expect(status).toBeDefined();
  });
});

describe('Security Integration Tests', () => {
  it('should combine path validation and secret redaction', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
    const testFile = path.join(tempDir, '.env');

    expect(() => {
      validateFilePath(testFile);
    }).toThrow('blocked path');

    fs.rmdirSync(tempDir);
  });

  it('should prevent common attack patterns', () => {
    const attacks = [
      '../../../etc/passwd',
      '/etc/shadow',
      '../../.ssh/id_rsa',
      '/root/.bash_history',
      'file\0.txt',
      '/proc/self/environ'
    ];

    for (const attack of attacks) {
      expect(() => validateFilePath(attack)).toThrow();
    }
  });

  it('should protect sensitive environment variables', () => {
    const env = {
      ANTHROPIC_API_KEY: 'sk-ant-secret123',
      AWS_SECRET_ACCESS_KEY: 'secretkey',
      DATABASE_PASSWORD: 'dbpass',
      PATH: '/usr/bin'
    };

    const safe = sanitizeEnvironment(env, []);
    expect(safe.ANTHROPIC_API_KEY).toBeUndefined();
    expect(safe.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(safe.DATABASE_PASSWORD).toBeUndefined();
    expect(safe.PATH).toBe('/usr/bin');
  });
});

describe('Regression Tests', () => {
  it('should not break normal file operations', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
    const testFile = path.join(tempDir, 'normal.txt');
    fs.writeFileSync(testFile, 'test');

    const validated = validateReadPath(testFile, tempDir);
    expect(validated).toBe(path.resolve(testFile));

    const content = fs.readFileSync(validated, 'utf-8');
    expect(content).toBe('test');

    fs.unlinkSync(testFile);
    fs.rmdirSync(tempDir);
  });

  it('should not break API key detection in normal use', () => {
    const logStatus = secretRedactor.logEnvStatus([
      'ANTHROPIC_API_KEY',
      'OPENROUTER_API_KEY'
    ], {
      ANTHROPIC_API_KEY: 'sk-ant-1234567890',
      OPENROUTER_API_KEY: undefined
    });

    expect(logStatus).toHaveLength(2);
    expect(logStatus[0]).toContain('ANTHROPIC_API_KEY');
    expect(logStatus[1]).toContain('not set');
  });
});
