# Dead Code Removal - Impact Analysis

**Generated:** 2026-02-25
**Analyst:** Dead Code Eliminator Agent

## Purpose

This document analyzes the safety and impact of each proposed dead code removal from the main report. Each removal is assessed for:
- **Breaking Changes:** API surface changes
- **Test Impact:** Number of tests affected
- **Dependency Impact:** Other code that depends on this
- **Risk Level:** LOW / MEDIUM / HIGH
- **Mitigation:** Steps to ensure safe removal

---

## 1. Medical Domain Removal (P0 - High Safety)

### 1.1 Medical Services Removal

**Files to Remove:**
```
src/services/medical-analysis.service.ts
src/services/medical-analyzer.ts
src/services/provider.service.ts
src/services/notification-service.ts
src/services/knowledge-base.ts
src/services/verification-service.ts
src/services/anti-hallucination.service.ts
```

**Impact Assessment:**

| Factor | Analysis | Risk |
|--------|----------|------|
| **API Surface** | No exports used in agentic-flow main | ✅ SAFE |
| **MCP Tools** | No MCP tools reference these | ✅ SAFE |
| **CLI Commands** | No CLI commands reference these | ✅ SAFE |
| **Tests** | ~3,050 lines of tests affected | ⚠️ REMOVE TESTS TOO |
| **Dependencies** | Express.js API server (src/api) | ✅ CAN REMOVE API TOO |
| **External Users** | None (internal services only) | ✅ SAFE |

**Breaking Changes:** NONE
- These services are not exported in package.json
- Not referenced by any public API
- Not used in any MCP tool or CLI command

**Test Impact:**
- Remove: `tests/providers/`, `tests/notifications/`, `tests/routing/`
- Remove: `tests/validation/`, `tests/safety/`, `tests/verification/`
- Net result: ~3,050 fewer test lines

**Dependency Chain:**
```
medical-analysis.service.ts
  ← NO DEPENDENCIES (dead end)

provider.service.ts
  ← NO DEPENDENCIES (dead end)

src/api/index.ts (Express server)
  ← uses medical services
  ← NOT used by agentic-flow main
  ← SAFE TO REMOVE
```

**Risk Level:** 🟢 LOW

**Mitigation:**
1. ✅ Verify no imports in agentic-flow/src
2. ✅ Verify no imports in packages/agentdb/src
3. Run full test suite after removal
4. Document removal in CHANGELOG as "Removed legacy medical domain code"

**Recommendation:** ✅ SAFE TO REMOVE - No production impact

---

### 1.2 Medical Middleware Removal

**Files to Remove:**
```
src/middleware/auth.middleware.ts (medical auth)
src/middleware/logging.middleware.ts (medical logging)
```

**Impact Assessment:**

| Factor | Analysis | Risk |
|--------|----------|------|
| **API Surface** | Only used by src/api (Express server) | ✅ SAFE |
| **Alternative** | agentic-flow has its own auth/logging | ✅ NO LOSS |
| **Tests** | No dedicated tests | ✅ SAFE |

**Note:** There is another `src/middleware/agentdb-integration.ts` that IS used. DO NOT REMOVE.

**Risk Level:** 🟢 LOW

**Mitigation:**
1. Verify `agentdb-integration.ts` is NOT removed
2. Remove only medical-specific middleware

**Recommendation:** ✅ SAFE TO REMOVE

---

### 1.3 Medical Domain Objects Removal

**Directories to Remove:**
```
src/providers/
src/notifications/
src/routing/
src/consent/
```

**Impact Assessment:**

| Factor | Analysis | Risk |
|--------|----------|------|
| **Usage** | Only referenced in medical services | ✅ SAFE |
| **Exports** | Not exported in package.json | ✅ SAFE |
| **Tests** | Covered by test removals above | ✅ SAFE |

**Risk Level:** 🟢 LOW

**Recommendation:** ✅ SAFE TO REMOVE

---

### 1.4 Medical API Server Removal

**Files to Remove:**
```
src/api/index.ts (Express.js server)
```

**Impact Assessment:**

