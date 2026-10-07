import Fastify from "fastify";
import cors from "@fastify/cors";

const PORT = Number(process.env.PORT ?? 4000);

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get("/health", async () => ({ status: "ok", name: "orca-server" }));

await app.listen({ port: PORT, host: "127.0.0.1" });
