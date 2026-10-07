import { useCallback, useEffect, useState, type SyntheticEvent, type ReactNode } from "react";
import { OrcaMark } from "../components/icons";
import { clearQuery, Link, navigate, useLocation } from "../router";
import { appUrl, authClient, describeError, type SocialProvider } from "./client";
import { Field, Notice, PasswordField, ProviderIcon, Submit, useAuthConfig } from "./ui";

type SessionData = NonNullable<ReturnType<typeof authClient.useSession>["data"]>;
type Note = { tone: "error" | "info" | "success"; text: ReactNode } | null;

const PROVIDER_LABEL: Record<string, string> = { credential: "Email and password", github: "GitHub", google: "Google" };

export function Account({ session }: { session: SessionData }) {
  const { query } = useLocation();
  const [banner] = useState<Note>(() =>
    query.get("email") === "changed"
      ? { tone: "success", text: "Your email address is updated." }
      : query.get("error")
        ? { tone: "error", text: describeError({ code: query.get("error")!.toUpperCase() }) }
        : null,
  );
  useEffect(() => clearQuery("email", "error"), []);

  const [accounts, setAccounts] = useState<{ id: string; providerId: string }[] | null>(null);
  const loadAccounts = useCallback(async () => {
    const { data } = await authClient.listAccounts();
    setAccounts(data ?? []);
  }, []);
  useEffect(() => void loadAccounts(), [loadAccounts]);
  const hasPassword = accounts?.some((a) => a.providerId === "credential") ?? true;

  const signOut = async () => {
    await authClient.signOut();
    navigate("/sign-in", { replace: true });
  };

  return (
    <div className="account">
      <header className="account-bar">
        <Link to="/" className="brand">
          <OrcaMark />
          Orca
        </Link>
        <div className="ctrls">
          <Link to="/" className="btn">
            Back to console
          </Link>
          <button type="button" className="btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <main className="account-main">
        <div className="account-head">
          <span className="eyebrow">Account</span>
          <h1>{session.user.name || session.user.email}</h1>
          <p>{session.user.email}</p>
        </div>
        {banner && <Notice tone={banner.tone}>{banner.text}</Notice>}

        <ProfileSection session={session} />
        <EmailSection session={session} />
        <PasswordSection hasPassword={hasPassword} email={session.user.email} />
        <MethodsSection accounts={accounts} reload={loadAccounts} />
        <SessionsSection currentId={session.session.id} />
        <DeleteSection />
      </main>
    </div>
  );
}

function Section({ title, description, children, danger }: { title: string; description: ReactNode; children: ReactNode; danger?: boolean }) {
  return (
    <section className={danger ? "acct-section acct-danger" : "acct-section"}>
      <div className="acct-intro">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="acct-body">{children}</div>
    </section>
  );
}

function ProfileSection({ session }: { session: SessionData }) {
  const [name, setName] = useState(session.user.name ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const { error } = await authClient.updateUser({ name: name.trim() });
    setBusy(false);
    setNote(error ? { tone: "error", text: describeError(error) } : { tone: "success", text: "Name saved." });
  };

  return (
    <Section title="Profile" description="The name Orca uses when it talks to you.">
      <form className="acct-form" onSubmit={submit}>
        {note && <Notice tone={note.tone}>{note.text}</Notice>}
        <Field label="Name" id="acct-name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Submit busy={busy} disabled={!name.trim() || name.trim() === session.user.name}>
          Save name
        </Submit>
      </form>
    </Section>
  );
}

function EmailSection({ session }: { session: SessionData }) {
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const target = newEmail.trim();
    const { error } = await authClient.changeEmail({ newEmail: target, callbackURL: appUrl("/account?email=changed") });
    setBusy(false);
    if (error) return setNote({ tone: "error", text: describeError(error) });
    setNewEmail("");
    setNote({
      tone: "info",
      text: (
        <>
          To approve the change, open the email we sent to <strong>{session.user.email}</strong>. Then we'll send a link to <strong>{target}</strong> to verify it.
        </>
      ),
    });
  };

  return (
    <Section
      title="Email"
      description={
        <>
          You sign in with <strong>{session.user.email}</strong>
          {session.user.emailVerified ? <span className="tag tag-ok">Verified</span> : <span className="tag">Not verified</span>}
        </>
      }
    >
      <form className="acct-form" onSubmit={submit}>
        {note && <Notice tone={note.tone}>{note.text}</Notice>}
        <Field label="New email" id="acct-email" type="email" autoComplete="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        <Submit busy={busy} disabled={!newEmail.trim() || newEmail.trim().toLowerCase() === session.user.email.toLowerCase()}>
          Change email
        </Submit>
      </form>
    </Section>
  );
}

function PasswordSection({ hasPassword, email }: { hasPassword: boolean; email: string }) {
  const min = useAuthConfig()?.minPasswordLength ?? 10;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  if (!hasPassword) {
    return (
      <Section title="Password" description="You sign in with a connected account, so you don't have a password yet.">
        <div className="acct-form">
          <p className="muted">To add one, we'll email you a link to set it.</p>
          <Link to={`/forgot-password?email=${encodeURIComponent(email)}`} className="btn-secondary">
            Set a password
          </Link>
        </div>
      </Section>
    );
  }

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (next.length < min) return setNote({ tone: "error", text: `Use at least ${min} characters.` });
    setBusy(true);
    setNote(null);
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: signOutOthers });
    setBusy(false);
    if (error) return setNote({ tone: "error", text: describeError(error) });
    setCurrent("");
    setNext("");
    setNote({ tone: "success", text: "Password changed. We emailed you a notice." });
  };

  return (
    <Section title="Password" description={`At least ${min} characters. We email you whenever it changes.`}>
      <form className="acct-form" onSubmit={submit}>
        {note && <Notice tone={note.tone}>{note.text}</Notice>}
        <PasswordField label="Current password" id="acct-current" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        <PasswordField label="New password" id="acct-new" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={signOutOthers} onChange={(e) => setSignOutOthers(e.target.checked)} />
          Sign out my other devices
        </label>
        <Submit busy={busy} disabled={!current || !next}>
          Change password
        </Submit>
      </form>
    </Section>
  );
}

