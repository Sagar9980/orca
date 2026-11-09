import { app, safeStorage } from "electron";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// The user's Anthropic key, encrypted with the OS keychain (safeStorage) in the app's data folder. It never goes
// to our server or the page: the page learns only whether a key is set and its last four characters.

/** What the page may know about the key. */
export interface KeyStatus {
  /** "saved" in the keychain, "dev" from packages/engine/.env in development, or none. */
  source: "saved" | "dev" | null;
  /** The key's last four characters, so the user can tell which key it is. */
  last4: string | null;
}

const file = () => path.join(app.getPath("userData"), "anthropic-key");

const store = async (key: string) => writeFile(file(), await safeStorage.encryptStringAsync(key), { mode: 0o600 });

/** Decrypting can ask the OS for keychain access, so it happens once per app session. */
let saved: Promise<string | null> | undefined;

function savedKey(): Promise<string | null> {
  saved ??= (async () => {
    if (!existsSync(file())) return null;
    try {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(await readFile(file()));
      if (shouldReEncrypt) await store(result);
      return result;
    } catch {
      // Unreadable, or encrypted by another install: treat it as missing so the user can save it again.
      return null;
    }
  })();
  return saved;
}

/** The key for a run: the saved one, else ANTHROPIC_API_KEY (loaded from packages/engine/.env in development). */
export async function apiKey(): Promise<string | undefined> {
  return (await savedKey()) ?? process.env.ANTHROPIC_API_KEY ?? undefined;
}

export async function keyStatus(): Promise<KeyStatus> {
  const key = await savedKey();
  const env = process.env.ANTHROPIC_API_KEY;
  if (key) return { source: "saved", last4: key.slice(-4) };
  if (env) return { source: "dev", last4: env.slice(-4) };
  return { source: null, last4: null };
}

/** Checks the key with Anthropic (listing models is free), then saves it encrypted. */
export async function saveKey(input: unknown): Promise<KeyStatus> {
  const key = typeof input === "string" ? input.trim() : "";
  if (!/^sk-ant-[\w-]{20,300}$/.test(key)) throw new Error("That doesn't look like an Anthropic API key (sk-ant-…).");
  // On Linux without a keyring, safeStorage "encrypts" with a fixed password; that is no better than plain text.
  const plainText = process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text";
  if (plainText || !(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error("This computer has no keychain Orca can use to encrypt the key.");
  }

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Couldn't reach Anthropic to check the key. Check your connection and try again.");
  }
  if (res.status === 401 || res.status === 403) throw new Error("Anthropic didn't accept that key.");
  if (!res.ok) throw new Error(`Anthropic couldn't check the key right now (HTTP ${res.status}). Try again.`);

  await store(key);
  saved = Promise.resolve(key);
  return keyStatus();
}

export async function removeKey(): Promise<KeyStatus> {
  await rm(file(), { force: true });
  saved = Promise.resolve(null);
  return keyStatus();
}
