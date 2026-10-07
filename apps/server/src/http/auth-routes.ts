import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth, type Session } from "../auth.js";
import { env } from "../env.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by `requireSession` on protected routes. */
    session?: Session;
  }
}

/** Mounts Better Auth at /api/auth/* by converting Fastify requests to Fetch requests. */
export async function authRoutes(app: FastifyInstance) {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      // Build the URL from our configured origin, not the Host header, so it can't be spoofed.
      const url = new URL(request.url, env.BETTER_AUTH_URL);
      const hasBody = request.method !== "GET" && request.body !== undefined;
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          body: hasBody ? JSON.stringify(request.body) : undefined,
        }),
      );

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== "set-cookie") reply.header(key, value);
      });
      // Several cookies can be set at once; Headers.forEach would merge them into one.
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header("set-cookie", cookies);
      return reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
    },
  });
}

/** preHandler for routes that need a signed-in, verified user. Replies 401 otherwise. */
export async function requireSession(request: FastifyRequest, reply: FastifyReply) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) return reply.status(401).send({ error: "unauthorized", message: "Sign in to continue." });
  request.session = session;
}
