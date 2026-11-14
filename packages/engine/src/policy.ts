import fs from "node:fs";
import path from "node:path";

// Decides what happens to each tool call before it runs. Pure and synchronous on purpose: the gate node calls it
// before `interrupt()`, and that code runs again on resume, so it must have no side effects.

export type Verdict = "allow" | "ask" | "deny";

export interface Decision {
  verdict: Verdict;
  reason: string;
}

/** Commands that are never allowed, even with approval. A backstop; asking the human is the real guard. */
const DENIED_COMMANDS: [RegExp, string][] = [
  [/\bsudo\b|\bsu\s/, "runs as another user"],
  [/\brm\s+(-\w*\s+)*-\w*[rf]\w*\s+(\/|~|\$HOME|\.\.)/, "deletes outside the project"],
  [/\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b/, "pipes a download into a shell"],
  [/\bgit\s+push\b/, "pushes to a remote"],
  [/\bgit\s+(reset\s+--hard|clean\s+-\w*f)/, "throws away work"],
  // `dd if=` sits outside the \b group: there is no word boundary after "=", so it never matched there.
  [/\b(mkfs|shutdown|reboot)\b|\bdd\s+if=/, "touches the system"],
  [/:\(\)\s*\{/, "fork bomb"],
  [/\bchmod\s+(-R\s+)?[0-7]*7{2}\b/, "makes files world-writable"],
  [/(^|[\s'"=])(~|\$HOME)(\/|\s|$)|\.\.\//, "reaches outside the project"],
];

/**
 * Local secrets files (.env, .env.local, ...), copied into the run so the project works. Reading one needs a yes, so
 * secrets reach the model only when the human agrees. Example and template files are fine.
 */
export const SECRETS_FILE = /(^|\/)\.env(\.(?!example$|sample$|template$)[^/]+)?$/;

/**
 * Commands that reach beyond the run's own copy of the project. Everything else runs without asking when the project
 * holds no secrets files: the agent works in a throwaway worktree on its own branch, so ordinary commands (tests,
 * builds, scripts, editing with sed) can't harm the user's project, and a yes for each one only gets in the way.
 */
const ASK_COMMANDS: [RegExp, string][] = [
  [
    /\b(npm|pnpm|yarn|bun)\s+(i|install|add|ci|update|upgrade|remove|uninstall|dlx)\b|\bnpx\s+(-y|--yes)\b|\b(pip3?|pipx|poetry|uv)\s+(pip\s+)?(install|add)\b|\b(cargo|go|gem|composer|brew)\s+(add|get|install|require)\b|\bbundle\s+install\b/,
    "installs packages",
  ],
  [/\b(curl|wget|ssh|scp|rsync|nc|ncat|telnet|ftp)\b|\bgit\s+(clone|fetch|pull|remote)\b/, "uses the network"],
  [
    /\bgit\s+(checkout|switch|reset|rebase|merge|stash|cherry-pick|revert|tag|worktree|commit\s+--amend|branch\s+-[dDmM])\b/,
    "changes git branches or history",
  ],
  [/(^|[\s'"=/])\.env(?!\.(example|sample|template)\b)(\.\w+)?\b/, "touches a secrets file"],
];

/** Folders never searched for secrets files: installed packages, build output and git's own data. */
const SKIP_DIRS = new Set(["node_modules", ".git", ".venv", "venv", "vendor", "dist"]);

/**
 * Whether the project holds a secrets file. Any command can read one through a script or an interpreter
 * (`node -e`, `npm test`...), which no check on the command text can see, so commands run without a yes only where
 * there is none: a worktree run, which never gets .env files copied in. Looks a few folders deep to stay quick.
 */
function hasSecretsFile(dir: string, depth = 4): boolean {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e.isFile() && SECRETS_FILE.test(e.name)) return true;
    if (e.isDirectory() && depth > 0 && !SKIP_DIRS.has(e.name) && hasSecretsFile(path.join(dir, e.name), depth - 1))
      return true;
  }
  return false;
}

/** Top-level folders of macOS and Linux. /dev is left out, for /dev/null and friends. */
const SYSTEM_DIRS =
  /^\/(Users|home|root|etc|var|tmp|private|opt|usr|bin|sbin|lib|System|Library|Applications|Volumes|mnt|media|proc|sys|srv|boot|nix|cores)(\/|$)/;

/** An absolute path in a command that isn't inside the project. */
function outsidePath(root: string, command: string): string | null {
  // Turn the project's own paths into "." first, since they may contain spaces ("/Users/me/My Projects/app").
  let rest = command;
  for (const r of new Set([fs.existsSync(root) ? fs.realpathSync(root) : root, root])) rest = rest.split(r).join(".");
  for (const [, p] of rest.matchAll(/(?:^|[\s'"=<>|;&(])(\/[^\s'";|&()<>]*)/g)) {
    // Only real top-level folders count, so a regex such as /[a-z]+/ in a sed command isn't taken for a path.
    if (SYSTEM_DIRS.test(p!)) return p!;
  }
  return null;
}

export function decide(root: string, name: string, input: unknown): Decision {
  const args = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "read_file":
      if (SECRETS_FILE.test(String(args.path ?? ""))) return { verdict: "ask", reason: "reads a secrets file" };
      return { verdict: "allow", reason: "reads only" };
    case "list_files":
    case "search":
      return { verdict: "allow", reason: "reads only" };

    case "edit_file": {
      const rel = String(args.path ?? "");
      if (SECRETS_FILE.test(rel)) return { verdict: "ask", reason: `changes ${rel}, a secrets file` };
      const creates = args.old_string === "" || !fs.existsSync(path.resolve(root, rel));
      return { verdict: "allow", reason: creates ? `creates ${rel}` : `edits ${rel}` };
    }

    case "run_command": {
      const command = String(args.command ?? "");
      for (const [pattern, why] of DENIED_COMMANDS) {
        if (pattern.test(command)) return { verdict: "deny", reason: `Denied: the command ${why}.` };
      }
      for (const [pattern, why] of ASK_COMMANDS) {
        if (pattern.test(command)) return { verdict: "ask", reason: why };
      }
      const outside = outsidePath(root, command);
      if (outside) return { verdict: "ask", reason: `uses ${outside}, outside the project` };
      if (hasSecretsFile(root)) return { verdict: "ask", reason: "could read the project's .env secrets" };
      return { verdict: "allow", reason: "runs inside the project" };
    }

    default:
      return { verdict: "deny", reason: `Denied: unknown tool ${name}.` };
  }
}
