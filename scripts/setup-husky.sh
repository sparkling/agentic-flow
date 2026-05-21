#!/bin/bash
# Setup Husky Git Hooks for Agentic-Flow v2.0.0-alpha

set -e

echo "🔧 Setting up Husky Git hooks..."

# Install husky
npx husky install

# Create hooks directory
mkdir -p .husky

# Pre-commit hook
cat > .husky/pre-commit << 'EOF'
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🔍 Running pre-commit checks..."

# Run lint-staged
npx lint-staged --config config/lint-staged.config.js

echo "✅ Pre-commit checks passed!"
EOF

# Commit-msg hook
cat > .husky/commit-msg << 'EOF'
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🔍 Validating commit message..."

# Validate commit message format
node scripts/validate-commit-msg.js "$1"

echo "✅ Commit message is valid!"
EOF

# NOTE: no pre-push hook. Tests + typecheck run in CI / the release pipeline,
# not as a git hook (a pre-push test gate blocks automated version-bump pushes
# and couples git operations to full-suite health). Keep only the fast
# pre-commit (lint-staged) and commit-msg hooks.

# Make hooks executable
chmod +x .husky/pre-commit
chmod +x .husky/commit-msg

echo "✅ Husky Git hooks configured successfully!"
echo ""
echo "The following hooks are now active:"
echo "  - pre-commit: Runs lint-staged (ESLint + Prettier + TypeScript)"
echo "  - commit-msg: Validates commit message format"
