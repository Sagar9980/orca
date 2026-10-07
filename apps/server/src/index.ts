import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.js";
import { pool } from "./db/index.js";
import { authRoutes, requireSession } from "./http/auth-routes.js";
import { enabledSocialProviders, MIN_PASSWORD_LENGTH } from "./auth.js";

const app = Fastify({ logger: true, trustProxy: env.NODE_ENV === "production" });

// Only the web app's origins may call the API with cookies.
await app.register(cors, {
  origin: env.WEB_ORIGINS,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  maxAge: 86400,
});

await app.register(authRoutes);

app.get("/health", async () => ({ status: "ok", name: "orca-server" }));

/** Public: which sign-in methods the web app should offer. */
app.get("/api/auth-config", async () => ({
  socialProviders: enabledSocialProviders,
  minPasswordLength: MIN_PASSWORD_LENGTH,
}));

app.get("/api/me", { preHandler: requireSession }, async (request) => ({
  user: request.session!.user,
}));

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: env.PORT, host: env.HOST });
