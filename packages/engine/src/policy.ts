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
  [/\b(mkfs|dd\s+if=|shutdown|reboot)\b/, "touches the system"],
  [/:\(\)\s*\{/, "fork bomb"],
  [/\bchmod\s+(-R\s+)?[0-7]*7{2}\b/, "makes files world-writable"],
  [/(^|[\s'"=])(~|\$HOME)(\/|\s|$)|\.\.\//, "reaches outside the project"],
];

/** Files the normal edit flow doesn't touch. Changing them needs a yes. */
const SENSITIVE_FILES = /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|\.[^/]+)$/;

export function decide(root: string, name: string, input: unknown): Decision {
  const args = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "read_file":
    case "list_files":
    case "search":
      return { verdict: "allow", reason: "reads only" };

    case "edit_file": {
      const rel = String(args.path ?? "");
      if (SENSITIVE_FILES.test(rel)) return { verdict: "ask", reason: `changes ${rel}, a config or dot file` };
      if (args.old_string === "" || !fs.existsSync(path.resolve(root, rel))) {
        return { verdict: "ask", reason: `creates a new file, ${rel}` };
      }
      return { verdict: "allow", reason: "edits an existing project file" };
    }

    case "run_command": {
      const command = String(args.command ?? "");
      for (const [pattern, why] of DENIED_COMMANDS) {
        if (pattern.test(command)) return { verdict: "deny", reason: `Denied: the command ${why}.` };
      }
      return { verdict: "ask", reason: "runs a shell command" };
    }

    default:
      return { verdict: "deny", reason: `Denied: unknown tool ${name}.` };
  }
}
