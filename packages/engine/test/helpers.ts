import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import { afterAll } from "vitest";
import { fixtureRepo } from "../src/workspace.js";

export const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/buggy-project");

export const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

export const exists = (p: string) =>
  fs.stat(p).then(
    () => true,
    () => false,
  );

const made: string[] = [];
afterAll(async () => {
  for (const dir of made.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});

/** A throwaway git repo with the buggy test project in it, removed after the test file finishes. */
export async function testRepo(): Promise<string> {
  const repo = await fixtureRepo(FIXTURE);
  made.push(repo);
  return repo;
}

export const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

/** A model reply that calls one tool. */
export const toolTurn = (name: string, input: unknown, id = `call_${Math.random().toString(36).slice(2)}`) => ({
  stop_reason: "tool_use",
  usage,
  content: [{ type: "tool_use", id, name, input }],
});

export const endTurn = (text = "Done.") => ({ stop_reason: "end_turn", usage, content: [{ type: "text", text }] });

/** A client whose nth reply (from 1) comes from `reply(n)`. Only the one call the worker makes is implemented. */
export function scriptedClient(reply: (n: number) => unknown): Anthropic {
  let n = 0;
  const stream = () => ({
    on() {
      return this;
    },
    finalMessage: async () => reply(++n),
  });
  return { beta: { messages: { stream } } } as unknown as Anthropic;
}
