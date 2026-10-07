import { z } from "zod";

// All configuration comes from the environment (see .env.example).
// The server refuses to start if anything required is missing or malformed.

const optional = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().default("127.0.0.1"),

    DATABASE_URL: z.url(),

    /** Public URL of this server. Links in emails point here. */
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    /** Comma-separated origins allowed to call the API with cookies (the web app). */
    WEB_ORIGINS: z
      .string()
      .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean))
      .pipe(z.array(z.url()).min(1)),

    /** "resend" sends real email. "log" prints emails to the console (development only). */
    EMAIL_TRANSPORT: z.enum(["resend", "log"]).default("resend"),
    RESEND_API_KEY: optional,
    /** e.g. "Orca <auth@yourdomain.com>". The domain must be verified in Resend. */
    EMAIL_FROM: z.string().min(3),

    GITHUB_CLIENT_ID: optional,
    GITHUB_CLIENT_SECRET: optional,
    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_TRANSPORT === "resend" && !env.RESEND_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "Required when EMAIL_TRANSPORT=resend" });
    }
    if (env.EMAIL_TRANSPORT === "log" && env.NODE_ENV === "production") {
      ctx.addIssue({ code: "custom", path: ["EMAIL_TRANSPORT"], message: "Cannot be 'log' in production" });
    }
    for (const p of ["GITHUB", "GOOGLE"] as const) {
      if (Boolean(env[`${p}_CLIENT_ID`]) !== Boolean(env[`${p}_CLIENT_SECRET`])) {
        ctx.addIssue({ code: "custom", path: [`${p}_CLIENT_SECRET`], message: `Set both ${p}_CLIENT_ID and ${p}_CLIENT_SECRET, or neither` });
      }
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
  console.error(`Invalid server environment:\n${lines.join("\n")}\nSee apps/server/.env.example.`);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
