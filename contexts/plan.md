# Plan: Orca's own agent engine--

## 1. Decisions

| Question                   | Decision                                                                                                                         | Why                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Agent framework            | `@langchain/langgraph`, `@langchain/anthropic`, `@langchain/core`, `langchain` (TypeScript)                                      | Same language as the repo. Graphs, checkpoints, `interrupt()`, streaming, and `Send` for starting workers at runtime. |
| Who writes the loop?       | Us, as a `StateGraph`. No `createAgent` to begin with                                                                            | The loop is what we want to learn and control.                                                                        |
| Fixed or dynamic workflow? | Fixed outer graph (analyze → plan → execute → verify → report); the number and type of workers is decided at runtime with `Send` | Orca designs the workflow per task. The graph is only the frame around it.                                            |
| Where the code lives       | New `packages/engine`: plain Node, no Electron                                                                                   | Runs from the terminal now, inside the desktop app next, and on a server later.                                       |
| Where agents run           | Desktop app, Electron main process, once the engine works from the terminal                                                      | The project folders are on the user's computer.                                                                       |
| Who pays for Claude?       | The user's own Anthropic API key at first                                                                                        | No billing to build yet.                                                                                              |
| Where does the key live?   | OS keychain via Electron `safeStorage`. In development, an environment variable                                                  | Never sent to our server, never in the database, prompts, logs or checkpoints.                                        |
| Models                     | `claude-opus-5-5` for planning and main agents; try `claude-sonnet-5-5` or `claude-haiku-5-5` for simple workers                 | Measure cost per finished task before moving work to cheaper models.                                                  |
| How the UI gets updates    | Same `RunEvent`s as today, through a new `RunSource`                                                                             | The UI and reducer stay as they are. Node code emits events with `config.writer`, read with stream mode `custom`.     |
| Saved state                | LangGraph checkpointer: `MemorySaver` first, then SQLite on the user's computer                                                  | Checkpoints contain the user's code, so they stay local by default.                                                   |

**While developing**, the engine defaults to `claude-haiku-5-5` with a $0.25 budget per run, about 30x cheaper than Opus
($0.0017 vs $0.054 for the test project). Use `--model claude-opus-5-5` for real tasks and occasional quality checks.
Test engine logic against a fake client first; real API calls are the last check. Set a monthly spend limit in the
Anthropic Console as a hard cap.

---

## 2. The loops

Agent engineering here is three loops inside each other. Each has its own stop rule.

```
Outer loop (orchestrator graph, one per run)
  analyze → plan → ask human → start workers → verify → done? → report
                                    ▲                     │ no
                                    └── send failures back┘   stop: criteria pass, or retry / budget limit

  Worker loop (one per agent)
    call model → tool calls? → gate → run tools → call model ...
                     │ no                                     stop: no tool calls, or turn / budget limit
                     └──> report

    Tool safety (one per tool call)
      check the policy → allow / deny / ask the human         stop: never skip this step
```

**Worker graph:**

```
START → model ──(has tool calls)──> gate ──> tools ──> model
          │                          │
          └──(finished)──> END       └──(denied)──> model, with the reason as the tool result
```

**Mapping to our model (`packages/shared/src/model.ts`):**

| Orca concept                 | LangGraph piece                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `Run`                        | One orchestrator graph run; its `thread_id` is the run id                                |
| `Agent` (Builder, Tester...) | A worker subgraph, started with `Send`                                                   |
| `SubAgent`                   | A smaller worker started by a tool the agent calls, or a nested subgraph                 |
| `Message`                    | Model and tool messages, turned into `message.sent` events                               |
| `HumanRequest`               | `interrupt()` pauses; `new Command({ resume })` continues                                |
| `RunEvent`                   | Emitted by nodes with `config.writer`                                                    |
| `Budget`                     | Token usage from each model response, added up in graph state                            |
| Pause                        | Stop after the current node, then continue from the checkpoint with the same `thread_id` |

---

## 3. Phases

Each phase ends with something we can see working. From Phase D on, engine work is built and tested in the desktop
app alongside the CLI, which stays as a quick way to debug the engine on its own.

### Phase A: The worker loop by hand

- [x] Create `packages/engine` and add the LangChain and LangGraph packages.
- [x] A small test project with bugs and failing tests. The engine works on a temporary copy of it.
- [x] Write the tools: `read_file`, `list_files`, `search`, `edit_file`, `run_command`. All paths must stay inside the
      project folder.
- [x] Write the worker `StateGraph`: `model` node, `tools` node, and a conditional edge that loops or ends.
- [x] Print every step in the terminal.
- [ ] Check the risks in section 5 against the real API.

**Done when:** our own loop fixes the test project's bugs and its tests pass.

### Phase B: Human gate and limits

- [x] One `gate` node that **every** tool call passes through, before the `tools` node. Tools have no other way to run.
- [x] Policy: allow reads, ask for commands and anything outside the normal edit flow, deny dangerous commands.
- [x] `interrupt()` for "ask", and a terminal y/n to resume. Add `MemorySaver`.
- [x] Turn limit, retry limit, and a dollar budget from the token usage in each response.

**Done when:** no command can run without passing the gate, and a run stops cleanly at its budget.

### Phase C: Better worker loop

