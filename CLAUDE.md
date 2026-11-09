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
  `pnpm --filter @orca/engine fix` (`--model`, `--budget 0.25`, `--turns 30`); edits and ordinary commands run on their own,
  installs, network, git history and `.env` reads ask y/n (`src/policy.ts`); it works on its own `orca/run-*` branch
  in a git worktree, or live in the project folder on its current branch when the idea box's Worktree box is unchecked
  (`openFolder` in `src/workspace.ts`; changes are then left uncommitted). Defaults to `claude-haiku-5-5` to keep testing cheap. Needs
  `ANTHROPIC_API_KEY` in `packages/engine/.env`.
- Evals: `pnpm --filter @orca/engine eval` runs the tasks in `packages/engine/evals/tasks` and reports pass rate, cost
  and turns (`--repeat 3`, `--baseline evals/results/<run>` to compare, task names to run only those). Run it before
  and after changing a prompt, the loop or the model. Each task is graded by a check the agent can't edit; a new task
  needs a `solution/`, which the engine tests use to prove it can pass.
- `apps/web`: React + Vite UI, styled with Tailwind v4 and shadcn/ui conventions. Colors are tokens in
  `src/index.css` (`bg-panel`, `text-muted-foreground`, `border-border-strong`, status `tone-*` classes); shared parts
  are in `src/components/ui` (`Button`, `Input`, `Badge`), built with `cva` and `cn()`. Use tokens, not hex colors.
  `components.json` lets `pnpm dlx shadcn@latest add <name>` add shadcn components. Runs come through the `RunSource` interface: `src/run/desktopSource.ts` for real runs
  in the desktop app when the project's folder is on this computer, else the scripted demo (`src/run/demoSource.ts`).
- `apps/server`: Fastify + Drizzle/Postgres + Better Auth. Projects, machines, project folders, runs.
- `apps/desktop`: Electron. Picks local folders and runs the engine in the main process (`src/runs.ts`); the page
  reaches it only through `src/preload.ts`, and every IPC call is checked with `fromOrca` in `src/main.ts`. Runs use
  the user's own Claude Code login first (`claude auth login`; `packages/engine/src/claudeCode.ts` drives it through
  the Claude Agent SDK, with Orca's policy in a `PreToolUse` hook and approvals in `canUseTool`), else the user's
  Anthropic key is saved from the Account page, encrypted with `safeStorage` (`src/apiKey.ts`); the page only sees
  its last four characters. In development `packages/engine/.env` is the fallback; `pnpm dev:fake`
  (`ORCA_FAKE_MODEL=1`) runs agents on scripted model replies for free.
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
