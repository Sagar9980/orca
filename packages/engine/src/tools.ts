import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// The tools a worker can call. Every path is checked against the project folder after resolving symlinks, and
// model input is validated here, since streamed tool input is not validated by the API.

const MAX_READ_BYTES = 100_000;
const MAX_OUTPUT_CHARS = 20_000;
const MAX_LIST_ENTRIES = 500;
const MAX_SEARCH_MATCHES = 200;
const COMMAND_TIMEOUT_MS = 60_000;
const SKIP_DIRS = new Set([".git", "node_modules", "dist"]);

const schemas = {
  list_files: z.object({ path: z.string().describe('Folder relative to the project root, e.g. "."') }),
  read_file: z.object({ path: z.string() }),
  search: z.object({
    pattern: z.string().describe("JavaScript regular expression"),
    path: z.string().describe("Folder or file to search, relative to the project root"),
  }),
  edit_file: z.object({
    path: z.string(),
    old_string: z.string().describe("Exact text to replace; must appear once. Empty to create a new file."),
    new_string: z.string(),
  }),
  run_command: z.object({ command: z.string().describe("Shell command, run from the project root") }),
};

export type ToolName = keyof typeof schemas;

const descriptions: Record<ToolName, string> = {
  list_files: "List files under a folder in the project, recursively. Skips .git, node_modules and dist.",
  read_file: "Read a text file in the project.",
  search: "Search project files for a regular expression. Returns file:line: text for each match.",
  edit_file:
    "Replace one exact occurrence of old_string with new_string in a file. With an empty old_string, creates the file.",
  run_command: "Run a shell command in the project root, e.g. the test suite. 60 second timeout. Background processes are stopped when the command ends.",
};

export const toolDefinitions: Anthropic.Beta.BetaTool[] = (Object.keys(schemas) as ToolName[]).map((name) => ({
  name,
  description: descriptions[name],
  input_schema: z.toJSONSchema(schemas[name]) as Anthropic.Beta.BetaTool.InputSchema,
  eager_input_streaming: true,
}));

export interface ToolResult {
  content: string;
  isError: boolean;
}

export async function runTool(root: string, name: string, input: unknown): Promise<ToolResult> {
  if (!(name in schemas)) return { content: `Unknown tool: ${name}`, isError: true };
  const parsed = schemas[name as ToolName].safeParse(input);
  if (!parsed.success) return { content: `Invalid input: ${parsed.error.message}`, isError: true };
  try {
    const realRoot = await fs.realpath(root);
    const content = await handlers[name as ToolName](realRoot, parsed.data as never);
    return { content, isError: false };
  } catch (err) {
    return { content: err instanceof Error ? err.message : String(err), isError: true };
  }
}

const handlers: { [K in ToolName]: (root: string, input: z.infer<(typeof schemas)[K]>) => Promise<string> } = {
  async list_files(root, { path: rel }) {
    const start = await insideRoot(root, rel);
    const out: string[] = [];
    async function walk(dir: string) {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (out.length >= MAX_LIST_ENTRIES) return;
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else out.push(path.relative(root, full));
      }
    }
    await walk(start);
    return out.length ? out.join("\n") : "(no files)";
  },

  async read_file(root, { path: rel }) {
    const file = await insideRoot(root, rel);
    const buf = await fs.readFile(file);
    const text = buf.subarray(0, MAX_READ_BYTES).toString("utf8");
    return buf.length > MAX_READ_BYTES ? `${text}\n[truncated: file is ${buf.length} bytes]` : text;
  },

  async search(root, { pattern, path: rel }) {
    const re = new RegExp(pattern);
    const start = await insideRoot(root, rel);
    const matches: string[] = [];
    async function visit(p: string) {
      if (matches.length >= MAX_SEARCH_MATCHES) return;
      const stat = await fs.stat(p);
      if (stat.isDirectory()) {
        for (const name of await fs.readdir(p)) if (!SKIP_DIRS.has(name)) await visit(path.join(p, name));
        return;
      }
      if (stat.size > MAX_READ_BYTES) return;
      const lines = (await fs.readFile(p, "utf8")).split("\n");
      lines.forEach((line, i) => {
        if (matches.length < MAX_SEARCH_MATCHES && re.test(line)) {
          matches.push(`${path.relative(root, p)}:${i + 1}: ${line}`);
        }
      });
    }
    await visit(start);
    return matches.length ? matches.join("\n") : "(no matches)";
  },

  async edit_file(root, { path: rel, old_string, new_string }) {
    const file = await insideRoot(root, rel);
    if (old_string === "") {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, new_string, { flag: "wx" });
      return `Created ${rel}`;
    }
    const text = await fs.readFile(file, "utf8");
    const count = text.split(old_string).length - 1;
    if (count !== 1) throw new Error(`old_string must appear exactly once in ${rel}, found ${count}`);
    await fs.writeFile(
      file,
      text.replace(old_string, () => new_string),
    );
    return `Edited ${rel}`;
  },

  async run_command(root, { command }) {
    return (await runShell(root, command)).text;
  },
};