| Factor | Analysis | Risk |
|--------|----------|------|
| **Usage** | Separate Express server, not main entry | ✅ SAFE |
| **Entry Point** | Not in package.json bin or exports | ✅ SAFE |
| **Port Conflict** | Doesn't affect CLI or MCP server | ✅ SAFE |

**Dependencies to Remove After:**
```json
{
  "cors": "Only used by medical API",
  "helmet": "Only used by medical API",
  "express-rate-limit": "Only used by medical API",
  "express": "Check for other usage first"
}
```

**Risk Level:** 🟢 LOW

**Mitigation:**
1. Verify `express` is not used elsewhere
2. Remove Express dependencies after confirming no other usage

**Recommendation:** ✅ SAFE TO REMOVE

---

## 2. QUIC Transport Removal (P1 - Medium Safety)

### 2.1 QUIC Controllers

**Files to Remove/Archive:**
```
packages/agentdb/src/controllers/QUICServer.ts
packages/agentdb/src/controllers/QUICClient.ts
packages/agentdb/src/controllers/SyncCoordinator.ts
```

**Impact Assessment:**

| Factor | Analysis | Risk |
|--------|----------|------|
| **API Surface** | Exported in controllers/index.ts | ⚠️ BREAKING |
| **MCP Tools** | No MCP tools use QUIC | ✅ SAFE |
| **CLI Commands** | No CLI commands use QUIC | ✅ SAFE |
| **Tests** | 4 test files affected | ⚠️ REMOVE TESTS |
| **AgentDB Public API** | Part of published package | ⚠️ BREAKING |
| **Usage** | Only in tests and examples | ⚠️ BREAKING |

**Breaking Changes:** YES
- These are exported from `agentdb` package
- Removing them is a breaking change for external users
- Semantic version: MAJOR bump required (4.0.0)

**Alternative Approaches:**

**Option A: Full Removal (Breaking)**
- Remove from codebase entirely
- Bump to AgentDB v4.0.0
- Document as breaking change
- Risk: External users may depend on this

**Option B: Deprecation + Archive (Non-Breaking)**
- Move to `packages/agentdb/src/controllers/deprecated/`
- Add deprecation warnings
- Mark as deprecated in docs
- Remove in future major version
- Risk: Keeps dead code temporarily

**Option C: Extract to Separate Package (Non-Breaking)**
- Create `@agentdb/quic-transport` package
- Keep API compatibility
- Move tests and examples
- Risk: Maintenance burden

**Recommendation:** **Option B (Deprecation)** - Safest approach
- Mark deprecated in v3.0.0
- Remove in v4.0.0
- Gives users migration time

**Risk Level:** 🟡 MEDIUM (due to breaking change)

**Mitigation:**
1. Add deprecation warnings with clear migration guide
2. Update CHANGELOG with deprecation notice
3. Remove in next major version
4. Document reason: "QUIC transport was never integrated into production features"

---

## 3. Unused AgentDB Services (P1 - High Safety)

### 3.1 SonaTrajectoryService

**File:** `packages/agentdb/src/services/SonaTrajectoryService.ts`

**Impact Assessment:**

| Factor | Analysis | Risk |
|--------|----------|------|
| **API Surface** | NOT exported in package.json | ✅ SAFE |
| **Dependencies** | @ruvector/sona (never available) | ✅ SAFE |
| **Usage** | Never successfully invoked | ✅ SAFE |
| **Tests** | No dedicated tests | ✅ SAFE |

**Breaking Changes:** NONE (not exported)

**Risk Level:** 🟢 LOW

**Recommendation:** ✅ SAFE TO REMOVE

---

### 3.2 SemanticRouter

**File:** `packages/agentdb/src/services/SemanticRouter.ts`

**Impact Assessment:**

| Factor | Analysis | Risk |
|--------|----------|------|
| **API Surface** | NOT exported in package.json | ✅ SAFE |
| **Dependencies** | @ruvector/router (never available) | ✅ SAFE |
| **Usage** | Never successfully invoked | ✅ SAFE |
| **Tests** | No dedicated tests | ✅ SAFE |

