#!/bin/bash
set -euo pipefail

# Runtime git access in apps/desktop must go through git-client.ts so spawned
# git processes inherit the shell-derived PATH/env expected by users.
runtime_imports=$(
	rg -n '^[[:space:]]*import[[:space:]].*from ["'\'']simple-git["'\'']' \
		apps/desktop/src \
		-g '*.ts' \
		-g '*.tsx' \
		-g '!apps/desktop/src/lib/trpc/routers/workspaces/utils/git-client.ts' \
		-g '!**/*.test.ts' \
		-g '!**/*.test.tsx' \
		| rg -v '^[^:]+:[0-9]+:[[:space:]]*import[[:space:]]+type[[:space:]]' \
		|| true
)

runtime_calls=$(
	rg -n \
		-e 'require\(["'\'']simple-git["'\'']\)' \
		-e 'execFile\(\s*["'\'']git["'\'']' \
		apps/desktop/src \
		-g '*.ts' \
		-g '*.tsx' \
		-g '!apps/desktop/src/lib/trpc/routers/workspaces/utils/git-client.ts' \
		-g '!**/*.test.ts' \
		-g '!**/*.test.tsx' \
		|| true
)

violations="${runtime_imports}${runtime_imports:+$'\n'}${runtime_calls}"

if [ -n "$violations" ]; then
	echo "Desktop runtime git access must use apps/desktop/src/lib/trpc/routers/workspaces/utils/git-client.ts"
	echo "$violations"
	exit 1
fi
