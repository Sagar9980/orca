import {
  query,
  type AccountInfo,
  type CanUseTool,
  type HookCallback,
  type Options,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decide, type Decision } from "./policy.js";

// A worker that runs the user's own Claude Code through the Claude Agent SDK, signed in with `claude auth login`.
// Claude Code runs its own agent loop; Orca keeps the parts that are Orca's: every tool call passes Orca's policy
// (a PreToolUse hook), "ask" goes to the human through `canUseTool`, and the run reports the same events.
// Note: Anthropic's terms don't allow third-party products to use Claude.ai subscriptions for their users without
// approval; the app labels this as the user's own local login, and an API key is the fallback.

/** What the app may show about the Claude Code login on this computer. */
export interface ClaudeLogin {
  signedIn: boolean;
  /** Where `claude` was found; the SDK's built-in copy when not installed. */
  executable: string | null;
  email?: string;
  /** "max", "pro", ... when signed in with a Claude plan. */
  plan?: string;
  detail?: string;
}

/** Common install places, for when the app is opened from the Dock and PATH is short. */
function candidates(): string[] {
  const home = os.homedir();
  const fromPath = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const extra = [
    path.join(home, ".local", "bin"),
    path.join(home, ".claude", "local"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  const name = process.platform === "win32" ? "claude.exe" : "claude";
  return [...fromPath, ...extra].map((dir) => path.join(dir, name));
}

/** The installed `claude` program, which holds the user's login. */
export function findClaudeExecutable(): string | null {
  for (const file of candidates()) {
    try {
      if (fs.statSync(file).isFile()) return file;
    } catch {
      // Not here.
    }
  }
  return null;
}

/**
 * The environment Claude Code runs in. No Anthropic key or endpoint: it must use the user's own login, and its
 * shell commands must never see a key. Also not "inside Claude Code", in case Orca itself was started from one.
 */
function claudeEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^ANTHROPIC_/.test(key) || key === "CLAUDECODE" || key === "CLAUDE_CODE_ENTRYPOINT") delete env[key];
  }
  env.CLAUDE_AGENT_SDK_CLIENT_APP = "orca";
  // No claude.ai connectors or IDE hookups: the run gets only Claude Code's own tools.
  env.ENABLE_CLAUDEAI_MCP_SERVERS = "false";
  env.CLAUDE_CODE_AUTO_CONNECT_IDE = "0";
  return env;
}

/** Options every session shares: the user's login, no user or project settings, no MCP servers. */
function baseOptions(executable: string | null, abortController: AbortController): Options {
  return {
    ...(executable ? { pathToClaudeCodeExecutable: executable } : {}),
    env: claudeEnv(),
    abortController,
    // Settings files could pre-approve tools, which would skip Orca's gate.
    settingSources: [],
    mcpServers: {},
    strictMcpConfig: true,
    persistSession: false,
    stderr: () => {},
  };
}

/** A prompt stream that sends nothing, for asking a session about its account without spending anything. */
async function* silent(): AsyncGenerator<SDKUserMessage> {
  await new Promise(() => {});
}

/** Starts Claude Code without a prompt and reads which account it is signed in with. Free: no model call. */
export async function checkClaudeLogin(timeoutMs = 20_000): Promise<ClaudeLogin> {
  const executable = findClaudeExecutable();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const session = query({ prompt: silent(), options: { ...baseOptions(executable, abort), allowedTools: [] } });
    const account = await Promise.race([
      session.accountInfo(),
      new Promise<never>((_, reject) =>
        abort.signal.addEventListener("abort", () => reject(new Error("Claude Code didn't answer in time."))),
      ),
    ]);
    return describeLogin(account, executable);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { signedIn: false, executable, detail };
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}

function describeLogin(account: AccountInfo, executable: string | null): ClaudeLogin {
  // The env has no key, so a token here can only be the user's own `claude auth login`.
  const signedIn =
    (account.apiProvider === undefined || account.apiProvider === "firstParty") &&
    ((!!account.tokenSource && account.tokenSource !== "none") || !!account.subscriptionType || !!account.email);
  return {
    signedIn,
    executable,
    ...(account.email ? { email: account.email } : {}),
    ...(account.subscriptionType ? { plan: account.subscriptionType } : {}),
    ...(signedIn ? {} : { detail: "Claude Code is not signed in. Run `claude auth login` in a terminal." }),
  };
}

/** Orca's policy for Claude Code's tools. Paths must stay inside the project; the rest maps to `decide()`. */
export function decideClaudeTool(root: string, name: string, input: unknown): Decision {
  const args = (input ?? {}) as Record<string, unknown>;
  const target = typeof args.file_path === "string" ? args.file_path : typeof args.path === "string" ? args.path : "";
  const rel = target ? insideProject(root, target) : ".";
  if (rel === null) return { verdict: "deny", reason: `Denied: ${target} is outside the project.` };

  switch (name) {
    case "Read":
    case "Glob":
    case "Grep":
    case "LS":
    case "NotebookRead":
      return { verdict: "allow", reason: "reads only" };
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return decide(root, "edit_file", { path: rel, old_string: "x" });
    case "Write":
      // Write replaces the whole file, so it counts as creating one.
      return decide(root, "edit_file", { path: rel, old_string: "" });
    case "Bash":
      return decide(root, "run_command", { command: args.command });
    case "BashOutput":
    case "KillShell":
    case "TodoWrite":
    case "Task":
    case "Agent":
      return { verdict: "allow", reason: "manages its own work" };
    case "WebFetch":
    case "WebSearch":
      return { verdict: "ask", reason: "goes to the internet" };
    default:
      return name.startsWith("mcp__")
        ? { verdict: "deny", reason: "Denied: no outside tools in Orca runs." }
        : { verdict: "ask", reason: `uses ${name}` };
  }
}

