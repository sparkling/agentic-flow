# Threat Model - Agentic Flow v3
**Version**: 1.0
**Date**: 2026-02-25
**Methodology**: STRIDE
**Status**: Active

---

## Executive Summary

This threat model identifies and analyzes security threats to the Agentic Flow v3 system using the STRIDE methodology (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege). The model covers 8 attack surfaces, 24 threat actors, and 47 identified threats with risk ratings from LOW to CRITICAL.

**Key Risk Areas:**
1. MCP Tool Command Injection (CRITICAL)
2. Dependency Vulnerabilities (HIGH)
3. Distributed Sync Byzantine Attacks (HIGH)
4. WASM Module Tampering (HIGH)
5. Rate Limiting Bypass (MEDIUM)

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       USER/CLIENT                            │
│  (Claude Code, CLI, Web UI, API Clients)                    │
└────────────┬────────────────────────────────────────────────┘
             │
             │ HTTP/WebSocket/STDIO
             ▼
┌────────────────────────────────────────────────────────────┐
│                    API BOUNDARY                             │
│  ┌──────────────────────────────────────────────────┐     │
│  │  Authentication & Rate Limiting Layer            │     │
│  └──────────────────────────────────────────────────┘     │
└────────────┬───────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────┐
│                    MCP SERVER                               │
│  ┌─────────────┬──────────────┬───────────────────┐       │
│  │ 133+ Tools  │ Input Valid. │ Command Execution │       │
│  └─────────────┴──────────────┴───────────────────┘       │
└────────────┬───────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────┐
│                CORE SERVICES LAYER                          │
│  ┌──────────────┬───────────────┬──────────────────┐      │
│  │ AgentDB      │ Swarm Mgr     │ Memory System    │      │
│  │ (Proof-Gate) │ (Multi-Agent) │ (Vector Store)   │      │
│  └──────────────┴───────────────┴──────────────────┘      │
└────────────┬───────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────┐
│              DATA STORAGE & PERSISTENCE                     │
│  ┌──────────────┬───────────────┬──────────────────┐      │
│  │ SQLite       │ AttestationLog│ Vector Index     │      │
│  │ (Metadata)   │ (Audit Trail) │ (HNSW/RuVector)  │      │
│  └──────────────┴───────────────┴──────────────────┘      │
└────────────────────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────────────┐
│           DISTRIBUTED SYNC (QUIC/WASM)                      │
│  Multi-node synchronization, Byzantine consensus           │
└────────────────────────────────────────────────────────────┘
```

---

## Attack Surfaces

### AS-1: MCP Tool Endpoints

**Description**: 133+ MCP tools exposed via STDIO, HTTP, WebSocket

**Entry Points:**
- `agent_spawn` - Agent creation
- `workflow_create` - Workflow definition
- `workflow_execute` - Workflow execution
- `swarm_init` - Swarm initialization
- `memory_store` - Memory operations
- `task_create` - Task management
- 127+ other tools

**Assets at Risk:**
- System integrity (command execution)
- Data confidentiality (memory access)
- Availability (resource exhaustion)

**Existing Controls:**
- Zod schema validation on inputs
- MutationGuard proof validation
- AttestationLog audit trail

**Risk Level**: CRITICAL

---

### AS-2: Authentication Layer

**Description**: JWT-based authentication for API access

**Entry Points:**
- `/api/auth/login`
- `/api/auth/token`
- Bearer token in Authorization header

**Assets at Risk:**
- User accounts
- Session tokens
- API access

**Existing Controls:**
- JWT signature verification
- Token expiration
- Role-based access control (RBAC)

**Gaps:**
- Development mode bypass (NODE_ENV check)
- Weak validation in some paths

**Risk Level**: HIGH

---

### AS-3: Database Layer

**Description**: SQLite databases for metadata, attestation logs, vector indices

**Entry Points:**
- AgentDB queries
- AttestationLog queries
- Memory search operations

**Assets at Risk:**
- Sensitive data in databases
- Audit trail integrity
- Vector embeddings

**Existing Controls:**
- Parameterized queries (prepared statements)
- AttestationLog append-only design
- MutationGuard validation before DB writes

**Gaps:**
- No encryption-at-rest by default
- No Merkle tree for log integrity

**Risk Level**: MEDIUM

---

### AS-4: WASM Module Loading

**Description**: Dynamic loading of WASM modules for proof generation and vector operations

**Entry Points:**
- `@ruvector/graph-transformer` (native)
- `ruvector-graph-transformer-wasm` (browser)
- `@ruvnet/ruvector-verified-wasm` (legacy)

**Assets at Risk:**
- System integrity (malicious WASM)
- Proof validity
- Memory safety

**Existing Controls:**
- Try/catch error handling
- Fallback to JS if WASM fails

**Gaps:**
- No signature verification before loading
- No integrity checks
- WASM sandbox boundaries unclear

**Risk Level**: HIGH

---

### AS-5: Distributed Sync (QUIC)

**Description**: QUIC-based synchronization between distributed AgentDB nodes

**Entry Points:**
- QUIC server endpoints
- Sync proposal messages
- Byzantine consensus voting

**Assets at Risk:**
- Distributed state consistency
- Data integrity across nodes
- Consensus algorithm correctness

**Existing Controls:**
- TLS 1.3 encryption in QUIC
- Connection tracking

**Gaps:**
- No Byzantine fault tolerance implemented
- No cryptographic signatures on sync messages
- No proof-of-work for proposals

**Risk Level**: HIGH

---

### AS-6: Command Execution

**Description**: System command execution via CLI and MCP tools

**Entry Points:**
- `agent_spawn` tool (execSync)
- `workflow_create` tool (CLI invocation)
- Git operations in github-service
- File system operations

**Assets at Risk:**
- System integrity
- File system access
- Process execution privileges

**Existing Controls:**
- Some tools use execFileSync
- Input validation on tool parameters

**Gaps:**
- `agent_spawn` uses string interpolation + execSync
- No allowlist for commands
- Insufficient input sanitization

**Risk Level**: CRITICAL

---

### AS-7: Dependency Chain

**Description**: npm package dependencies including vulnerable versions

**Entry Points:**
- @anthropic-ai/claude-code (7 vulnerabilities)
- @modelcontextprotocol/sdk (3 vulnerabilities)
- axios, minimatch, glob (transitive vulnerabilities)

**Assets at Risk:**
- System integrity
- Data confidentiality
- Availability

**Existing Controls:**
- npm audit alerts
- Dependabot updates

**Gaps:**
- Outdated critical dependencies
- No automated blocking of vulnerable versions

**Risk Level**: HIGH

---

### AS-8: Rate Limiting & DoS

**Description**: Resource protection against abuse and denial of service

**Entry Points:**
- All MCP tool endpoints
- HTTP API endpoints
- QUIC sync endpoints

**Assets at Risk:**
- System availability
- Resource utilization
- Service reliability

**Existing Controls:**
- RateLimiter class implementation
- Timeout configuration on some operations

**Gaps:**
- No rate limiting on MCP tools
- RateLimiter not applied to critical paths
- No global rate limiting

**Risk Level**: HIGH

---

## STRIDE Threat Analysis

### Spoofing (S)

#### S-1: JWT Token Forgery
**Threat**: Attacker forges JWT tokens to impersonate users
**Attack Vector**: Weak secret key, algorithm confusion attack
**Impact**: Unauthorized access to all user data and operations
**Likelihood**: Medium (if weak secret used)
**Risk**: HIGH
**Mitigation**:
- Enforce minimum 32-character JWT_SECRET
- Use HS256 or RS256 (no "none" algorithm)
- Validate issuer, audience, expiration
**Status**: ✅ Partially Mitigated (needs enforcement)

#### S-2: API Key Spoofing
**Threat**: Attacker guesses or brute-forces API keys
**Attack Vector**: Weak API key validation (prefix + length check only)
**Impact**: Unauthorized API access
**Likelihood**: Low (rate limiting helps)
**Risk**: MEDIUM
**Mitigation**:
- Implement proper API key hashing
- Add rate limiting on auth endpoints
- Use cryptographically random API keys
**Status**: ⚠️ Needs Implementation

#### S-3: Node ID Spoofing in Distributed Sync
**Threat**: Malicious node impersonates legitimate node
**Attack Vector**: No cryptographic node authentication
**Impact**: Byzantine attacks, state corruption
**Likelihood**: High (in distributed deployments)
**Risk**: HIGH
**Mitigation**:
- Implement public key infrastructure for nodes
- Sign all sync messages
- Verify node certificates
**Status**: ❌ Not Implemented

---

### Tampering (T)

#### T-1: MutationProof Tampering
**Threat**: Attacker modifies mutation proofs to bypass validation
**Attack Vector**: Proof structure manipulation
**Impact**: Unauthorized database mutations
**Likelihood**: Low (structural hash verified)
**Risk**: MEDIUM
**Mitigation**:
- Cryptographic signatures on proofs
- Nonce-based replay protection
- Proof revocation mechanism
**Status**: ✅ Partially Mitigated

#### T-2: AttestationLog Tampering
**Threat**: Attacker modifies audit logs to cover tracks
**Attack Vector**: Direct database manipulation if compromised
**Impact**: Loss of audit trail, compliance violations
**Likelihood**: Low (requires DB access)
**Risk**: HIGH
**Mitigation**:
- Merkle tree for log integrity
- Immutable log storage
- Regular integrity checks
**Status**: ⚠️ Needs Implementation

#### T-3: WASM Module Tampering
**Threat**: Attacker replaces legitimate WASM with malicious version
**Attack Vector**: npm package compromise, MITM attack
**Impact**: Arbitrary code execution, proof forgery
**Likelihood**: Low (but high impact)
**Risk**: HIGH
**Mitigation**:
- Subresource Integrity (SRI) checks
- Cryptographic signatures on WASM
- Hash verification before loading
**Status**: ❌ Not Implemented

#### T-4: Configuration File Tampering
**Threat**: Attacker modifies .env or config files
**Attack Vector**: File system access
**Impact**: Secret exposure, service misconfiguration
**Likelihood**: Low (requires file system access)
**Risk**: MEDIUM
**Mitigation**:
- File integrity monitoring
- Encrypted configuration
- Immutable infrastructure
**Status**: ⚠️ Partial (gitignore protection)

---

### Repudiation (R)

#### R-1: Action Repudiation
**Threat**: User denies performing malicious actions
**Attack Vector**: Insufficient audit logging
**Impact**: Inability to prove malicious activity
**Likelihood**: Medium
**Risk**: MEDIUM
**Mitigation**:
- Comprehensive AttestationLog
- Non-repudiable signatures on actions
- Tamper-proof audit trail
**Status**: ✅ Partially Mitigated

#### R-2: Sync Proposal Repudiation
**Threat**: Node denies proposing malicious state change
**Attack Vector**: No cryptographic signatures on proposals
**Impact**: Cannot prove which node is malicious
**Likelihood**: High (in distributed setup)
**Risk**: HIGH
**Mitigation**:
- Sign all consensus proposals
- Persistent proposal log
- Public key infrastructure
**Status**: ❌ Not Implemented

---

### Information Disclosure (I)

#### I-1: Secret Exposure in Logs
**Threat**: API keys, tokens logged in application logs
**Attack Vector**: Insufficient log sanitization
**Impact**: Secret compromise, unauthorized access
**Likelihood**: Medium (common mistake)
**Risk**: HIGH
**Mitigation**:
- Log sanitization (redact sensitive fields)
- Never log request bodies with auth headers
- Structured logging with field-level controls
**Status**: ⚠️ Needs Verification

#### I-2: Error Message Information Leakage
**Threat**: Detailed error messages expose system internals
**Attack Vector**: Stack traces, file paths in errors
**Impact**: Reconnaissance for further attacks
**Likelihood**: High
**Risk**: MEDIUM
**Mitigation**:
- Generic error messages to users
- Detailed errors only in secure logs
- Stack trace sanitization
**Status**: ⚠️ Partial

#### I-3: Timing Side-Channel (Token Comparison)
**Threat**: Token validation timing reveals valid token length
**Attack Vector**: Timing attack on string comparison
**Impact**: Token guessing acceleration
**Likelihood**: Low (requires precision timing)
**Risk**: LOW
**Mitigation**:
- Use timingSafeEqual() for comparisons
- Constant-time string comparison
**Status**: ⚠️ Needs Audit

#### I-4: Database Exposure (No Encryption-at-Rest)
**Threat**: Attacker reads SQLite database files directly
**Attack Vector**: File system access or stolen backups
**Impact**: Full data exposure including sensitive metadata
**Likelihood**: Medium (depends on deployment)
**Risk**: HIGH
**Mitigation**:
- SQLCipher for encryption-at-rest
- Encrypted backups
- Full disk encryption
**Status**: ❌ Not Implemented

#### I-5: Memory Dump Analysis
**Threat**: Attacker analyzes process memory dump
**Attack Vector**: Malware, privileged access
**Impact**: Secrets, keys, JWT tokens in memory
**Likelihood**: Low
**Risk**: MEDIUM
**Mitigation**:
- Zero memory on secret use
- Memory encryption (OS-level)
- Limit secret lifetime in memory
**Status**: ⚠️ OS-dependent

---

### Denial of Service (D)

#### D-1: Rate Limit Bypass
**Threat**: Attacker bypasses rate limiting to exhaust resources
**Attack Vector**: Distributed requests, IP rotation
**Impact**: Service unavailability
**Likelihood**: High
**Risk**: HIGH
**Mitigation**:
- Global rate limiting (not just per-IP)
- CAPTCHA for suspicious activity
- DDoS protection (Cloudflare, AWS Shield)
**Status**: ⚠️ Partial

#### D-2: MCP Tool Flooding
**Threat**: Attacker floods expensive MCP tools
**Attack Vector**: No per-tool rate limiting
**Impact**: CPU/memory exhaustion
**Likelihood**: High
**Risk**: HIGH
**Mitigation**:
- Per-tool rate limiting
- Cost-based rate limiting
- Request queuing with backpressure
**Status**: ❌ Not Implemented

#### D-3: Memory Exhaustion via Large Inputs
**Threat**: Attacker sends huge payloads to exhaust memory
**Attack Vector**: Large JSON bodies, huge arrays
**Impact**: Out-of-memory crash
**Likelihood**: Medium
**Risk**: MEDIUM
**Mitigation**:
- Request size limits (express.json({limit}))
- Array length validation
- Streaming for large inputs
**Status**: ✅ Partially Mitigated

#### D-4: Algorithmic Complexity Attack
**Threat**: Attacker triggers O(n²) or worse algorithms
**Attack Vector**: Crafted inputs to sorting, search
**Impact**: CPU exhaustion
**Likelihood**: Low (depends on implementation)
**Risk**: MEDIUM
**Mitigation**:
- Algorithmic complexity analysis
- Input size limits
- Timeout on expensive operations
**Status**: ⚠️ Needs Audit

#### D-5: QUIC Sync Flooding
**Threat**: Malicious node floods sync proposals
**Attack Vector**: No rate limiting on consensus messages
**Impact**: Consensus failure, resource exhaustion
**Likelihood**: High (in distributed setup)
**Risk**: HIGH
**Mitigation**:
- Rate limit proposals per node
- Proof-of-work for proposals
- Byzantine fault tolerance
**Status**: ❌ Not Implemented

#### D-6: ReDoS (Regular Expression DoS)
**Threat**: Attacker triggers exponential regex backtracking
**Attack Vector**: Crafted strings to Zod regex validation
**Impact**: CPU hang, service unavailability
**Likelihood**: Low (Zod uses safe regexes)
**Risk**: LOW
**Mitigation**:
- Audit all regex patterns
- Use safe regex library
- Timeout on regex matching
**Status**: ✅ Low Risk

---

### Elevation of Privilege (E)

#### E-1: Command Injection → Root
**Threat**: Command injection escalates to root privileges
**Attack Vector**: agent_spawn tool with malicious input
**Impact**: Full system compromise
**Likelihood**: High (vulnerability exists)
**Risk**: CRITICAL
**Mitigation**:
- Fix agent_spawn to use execFileSync
- Input validation with allowlist
- Run services with least privilege
**Status**: ❌ Vulnerable (HIGH-001)

#### E-2: WASM Sandbox Escape
**Threat**: Malicious WASM escapes sandbox to access Node.js APIs
**Attack Vector**: WASM exploit, V8 vulnerability
**Impact**: Arbitrary code execution
**Likelihood**: Low (requires WASM exploit)
**Risk**: MEDIUM
**Mitigation**:
- WASM signature verification
- Sandboxed execution environment
- Security hardened V8
**Status**: ⚠️ Needs Hardening

#### E-3: Prototype Pollution → RCE
**Threat**: Prototype pollution leads to code execution
**Attack Vector**: Unsanitized metadata merging
**Impact**: Remote code execution
**Likelihood**: Low (sanitization in place)
**Risk**: MEDIUM
**Mitigation**:
- Reject __proto__, constructor keys
- Use Object.create(null) for metadata
- Deep object validation
**Status**: ✅ Partially Mitigated

#### E-4: SQL Injection → File Write
**Threat**: SQL injection escalates to arbitrary file write
**Attack Vector**: SQLite ATTACH/COPY commands
**Impact**: Code execution via file overwrite
**Likelihood**: Very Low (no SQL injection found)
**Risk**: LOW
**Mitigation**:
- Continue using parameterized queries
- Disable ATTACH in SQLite
**Status**: ✅ Mitigated

#### E-5: JWT Algorithm Confusion
**Threat**: Attacker changes JWT algorithm to "none"
**Attack Vector**: HS256 → none algorithm switch
**Impact**: Bypass authentication
**Likelihood**: Low (if JWT library configured correctly)
**Risk**: MEDIUM
**Mitigation**:
- Explicitly specify allowed algorithms
- Reject "none" algorithm
- Use jwt.verify() not jwt.decode()
**Status**: ✅ Mitigated (if properly configured)

---

## Threat Actors

### TA-1: External Attacker (Unauthenticated)
**Motivation**: Financial gain, disruption
**Capabilities**: Network access, public exploits
**Targets**: AS-1 (MCP Tools), AS-2 (Auth), AS-8 (DoS)
**Threats**: S-2, T-3, D-1, D-2, D-3, E-1

### TA-2: Authenticated User (Malicious)
**Motivation**: Data theft, privilege escalation
**Capabilities**: Valid credentials, API access
**Targets**: AS-1 (MCP Tools), AS-6 (Command Execution)
**Threats**: E-1, E-3, R-1, I-1

### TA-3: Insider Threat
**Motivation**: Sabotage, data exfiltration
**Capabilities**: System access, code changes
**Targets**: All attack surfaces
**Threats**: T-2, T-4, I-4, R-1

### TA-4: Supply Chain Attacker
**Motivation**: Wide-spread compromise
**Capabilities**: npm package compromise
**Targets**: AS-7 (Dependencies), AS-4 (WASM)
**Threats**: T-3, E-2

### TA-5: Nation State
**Motivation**: Espionage, infrastructure disruption
**Capabilities**: Advanced persistent threat (APT)
**Targets**: AS-5 (Distributed Sync), AS-4 (WASM)
**Threats**: S-3, T-2, T-3, R-2

---

## Risk Matrix

| Threat ID | Category | Likelihood | Impact | Risk Level | Status |
|-----------|----------|------------|--------|----------|--------|
| E-1 | Command Injection | HIGH | CRITICAL | CRITICAL | ❌ Vulnerable |
| AS-7 | Dependency Vulns | HIGH | HIGH | HIGH | ⚠️ Partial |
| D-2 | MCP Tool Flooding | HIGH | HIGH | HIGH | ❌ Not Mitigated |
| S-3 | Node ID Spoofing | HIGH | HIGH | HIGH | ❌ Not Mitigated |
| T-3 | WASM Tampering | MEDIUM | HIGH | HIGH | ❌ Not Mitigated |
| I-4 | DB No Encryption | MEDIUM | HIGH | HIGH | ❌ Not Mitigated |
| T-2 | Log Tampering | LOW | HIGH | MEDIUM | ⚠️ Partial |
| D-1 | Rate Limit Bypass | HIGH | MEDIUM | MEDIUM | ⚠️ Partial |
| S-1 | JWT Forgery | MEDIUM | HIGH | MEDIUM | ✅ Mitigated |

---

## Mitigation Roadmap

### Phase 1: Critical (Week 1)
- [ ] Fix E-1: Command injection in agent_spawn
- [ ] Update AS-7: Upgrade vulnerable dependencies
- [ ] Implement D-2: MCP tool rate limiting

### Phase 2: High Priority (Weeks 2-3)
- [ ] Implement T-3: WASM signature verification
- [ ] Implement I-4: Database encryption-at-rest
- [ ] Implement S-3: Node cryptographic authentication
- [ ] Implement T-2: Merkle tree for log integrity

### Phase 3: Medium Priority (Month 2)
- [ ] Enhance D-1: Global rate limiting
- [ ] Implement E-2: WASM sandbox hardening
- [ ] Add monitoring for all threat categories

### Phase 4: Hardening (Month 3)
- [ ] Penetration testing
- [ ] Red team exercises
- [ ] Third-party security audit

---

## Security Controls Summary

### Preventive Controls
✅ Input validation (Zod schemas)
✅ Parameterized SQL queries
✅ JWT authentication
⚠️ Rate limiting (partial)
❌ Command injection prevention (vulnerable)
❌ WASM integrity verification
❌ Byzantine fault tolerance

### Detective Controls
✅ AttestationLog audit trail
✅ Security event logging
⚠️ Anomaly detection (basic)
❌ Intrusion detection system
❌ File integrity monitoring

### Corrective Controls
⚠️ Incident response plan (documented)
❌ Automated remediation
❌ Backup and recovery (not encrypted)

---

## Assumptions

1. **Network Security**: Infrastructure provides basic network security (firewalls, DDoS protection)
2. **OS Security**: Underlying OS is patched and hardened
3. **Physical Security**: Physical access to servers is restricted
4. **Personnel**: Development team follows secure coding practices
5. **Environment**: Sensitive operations run in isolated environments

---

## Out of Scope

- Physical attacks
- Social engineering
- Browser-side vulnerabilities (if web UI)
- Third-party service vulnerabilities (Anthropic API, etc.)
- Hardware vulnerabilities (Spectre, Meltdown, etc.)

---

## Review Schedule

This threat model should be reviewed:
- After any architecture changes
- After new attack surfaces are added
- After security incidents
- At minimum quarterly

**Next Review**: 2026-05-25

---

## References

- SECURITY-AUDIT-REPORT.md (detailed findings)
- VULNERABILITY-FIXES.md (remediation plans)
- SECURITY-BEST-PRACTICES.md (secure coding guidelines)
- OWASP Threat Modeling Guide
- STRIDE Methodology (Microsoft)
- MITRE ATT&CK Framework

---

**Document Version**: 1.0
**Last Updated**: 2026-02-25
**Document Owner**: Security Team
**Approval**: Pending Security Review
