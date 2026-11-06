# Orca

An AI agent orchestration platform. The user states an idea in plain words; Orca plans the work, runs a team of Claude
agents, verifies the result, and only asks the human for decisions, credentials and approvals. Full vision:
[README.md](README.md).

## Context files

Plans and decisions live in `contexts/`. Read them before starting work on agents or the orchestrator.

- Agent engine plan (LangGraph, our own loops, orchestrator, phases): @contexts/plan.md

## Repo layout

pnpm monorepo, TypeScript everywhere.

- `packages/shared`: run model, `RunEvent`s and the reducer that rebuilds a run from events. Build it before the apps
  use it (`pnpm build:shared`).
- `packages/engine`: the agent engine (LangGraph worker loop + tools). Plain Node; run it on the test project with
  `pnpm --filter @orca/engine fix` (`--model`, `--budget 0.25`, `--turns 30`); it asks y/n before commands and works
  on its own `orca/run-*` branch in a git worktree. Defaults to `claude-haiku-5-5` to keep testing cheap. Needs
  `ANTHROPIC_API_KEY` in `packages/engine/.env`.
- `apps/web`: React + Vite UI. Runs come through the `RunSource` interface: `src/run/desktopSource.ts` for real runs
  in the desktop app when the project's folder is on this computer, else the scripted demo (`src/run/demoSource.ts`).
- `apps/server`: Fastify + Drizzle/Postgres + Better Auth. Projects, machines, project folders, runs.
- `apps/desktop`: Electron. Picks local folders and runs the engine in the main process (`src/runs.ts`); the page
  reaches it only through `src/preload.ts`, and every IPC call is checked with `fromOrca` in `src/main.ts`. In
  development it reads the key from `packages/engine/.env`; `ORCA_FAKE_MODEL=1 pnpm dev` runs agents on scripted model
  replies for free.
- `apps/marketing`: Next.js landing page. Read `apps/marketing/AGENTS.md` before editing it.

## Commands

Node 26 and pnpm 12, pinned in the root `package.json` (`engines`, `packageManager`). Installs on other versions are
refused (`engineStrict` in `pnpm-workspace.yaml`).

- `pnpm dev`: shared + server + web + desktop together (`dev:web`, `dev:server`, `dev:desktop`, `dev:marketing` for one).
- `pnpm typecheck`: typecheck every package.
- `pnpm test`: Vitest. Engine tests (`packages/engine/test/`) run offline on scripted model replies and throwaway git
  repos, so they cost nothing; `pnpm --filter @orca/engine test:watch` while working on the engine.
- `pnpm --filter @orca/server db:generate` / `db:migrate`: Drizzle migrations.
- Env: copy `apps/server/.env.example` and `apps/web/.env.example` to `.env`. Never commit `.env`.

## Conventions

- Match the surrounding code: short doc comments explaining why, plain names, no extra abstractions.
- Prettier: printWidth 120, LF. Don't reformat files you didn't change.
- Agents never get the user's API key or other secrets in prompts or logs.
