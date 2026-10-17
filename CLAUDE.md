# Orca

An AI agent orchestration platform. The user states an idea in plain words; Orca plans the work, runs a team of Claude
agents, verifies the result, and only asks the human for decisions, credentials and approvals. Full vision:
[README.md](README.md).

## Context files

Plans and decisions live in `contexts/`. Read them before starting work on agents or the orchestrator.

- Real agents plan (Claude Agent SDK, orchestrator, phases): @contexts/plan.md

## Repo layout

pnpm monorepo, TypeScript everywhere.

- `packages/shared`: run model, `RunEvent`s and the reducer that rebuilds a run from events. Build it before the apps
  use it (`pnpm build:shared`).
- `apps/web`: React + Vite UI. Runs currently come from a scripted demo (`src/run/demoSource.ts`) behind the
  `RunSource` interface.
- `apps/server`: Fastify + Drizzle/Postgres + Better Auth. Projects, machines, project folders, runs.
- `apps/desktop`: Electron. Picks local folders; the page reaches it only through `src/preload.ts`, and every IPC call
  is checked with `fromOrca` in `src/main.ts`.
- `apps/marketing`: Next.js landing page. Read `apps/marketing/AGENTS.md` before editing it.

## Commands

- `pnpm dev`: shared + server + web + desktop together (`dev:web`, `dev:server`, `dev:desktop`, `dev:marketing` for one).
- `pnpm typecheck`: typecheck every package.
- `pnpm --filter @orca/server db:generate` / `db:migrate`: Drizzle migrations.
- Env: copy `apps/server/.env.example` and `apps/web/.env.example` to `.env`. Never commit `.env`.

## Conventions

- Match the surrounding code: short doc comments explaining why, plain names, no extra abstractions.
- Prettier: printWidth 120, LF. Don't reformat files you didn't change.
- Agents never get the user's API key or other secrets in prompts or logs.
