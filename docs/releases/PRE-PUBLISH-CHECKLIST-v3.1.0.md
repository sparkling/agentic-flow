# Pre-Publish Checklist v3.1.0

**Version**: 3.1.0 (GA)
**Date**: 2026-02-27
**Status**: ⚠️ IN PROGRESS

---

## 🔴 CRITICAL BLOCKERS (Must Complete Before Publish)

### 1. TypeScript Compilation
- [ ] Fix import type misuse in billing/mcp/tools.ts (8 errors)
  ```bash
  # Change 'import type' to 'import' for enums used at runtime
  # Files: src/billing/mcp/tools.ts
  ```
- [ ] Install missing dependencies
  ```bash
  npm install @ruvector/graph-node@latest
  npm install @joshuapowell/fastmcp
  ```
- [ ] Resolve missing SDK modules (15 errors)
  - [ ] Create src/sdk/hooks-bridge.js OR remove import
  - [ ] Create src/sdk/session-manager.js OR remove import
  - [ ] Create src/sdk/permission-handler.js OR remove import
  - [ ] Create src/sdk/agent-converter.js OR remove import
  - [ ] Create src/sdk/e2b-sandbox.js OR remove import
  - [ ] Create src/sdk/e2b-swarm.js OR remove import
  - [ ] Create src/sdk/e2b-swarm-optimizer.js OR remove import
  - [ ] Create src/sdk/query-control.js OR remove import
  - [ ] Create src/sdk/plugins.js OR remove import
  - [ ] Create src/sdk/streaming-input.js OR remove import
  - [ ] Create src/utils/safe-exec.js OR remove import
- [ ] Fix tsconfig.json rootDir violations (20+ errors)
  ```bash
  # Option 1: Use project references
  # Option 2: Adjust rootDir in config/tsconfig.json
  # Option 3: Move packages/agentdb into agentic-flow/src/
  ```
- [ ] Fix type errors
  - [ ] Fix Database namespace usage (FederationHubServer.ts, db/queries.ts)
  - [ ] Fix cli-proxy.ts command comparisons (10 errors)
  - [ ] Fix EmbeddingService type mismatches (4 errors)
  - [ ] Fix ort.Tensor type usage (6 errors)
- [ ] Verify compilation succeeds
  ```bash
  cd /workspaces/agentic-flow/agentic-flow
  npx tsc --project config/tsconfig.json --noEmit
  # Expected: 0 errors
  ```

### 2. Build Process
- [ ] Run build successfully
  ```bash
  cd /workspaces/agentic-flow/agentic-flow
  npm run build
  # Expected: Success with no errors
  ```
- [ ] Verify dist/ directory structure
  ```bash
  ls -la dist/
  ls -la dist/security/
  ls -la dist/orchestration/
  ls -la dist/sdk/
  # Expected: All directories exist with compiled .js files
  ```
- [ ] Test module imports
  ```bash
  node -e "console.log(require('./dist/security/index.js'))"
  node -e "console.log(require('./dist/orchestration/index.js'))"
  node -e "console.log(require('./dist/sdk/index.js'))"
  # Expected: No errors, objects with exports
  ```

### 3. Test Suite
- [ ] Fix broken test scripts
  ```bash
  # Edit agentic-flow/package.json
  # Remove or fix:
  #   "test:retry": "tsx validation/quick-wins/test-retry.ts"
  #   "test:logging": "tsx validation/quick-wins/test-logging.ts"
  ```
- [ ] Run test suite
  ```bash
  npm test
  # Expected: Tests pass (or at least run without crashing)
  ```
- [ ] Run security tests specifically
  ```bash
  npm test tests/security/
  # Expected: All security tests pass
  ```

### 4. npm Audit
- [ ] Fix agentic-flow vulnerabilities
  ```bash
  cd /workspaces/agentic-flow/agentic-flow
  npm audit fix
  npm audit
  # Expected: 0 high or critical vulnerabilities
  ```
- [ ] Fix agentdb vulnerabilities
  ```bash
  cd /workspaces/agentic-flow/packages/agentdb
  npm audit fix
  npm audit
  # Expected: 0 high or critical vulnerabilities
  ```
- [ ] Verify @modelcontextprotocol/sdk version
  ```bash
  npm list @modelcontextprotocol/sdk
  # Expected: >=1.25.4 (CVE-2026-002 fix)
  ```

### 5. Package Versions
- [ ] Bump agentic-flow version
  ```bash
  cd /workspaces/agentic-flow/agentic-flow
  npm version 3.1.0 --no-git-tag-version
  # Updates package.json and package-lock.json
  ```
