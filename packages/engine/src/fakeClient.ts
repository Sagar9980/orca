import type Anthropic from "@anthropic-ai/sdk";

// A stand-in for the Anthropic client that replays scripted turns, so the real graph, gate, approvals and UI can be
// tried without spending anything. It only implements the one call the worker makes.

interface FakeTurn {
  text: string;
  tool?: { name: string; input: Record<string, unknown> };
}

/** Looks around, asks to run a command, asks to create a file, then finishes. Works on any project. */
const DEMO_TURNS: FakeTurn[] = [
  { text: "I'll look at the project first.", tool: { name: "list_files", input: { path: "." } } },
  { text: "Let me check the git status.", tool: { name: "run_command", input: { command: "git status --short" } } },
  {
    text: "I'll add a small note so the run leaves a change to review.",
    tool: {
      name: "edit_file",
      input: { path: "ORCA_DEMO.md", old_string: "", new_string: "Written by Orca's fake model.\n" },
    },
  },
  { text: "Done. I listed the files, checked git status and added ORCA_DEMO.md." },
];

export function fakeClient({ turns = DEMO_TURNS, delayMs = 700 }: { turns?: FakeTurn[]; delayMs?: number } = {}) {
  let n = 0;
  const stream = () => {
    const turn = turns[Math.min(n++, turns.length - 1)];
    const onText: ((text: string) => void)[] = [];
    return {
      on(event: string, listener: (text: string) => void) {
        if (event === "text") onText.push(listener);
        return this;
      },
      async finalMessage() {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        for (const word of turn.text.split(/(?<= )/)) onText.forEach((l) => l(word));
        const content: unknown[] = [{ type: "text", text: turn.text }];
        if (turn.tool) content.push({ type: "tool_use", id: `fake_${n}`, ...turn.tool });
        return {
          content,
          stop_reason: turn.tool ? "tool_use" : "end_turn",
          usage: { input_tokens: 1500, output_tokens: 120, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        };
      },
    };
  };
  return { beta: { messages: { stream } } } as unknown as Anthropic;
}
