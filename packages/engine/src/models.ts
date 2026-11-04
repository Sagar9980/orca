// Models the worker can run, with list prices so budgets can be enforced. A model missing here can't be used,
// because a run on it couldn't be stopped at its budget.

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

interface ModelInfo {
  /** US dollars per million tokens. Cache writes are 1.25x input. */
  input: number;
  output: number;
  cacheRead: number;
  /** Prompts above this many tokens are billed at `longPrompt` rates instead. */
  longPromptOver?: number;
  longPrompt?: { input: number; output: number; cacheRead: number };
  /** Supports the server-side refusal fallback (`fallbacks: "default"`). */
  fallbacks: boolean;
}

export const MODELS: Record<string, ModelInfo> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, fallbacks: true },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, fallbacks: true },
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    longPromptOver: 100_000,
    longPrompt: { input: 0.5, output: 2.5, cacheRead: 0.05 },
    fallbacks: false,
  },
};

/** Cheap enough to test with freely. Use Opus for real tasks and quality checks. */
export const DEFAULT_MODEL = "claude-haiku-5-5";

export function modelInfo(model: string): ModelInfo {
  const info = MODELS[model];
  if (!info) throw new Error(`Unknown model ${model}. Known: ${Object.keys(MODELS).join(", ")}`);
  return info;
}

/** Cost of one response. Per response, since long-prompt pricing depends on that request's prompt size. */
export function costUsd(model: string, usage: Usage): number {
  const info = modelInfo(model);
  const prompt = usage.input + usage.cacheRead + usage.cacheWrite;
  const rates = info.longPromptOver && info.longPrompt && prompt > info.longPromptOver ? info.longPrompt : info;
  return (
    (usage.input * rates.input +
      usage.cacheWrite * rates.input * 1.25 +
      usage.cacheRead * rates.cacheRead +
      usage.output * rates.output) /
    1_000_000
  );
}
