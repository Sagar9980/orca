import { Resend } from "resend";
import { env } from "../env.js";

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const resend = env.EMAIL_TRANSPORT === "resend" ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Sends one email through Resend. With EMAIL_TRANSPORT=log (development only)
 * it prints the email instead, so auth flows can be tested without sending.
 * Throws if Resend rejects the message, so the auth request fails visibly.
 */
export async function sendEmail(email: Email): Promise<void> {
  if (!resend) {
    console.info(`\n[email:log] To: ${email.to}\n[email:log] Subject: ${email.subject}\n${email.text}\n`);
    return;
  }
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  if (error) {
    throw new Error(`Resend could not send "${email.subject}" to ${email.to}: ${error.name}: ${error.message}`);
  }
}