function MethodsSection({ accounts, reload }: { accounts: { id: string; providerId: string }[] | null; reload: () => Promise<void> }) {
  const config = useAuthConfig();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);
  const linked = new Set(accounts?.map((a) => a.providerId));
  const available = (config?.socialProviders ?? []).filter((p) => !linked.has(p));

  const connect = async (provider: SocialProvider) => {
    setBusy(provider);
    const { error } = await authClient.linkSocial({ provider, callbackURL: appUrl("/account"), errorCallbackURL: appUrl("/account") });
    if (error) {
      setBusy(null);
      setNote({ tone: "error", text: describeError(error) });
    }
  };

  const disconnect = async (accountId: string, providerId: string) => {
    setBusy(providerId);
    setNote(null);
    const { error } = await authClient.unlinkAccount({ accountId });
    setBusy(null);
    if (error) setNote({ tone: "error", text: describeError(error) });
    else {
      setNote({ tone: "success", text: `${PROVIDER_LABEL[providerId] ?? providerId} disconnected.` });
      await reload();
    }
  };

  return (
    <Section title="Sign-in methods" description="Ways you can sign in to this account.">
      <div className="acct-form">
        {note && <Notice tone={note.tone}>{note.text}</Notice>}
        {accounts === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <ul className="acct-list">
            {accounts.map((a) => (
              <li key={a.id}>
                <span className="acct-item">
                  {a.providerId !== "credential" && <ProviderIcon provider={a.providerId as SocialProvider} />}
                  {PROVIDER_LABEL[a.providerId] ?? a.providerId}
                </span>
                {accounts.length > 1 && (
                  <button type="button" className="linkbtn" onClick={() => disconnect(a.id, a.providerId)} disabled={busy !== null}>
                    Disconnect
                  </button>
                )}
              </li>
            ))}
            {available.map((p) => (
              <li key={p}>
                <span className="acct-item muted">
                  <ProviderIcon provider={p} />
                  {PROVIDER_LABEL[p]}
                </span>
                <button type="button" className="btn-secondary btn-small" onClick={() => connect(p)} disabled={busy !== null}>
                  Connect
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

interface DeviceSession {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date | string;
}

/** "Chrome on macOS" from a user-agent string, good enough to recognise a device. */
function describeDevice(ua?: string | null): string {
  if (!ua) return "Unknown device";
  if (ua.includes("Electron")) return "Orca desktop app";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /curl\//.test(ua) ? "curl" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function SessionsSection({ currentId }: { currentId: string }) {
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const load = useCallback(async () => {
    const { data } = await authClient.listSessions();
    setSessions((data as DeviceSession[] | null) ?? []);
  }, []);
  useEffect(() => void load(), [load]);

  const revoke = async (token: string) => {
    setBusy(true);
    const { error } = await authClient.revokeSession({ token });
    setBusy(false);
    if (error) setNote({ tone: "error", text: describeError(error) });
    await load();
  };

  const revokeOthers = async () => {
    setBusy(true);
    const { error } = await authClient.revokeOtherSessions();
    setBusy(false);
    setNote(error ? { tone: "error", text: describeError(error) } : { tone: "success", text: "Signed out of your other devices." });
    await load();
  };

  const others = sessions?.filter((s) => s.id !== currentId).length ?? 0;

  return (
    <Section title="Devices" description="Where you're signed in right now.">
      <div className="acct-form">
        {note && <Notice tone={note.tone}>{note.text}</Notice>}
        {sessions === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <ul className="acct-list">
            {sessions.map((s) => (
              <li key={s.id}>
                <span className="acct-item acct-device">
                  <span>
                    {describeDevice(s.userAgent)}
                    {s.id === currentId && <span className="tag tag-ok">This device</span>}
                  </span>
                  <span className="muted mono">
                    Since {new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                  </span>
                </span>
                {s.id !== currentId && (
                  <button type="button" className="linkbtn" onClick={() => revoke(s.token)} disabled={busy}>
                    Sign out
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {others > 0 && (
          <button type="button" className="btn-secondary" onClick={revokeOthers} disabled={busy}>
            Sign out of {others} other {others === 1 ? "device" : "devices"}
          </button>
        )}
      </div>
    </Section>
  );
}

function DeleteSection() {
  const [confirming, setConfirming] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const { error } = await authClient.deleteUser({ callbackURL: appUrl("/goodbye") });
    setBusy(false);
    if (error) return setNote({ tone: "error", text: describeError(error) });
    setConfirming(false);
    setNote({ tone: "info", text: "Check your email. Your account is deleted only after you open the link we sent, within 24 hours." });
  };

  return (
    <Section title="Delete account" description="Removes your account and everything in it. This can't be undone." danger>
      <div className="acct-form">
        {note && <Notice tone={note.tone}>{note.text}</Notice>}
        {confirming ? (
          <form className="acct-form" onSubmit={submit}>
            <label className="check">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              I understand my runs and settings will be deleted for good
            </label>
            <div className="acct-actions">
              <Submit busy={busy} disabled={!understood} className="btn-danger">
                Email me a deletion link
              </Submit>
              <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn-secondary btn-danger-outline" onClick={() => setConfirming(true)}>
            Delete my account…
          </button>
        )}
      </div>
    </Section>
  );
}