/** The path relative to the project, after resolving symlinks; null when it leaves the project. */
function insideProject(root: string, target: string): string | null {
  const realRoot = fs.realpathSync(root);
  let abs = path.resolve(root, target);
  // Resolve the deepest part that exists, so a new file in a symlinked folder is still checked.
  let existing = abs;
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing);
  abs = path.join(fs.realpathSync(existing), path.relative(existing, abs));
  const rel = path.relative(realRoot, abs);
  return rel.startsWith("..") || path.isAbsolute(rel) ? null : rel || ".";
}

export type ClaudeCodeEvent =
  | { kind: "started"; model: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; input: unknown; verdict: "allow" | "deny"; reason: string }
  | { kind: "tokens"; tokens: number };

export interface ClaudeCodeWorkerOptions {
  /** The run's worktree; Claude Code works only here. */
  root: string;
  task: string;
  maxTurns: number;
  /** Shows an approval card; resolves true when the human approves. */
  ask(call: { id: string; name: string; input: unknown; reason: string }): Promise<boolean>;
  /** Resolves once the run is not paused. Called before every tool call. */
  waitWhilePaused(): Promise<void>;
  /** Aborted when the run is stopped. */
  signal: AbortSignal;
  onEvent(event: ClaudeCodeEvent): void;
}

export interface ClaudeCodeResult {
  ok: boolean;
  /** Claude Code's final answer, or why it stopped. */
  text: string;
  turns: number;
  /** What the same work would cost on the API. An estimate; on a Claude plan nothing is billed per token. */
  estimatedUsd: number;
}

const ORCA_INSTRUCTIONS = `You are working for Orca on a branch made for this task, in the current folder.
Make the change, check it (run the tests if the project has them), and finish with a short summary of what you changed.
Some tool calls need a human's approval; if one is denied, adjust instead of retrying the same call.
Don't commit or switch branches: Orca commits your changes to this branch when you finish.`;

export async function runClaudeCode(options: ClaudeCodeWorkerOptions): Promise<ClaudeCodeResult> {
  const { root, task, maxTurns, ask, waitWhilePaused, signal, onEvent } = options;
  const abort = new AbortController();
  signal.addEventListener("abort", () => abort.abort(), { once: true });
  /** The gate's decision per tool call, so canUseTool asks with the same reason. */
  const decisions = new Map<string, Decision>();

  // Every tool call, including a sub-agent's, passes here first. Older Claude Code lets a tool run when its hook
  // throws (there is no `onFailure: "block"` before 2.1.3xx), so the hook never throws: any error denies the call.
  const gate: HookCallback = async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    let decision: Decision;
    try {
      await waitWhilePaused();
      decision = decideClaudeTool(root, input.tool_name, input.tool_input);
    } catch (err) {
      decision = { verdict: "deny", reason: `Denied: Orca couldn't check this call (${String(err)}).` };
    }
    decisions.set(input.tool_use_id, decision);
    if (decision.verdict !== "ask") {
      onEvent({ kind: "tool", name: input.tool_name, input: input.tool_input, ...decision } as ClaudeCodeEvent);
    }
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision.verdict,
        permissionDecisionReason: decision.reason,
      },
    };
  };

  const canUseTool: CanUseTool = async (name, input, { toolUseID }) => {
    const decision = decisions.get(toolUseID) ?? decideClaudeTool(root, name, input);
    let allowed = decision.verdict === "allow";
    let reason = decision.reason;
    if (decision.verdict === "ask") {
      allowed = await ask({ id: toolUseID, name, input, reason });
      reason = allowed ? "approved by the human" : "Denied by the human.";
      onEvent({ kind: "tool", name, input, verdict: allowed ? "allow" : "deny", reason });
    }
    return allowed
      ? { behavior: "allow", updatedInput: input, toolUseID }
      : { behavior: "deny", message: reason, toolUseID };
  };

  const session = query({
    prompt: task,
    options: {
      ...baseOptions(findClaudeExecutable(), abort),
      cwd: root,
      maxTurns,
      permissionMode: "default",
      systemPrompt: { type: "preset", preset: "claude_code", append: ORCA_INSTRUCTIONS },
      canUseTool,
      hooks: { PreToolUse: [{ hooks: [gate] }] },
    },
  });

  let tokens = 0;
  for await (const message of session as AsyncIterable<SDKMessage>) {
    if (message.type === "system" && message.subtype === "init") onEvent({ kind: "started", model: message.model });
    else if (message.type === "assistant") {
      const text = message.message.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("")
        .trim();
      if (text) onEvent({ kind: "text", text });
      const usage = message.message.usage;
      tokens +=
        usage.input_tokens +
        usage.output_tokens +
        (usage.cache_read_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0);
      onEvent({ kind: "tokens", tokens });
    } else if (message.type === "result") {
      const ok = message.subtype === "success" && !message.is_error;
      const text =
        message.subtype === "success"
          ? message.result
          : message.subtype === "error_max_turns"
            ? `Stopped at the ${maxTurns}-turn limit.`
            : `Claude Code stopped: ${message.subtype}.`;
      return { ok, text, turns: message.num_turns, estimatedUsd: message.total_cost_usd };
    }
  }
  return {
    ok: false,
    text: signal.aborted ? "Stopped." : "Claude Code ended without a result.",
    turns: 0,
    estimatedUsd: 0,
  };
}
