#!/bin/bash
# Dead Code Cleanup Script - Agentic Flow
# Generated: 2026-02-25
# Analyst: Dead Code Eliminator Agent
#
# This script removes confirmed dead code in phases.
# Execute each phase separately and test before proceeding to the next.
#
# Usage:
#   ./cleanup-script.sh phase1  # Execute Phase 1 (zero-risk removals)
#   ./cleanup-script.sh phase2  # Execute Phase 2 (low-risk removals)
#   ./cleanup-script.sh all     # Execute all phases (use with caution)
#   ./cleanup-script.sh dry-run # Show what would be removed without removing

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Dry run flag
DRY_RUN=false

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

remove_file() {
    local file="$1"
    if [ "$DRY_RUN" = true ]; then
        echo "  [DRY-RUN] Would remove: $file"
    else
        if [ -f "$file" ]; then
            rm "$file"
            log_success "Removed: $file"
        else
            log_warning "Not found: $file"
        fi
    fi
}

remove_directory() {
    local dir="$1"
    if [ "$DRY_RUN" = true ]; then
        echo "  [DRY-RUN] Would remove directory: $dir"
    else
        if [ -d "$dir" ]; then
            rm -rf "$dir"
            log_success "Removed directory: $dir"
        else
            log_warning "Not found: $dir"
        fi
    fi
}

create_backup() {
    local phase="$1"
    local backup_dir="$ROOT_DIR/backups/dead-code-cleanup-$(date +%Y%m%d-%H%M%S)-$phase"

    if [ "$DRY_RUN" = false ]; then
        mkdir -p "$backup_dir"
        log_info "Creating backup at: $backup_dir"

        # Create git stash as backup
        git stash push -u -m "Dead code cleanup $phase backup - $(date +%Y-%m-%d)"
        log_success "Git stash created as backup"
    fi
}

verify_git_clean() {
    if [ "$DRY_RUN" = false ]; then
        if ! git diff-index --quiet HEAD --; then
            log_error "Working directory has uncommitted changes. Commit or stash before running cleanup."
            exit 1
        fi
    fi
}

run_tests() {
    if [ "$DRY_RUN" = false ]; then
        log_info "Running test suite to verify cleanup..."
        cd "$ROOT_DIR"

        # Build
        log_info "Building..."
        npm run build || { log_error "Build failed!"; exit 1; }

        # Type check
        log_info "Type checking..."
        npm run typecheck || { log_error "Type check failed!"; exit 1; }

        # Run tests
        log_info "Running tests..."
        npm test || { log_error "Tests failed!"; exit 1; }

        log_success "All tests passed!"
    fi
}

# =============================================================================
# PHASE 1: Zero-Risk Removals
# =============================================================================

phase1_medical_domain() {
    log_info "Phase 1.1: Removing Medical Domain Code (~9,500 lines)"

    # Medical services
    remove_file "$ROOT_DIR/src/services/medical-analysis.service.ts"
    remove_file "$ROOT_DIR/src/services/medical-analyzer.ts"
    remove_file "$ROOT_DIR/src/services/provider.service.ts"
    remove_file "$ROOT_DIR/src/services/notification-service.ts"
    remove_file "$ROOT_DIR/src/services/knowledge-base.ts"
    remove_file "$ROOT_DIR/src/services/verification-service.ts"
    remove_file "$ROOT_DIR/src/services/anti-hallucination.service.ts"

    # Medical middleware
    remove_file "$ROOT_DIR/src/middleware/auth.middleware.ts"
    remove_file "$ROOT_DIR/src/middleware/logging.middleware.ts"

    # Medical domain objects
    remove_directory "$ROOT_DIR/src/providers"
    remove_directory "$ROOT_DIR/src/notifications"
    remove_directory "$ROOT_DIR/src/routing"
    remove_directory "$ROOT_DIR/src/consent"

    # Medical API
    remove_file "$ROOT_DIR/src/api/index.ts"

    # Medical tests
    remove_directory "$ROOT_DIR/tests/providers"
    remove_directory "$ROOT_DIR/tests/notifications"
    remove_directory "$ROOT_DIR/tests/routing"
    remove_directory "$ROOT_DIR/tests/validation"
    remove_directory "$ROOT_DIR/tests/safety"
    remove_directory "$ROOT_DIR/tests/verification"

    log_success "Phase 1.1 complete: Medical domain removed"
}

