import { DEVICE_HEADER } from "@orca/shared";
import { API_URL } from "../auth/client";
import { getDevice } from "./desktop";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** JSON request to the Orca server with the session cookie (and, in the desktop app, this device's id). */
export async function api<T>(path: string, { method = "GET", body }: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  // Only send a content type with a body: Fastify rejects an empty JSON body.
  if (body !== undefined) headers["content-type"] = "application/json";
  const device = await getDevice();
  if (device) headers[DEVICE_HEADER] = device.id;

  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the Orca server. Check that it's running.", 0, "network");
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof data.message === "string" ? data.message : "Something went wrong. Try again.";
    throw new ApiError(message, res.status, typeof data.error === "string" ? data.error : "error", data);
  }
  return data as T;
}