/**
 * Runs a shell command in `root` with a timeout, an output limit and no secrets in its environment. `text` is the
 * output plus how it ended; `ok` is true only for exit code 0. Also used by the evals to run a task's check.
 */
export function runShell(root: string, command: string): Promise<{ text: string; ok: boolean }> {
  return new Promise((resolve) => {
    // Its own process group, so bash and everything it starts can be killed together. Node's `timeout` signals
    // only bash, and anything left running keeps the output pipes open, so "close" would never fire.
    const child = spawn("bash", ["-c", command], { cwd: root, env: safeEnv(), detached: true });
    const group = child.pid;
    if (group) trackGroup(group);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (group) killGroup(group);
    }, COMMAND_TIMEOUT_MS);

    let output = "";
    const collect = (chunk: Buffer) => {
      if (output.length < MAX_OUTPUT_CHARS) output += chunk.toString("utf8");
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    // Background processes (a dev server, a watcher) don't outlive the command; otherwise the call never returns.
    child.on("exit", () => group && killGroup(group));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (group) untrackGroup(group);
      const cut = output.length >= MAX_OUTPUT_CHARS ? "\n[output truncated]" : "";
      const status = timedOut
        ? `killed after the ${COMMAND_TIMEOUT_MS / 1000} second timeout`
        : signal
          ? `killed by ${signal}`
          : `exit code ${code}`;
      resolve({
        text: `${output.slice(0, MAX_OUTPUT_CHARS)}${cut}\n[${status}]`,
        ok: !timedOut && !signal && code === 0,
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      if (group) untrackGroup(group);
      resolve({ text: `Failed to start: ${err.message}`, ok: false });
    });
  });
}

/**
 * Resolves `rel` inside `root`, following symlinks, and throws if it ends up outside. Paths that don't exist yet
 * (new files) are checked through their nearest existing parent.
 */
async function insideRoot(root: string, rel: string): Promise<string> {
  const realRoot = await fs.realpath(root);
  const target = path.resolve(realRoot, rel);
  let existing = target;
  const rest: string[] = [];
  while (true) {
    try {
      existing = await fs.realpath(existing);
      break;
    } catch {
      rest.unshift(path.basename(existing));
      existing = path.dirname(existing);
    }
  }
  const resolved = path.join(existing, ...rest);
  const relative = path.relative(realRoot, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error(`Path is outside the project: ${rel}`);
  return resolved;
}

/** Only what commands need to run. API keys and other secrets never reach the agent's shell. */
/** Process groups of commands still running. A detached group doesn't get the terminal's Ctrl-C, so we pass it on. */
const runningGroups = new Set<number>();
const EXIT_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

function killGroup(group: number) {
  try {
    process.kill(-group, "SIGKILL");
  } catch {
    // ESRCH: the group has already exited.
  }
}

function killAllGroups() {
  for (const group of runningGroups) killGroup(group);
}

/** Kills the group, then exits the way the signal would have; listeners exist only while a command runs. */
function onExitSignal(signal: NodeJS.Signals) {
  killAllGroups();
  stopListening();
  process.kill(process.pid, signal);
}

function stopListening() {
  for (const s of EXIT_SIGNALS) process.off(s, onExitSignal);
  process.off("exit", killAllGroups);
}

function trackGroup(group: number) {
  if (runningGroups.size === 0) {
    for (const s of EXIT_SIGNALS) process.on(s, onExitSignal);
    process.on("exit", killAllGroups);
  }
  runningGroups.add(group);
}

function untrackGroup(group: number) {
  runningGroups.delete(group);
  if (runningGroups.size === 0) stopListening();
}

function safeEnv(): NodeJS.ProcessEnv {
  const keep = ["PATH", "HOME", "LANG", "TERM", "TMPDIR", "SHELL", "USER"];
  return Object.fromEntries(keep.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
}
