# Orca

**An AI agent orchestration platform that removes prompt engineering.**

You give Orca an idea. Orca figures out what needs to happen, spawns the right agents, decides the next step on its own, and only comes back to you when it needs something only a human can provide (a choice, a credential, an approval).

> Status: idea / planning stage. No stack chosen yet. This document captures the vision and plan before any code is written.

---

## 1. The Problem

Building with LLMs today is human-driven at every step:

- We write a prompt: "Do this." Then another: "Now do that." Then another.
- The human is the orchestrator. Every decision about what happens next comes from our hands.
- Good results depend on prompt-writing skill (prompt engineering), which is a tax on every task.
- Non-technical people are worse off. Given three options (e.g. which payment gateway, which database), they don't know how to choose, so they are stuck.

Existing orchestration platforms let you wire agents together, but **you** still design the workflow and write the prompts. The thinking stays with the human.

## 2. The Idea

Orca flips this. Instead of the human orchestrating agents, **an agent orchestrates the agents.**

```
Simple idea  ->  Analyze  ->  Plan  ->  Spawn agents  ->  Execute  ->  Verify  ->  Decide next step  ->  ...
                                 ^                                                        |
                                 +--------------------------------------------------------+
                                     (loop until done; ask the human only when blocked)
```

Example input:

> "Add complete payment features to this app."

Orca should respond by itself:

1. Analyze the codebase and the request.
2. Ask the human only what it cannot decide: "Which payment gateway?" -> "Stripe."
3. Create a plan and spawn the specialist agents needed.
4. Do the full setup: SDK, checkout flow, webhooks, environment config, database changes.
5. Open a browser, pause to ask for credentials (human-only step), then continue configuring the dashboard side, webhooks and keys.
6. Test everything, find failures, fix them, and re-verify.
7. Report back with what was built and anything needing human attention.

## 3. Core Principles

1. **No prompt engineering.** The user states intent in plain language. Orca writes all internal prompts for its own agents.
2. **Autonomous next-step detection.** Orca decides what to do next. The user never has to say "now do the tests" or "now check edge cases."
3. **Human only where a human is required.** Credentials, payments, legal choices, taste calls, approvals. Everything else is automated.
4. **Opinionated defaults over options.** For non-technical users, Orca picks the best option and explains why in one line. It does not hand over a menu of three choices. Power users can override.
5. **Fail, learn, optimize.** Orca will sometimes get it wrong. That's accepted. Failures are captured and used to improve decisions over time.
6. **Verification is built in, not optional.** Every feature ships with testing, resilience checks, and review by dedicated agents.
7. **Transparent and interruptible.** The user can always see what agents are doing, why, and can pause or redirect.

## 4. How It Works (Conceptual Architecture)

### 4.1 The Orchestrator ("the brain")

A top-level agent that:

- Takes the raw idea or task.
- Classifies it (feature, bug, refactor, new product, infra change, etc.).
- Inspects project context (code, dependencies, existing patterns, environment).
- Produces a plan: goals, steps, required agents, dependencies between steps.
- Spawns and supervises agents, handles retries and re-planning.
- Decides when the work is "done" using explicit acceptance criteria it generates up front.
- Decides when it must ask the human.

### 4.2 Specialist Agents (spawned on demand)

The orchestrator chooses which to spawn based on the task. Initial roster:

| Agent | Responsibility |
|---|---|
| **Builder** | Writes the implementation code. |
| **Tester** | Writes and runs unit and integration tests. |
| **UI Tester** | Drives a real browser, clicks through flows, checks visuals and behavior. |
| **Fault Tolerance** | Probes failure modes: retries, timeouts, idempotency, webhook replays, partial failures, network drops. |
| **Threshold / Limits** | Checks rate limits, load, quotas, size limits, concurrency, cost ceilings. |
| **Security Reviewer** | Secrets handling, auth, input validation, dependency risk. |
| **Integrator** | Handles third-party setup: API keys, dashboards, webhooks, env config. |
| **Reviewer** | Final pass on quality, consistency with the codebase, and completeness against acceptance criteria. |

The roster is extensible. The orchestrator can propose a new agent type when a task needs one (e.g. a "Migration" agent, an "SEO" agent, a "Compliance" agent).

### 4.3 Human-in-the-Loop Gate

A first-class concept, not an afterthought. Orca classifies each blocker:

- **Decision:** needs a choice. Orca recommends a default, so the human can just confirm.
- **Secret / credential:** needs the human to log in or paste a key. Orca opens a browser or a secure prompt, waits, then continues.
- **Approval:** destructive or costly action (deploy, spend money, delete data). Orca asks first.
- **Information:** facts only the human knows (business rules, brand, pricing).

Questions are batched, short, and answerable in one tap where possible.

### 4.4 Tools the Agents Need

- Code read/write and shell execution (sandboxed).
- Browser automation (navigate, fill forms, screenshot, read console and network).
- Git operations (branches, commits, diffs, PRs).
- Third-party APIs and CLIs (Stripe, cloud providers, etc.).
- Secure secrets vault (never put credentials into prompts or logs).
- Test runners and linters.
- Memory / project knowledge store.