**Breaking Changes:** NONE (not exported)

**Risk Level:** 🟢 LOW

**Recommendation:** ✅ SAFE TO REMOVE

---

### 3.3 GraphTransformerService

**File:** `packages/agentdb/src/services/GraphTransformerService.ts`

**Impact Assessment:**

| Factor | Analysis | Risk |
|--------|----------|------|
| **API Surface** | NOT exported in package.json | ✅ SAFE |
| **Dependencies** | ruvector-graph-transformer-wasm (never available) | ✅ SAFE |
| **Usage** | Used by MutationGuard (also uses fallback) | ⚠️ CHECK |
| **Tests** | No dedicated tests | ✅ SAFE |

**Dependency Chain:**
```
GraphTransformerService.ts
  ← MutationGuard.ts (uses it as optional import)
  ← GuardedVectorBackend.ts (exports MutationGuard)
```

**Analysis:**
- `MutationGuard` has try-catch for GraphTransformerService
- Falls back to simple hash if unavailable
- Removing service won't break MutationGuard

**Breaking Changes:** NONE

**Risk Level:** 🟢 LOW

**Mitigation:**
1. Verify MutationGuard handles missing import gracefully
2. Update MutationGuard to remove import attempt

**Recommendation:** ✅ SAFE TO REMOVE (with MutationGuard update)

---

## 4. Sona RVF MCP Tools (P1 - High Safety)

### 4.1 Sona RVF Tools

**File:** `agentic-flow/src/mcp/fastmcp/tools/sona-rvf-tools.ts`

**Impact Assessment:**

| Factor | Analysis | Risk |
|--------|----------|------|
| **MCP Registration** | Registered in stdio-full.ts | ⚠️ REMOVE FROM SERVER |
| **Usage** | Never successfully invoked | ✅ SAFE |
| **Dependencies** | @ruvector/sona (never available) | ✅ SAFE |
| **Tests** | Test file exists: tests/integration/sona-rvf-tools.test.ts | ⚠️ REMOVE TEST |

**Breaking Changes:** YES (MCP API surface)
- Removes MCP tools from server
- External MCP clients may expect these tools
- Semantic version: MINOR bump (tools removal is backwards compatible at runtime)

**MCP Tools Removed:**
```
sona_record_trajectory
sona_predict_action
sona_get_stats
rvf_embed_text
rvf_search_similar
rvf_get_status
```

**Risk Level:** 🟢 LOW (tools never worked anyway)

**Mitigation:**
1. Remove tools from `stdio-full.ts` registration
2. Remove test file
3. Document removal in CHANGELOG
4. Note: "Removed non-functional Sona/RVF tools pending proper @ruvector/sona integration"

**Recommendation:** ✅ SAFE TO REMOVE

---

## 5. Backup Files (P0 - High Safety)

### 5.1 TypeScript Backup Files

**Files:**
```
agentic-flow/src/utils/modelOptimizer.ts.backup
agentic-flow/src/reasoningbank/HybridBackend.ts.backup
```

**Impact Assessment:**

| Factor | Analysis | Risk |
|--------|----------|------|
| **Usage** | ZERO (backup files never imported) | ✅ SAFE |
| **Purpose** | Historical reference only | ✅ SAFE |
| **Git History** | Original versions in git | ✅ SAFE |

**Breaking Changes:** NONE

**Risk Level:** 🟢 LOW

**Recommendation:** ✅ SAFE TO REMOVE - Use git history instead

---

### 5.2 Disabled CI Workflow

**File:** `.github/workflows/test-agentdb-attention.yml.disabled`

**Impact Assessment:**

| Factor | Analysis | Risk |
|--------|----------|------|
| **CI Pipeline** | Not executed (disabled extension) | ✅ SAFE |
| **Purpose** | Unknown (disabled for a reason) | ⚠️ INVESTIGATE |

**Options:**
1. Re-enable as `.yml` if tests are valuable
2. Remove if no longer needed

**Risk Level:** 🟢 LOW

