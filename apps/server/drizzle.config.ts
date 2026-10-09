/// <reference types="node" />
import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't read .env itself.
try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on the real environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
});