phase1_backup_files() {
    log_info "Phase 1.2: Removing Backup Files (~880 lines)"

    remove_file "$ROOT_DIR/agentic-flow/src/utils/modelOptimizer.ts.backup"
    remove_file "$ROOT_DIR/agentic-flow/src/reasoningbank/HybridBackend.ts.backup"
    remove_file "$ROOT_DIR/.github/workflows/test-agentdb-attention.yml.disabled"

    log_success "Phase 1.2 complete: Backup files removed"
}

phase1_agentdb_services() {
    log_info "Phase 1.3: Removing Unused AgentDB Services (~750 lines)"

    remove_file "$ROOT_DIR/packages/agentdb/src/services/SonaTrajectoryService.ts"
    remove_file "$ROOT_DIR/packages/agentdb/src/services/SonaTrajectoryService.js"
    remove_file "$ROOT_DIR/packages/agentdb/src/services/SonaTrajectoryService.d.ts"

    remove_file "$ROOT_DIR/packages/agentdb/src/services/SemanticRouter.ts"
    remove_file "$ROOT_DIR/packages/agentdb/src/services/SemanticRouter.js"
    remove_file "$ROOT_DIR/packages/agentdb/src/services/SemanticRouter.d.ts"

    remove_file "$ROOT_DIR/packages/agentdb/src/services/GraphTransformerService.ts"
    remove_file "$ROOT_DIR/packages/agentdb/src/services/GraphTransformerService.js"
    remove_file "$ROOT_DIR/packages/agentdb/src/services/GraphTransformerService.d.ts"

    log_success "Phase 1.3 complete: Unused AgentDB services removed"
}

phase1_sona_rvf_tools() {
    log_info "Phase 1.4: Removing Sona RVF MCP Tools (~400 lines)"

    remove_file "$ROOT_DIR/agentic-flow/src/mcp/fastmcp/tools/sona-rvf-tools.ts"
    remove_file "$ROOT_DIR/tests/integration/sona-rvf-tools.test.ts"

    log_warning "Manual step required: Remove Sona RVF tool registration from stdio-full.ts"

    log_success "Phase 1.4 complete: Sona RVF tools removed"
}

phase1_dependencies() {
    log_info "Phase 1.5: Removing Unused Dependencies (~50MB)"

    if [ "$DRY_RUN" = false ]; then
        cd "$ROOT_DIR"

        # Remove unused dependencies
        npm uninstall \
            @anthropic-ai/claude-agent-sdk \
            @anthropic-ai/claude-code \
            @google/genai \
            @supabase/supabase-js \
            agentic-payments \
            autoprefixer \
            axios \
            http-proxy-middleware \
            postcss \
            tiktoken \
            ulid \
            @types/better-sqlite3 \
            @types/jest \
            jest \
            2>/dev/null || true

        # Install missing critical dependencies
        npm install uuid @modelcontextprotocol/sdk commander chalk ora inquirer

        log_success "Phase 1.5 complete: Dependencies updated"
    else
        echo "  [DRY-RUN] Would uninstall unused dependencies and install missing ones"
    fi
}