- [ ] Context management: big tool results, long runs, summarizing, prompt caching.
- [x] Recovery: tool errors go back to the model, API errors retry, and the loop notices when it is stuck.
- [x] Work in a git worktree / branch, never on uncommitted user work.
- [ ] A small eval set: 5–10 test tasks that report pass rate, cost and turns, so changes are measured. Needed before
      we change models or prompts.

**Done when:** a real change to a real small repo works, and the eval numbers show whether a change helped.

### Phase D: Live in the UI

- [x] Settings screen for the API key, stored with `safeStorage` (Account page, `apps/desktop/src/apiKey.ts`). In
      development `packages/engine/.env` still works when no key is saved.
- [x] Run the engine in the desktop app (`apps/desktop/src/runs.ts`). IPC calls `orca:run-start`, `orca:run-attach`
      and `orca:run-command`, plus the `orca:run-event` channel. Same `fromOrca` guard as today.
- [x] Turn node output into `RunEvent`s (`startRun` in `packages/engine/src/run.ts`). `DesktopRunSource` in
      `apps/web/src/run/` implements `RunSource`. A run only starts from its Start button, never by opening a page.
- [x] Interrupts appear as `HumanCard`s, and the answer resumes the graph. Pause takes effect between turns.
- [x] `ORCA_FAKE_MODEL=1` runs the real graph and gate on scripted model replies, so the UI can be tried for free.
- [x] Check it end to end in the app: a fake run, then one real Haiku run.

**Done when:** typing an idea runs a real agent and the existing UI shows it live, with approvals working.

### Phase E: The orchestrator

- [ ] Analyze and plan nodes: structured output with steps, agents, acceptance criteria and questions.
- [ ] Agent roster as config: Builder, Tester, Reviewer first.
- [ ] `Send` starts workers from the plan. Reducers merge their results.
- [ ] Verify against the acceptance criteria, send failures back to the Builder, stop at the retry limit.
- [ ] Run-level budget across all workers.

**Done when:** a one-line idea produces a plan, a Builder and a Tester, a fix loop and a report, with no second prompt.

### Phase F: Scale

- [ ] Parallel workers on separate worktrees, and merging their results.
- [ ] Sub-agents inside a main agent.
- [ ] SQLite checkpointer: reopen and resume a run after a crash.
- [ ] Send `RunEvent`s to the server and add a `run_event` table for run history.
- [ ] Docker sandbox for running code.

### Phase G: More agents

- [ ] UI Tester with Playwright, Security Reviewer, Fault Tolerance, Integrator.
- [ ] Third-party secrets: keychain, injected as env vars, never shown to the model.
- [ ] Project, user and outcome memory.

---

## 4. Safety rules

We own all the tools, so nothing here is provided for us.

- **One gate, no bypass.** Every tool call goes through the gate node. Enforce rules there, not in the prompt.
- Paths are checked after resolving symlinks, and must stay inside the project folder.
- `run_command` gets a timeout, an output limit, and an environment with no API keys or other secrets.
- Agents work in a **git worktree / branch**, never on uncommitted user work.
- Every worker has a turn cap, a budget cap and a retry cap, and so does the run.
- Destructive or costly actions always go to the human.
- Every tool call is logged as an event (audit log).
- File contents, command output and web pages are data, never instructions (prompt injection).
- Code that runs before `interrupt()` runs again on resume, so the gate node has no side effects before it pauses.
- Don't wrap `interrupt()` in a bare try/catch, because it pauses by throwing.

---

## 5. Risks to check in Phase A

These come from how `claude-opus-5-5` behaves. Test each with `@langchain/anthropic`, since the wrapper may not handle
them yet.

1. **Forced tools:** `tool_choice` `any` or a named tool returns a 400. `withStructuredOutput` may force a tool, so check
   which method works.
2. **Thinking blocks:** they must go back unchanged, in order. Any history editing or trimming (including summarizing)
   can cause a 400 on accounts created on or after 2026-08-31. Check that LangChain's message conversion keeps them.
3. **Thinking settings:** thinking can't be turned off, and sending `budget_tokens` or sampling settings returns a 400.
   Default effort is `medium`, so set it on purpose.
4. **Refusals:** check `stop_reason: "refusal"` and handle it. Plan for server-side fallbacks.
5. **Streaming and long outputs:** use streaming for large `max_tokens`.
6. **Prompt caching:** confirm cache hits, since caching is the biggest cost saver in a long loop.

If the wrapper blocks one of these, call the `@anthropic-ai/sdk` directly inside the `model` node. LangGraph doesn't care
how a node gets its answer.

---

## 6. Open questions

1. **Sandbox:** is a git worktree enough for early testing, or do we need Docker sooner? Commands from a worktree can
   still reach the rest of the computer.
2. **Sub-agents:** a nested subgraph or a tool that starts a worker? Try both in Phase F.
3. **Parallel edits:** who merges separate worktrees, and what happens on a conflict?
4. **Judging "done":** how good are the model's own acceptance criteria? Measure with the evals.
5. **Cost per run:** measure from Phase A onward.
6. **Long-term home:** desktop only, or also the server for a hosted version? `packages/engine` keeps both possible.

---

## 7. Not doing yet

- Hosted / cloud runs and "Orca pays" billing.
- LangSmith or LangGraph Platform; printed logs and our own events come first.
- Non-technical "zero menu" mode.