- [ ] Bump agentdb version
  ```bash
  cd /workspaces/agentic-flow/packages/agentdb
  npm version 3.1.0 --no-git-tag-version
  # OR: npm version 3.1.0-alpha.1 if keeping alpha
  ```
- [ ] Update inter-package dependencies
  ```bash
  # Edit agentic-flow/package.json
  # Update "agentdb": "workspace:*" or specific version
  ```

---

## ⚠️ HIGH PRIORITY (Strongly Recommended)

### 6. Security Validation
- [ ] Manual test CVE-2026-003 fix (command injection)
  ```bash
  # Test Agent Booster with malicious language parameter
  # Expected: Validation error, not code execution
  ```
- [ ] Manual test CVE-2026-004 fix (path traversal)
  ```bash
  # Test file operations with "../../../etc/passwd"
  # Expected: Validation error, file not accessed
  ```
- [ ] Manual test CVE-2026-005 fix (API key redaction)
  ```bash
  npx agentic-flow doctor --verbose
  # Expected: Keys redacted in output (sk-xxx...xxx)
  ```
- [ ] Manual test CVE-2026-006 fix (safe file deletion)
  ```bash
  # Test model deletion with invalid path
  # Expected: Validation error, no deletion
  ```
- [ ] Manual test rate limiting (VUL-010)
  ```bash
  # Send 15 orchestration requests in 1 minute
  # Expected: Requests 11-15 rejected with rate limit error
  ```

### 7. Package Exports
- [ ] Add security module export
  ```bash
  # Edit agentic-flow/package.json
  # Add to "exports":
  #   "./security": "./dist/security/index.js"
  ```
- [ ] Verify all exports work
  ```bash
  node -e "require('agentic-flow')"
  node -e "require('agentic-flow/orchestration')"
  node -e "require('agentic-flow/sdk')"
  node -e "require('agentic-flow/security')"
  node -e "require('agentic-flow/reasoningbank')"
  node -e "require('agentic-flow/router')"
  node -e "require('agentic-flow/agent-booster')"
  # Expected: All succeed
  ```

### 8. Documentation Updates
- [ ] Update main README.md
  ```bash
  # Add v3.1.0 features section
  # - Orchestration API
  # - Security hardening (10 CVEs fixed)
  # - 213+ MCP tools
  # - Performance improvements
  ```
- [ ] Update CHANGELOG-3.1.0.md
  ```bash
  # Add security fixes section
  # List all 10 CVEs with descriptions
  ```
- [ ] Create MIGRATION-v2-to-v3.md (optional but recommended)
  ```bash
  # Guide for upgrading from v2.x to v3.1.0
  # Breaking changes (if any)
  # New features to adopt
  ```
- [ ] Verify ADRs marked "Implemented"
  - [ ] ADR-051: MCP tool implementation gap ✅
  - [ ] ADR-052: CLI tool gap remediation ✅
  - [ ] ADR-053: Security review remediation ✅
  - [ ] ADR-054: AgentDB v3 architecture review ✅
  - [ ] ADR-055: Documentation implementation parity ✅
  - [ ] ADR-056: RVF RuVector integration roadmap ✅
  - [ ] ADR-057: AgentDB RuVector v2 integration ✅
  - [ ] ADR-064: V3.1 P0 native performance completion ✅
  - [ ] ADR-065: V3.1 P1 intelligent agents ✅
  - [ ] ADR-066: V3.1 P2 enterprise ready ✅
  - [ ] ADR-067: V3 security hardening complete ✅

### 9. Dependency Updates
- [ ] Update ruvector to latest
  ```bash
  npm install ruvector@latest
  # Current: 0.1.24, Latest: 0.1.99
  ```
- [ ] Verify all @ruvector packages installed
  ```bash
  npm list | grep ruvector
  # Expected:
  #   @ruvector/core@0.1.30
  #   @ruvector/gnn@0.1.25
  #   @ruvector/attention@0.1.31
  #   @ruvector/graph-node@0.1.15
  #   @ruvector/router@0.1.15
  #   @ruvector/sona@0.1.5
  #   ruvector@0.1.99
  ```
- [ ] Install missing dependencies
  ```bash
  npm install @joshuapowell/fastmcp
  # For consensus-tools.ts
  ```
- [ ] Remove unused dependencies
  ```bash
  npm prune
  ```

### 10. Git and Tagging
- [ ] Commit all changes
  ```bash
  git add .
  git commit -m "chore: Prepare v3.1.0 release

  - Fix TypeScript compilation errors
  - Fix npm audit vulnerabilities
  - Update package versions
  - Add security module exports
  - Update documentation

  Fixes: ADR-067
  "
  ```