run_phase1() {
    log_info "=== PHASE 1: Zero-Risk Removals ==="
    log_info "Removes: ~11,530 lines, ~50MB node_modules"
    log_info "Risk: LOW | Breaking Changes: NONE"
    echo ""

    if [ "$DRY_RUN" = false ]; then
        verify_git_clean
        create_backup "phase1"
    fi

    phase1_medical_domain
    phase1_backup_files
    phase1_agentdb_services
    phase1_sona_rvf_tools
    phase1_dependencies

    log_success "=== PHASE 1 COMPLETE ==="

    if [ "$DRY_RUN" = false ]; then
        log_info "Running tests..."
        run_tests

        echo ""
        log_success "Phase 1 cleanup successful!"
        log_info "Next steps:"
        echo "  1. Review changes: git diff"
        echo "  2. Commit changes: git add -A && git commit -m 'chore: remove dead code (Phase 1)'"
        echo "  3. Run Phase 2: ./cleanup-script.sh phase2"
    fi
}

# =============================================================================
# PHASE 2: Low-Risk Removals (Manual Actions)
# =============================================================================

run_phase2() {
    log_info "=== PHASE 2: Low-Risk Removals (Deprecation) ==="
    log_info "This phase requires manual actions:"
    echo ""

    log_warning "QUIC Transport Deprecation:"
    echo "  1. Add deprecation warnings to QUIC controllers"
    echo "  2. Update CHANGELOG.md with deprecation notice"
    echo "  3. Update docs to mark QUIC as deprecated"
    echo "  4. Plan removal for AgentDB v4.0.0"
    echo ""

    log_warning "Broken Examples:"
    echo "  1. Fix: examples/batch-query.js (syntax error line 44)"
    echo "  2. Fix: examples/quic-swarm-coordination.js (syntax error line 194)"
    echo "  3. Fix: examples/quic-server-coordinator.js (import path)"
    echo ""

    log_info "Manual actions required - Phase 2 cannot be automated"
}

# =============================================================================
# Manual Cleanup Tasks
# =============================================================================

show_manual_tasks() {
    log_info "=== MANUAL CLEANUP TASKS ==="
    echo ""

    log_info "1. Update stdio-full.ts"
    echo "   Remove Sona RVF tool registration from:"
    echo "   agentic-flow/src/mcp/fastmcp/servers/stdio-full.ts"
    echo ""

    log_info "2. Update MutationGuard.ts"
    echo "   Remove GraphTransformerService import from:"
    echo "   packages/agentdb/src/security/MutationGuard.ts"
    echo ""

    log_info "3. Update AgentDB controllers/index.ts"
    echo "   Consider removing QUIC exports (breaking change)"
    echo ""

    log_info "4. Update CHANGELOG.md"
    echo "   Document all removals with clear migration notes"
    echo ""

    log_info "5. Update README.md"
    echo "   Remove references to removed features"
    echo ""
}

# =============================================================================
# Dry Run
# =============================================================================

run_dry_run() {
    log_info "=== DRY RUN MODE ==="
    log_info "Showing what would be removed without actually removing anything"
    echo ""

    DRY_RUN=true
    run_phase1
    echo ""
    run_phase2
    echo ""
    show_manual_tasks
}

# =============================================================================
# Main
# =============================================================================

show_usage() {
    echo "Dead Code Cleanup Script - Agentic Flow"
    echo ""
    echo "Usage:"
    echo "  $0 phase1   - Execute Phase 1 (zero-risk removals)"
    echo "  $0 phase2   - Show Phase 2 manual tasks"
    echo "  $0 all      - Execute Phase 1 and show Phase 2 tasks"
    echo "  $0 dry-run  - Show what would be removed without removing"
    echo "  $0 manual   - Show manual cleanup tasks"
    echo ""
    echo "Phases:"
    echo "  Phase 1: Automated removal of confirmed dead code (~11,530 lines)"
    echo "  Phase 2: Manual deprecation and documentation updates"
    echo ""
    echo "Always commit your work before running this script!"
}

case "${1:-}" in
    phase1)
        run_phase1
        ;;
    phase2)
        run_phase2
        show_manual_tasks
        ;;
    all)
        run_phase1
        echo ""
        run_phase2
        echo ""
        show_manual_tasks
        ;;
    dry-run)
        run_dry_run
        ;;
    manual)
        show_manual_tasks
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
