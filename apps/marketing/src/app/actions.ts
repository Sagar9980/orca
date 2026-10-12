"use server";

import { Resend } from "resend";

export type InterestState = { status: "idle" | "sent" | "error"; message: string; email?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Emails the owner (INTEREST_TO) when someone leaves their email on the landing page. */
export async function sendInterest(_prev: InterestState, form: FormData): Promise<InterestState> {
  const email = String(form.get("email") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();

  // Hidden field only bots fill in: pretend it worked and send nothing.
  if (form.get("website")) return { status: "sent", message: "", email };

  if (email.length > 254 || !EMAIL.test(email)) {
    return { status: "error", message: "That email doesn't look right." };
  }
  if (note.length > 500) return { status: "error", message: "Keep the note under 500 characters." };

  const { RESEND_API_KEY, INTEREST_FROM, INTEREST_TO } = process.env;
  if (!RESEND_API_KEY || !INTEREST_FROM || !INTEREST_TO) {
    console.error("Interest form: set RESEND_API_KEY, INTEREST_FROM and INTEREST_TO (see .env.example).");
    return { status: "error", message: "Couldn't send that just now. Try again later." };
  }

  const { error } = await new Resend(RESEND_API_KEY).emails.send({
    from: INTEREST_FROM,
    to: INTEREST_TO,
    replyTo: email,
    subject: `Orca interest: ${email}`,
    text: [
      `${email} is interested in Orca.`,
      "",
      "What they'd build:",
      note || "(not given)",
      "",
      "Reply to this email to answer them.",
    ].join("\n"),
  });
  if (error) {
    console.error(`Interest form: Resend could not send: ${error.name}: ${error.message}`);
    return { status: "error", message: "Couldn't send that just now. Try again later." };
  }
  return { status: "sent", message: "", email };
}