- [ ] Create annotated tag
  ```bash
  git tag -a v3.1.0 -m "Release v3.1.0 - Security hardening, orchestration API, performance improvements

  Features:
  - Orchestration API (ADR-064)
  - 10 security fixes (ADR-067)
  - 213+ MCP tools (ADR-051)
  - Performance improvements (7.47x speedup)
  - AgentDB v3 integration

  Security:
  - CVE-2026-003: Command injection fix
  - CVE-2026-004: Path traversal prevention
  - CVE-2026-005: API key redaction
  - CVE-2026-006: Safe file deletion
  - CVE-2026-007: Memory injection prevention
  - CVE-2026-008: Input validation
  - VUL-009: Process sanitization
  - VUL-010: Rate limiting
  "
  ```
- [ ] Push to remote
  ```bash
  git push origin feature/agentic-flow-v2
  git push origin v3.1.0
  ```

---

## ✅ NICE TO HAVE (Optional)

### 11. Advanced Testing
- [ ] Run integration test suite (360 tests)
  ```bash
  npm test tests/integration/
  # From V3.1.0-FINAL-STATUS.md: 360 tests, 84% passing
  ```
- [ ] Performance benchmarks
  ```bash
  npm run bench
  # Verify: 7.47x speedup, 90% cost savings
  ```
- [ ] Load testing
  ```bash
  # Test orchestration API under load
  # 100+ concurrent requests
  ```
- [ ] Memory leak testing
  ```bash
  # Long-running process (24 hours)
  # Monitor memory usage
  ```

### 12. External Validation
- [ ] Penetration testing
  ```bash
  # External security audit
  # Test all 10 CVE fixes
  ```
- [ ] Static analysis
  ```bash
  npm run lint
  # ESLint security rules
  ```
- [ ] Dependency scanning
  ```bash
  npx snyk test
  # Or: npm audit (already done)
  ```

### 13. Community Testing
- [ ] Beta release (optional)
  ```bash
  npm publish --tag beta
  # Get community feedback before GA
  ```
- [ ] Documentation review
  ```bash
  # External review of docs
  # Test tutorials and examples
  ```

---

## 📋 Pre-Publish Verification Commands

Run these commands in sequence before publishing:

```bash
# 1. Clean install
rm -rf node_modules package-lock.json
npm install

# 2. TypeScript check
npx tsc --noEmit

# 3. Build
npm run build

# 4. Test
npm test

# 5. Audit
npm audit

# 6. Dry run publish
npm publish --dry-run

# 7. Check package contents
npm pack --dry-run

# 8. Verify version
npm version

# 9. Check exports
node -e "console.log(require('./dist/index.js'))"
node -e "console.log(require('./dist/security/index.js'))"
node -e "console.log(require('./dist/orchestration/index.js'))"

# 10. Final verification
echo "✅ All checks passed - ready to publish!"
```

---

## 🚀 Publishing Commands

**DO NOT RUN UNTIL ALL ABOVE CHECKS PASS**

```bash
# 1. Publish agentdb first
cd /workspaces/agentic-flow/packages/agentdb
npm publish --access public

# 2. Publish agentic-flow
cd /workspaces/agentic-flow/agentic-flow
npm publish --access public

# 3. Create GitHub release
gh release create v3.1.0 \
  --title "v3.1.0: Production Ready - Security + Performance + Intelligence" \
  --notes-file ../docs/releases/CHANGELOG-3.1.0.md

# 4. Announce
echo "🎉 v3.1.0 published successfully!"
```

---

## 📊 Status Summary

### Current Status
- [ ] 🔴 TypeScript: 100+ errors (BLOCKER)
- [ ] 🔴 Tests: Broken (BLOCKER)
- [ ] 🔴 npm audit: 6+ CVEs (BLOCKER)
- [ ] ⚠️ Versions: Need bump (2.0.0 → 3.1.0)
- [ ] ⚠️ Exports: Security module missing
- [ ] ✅ Documentation: Complete
- [ ] ✅ Security code: Written (needs testing)
- [ ] ✅ Features: Implemented (ADR-064, 065, 066)

### Estimated Time to Ready
- **Optimistic**: 2-3 days
- **Realistic**: 4-5 days
- **Pessimistic**: 1-2 weeks

### Recommendation
**Fix all blockers before publishing v3.1.0 (GA)**

Do not rush to publish with TypeScript errors. Better to invest 4-5 days and ship with confidence.

---

**Last Updated**: 2026-02-27
**Next Review**: After blockers fixed
**Owner**: Development Team
