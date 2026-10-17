# Plan: Real agents in Orca

Replace the scripted demo with real Claude workers, built on the **Claude Agent SDK**.

**Split of work:** the Agent SDK is the workers (they read, edit, run and test code). Orca is the manager (it plans, picks
the workers, passes work between them, asks the human, and tracks cost).

---

## 1. Decisions

| Question | Decision | Why |
|---|---|---|
| Who does the coding? | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) | Ready-made coding agent with file, shell and search tools, subagents, permissions, hooks and budgets. TypeScript, like the repo. |
| Who decides what happens next? | Orca's own code, the **orchestrator** | That decision-making is Orca's product. Keeping it in our code keeps it visible, pausable and within budget. |
| Where do agents run? | **Desktop app, Electron main process** | The project folders are on the user's computer, and the desktop app already connects them. |
| Who pays for Claude? | **The user's own Anthropic API key** at first | No billing to build yet. A hosted "Orca pays" option can come later. The Agent SDK does not allow Claude Pro/Max login. |
| Where does the key live? | OS keychain via Electron `safeStorage` | Never sent to our server, never in the database, prompts or logs. |
| Models | Orchestrator and main agents: `claude-opus-5-5`. Helper subagents: `sonnet`, or `haiku` for reading-heavy work | Planning needs the strongest model; bulk work can be cheaper. |
| How the UI gets updates | Same `RunEvent`s as today, through a new `RunSource` | The UI, reducer and components stay as they are. Only the source of events changes. |

---

## 2. How a run works

```
User types an idea in the Composer
        │
        ▼
Orchestrator (desktop main process)
  1. Analyze  - one Claude call reads the repo summary and the idea
  2. Plan     - Claude returns JSON: steps, which agents, acceptance criteria, questions for the human
  3. Ask      - if there are questions, emit human.requested and wait
  4. Spawn    - start an Agent SDK session per main agent (Builder, Tester, ...)
  5. Execute  - stream each session's messages and convert them to RunEvents
  6. Verify   - Tester / Reviewer sessions check the work against the acceptance criteria
  7. Decide   - all criteria pass: Report. Otherwise send failures back to the Builder and loop (max N times)
  8. Report   - emit run.finished with a summary and what the human still has to do
        │
        ▼
RunEvents → IPC → web UI (Board, AgentRail, Comms, HumanCard)
```

**Mapping to our model (`packages/shared/src/model.ts`):**

| Orca concept | Agent SDK piece |
|---|---|
| `Run` | One orchestrator loop |
| `Agent` (Builder, Tester...) | One `query()` session |
| `SubAgent` | A subagent defined in that session's `agents` option |
| `Message` | Streamed SDK messages (assistant text, tool calls, subagent results) |
| `HumanRequest` (approval) | `canUseTool` callback pauses and waits for the human |
| `HumanRequest` (decision / information) | The orchestrator's plan questions, or a custom `ask_human` tool through an SDK MCP server |
| `Budget` | `maxBudgetUsd` per session, plus a run total kept by the orchestrator |
| Pause / stop | `interrupt()` / `abortController` |

---

## 3. Phases

Each phase ends with something we can see working.

### Phase A: One real worker (spike)
Goal: prove the SDK works on a real folder and see what it streams.

- [ ] Add `@anthropic-ai/claude-agent-sdk` to `apps/desktop`.
- [ ] A throwaway script: run one `query()` on a test folder with a small task, print every message.
- [ ] Note the message shapes (assistant, tool use, subagent, result with cost) to design the event mapping.

**Done when:** we watch Claude read, edit and test code in a folder from our own script.

### Phase B: API key and bridge
- [ ] Settings screen: paste an Anthropic API key, store it with `safeStorage`, show only "key saved ✓".
- [ ] New IPC calls in `apps/desktop/src/preload.ts`: `run.start`, `run.command` (pause, resume, respond), and an
      event channel from main to the page. Same `fromOrca` guard as today.
- [ ] `DesktopRunSource` in `apps/web/src/run/` that implements `RunSource` over that IPC.

**Done when:** the web app can start a run in the desktop app and receive events.

### Phase C: One agent, live in the UI
- [ ] `apps/desktop/src/agents/session.ts`: wraps one `query()` and converts SDK messages to `RunEvent`s
      (`agent.spawned`, `subagent.updated`, `message.sent`, `run.spend`...).
- [ ] The Builder runs on the project folder **in its own git worktree / branch** (`run.branch`), never directly on the
      user's working copy.
- [ ] `canUseTool` sends risky actions (deploy, delete, network installs, editing `.env`) to the human as
      `human.requested` and waits for `human.responded`.
- [ ] `maxBudgetUsd` and `maxTurns` on every session.

**Done when:** typing an idea runs a real Builder and the existing UI shows it live, with approvals working.

### Phase D: The orchestrator
- [ ] `apps/desktop/src/orchestrator/`: the loop from section 2.
- [ ] Plan call: Claude API with structured JSON output (steps, agents, acceptance criteria, questions, recommended
      defaults).
- [ ] Agent roster as config: Builder, Tester, Reviewer first. Each has a mission prompt, tools, model and subagents.
- [ ] Handoffs: Builder → Tester → (failures) → Builder, with a retry limit.
- [ ] Run-level budget: stop everything when the total reaches the limit.

**Done when:** a one-line idea produces a plan, a Builder and a Tester, a fix loop, and a final report, without any
second prompt from the user.

### Phase E: Saving and resuming
- [ ] Send every `RunEvent` to the server (`apps/server`) and store it in Postgres; add a `run_event` table.
- [ ] Reopening a run replays its events, which the reducer already supports.
- [ ] Resume an interrupted run with the SDK's `resume` session IDs.

### Phase F: More agents and tools
- [ ] UI Tester with a browser (Playwright MCP server).
- [ ] Security Reviewer, Fault Tolerance, Integrator.
- [ ] Secrets handling for third-party keys (keychain, injected as env vars, never shown to the model).

---

## 4. Safety rules (from README §9)

- Agents work in a **git worktree / branch**, never on uncommitted user work.
- Every run has a **budget cap** and a **turn cap**; the orchestrator has a retry cap.
- Destructive or costly actions always go to the human (`canUseTool` + `disallowedTools` such as `Bash(rm -rf *)`).
- Every tool call is logged as an event (audit log).
- The API key and other secrets never go into prompts, logs or our server.

---

## 5. Open questions

1. **Folder safety:** is a git worktree enough, or do we need a Docker sandbox for running the user's code?
2. **Where the orchestrator lives long-term:** desktop only, or move it to the server for the hosted version (then
   Managed Agents with a self-hosted worker is the likely path)?
3. **Parallel agents:** can Builder and Tester run at the same time on separate worktrees, and who merges?
4. **Judging "done":** how good are Claude's own acceptance criteria? We need a small set of test tasks (evals) to
   measure it.
5. **Cost per run:** what is a typical "add a feature" run going to cost? Measure in Phase C.

---

## 6. Not doing yet

- Hosted / cloud runs and "Orca pays" billing.
- Memory across runs (project, user and outcome memory).
- Non-technical "zero menu" mode.
- LangGraph or other frameworks; plain TypeScript first, a durable workflow engine (Temporal / Inngest) only if
  resuming runs gets hard.