**Recommendation:** REMOVE or RE-ENABLE (decide based on test value)

---

## 6. Broken Examples (P2 - Medium Safety)

### 6.1 Parse Error Examples

**Files:**
```
examples/batch-query.js (parse error line 44)
examples/quic-swarm-coordination.js (parse error line 194)
```

**Impact Assessment:**

| Factor | Analysis | Risk |
|--------|----------|------|
| **Functionality** | Broken, cannot execute | ❌ BROKEN |
| **Documentation Value** | Reference examples for users | ⚠️ USER IMPACT |
| **Tests** | No tests for examples | ✅ SAFE |

**Options:**
1. **Fix** - Repair syntax errors and test
2. **Remove** - Delete broken examples
3. **Archive** - Move to `examples/archived/`

**Risk Level:** 🟡 MEDIUM (user-facing)

**Recommendation:** FIX if examples are valuable, otherwise REMOVE

---

### 6.2 Missing Dependency Example

**File:** `examples/quic-server-coordinator.js`

**Impact Assessment:**

| Factor | Analysis | Risk |
|--------|----------|------|
| **Issue** | Missing `agentic-flow` import | ❌ BROKEN |
| **Fix** | Update import path | ✅ EASY FIX |

**Recommendation:** FIX - Simple import path fix

---

## 7. React Frontend (P2 - Needs Decision)

### 7.1 React Landing Page

**Files:** `src/App.tsx`, `src/main.tsx`, `src/components/*.tsx`

**Impact Assessment:**

| Factor | Analysis | Risk |
|--------|----------|------|
| **Usage** | Unclear (separate Vite build) | ❓ UNKNOWN |
| **Purpose** | Landing page / documentation | ❓ UNKNOWN |
| **Dependencies** | React, Tailwind, Lucide (~15MB) | ⚠️ LARGE |
| **Build** | Separate build target | ✅ ISOLATED |

**Decision Required:** Is the landing page actively used?

**If YES (Landing Page Active):**
- KEEP all React files
- KEEP dependencies
- No action needed

**If NO (Landing Page Unused):**
- REMOVE ~1,500 lines
- REMOVE React dependencies (~15MB)
- Move to separate repo if needed later

**Risk Level:** 🟡 MEDIUM (needs product decision)

**Recommendation:** ⏸️ DEFER - Requires stakeholder input

---

## 8. Unused Dependencies (P0 - High Safety)

### 8.1 Root Package Unused Dependencies

**To Remove:**
```json
{
  "@anthropic-ai/claude-agent-sdk": "Unused",
  "@anthropic-ai/claude-code": "Unused",
  "@google/genai": "Unused",
  "@supabase/supabase-js": "Unused",
  "agentic-payments": "Unused",
  "autoprefixer": "Unused (unless React frontend is kept)",
  "axios": "Unused",
  "dotenv": "Unused (but commonly needed)",
  "http-proxy-middleware": "Unused",
  "postcss": "Unused (unless React frontend is kept)",
  "tiktoken": "Unused",
  "ulid": "Unused"
}
```

**Impact Assessment:**

| Factor | Analysis | Risk |
|--------|----------|------|
| **Build** | Not imported anywhere | ✅ SAFE |
| **Runtime** | Not loaded at runtime | ✅ SAFE |
| **Size** | ~50MB saved | ✅ BENEFIT |

**Exception:** Keep `dotenv` - commonly needed for env config

**Risk Level:** 🟢 LOW

**Recommendation:** ✅ SAFE TO REMOVE

---

### 8.2 Missing Dependencies to Add

**To Install:**
```json
{
  "uuid": "REQUIRED - Used in 5 files",
  "@modelcontextprotocol/sdk": "REQUIRED - Used in stdio.ts",
  "commander": "REQUIRED - Used in CLI",
  "chalk": "REQUIRED - Used in CLI",
  "ora": "REQUIRED - Used in CLI",
  "inquirer": "REQUIRED - Used in CLI"
}
```

**Risk Level:** 🔴 HIGH (currently broken)

**Recommendation:** ✅ INSTALL IMMEDIATELY - Critical for functionality

