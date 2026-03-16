# Security Best Practices - Agentic Flow v3
**Version**: 1.0
**Date**: 2026-02-25
**Audience**: Developers, Security Engineers, DevOps

---

## Table of Contents

1. [Input Validation](#input-validation)
2. [Command Execution](#command-execution)
3. [Authentication & Authorization](#authentication--authorization)
4. [Cryptography](#cryptography)
5. [Database Security](#database-security)
6. [API Security](#api-security)
7. [Secret Management](#secret-management)
8. [Logging & Monitoring](#logging--monitoring)
9. [Dependency Management](#dependency-management)
10. [WASM Security](#wasm-security)
11. [Code Review Guidelines](#code-review-guidelines)
12. [Incident Response](#incident-response)

---

## Input Validation

### Principle: Never Trust User Input

All user input MUST be validated at system boundaries before processing.

### Zod Schema Validation (Required)

```typescript
import { z } from 'zod';

// ✅ GOOD: Comprehensive validation
const UserInputSchema = z.object({
  name: z.string()
    .min(1, 'Name required')
    .max(100, 'Name too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid characters'),

  email: z.string()
    .email('Invalid email'),

  age: z.number()
    .int('Must be integer')
    .min(0, 'Must be non-negative')
    .max(150, 'Invalid age'),

  tags: z.array(z.string())
    .max(10, 'Too many tags')
    .refine(tags => tags.every(t => t.length <= 50), 'Tag too long')
});

// Validate before use
function handleInput(raw: unknown) {
  try {
    const validated = UserInputSchema.parse(raw);
    // Safe to use validated data
    return processData(validated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { error: err.errors };
    }
    throw err;
  }
}
```

### File Path Validation

```typescript
import { resolve, normalize, isAbsolute } from 'path';

// ✅ GOOD: Path traversal protection
function validatePath(userPath: string, allowedDir: string): string {
  // Reject null bytes
  if (userPath.includes('\x00')) {
    throw new Error('Path contains null bytes');
  }

  // Normalize path
  const normalized = normalize(userPath);

  // Reject path traversal
  if (normalized.startsWith('..') || normalized.includes('/..')) {
    throw new Error('Path traversal detected');
  }

  // Reject absolute paths
  if (isAbsolute(normalized)) {
    throw new Error('Absolute paths not allowed');
  }

  // Resolve against allowed directory
  const fullPath = resolve(allowedDir, normalized);

  // Verify result is within allowed directory
  if (!fullPath.startsWith(resolve(allowedDir))) {
    throw new Error('Path escapes allowed directory');
  }

  return fullPath;
}

// ❌ BAD: No validation
function badValidatePath(userPath: string): string {
  return path.join('/data', userPath); // Vulnerable to traversal
}
```

### Metadata Sanitization

```typescript
// ✅ GOOD: Sanitize metadata objects
function sanitizeMetadata(metadata: Record<string, any>): void {
  // Reject prototype pollution
  if ('__proto__' in metadata || 'constructor' in metadata || 'prototype' in metadata) {
    throw new Error('Invalid metadata keys');
  }

  // Limit size
  if (Object.keys(metadata).length > 100) {
    throw new Error('Too many metadata keys');
  }

  // Validate values
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof key !== 'string' || key.length > 100) {
      throw new Error(`Invalid metadata key: ${key}`);
    }

    if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects (limited depth)
      sanitizeMetadata(value);
    }
  }
}
```

---

## Command Execution

### Rule: NEVER Use Shell Interpretation

Always use `execFileSync` or `execFile` with argument arrays, never `execSync` or `exec` with command strings.

### Safe Command Execution

```typescript
import { execFileSync } from 'child_process';

// ✅ GOOD: Safe command execution
function safeGitCommand(branch: string): string {
  // Validate input
  if (!/^[a-zA-Z0-9_/-]+$/.test(branch)) {
    throw new Error('Invalid branch name');
  }

  // Use argument array, no shell
  const result = execFileSync('git', ['checkout', branch], {
    encoding: 'utf-8',
    shell: false, // CRITICAL: No shell interpretation
    timeout: 30000, // Timeout protection
    maxBuffer: 1024 * 1024 // Limit output size
  });

  return result.trim();
}

// ❌ BAD: Command injection vulnerability
function unsafeGitCommand(branch: string): string {
  // DO NOT DO THIS
  const result = execSync(`git checkout ${branch}`, {
    encoding: 'utf-8'
  });
  return result.trim();
}

// ❌ BAD: Template literal injection
function templateInjection(file: string): string {
  // DO NOT DO THIS
  return execSync(`cat ${file}`, { encoding: 'utf-8' });
}
```

### Validating Command Arguments

```typescript
// ✅ GOOD: Argument allowlist
function validateGitCommand(args: string[]): void {
  const allowedCommands = ['checkout', 'status', 'log', 'diff'];
  const allowedOptions = ['--oneline', '--short', '--stat'];

  if (args.length === 0) {
    throw new Error('No command specified');
  }

  const command = args[0];
  if (!allowedCommands.includes(command)) {
    throw new Error(`Command not allowed: ${command}`);
  }

  // Validate all arguments
  for (const arg of args.slice(1)) {
    if (arg.startsWith('-') && !allowedOptions.includes(arg)) {
      throw new Error(`Option not allowed: ${arg}`);
    }
  }
}
```

---

## Authentication & Authorization

### JWT Best Practices

```typescript
import jwt from 'jsonwebtoken';

// ✅ GOOD: Secure JWT configuration
const JWT_CONFIG = {
  algorithm: 'HS256' as const, // Or RS256 for public/private key
  expiresIn: '1h', // Short-lived tokens
  issuer: 'agentic-flow',
  audience: 'agentic-flow-api'
};

function generateToken(userId: string, role: string): string {
  const payload = {
    userId,
    role,
    iat: Math.floor(Date.now() / 1000)
  };

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }

  return jwt.sign(payload, secret, JWT_CONFIG);
}

function verifyToken(token: string): { userId: string; role: string } {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!, {
      algorithms: [JWT_CONFIG.algorithm],
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience,
      maxAge: JWT_CONFIG.expiresIn
    }) as jwt.JwtPayload;

    return {
      userId: payload.userId as string,
      role: payload.role as string
    };
  } catch (err) {
    throw new Error('Invalid token');
  }
}

// ❌ BAD: Weak validation
function badVerifyToken(token: string): any {
  // DO NOT DO THIS
  return jwt.decode(token); // No signature verification!
}
```

### Role-Based Access Control

```typescript
// ✅ GOOD: RBAC implementation
type Role = 'admin' | 'user' | 'readonly';
type Permission = 'read' | 'write' | 'delete' | 'admin';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ['read', 'write', 'delete', 'admin'],
  user: ['read', 'write'],
  readonly: ['read']
};

function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) || false;
}

function requirePermission(permission: Permission) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!hasPermission(req.userRole as Role, permission)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
}

// Usage
app.delete('/api/data/:id', requirePermission('delete'), handleDelete);
```

### Password Hashing

```typescript
import bcrypt from 'bcrypt';

// ✅ GOOD: Strong password hashing
const SALT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  // Validate password strength
  if (password.length < 12) {
    throw new Error('Password must be at least 12 characters');
  }

  return await bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

// ❌ BAD: Weak hashing
function badHashPassword(password: string): string {
  // DO NOT DO THIS
  return crypto.createHash('sha256').update(password).digest('hex');
}
```

---

## Cryptography

### Random ID Generation

```typescript
import { randomUUID, randomBytes } from 'crypto';

// ✅ GOOD: Cryptographically secure random IDs
function generateId(): string {
  return randomUUID(); // UUIDv4
}

function generateApiKey(): string {
  return randomBytes(32).toString('base64url');
}

// ❌ BAD: Weak random
function badGenerateId(): string {
  // DO NOT DO THIS
  return Math.random().toString(36); // Predictable!
}
```

### HMAC Signatures

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

// ✅ GOOD: HMAC signature verification
function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = signPayload(payload, secret);
  const actual = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  // Use timing-safe comparison to prevent timing attacks
  return actual.length === expectedBuf.length && timingSafeEqual(actual, expectedBuf);
}

// ❌ BAD: Timing attack vulnerable
function badVerifySignature(payload: string, signature: string, secret: string): boolean {
  // DO NOT DO THIS
  return signPayload(payload, secret) === signature; // Timing leak!
}
```

### Encryption (if needed)

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// ✅ GOOD: AES-256-GCM encryption
function encrypt(plaintext: string, key: Buffer): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('hex'),
    tag: tag.toString('hex')
  };
}

function decrypt(ciphertext: string, key: Buffer, iv: string, tag: string): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}
```

---

## Database Security

### SQL Injection Prevention

```typescript
import Database from 'better-sqlite3';

// ✅ GOOD: Parameterized queries
function safeQuery(db: Database.Database, userId: string): any[] {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.all(userId);
}

function safeDynamicQuery(db: Database.Database, filters: Record<string, any>): any[] {
  const conditions: string[] = [];
  const params: any[] = [];

  for (const [key, value] of Object.entries(filters)) {
    // Validate column names against allowlist
    if (!['name', 'email', 'age'].includes(key)) {
      throw new Error(`Invalid column: ${key}`);
    }
    conditions.push(`${key} = ?`);
    params.push(value);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const stmt = db.prepare(`SELECT * FROM users ${where}`);

  return stmt.all(...params);
}

// ❌ BAD: SQL injection
function unsafeQuery(db: Database.Database, userId: string): any[] {
  // DO NOT DO THIS
  return db.prepare(`SELECT * FROM users WHERE id = '${userId}'`).all();
}
```

### Database Encryption

```typescript
import SQLCipher from '@journeyapps/sqlcipher';

// ✅ GOOD: Encrypted database
function createEncryptedDB(path: string): SQLCipher.Database {
  const key = process.env.DB_ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error('DB_ENCRYPTION_KEY required (min 32 chars)');
  }

  const db = new SQLCipher(path);
  db.pragma(`key = '${key}'`);
  db.pragma('cipher = aes-256-cbc');
  db.pragma('kdf_iter = 64000');

  return db;
}
```

---

## API Security

### Rate Limiting

```typescript
import { RateLimiter } from '../utils/rate-limiter.js';

// ✅ GOOD: Multi-tier rate limiting
const RATE_LIMITS = {
  global: new RateLimiter({ points: 10000, duration: 60, blockDuration: 300 }),
  perUser: new RateLimiter({ points: 100, duration: 60, blockDuration: 60 }),
  perEndpoint: {
    '/api/expensive': new RateLimiter({ points: 10, duration: 60, blockDuration: 120 })
  }
};

async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const userId = req.userId || req.ip;

  try {
    // Check global limit
    await RATE_LIMITS.global.consume('global');

    // Check per-user limit
    await RATE_LIMITS.perUser.consume(userId);

    // Check per-endpoint limit
    const endpointLimiter = RATE_LIMITS.perEndpoint[req.path];
    if (endpointLimiter) {
      await endpointLimiter.consume(`${userId}:${req.path}`);
    }

    next();
  } catch (err: any) {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: err.message,
      retryAfter: err.retryAfter || 60
    });
  }
}
```

### CORS Configuration

```typescript
import cors from 'cors';

// ✅ GOOD: Restrictive CORS
const corsOptions = {
  origin: (origin: string | undefined, callback: Function) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// ❌ BAD: Permissive CORS
app.use(cors({ origin: '*' })); // DO NOT DO THIS
```

### Request Size Limits

```typescript
import express from 'express';

// ✅ GOOD: Size limits
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// File upload limits
import multer from 'multer';
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5
  }
});
```

---

## Secret Management

### Environment Variables

```typescript
// ✅ GOOD: Validate required secrets on startup
function validateEnvironment(): void {
  const required = [
    'JWT_SECRET',
    'DB_ENCRYPTION_KEY',
    'API_SECRET_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate key strength
  if (process.env.JWT_SECRET!.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
}

// Run on startup
validateEnvironment();
```

### Secret Rotation

```typescript
// ✅ GOOD: Support for secret rotation
interface SecretProvider {
  getSecret(name: string): Promise<string>;
}

class RotatingSecretProvider implements SecretProvider {
  private cache: Map<string, { value: string; expiry: number }> = new Map();
  private readonly ttl = 60 * 60 * 1000; // 1 hour

  async getSecret(name: string): Promise<string> {
    const cached = this.cache.get(name);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }

    // Fetch from secret manager (AWS Secrets Manager, Vault, etc.)
    const value = await this.fetchFromSecretManager(name);

    this.cache.set(name, {
      value,
      expiry: Date.now() + this.ttl
    });

    return value;
  }

  private async fetchFromSecretManager(name: string): Promise<string> {
    // Implementation depends on secret manager
    throw new Error('Not implemented');
  }
}
```

### Never Log Secrets

```typescript
// ✅ GOOD: Redact secrets in logs
function sanitizeForLogging(obj: any): any {
  const sensitive = ['password', 'token', 'secret', 'key', 'apiKey'];

  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const sanitized: any = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (sensitive.some(s => lowerKey.includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// Usage
console.log('Request:', sanitizeForLogging(req.body));
```

---

## Logging & Monitoring

### Security Event Logging

```typescript
// ✅ GOOD: Comprehensive security logging
interface SecurityEvent {
  timestamp: Date;
  type: 'auth_failure' | 'rate_limit' | 'invalid_input' | 'suspicious_activity';
  userId?: string;
  ip: string;
  details: any;
}

class SecurityLogger {
  private events: SecurityEvent[] = [];

  logAuthFailure(userId: string | undefined, ip: string, reason: string): void {
    this.log({
      timestamp: new Date(),
      type: 'auth_failure',
      userId,
      ip,
      details: { reason }
    });
  }

  logRateLimit(userId: string, ip: string, endpoint: string): void {
    this.log({
      timestamp: new Date(),
      type: 'rate_limit',
      userId,
      ip,
      details: { endpoint }
    });
  }

  private log(event: SecurityEvent): void {
    this.events.push(event);

    // Send to security monitoring system
    this.sendToMonitoring(event);

    // Alert on suspicious patterns
    this.checkForPatterns(event);
  }

  private checkForPatterns(event: SecurityEvent): void {
    // Alert on repeated failures from same IP
    const recentFailures = this.events.filter(
      e => e.ip === event.ip &&
           e.type === 'auth_failure' &&
           e.timestamp.getTime() > Date.now() - 60000 // Last minute
    );

    if (recentFailures.length >= 5) {
      this.alert('Brute force attempt detected', event);
    }
  }

  private sendToMonitoring(event: SecurityEvent): void {
    // Send to Datadog, Sentry, etc.
  }

  private alert(message: string, event: SecurityEvent): void {
    // Send alert to security team
    console.error(`[SECURITY ALERT] ${message}`, event);
  }
}
```

---

## Dependency Management

### npm audit

```bash
# Run regularly
npm audit

# Fix automatically (review changes!)
npm audit fix

# Only production dependencies
npm audit --production
```

### Automated Scanning

```yaml
# .github/workflows/security.yml
name: Security Scan

on:
  push:
    branches: [ main ]
  pull_request:
  schedule:
    - cron: '0 0 * * *' # Daily

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run npm audit
        run: npm audit --audit-level=high

      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

      - name: Run Trivy
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
```

### Dependency Allowlist

```typescript
// scripts/check-dependencies.ts
const ALLOWED_DEPENDENCIES = {
  // Core
  '@anthropic-ai/sdk': '^2.0.0',
  '@modelcontextprotocol/sdk': '^1.25.4',

  // Security (manually audited)
  'bcrypt': '^5.1.0',
  'jsonwebtoken': '^9.0.0',

  // ... rest of allowlist
};

function checkDependencies(): void {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

  for (const [name, version] of Object.entries(pkg.dependencies)) {
    if (!ALLOWED_DEPENDENCIES[name]) {
      throw new Error(`Unapproved dependency: ${name}`);
    }
  }
}
```

---

## WASM Security

### Module Signature Verification

```typescript
// ✅ GOOD: Verify WASM integrity before loading
import { createHash } from 'crypto';

const TRUSTED_WASM_HASHES = {
  '@ruvector/graph-transformer': '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4'
};

async function loadVerifiedWASM(moduleName: string): Promise<any> {
  const modulePath = require.resolve(moduleName);
  const fileBuffer = await fs.promises.readFile(modulePath);

  // Compute hash
  const hash = createHash('sha256').update(fileBuffer).digest('hex');

  // Verify against trusted hash
  if (hash !== TRUSTED_WASM_HASHES[moduleName]) {
    throw new Error(`WASM integrity check failed for ${moduleName}`);
  }

  // Safe to import
  return await import(moduleName);
}
```

### WASM Sandbox

```typescript
// ✅ GOOD: Limit WASM memory and execution
const wasmInstance = await WebAssembly.instantiate(wasmModule, {
  env: {
    memory: new WebAssembly.Memory({
      initial: 256, // 16MB
      maximum: 1024 // 64MB max
    })
  }
});

// Set execution timeout
const timeoutMs = 5000;
const result = await Promise.race([
  wasmInstance.exports.run(),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('WASM execution timeout')), timeoutMs)
  )
]);
```

---

## Code Review Guidelines

### Security Checklist

Use this checklist for all code reviews:

**Input Validation**
- [ ] All user inputs validated with Zod schemas
- [ ] File paths validated for traversal
- [ ] Metadata sanitized for prototype pollution
- [ ] Array/string length limits enforced

**Command Execution**
- [ ] No use of `execSync` or `exec`
- [ ] `execFileSync` used with argument arrays
- [ ] `shell: false` explicitly set
- [ ] Command arguments validated against allowlist

**Authentication/Authorization**
- [ ] JWT properly verified (not just decoded)
- [ ] Role-based permissions checked
- [ ] No authentication bypasses in any environment

**Database**
- [ ] All queries use parameterized statements
- [ ] No string concatenation in SQL
- [ ] Column names validated against allowlist

**Secrets**
- [ ] No hardcoded secrets or API keys
- [ ] Secrets loaded from environment variables
- [ ] Secrets not logged or returned in errors

**Dependencies**
- [ ] No new dependencies without security review
- [ ] `npm audit` passing
- [ ] Known vulnerabilities documented and tracked

**Rate Limiting**
- [ ] Rate limiting applied to all public endpoints
- [ ] Resource limits (timeout, memory, file size) configured

**Logging**
- [ ] Security events logged
- [ ] Secrets redacted from logs
- [ ] PII handling compliant

### Dangerous Patterns to Reject

```typescript
// ❌ Reject these patterns in code review

// 1. Shell interpolation
execSync(`command ${userInput}`);

// 2. SQL injection
db.prepare(`SELECT * FROM users WHERE id = '${id}'`);

// 3. Path traversal
fs.readFileSync(path.join(baseDir, userPath));

// 4. Weak validation
if (token.length > 10) { /* accept */ }

// 5. Prototype pollution
Object.assign(target, userInput);

// 6. Development bypasses
if (process.env.NODE_ENV === 'development') {
  return next(); // Skip auth
}

// 7. Hardcoded secrets
const API_KEY = 'sk-ant-api03-...';

// 8. Timing attacks
if (computed === provided) { /* vulnerable */ }
```

---

## Incident Response

### Security Incident Playbook

**1. Detection**
- Monitor security logs for anomalies
- Alert on repeated auth failures, rate limit hits
- Watch for unusual access patterns

**2. Containment**
- Rotate compromised credentials immediately
- Block malicious IPs
- Disable affected accounts
- Isolate affected systems

**3. Investigation**
- Review security logs
- Identify attack vector
- Determine scope of compromise
- Preserve evidence

**4. Remediation**
- Patch vulnerabilities
- Deploy fixes
- Reset all potentially compromised credentials
- Update dependencies

**5. Recovery**
- Restore from clean backups if needed
- Verify system integrity
- Re-enable services gradually
- Monitor closely

**6. Post-Incident**
- Document incident and response
- Update security measures
- Conduct post-mortem
- Notify affected parties if required

### Contact Information

**Security Team**: security@agentic-flow.dev
**Emergency**: +1-XXX-XXX-XXXX (24/7)
**Bug Bounty**: https://agentic-flow.dev/security/bounty

---

## Training & Awareness

### Required Reading for Developers

1. OWASP Top 10 2021
2. CWE Top 25 Most Dangerous Software Weaknesses
3. This document (SECURITY-BEST-PRACTICES.md)
4. SECURITY-AUDIT-REPORT.md
5. THREAT-MODEL.md

### Security Training

- Monthly security workshops
- Quarterly penetration testing exercises
- Annual security certification

---

## Updates & Maintenance

This document is reviewed and updated:
- After each security audit
- When new vulnerabilities are discovered
- When new technologies are adopted
- At minimum quarterly

**Last Updated**: 2026-02-25
**Next Review**: 2026-05-25
**Document Owner**: Security Team