### 4.5 Memory and Learning

- **Project memory:** stack, conventions, past decisions, what already exists.
- **User memory:** preferences (e.g. "this user always picks Stripe," "prefers TypeScript").
- **Outcome memory:** what worked and what failed, feeding back into planning and defaults.

## 5. Example Walkthrough: "Add payments"

1. **Analyze:** detects app stack, existing auth, database, deployment target.
2. **Ask (decision):** "Which payment gateway? I recommend Stripe for your setup." -> user: "Stripe."
3. **Plan:** checkout, subscriptions or one-off, webhooks, receipts, refunds, failure handling, tests.
4. **Spawn:** Builder, Integrator, Tester, UI Tester, Fault Tolerance, Threshold, Security Reviewer.
5. **Integrator:** opens the Stripe dashboard in a browser, asks the human to log in (human gate), then creates products and prices, webhook endpoints, and stores keys in the vault and env.
6. **Builder:** implements the backend routes, webhook handler with signature verification, frontend checkout, and DB models.
7. **Tester / UI Tester:** run unit tests and walk through a full checkout in a browser using test cards.
8. **Fault Tolerance:** replays webhooks, drops the network mid-payment, tests duplicate events and idempotency.
9. **Threshold:** hits endpoints under load, checks rate limits and webhook burst handling.
10. **Security Reviewer:** checks key exposure, signature verification, and PCI-relevant mistakes.
11. **Loop:** failures go back to the Builder, then everything is re-verified.
12. **Report:** summary of what was done, what was verified, what the human still needs to do (e.g. switch to live keys).

## 6. Who It's For

- **Developers** tired of babysitting LLMs with step-by-step prompts.
- **Founders and non-technical builders** who want a product built without knowing which technical choices to make.
- **Teams** who want consistent, verified output instead of whatever one prompt happened to produce.

## 7. What Makes Orca Different

| Typical orchestration platforms | Orca |
|---|---|
| Human designs the workflow or graph | Orca designs the workflow from the idea |
| Human writes prompts for each agent | Orca writes all internal prompts |
| Human decides the next step | Orca detects the next step |
| Presents options to the human | Picks the best option, asks only if truly needed |
| Testing is something you add | Testing, fault tolerance, and limits are default agents |
| Fails silently or stops | Fails, diagnoses, retries, learns |

## 8. Non-Goals (for now)

- Not a visual drag-and-drop workflow builder.
- Not a general chatbot.
- Not trying to be perfect on day one. Occasional failure is expected and accepted; the focus is on the learning loop.
- Not replacing human judgment on money, legal, and security-sensitive approvals.

## 9. Risks and Open Questions

- **Runaway autonomy:** cost, time, and action limits per run. Hard budget caps are needed.
- **Safety of actions:** sandboxing, a permission model, and an audit log of everything agents do.
- **Credential handling:** how to let agents use secrets without exposing them to the model or logs.
- **Judging "done":** how reliably can Orca generate and check its own acceptance criteria?
- **Bad defaults:** how does Orca choose "best" options, and how does it explain them quickly?
- **Agent coordination:** conflicts when multiple agents edit the same files; ordering and parallelism.
- **Evaluation:** how do we measure whether Orca is actually better than a human prompting step by step?
- **Which model(s)** drive the orchestrator vs. the specialists (cost vs. quality).

## 10. Roadmap

### Phase 0: Plan (current)
- [x] Capture the vision in this README.
- [ ] Decide the tech stack.
- [ ] Define the agent interface and the orchestrator loop on paper.

### Phase 1: Core loop (MVP)
- Orchestrator that takes an idea, analyzes a local repo, and produces a plan.
- Spawns Builder and Tester agents; runs in a sandbox.
- Human-in-the-loop gate (decisions and approvals) via CLI.
- Run log and a simple view of agent activity.

### Phase 2: Verification agents
- UI Tester with real browser automation.
- Fault Tolerance and Threshold agents.
- Security Reviewer.
- Automatic fix-and-retry loop.

### Phase 3: Integrations
- Integrator agent: browser-driven third-party setup with a credential handoff.
- Secrets vault.
- First end-to-end showcase: "Add Stripe payments" with no step-by-step prompting.

### Phase 4: Memory and learning
- Project, user, and outcome memory.
- Opinionated default selection that improves from past runs.
- Failure analysis feeding back into planning.

### Phase 5: Non-technical experience
- Plain-language UI for people who don't code.
- Zero-menu mode: Orca decides, explains in one line, and proceeds.
- Hosted version, teams, and sharing.

## 11. Success Criteria

- A user can type a one-line idea and get a working, tested feature with fewer than ~3 human interventions, and those are credentials or true decisions only.
- The user never writes a second prompt just to tell Orca "now test it" or "now handle errors."
- A non-technical user can complete a real task without understanding any technical option.

## 12. Next Step

Choose the tech stack: language and runtime for the orchestrator, the agent execution and sandbox layer, browser automation, the model provider(s), the memory store, and the UI surface (CLI first, then web). To be planned next.
