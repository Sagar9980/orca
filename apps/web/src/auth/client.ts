import { createAuthClient } from "better-auth/react";

export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
});

/** Absolute URL in this web app, for links the server puts in emails or redirects to. */
export const appUrl = (path: string) => new URL(path, window.location.origin).toString();

export type SocialProvider = "github" | "google";

export interface AuthConfig {
  socialProviders: SocialProvider[];
  minPasswordLength: number;
}

const FALLBACK_CONFIG: AuthConfig = { socialProviders: [], minPasswordLength: 10 };
let configPromise: Promise<AuthConfig> | null = null;

/** Which sign-in methods the server has turned on. Fetched once per page load. */
export function loadAuthConfig(): Promise<AuthConfig> {
  configPromise ??= fetch(`${API_URL}/api/auth-config`)
    .then((r) => (r.ok ? (r.json() as Promise<AuthConfig>) : FALLBACK_CONFIG))
    .catch(() => FALLBACK_CONFIG);
  return configPromise;
}

/** Turns Better Auth error codes into sentences a person can act on. */
export function describeError(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!error) return "Something went wrong. Try again.";
  if (error.status === 429) return "Too many attempts. Wait a minute, then try again.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match. Check them, or reset your password.";
    case "EMAIL_NOT_VERIFIED":
      return "Verify your email first. We just sent you a new link.";
    case "INVALID_EMAIL":
      return "Enter a valid email address.";
    case "PASSWORD_TOO_SHORT":
      return "That password is too short.";
    case "PASSWORD_TOO_LONG":
      return "That password is too long. Use 128 characters or fewer.";
    case "INVALID_PASSWORD":
      return "Your current password is incorrect.";
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return "This link has expired or was already used. Request a new one.";
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return "This account doesn't have a password yet. Use “Forgot password” to set one.";
    case "SESSION_EXPIRED":
      return "For security, sign in again before making this change.";
    case "FAILED_TO_UNLINK_LAST_ACCOUNT":
      return "You can't disconnect your only way to sign in.";
  }
  if (error.status === 0 || error.message?.includes("fetch")) return "Can't reach the Orca server. Check that it's running.";
  return error.message || "Something went wrong. Try again.";
}
