import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { db, schema } from "./db/index.js";
import { env, isProduction } from "./env.js";
import { sendEmail, type Email } from "./email/send.js";
import * as mail from "./email/templates.js";

/**
 * Sends without making the request wait. Response time then doesn't reveal
 * whether an email was sent (e.g. whether an account exists for a reset).
 * Failures are logged, never silently dropped.
 */
function deliver(email: Email) {
  sendEmail(email).catch((err) => console.error(`[email] ${err instanceof Error ? err.message : err}`));
}

const socialProviders = {
  ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
    ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
    : {}),
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: "select_account" as const } }
    : {}),
};

export const auth = betterAuth({
  appName: "Orca",
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.WEB_ORIGINS,
  database: drizzleAdapter(db, { provider: "pg", schema }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => deliver(mail.resetPassword(user, url)),
    onPasswordReset: async ({ user }) => deliver(mail.passwordChanged(user)),
    // Sign-up with a taken email looks like a normal sign-up to the caller;
    // the real owner gets told instead. This prevents account enumeration.
    onExistingUserSignUp: async ({ user }) => deliver(mail.existingAccountSignUp(user)),
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => deliver(mail.verifyEmail(user, url)),
  },

  user: {
    changeEmail: {
      enabled: true,
      // The current address approves first; then the new address gets a verification email.
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) =>
        deliver(mail.confirmEmailChange(user, newEmail, url)),
    },
    deleteUser: {
      enabled: true,
      deleteTokenExpiresIn: 60 * 60 * 24,
      sendDeleteAccountVerification: async ({ user, url }) => deliver(mail.confirmAccountDeletion(user, url)),
    },
  },

  socialProviders,
  account: {
    accountLinking: {
      enabled: true,
      // Google and GitHub verify emails, so signing in with one links to an existing verified account.
      trustedProviders: ["google", "github"],
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/request-password-reset": { window: 300, max: 3 },
      "/send-verification-email": { window: 300, max: 3 },
      "/change-email": { window: 300, max: 3 },
      "/change-password": { window: 300, max: 5 },
      "/delete-user": { window: 300, max: 3 },
    },
  },

  advanced: {
    useSecureCookies: isProduction,
    cookiePrefix: "orca",
  },

  hooks: {
    // Reset-password has its own notice above; a signed-in password change gets the same one.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/change-password") return;
      const returned = ctx.context.returned;
      const user = ctx.context.session?.user;
      if (user && returned && !isAPIError(returned)) deliver(mail.passwordChanged(user));
    }),
  },
});

export type Session = typeof auth.$Infer.Session;
