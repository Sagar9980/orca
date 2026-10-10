import { useEffect, useState, type SyntheticEvent } from "react";
import { clearQuery, Link, navigate, useLocation } from "../router";
import { appUrl, authClient, describeError } from "./client";
import { AuthLayout, Field, Notice, PasswordField, SocialButtons, Submit, useAuthConfig } from "./ui";

/** Where verification links send people once their email is confirmed. */
const VERIFIED_URL = () => appUrl("/?verified=1");

function useMinPassword() {
  return useAuthConfig()?.minPasswordLength ?? 10;
}

/** An error passed back in the URL by the server (failed verification or social sign-in). */
function useQueryError() {
  const { query } = useLocation();
  const [error] = useState(() => query.get("error"));
  useEffect(() => {
    if (error) clearQuery("error");
  }, [error]);
  return error;
}

export function SignIn() {
  const queryError = useQueryError();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(queryError ? describeError({ code: queryError.toUpperCase() }) : null);
  const [unverified, setUnverified] = useState(false);

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setUnverified(false);
    // No callbackURL here: on success Better Auth's client would redirect to it, reloading the page.
    const { error } = await authClient.signIn.email({ email, password });
    if (!error) {
      setBusy(false);
      return navigate("/", { replace: true });
    }
    if (error.code === "EMAIL_NOT_VERIFIED") {
      // Only reached with the right password, so this resends to the account's real owner.
      await authClient.sendVerificationEmail({ email, callbackURL: VERIFIED_URL() });
      setUnverified(true);
    } else setError(describeError(error));
    setBusy(false);
  };

  return (
    <AuthLayout
      title="Sign in"
      lede="Pick up your runs where you left them."
      footer={
        <>
          New to Orca? <Link to="/sign-up">Create an account</Link>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {unverified && (
        <Notice tone="info">
          Verify your email first. We sent a new link to <strong>{email}</strong>.
        </Notice>
      )}
      <SocialButtons onError={setError} />
      <form className="auth-form" onSubmit={submit} noValidate>
        <Field label="Email" id="signin-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField label="Password" id="signin-password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="auth-row">
          <Link to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}>Forgot password?</Link>
        </div>
        <Submit busy={busy} disabled={!email || !password}>
          Sign in
        </Submit>
      </form>
    </AuthLayout>
  );
}

export function SignUp() {
  const min = useMinPassword();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (password.length < min) return setError(`Use at least ${min} characters for your password.`);
    setBusy(true);
    setError(null);
    const { error } = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: VERIFIED_URL() });
    setBusy(false);
    if (error) setError(describeError(error));
    else setSentTo(email.trim());
  };

  if (sentTo) return <CheckEmail email={sentTo} onChangeEmail={() => setSentTo(null)} />;

  return (
    <AuthLayout
      title="Create your account"
      lede="Describe what you want built. Orca plans it, staffs it and checks it."
      footer={
        <>
          Already have an account? <Link to="/sign-in">Sign in</Link>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <SocialButtons onError={setError} />
      <form className="auth-form" onSubmit={submit} noValidate>
        <Field label="Name" id="signup-name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Email" id="signup-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField
          label="Password"
          id="signup-password"
          autoComplete="new-password"
          required
          minLength={min}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={<PasswordHint password={password} min={min} />}
        />
        <Submit busy={busy} disabled={!name.trim() || !email.trim() || !password}>
          Create account
        </Submit>
      </form>
    </AuthLayout>
  );
}

function PasswordHint({ password, min }: { password: string; min: number }) {
  const left = min - password.length;
  if (!password) return <>At least {min} characters. A short phrase works well.</>;
  if (left > 0) return <>{left} more {left === 1 ? "character" : "characters"} to go.</>;
  return <span className="hint-ok">Long enough.</span>;
}

/** After sign-up: tells the person to check their inbox, with a rate-friendly resend. */
function CheckEmail({ email, onChangeEmail }: { email: string; onChangeEmail: () => void }) {
  const [cooldown, setCooldown] = useState(60);
  const [note, setNote] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    setNote(null);
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: VERIFIED_URL() });
    if (error) setNote({ tone: "error", text: describeError(error) });
    else {
      setNote({ tone: "success", text: "Sent. The newest link is the one that works." });
      setCooldown(60);
    }
  };

  return (
    <AuthLayout
      title="Check your email"
      lede={
        <>
          We sent a link to <strong>{email}</strong>. Open it to verify your address, and you'll be signed in.
        </>
      }
      footer={
        <>
          Wrong address?{" "}
          <button type="button" className="linkbtn" onClick={onChangeEmail}>
            Use a different email
          </button>
        </>
      }
    >
      {note && <Notice tone={note.tone}>{note.text}</Notice>}
      <div className="auth-steps">
        <p>The link works for 1 hour. If you can't find the email, check your spam folder.</p>
        <button type="button" className="btn-secondary" onClick={resend} disabled={cooldown > 0}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend the email"}
        </button>
      </div>
    </AuthLayout>
  );
}

export function ForgotPassword() {
  const { query } = useLocation();
  const [email, setEmail] = useState(() => query.get("email") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: appUrl("/reset-password") });
    setBusy(false);
    if (error) setError(describeError(error));
    else setSent(true);
  };

  return (
    <AuthLayout
      title={sent ? "Check your email" : "Reset your password"}
      lede={
        sent ? (
          <>
            If an account exists for <strong>{email.trim()}</strong>, we've sent a link to reset its password. It works for 1 hour.
          </>
        ) : (
          "Enter the email you sign in with, and we'll send you a link to choose a new password."
        )
      }
      footer={<Link to="/sign-in">Back to sign in</Link>}
    >
      {error && <Notice tone="error">{error}</Notice>}
      {sent ? (
        <div className="auth-steps">
          <button type="button" className="btn-secondary" onClick={() => setSent(false)}>
            Send to a different email
          </button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          <Field label="Email" id="forgot-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Submit busy={busy} disabled={!email.trim()}>
            Send reset link
          </Submit>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPassword() {
  const min = useMinPassword();
  const { query } = useLocation();
  // Read once, then drop the token from the address bar so it isn't left in history.
  const [token] = useState(() => query.get("token"));
  const [linkError] = useState(() => query.get("error"));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => clearQuery("token", "error"), []);

  if (!token || linkError) {
    return (
      <AuthLayout title="This link doesn't work" lede="Reset links expire after 1 hour and work only once." footer={<Link to="/sign-in">Back to sign in</Link>}>
        <div className="auth-steps">
          <Link to="/forgot-password" className="btn-primary">
            Request a new link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Password updated" lede="We signed you out everywhere, so sign in again with your new password.">
        <div className="auth-steps">
          <Link to="/sign-in" className="btn-primary">
            Sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (password.length < min) return setError(`Use at least ${min} characters.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (error) setError(describeError(error));
    else setDone(true);
  };

  return (
    <AuthLayout title="Choose a new password" lede="You'll be signed out on every device, then you can sign in with the new one.">
      {error && <Notice tone="error">{error}</Notice>}
      <form className="auth-form" onSubmit={submit} noValidate>
        <PasswordField
          label="New password"
          id="reset-password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={<PasswordHint password={password} min={min} />}
        />
        <PasswordField label="Repeat it" id="reset-confirm" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Submit busy={busy} disabled={!password || !confirm}>
          Update password
        </Submit>
      </form>
    </AuthLayout>
  );
}

export function Goodbye() {
  return (
    <AuthLayout title="Your account is deleted" lede="Your account and its data are gone. Thanks for trying Orca." footer={<Link to="/sign-up">Create a new account</Link>} />
  );
}