---

### 8.3 Dev Dependencies to Remove

**To Remove:**
```json
{
  "@types/better-sqlite3": "Unused type definitions",
  "@types/jest": "Using vitest, not jest",
  "jest": "Using vitest, not jest"
}
```

**Risk Level:** 🟢 LOW

**Recommendation:** ✅ SAFE TO REMOVE

---

## Summary Matrix

| Category | Files | Lines | Risk | Breaking | Test Impact | Recommendation |
|----------|-------|-------|------|----------|-------------|----------------|
| Medical Domain | ~40 | ~9,500 | 🟢 LOW | NO | 3,050 tests removed | ✅ REMOVE |
| QUIC Transport | 3 | ~1,200 | 🟡 MED | YES | 4 tests removed | ⏸️ DEPRECATE |
| AgentDB Services | 3 | ~750 | 🟢 LOW | NO | 0 tests | ✅ REMOVE |
| Sona RVF Tools | 1 | ~400 | 🟢 LOW | MINOR | 1 test removed | ✅ REMOVE |
| Backup Files | 3 | ~880 | 🟢 LOW | NO | 0 tests | ✅ REMOVE |
| Broken Examples | 3 | ~750 | 🟡 MED | NO | 0 tests | 🔧 FIX |
| React Frontend | ~10 | ~1,500 | 🟡 MED | NO | 0 tests | ❓ DECIDE |
| Dependencies | N/A | ~50MB | 🟢 LOW | NO | N/A | ✅ REMOVE |

## Recommended Removal Sequence

### Phase 1: Zero-Risk Removals (Execute Immediately)
1. ✅ Remove medical domain code (~9,500 lines)
2. ✅ Remove backup files (~880 lines)
3. ✅ Remove unused dependencies (~50MB)
4. ✅ Install missing critical dependencies
5. ✅ Remove Sona RVF tools (~400 lines)
6. ✅ Remove AgentDB services (~750 lines)

**Total:** ~11,530 lines, ~50MB node_modules
**Risk:** 🟢 LOW
**Breaking Changes:** NONE
**Test Time Reduction:** ~10-15%

### Phase 2: Low-Risk Removals (Execute After Phase 1 Tests Pass)
1. ⏸️ Deprecate QUIC transport (mark for v4.0.0 removal)
2. 🔧 Fix broken examples or remove
3. ✅ Remove disabled CI workflow

**Total:** ~880 lines
**Risk:** 🟡 MEDIUM
**Breaking Changes:** MINOR (examples only)

### Phase 3: Requires Decision (Defer)
1. ❓ React frontend - Product decision needed
2. ❓ Low-usage controllers - Consider lazy loading

**Total:** ~1,500 lines
**Risk:** Depends on usage

## Testing Protocol

After each phase:

```bash
# 1. Full build
npm run build

# 2. Type checking
npm run typecheck

# 3. Linting
npm run lint

# 4. Full test suite
npm test

# 5. Specific test suites
npm run test:main
npm run test:parallel

# 6. Verify MCP server
npx agentic-flow mcp start

# 7. Verify CLI
npx agentic-flow --help
npx agentic-flow doctor

# 8. Smoke test key features
npx agentic-flow memory list
npx agentic-flow swarm init
npx agentic-flow autopilot status
```

## Rollback Plan

If issues are discovered after removal:

1. **Immediate:** `git revert <commit>` to restore removed code
2. **Selective:** `git checkout <commit> -- <file>` to restore specific files
3. **Test:** Run full test suite after restore
4. **Document:** Record why removal failed for future attempts

## Success Criteria

✅ Phase 1 Complete When:
- All tests passing
- Build succeeds
- CLI functional
- MCP server starts
- No import errors
- 10-15% test time reduction achieved

✅ Phase 2 Complete When:
- Examples working or intentionally removed
- QUIC properly deprecated
- Documentation updated

✅ Overall Success When:
- 6-8% codebase reduction achieved
- Zero functionality loss
- All tests passing
- Build time improved 5-10%
- Test suite 10-15% faster
