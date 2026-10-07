import type { Email } from "./send.js";

// Transactional emails. Table layout and inline styles, because email clients
// ignore most CSS. Every email has a plain-text version too.

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const greeting = (name?: string | null) => (name?.trim() ? `Hi ${name.trim()},` : "Hi,");

interface Layout {
  to: string;
  subject: string;
  name?: string | null;
  /** Paragraphs of the message, plain text. */
  body: string[];
  action?: { label: string; url: string };
  /** Small print under the button, e.g. expiry and "ignore if this wasn't you". */
  footnote: string;
}

function render({ to, subject, name, body, action, footnote }: Layout): Email {
  const paragraphs = [greeting(name), ...body]
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#20384a">${esc(p)}</p>`)
    .join("");

  const button = action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:9px;background:#0a87a3">
         <a href="${esc(action.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9px">${esc(action.label)}</a>
       </td></tr></table>
       <p style="margin:0 0 20px;font-size:12.5px;line-height:1.5;color:#5a7282">If the button doesn't work, paste this link into your browser:<br>
         <a href="${esc(action.url)}" style="color:#0a87a3;word-break:break-all">${esc(action.url)}</a></p>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#e9f0f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9f0f4;padding:32px 16px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #d3e0e8;border-radius:16px">
      <tr><td style="padding:28px 32px 8px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
        <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#0b2130;margin-bottom:24px">Orca</div>
        <h1 style="margin:0 0 18px;font-size:22px;line-height:1.25;color:#0b2130">${esc(subject)}</h1>
        ${paragraphs}
        ${button}
        <p style="margin:0 0 24px;padding-top:16px;border-top:1px solid #e3ecf1;font-size:12.5px;line-height:1.5;color:#5a7282">${esc(footnote)}</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

  const text = [
    greeting(name),
    "",
    ...body.flatMap((p) => [p, ""]),
    ...(action ? [`${action.label}: ${action.url}`, ""] : []),
    footnote,
  ].join("\n");

  return { to, subject, html, text };
}

type User = { email: string; name?: string | null };

export const verifyEmail = (user: User, url: string) =>
  render({
    to: user.email,
    subject: "Verify your email",
    name: user.name,
    body: ["Confirm this email address to finish setting up your Orca account."],
    action: { label: "Verify email", url },
    footnote: "This link expires in 1 hour. If you didn't create an Orca account, you can ignore this email.",
  });

export const resetPassword = (user: User, url: string) =>
  render({
    to: user.email,
    subject: "Reset your password",
    name: user.name,
    body: ["We received a request to reset the password for your Orca account."],
    action: { label: "Choose a new password", url },
    footnote: "This link expires in 1 hour. If you didn't ask to reset your password, ignore this email; your password stays the same.",
  });

export const passwordChanged = (user: User) =>
  render({
    to: user.email,
    subject: "Your password was changed",
    name: user.name,
    body: [
      "The password for your Orca account was just changed, and you were signed out on your other devices.",
      "If you made this change, there's nothing else to do.",
    ],
    footnote: "If you didn't change your password, reset it right away from the sign-in page and check your account.",
  });

export const confirmEmailChange = (user: User, newEmail: string, url: string) =>
  render({
    to: user.email,
    subject: "Confirm your new email address",
    name: user.name,
    body: [`Someone asked to change the email on your Orca account from ${user.email} to ${newEmail}.`],
    action: { label: "Approve the change", url },
    footnote: "If you didn't ask for this, ignore this email and your address stays the same.",
  });

export const confirmAccountDeletion = (user: User, url: string) =>
  render({
    to: user.email,
    subject: "Confirm account deletion",
    name: user.name,
    body: [
      "You asked to delete your Orca account. This removes your account and all of its data, and it can't be undone.",
    ],
    action: { label: "Delete my account", url },
    footnote: "This link expires in 24 hours. If you didn't ask for this, ignore this email and your account stays as it is.",
  });

export const existingAccountSignUp = (user: User) =>
  render({
    to: user.email,
    subject: "Someone tried to sign up with your email",
    name: user.name,
    body: [
      "There was an attempt to create a new Orca account with this email address, but you already have one.",
      "If that was you, sign in instead. If you've forgotten your password, use “Forgot password” on the sign-in page.",
    ],
    footnote: "If this wasn't you, no action is needed. Nobody can create a second account with your email.",
  });
