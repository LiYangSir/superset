# Superset Desktop Guide

Guidelines for agents and developers working in this repository.

## Structure

- `src/` - React frontend (renderer)
- `src-tauri/` - Rust backend (Tauri)
- `scripts/` - Build and utility scripts

## Tech Stack

- **Package Manager**: npm
- **Desktop Framework**: Tauri v2 (Rust backend)
- **UI**: React + TailwindCSS v4 + shadcn/ui
- **Code Quality**: Biome (formatting + linting at root)
- **Native Terminal**: alacritty_terminal + wgpu + glyphon (GPU-rendered)

## Common Commands

```bash
# Development
npm run dev                # Start desktop app dev server
npm test                   # Run tests
npm run build              # Build desktop app

# Tauri
npm run tauri:dev          # Start Tauri dev (Rust + frontend)
npm run tauri:build        # Build Tauri release

# Rust only (in src-tauri/)
cargo check                # Check Rust compilation
cargo build                # Build Rust backend

# Code Quality
npm run lint               # Check for lint issues (no changes)
npm run lint:fix           # Fix auto-fixable lint issues
npm run format             # Format code only
npm run format:check       # Check formatting only (CI)
npm run typecheck          # Type check all packages
```

## Code Quality

**Biome runs at root level** for speed:
- `biome check --write --unsafe` = format + lint + organize imports + fix all auto-fixable issues
- `biome check` = check only (no changes)
- `biome format` = format only
- Use `npm run lint:fix` to fix all issues automatically

## Agent Rules
1. **Type safety** - avoid `any` unless necessary
2. **Prefer `gh` CLI** - when performing git operations (PRs, issues, checkout, etc.), prefer the GitHub CLI (`gh`) over raw `git` commands where possible
3. **Shared command source** - keep command definitions in `.agents/commands/` only. `.claude/commands` should be a symlink to `../.agents/commands`.
4. **Workspace MCP config** - keep shared MCP servers in `.mcp.json`.
5. **Desktop git env** - do not import `simple-git` directly for runtime use or call raw `execFile("git", ...)`. Use the helpers in `src/lib/trpc/routers/workspaces/utils/git-client.ts` so git resolves with shell-derived env/PATH.

---

## Project Structure

All projects in this repo should be structured like this:

```
app/
├── page.tsx
├── dashboard/
│   ├── page.tsx
│   ├── components/
│   │   └── MetricsChart/
│   │       ├── MetricsChart.tsx
│   │       ├── MetricsChart.test.tsx      # Tests co-located
│   │       ├── index.ts
│   │       └── constants.ts
│   ├── hooks/                             # Hooks used only in dashboard
│   │   └── useMetrics/
│   │       ├── useMetrics.ts
│   │       ├── useMetrics.test.ts
│   │       └── index.ts
│   ├── utils/                             # Utils used only in dashboard
│   │   └── formatData/
│   │       ├── formatData.ts
│   │       ├── formatData.test.ts
│   │       └── index.ts
│   ├── stores/                            # Stores used only in dashboard
│   │   └── dashboardStore/
│   │       ├── dashboardStore.ts
│   │       └── index.ts
│   └── providers/                         # Providers for dashboard context
│       └── DashboardProvider/
│           ├── DashboardProvider.tsx
│           └── index.ts
└── components/
    ├── Sidebar/
    │   ├── Sidebar.tsx
    │   ├── Sidebar.test.tsx               # Tests co-located
    │   ├── index.ts
    │   ├── components/                    # Used 2+ times IN Sidebar
    │   │   └── SidebarButton/             # Shared by SidebarNav + SidebarFooter
    │   │       ├── SidebarButton.tsx
    │   │       ├── SidebarButton.test.tsx
    │   │       └── index.ts
    │   ├── SidebarNav/
    │   │   ├── SidebarNav.tsx
    │   │   └── index.ts
    │   └── SidebarFooter/
    │       ├── SidebarFooter.tsx
    │       └── index.ts
    └── HeroSection/
        ├── HeroSection.tsx
        ├── HeroSection.test.tsx           # Tests co-located
        ├── index.ts
        └── components/                    # Used ONLY by HeroSection
            └── HeroCanvas/
                ├── HeroCanvas.tsx
                ├── HeroCanvas.test.tsx
                ├── HeroCanvas.stories.tsx
                ├── index.ts
                └── config.ts

components/                                # Used in 2+ pages (last resort)
└── Header/
```

1. **One folder per component**: `ComponentName/ComponentName.tsx` + `index.ts` for barrel export
2. **Co-locate by usage**: If used once, nest under parent's `components/`. If used 2+ times, promote to **highest shared parent's** `components/` (or `components/` as last resort)
3. **One component per file**: No multi-component files
4. **Co-locate dependencies**: Utils, hooks, constants, config, tests, stories live next to the file using them

### Exception: shadcn/ui Components

The `src/components/ui/` and `src/components/ai-elements` directories contain shadcn/ui components. These use **kebab-case single files** (e.g., `button.tsx`, `base-node.tsx`) instead of the folder structure above. This is intentional -- shadcn CLI expects this format for updates via `npx shadcn@latest add`.
