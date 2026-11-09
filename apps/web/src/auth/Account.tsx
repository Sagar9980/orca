import { useCallback, useEffect, useState, type SyntheticEvent, type ReactNode } from "react";
import { OrcaMark } from "../components/icons";
import { Badge } from "../components/ui/badge";
import { Button, buttonVariants } from "../components/ui/button";
import { bridgeError, desktop, type ClaudeLoginStatus, type DesktopBridge, type KeyStatus } from "../lib/desktop";
import { cn } from "../lib/utils";
import { clearQuery, Link, navigate, useLocation } from "../router";
import { appUrl, authClient, describeError, type SocialProvider } from "./client";
import { Field, Notice, PasswordField, ProviderIcon, Submit, useAuthConfig } from "./ui";

type SessionData = NonNullable<ReturnType<typeof authClient.useSession>["data"]>;
type Note = { tone: "error" | "info" | "success"; text: ReactNode } | null;

/** A form inside an account section. */
const form = "flex max-w-[440px] flex-col gap-3.5";
const list = "rounded-xl border bg-card [&>li]:flex [&>li]:items-center [&>li]:justify-between [&>li]:gap-3 [&>li]:px-3.5 [&>li]:py-3 [&>li]:text-sm [&>li+li]:border-t";
const item = "inline-flex min-w-0 items-center gap-2.5 [&_svg]:size-[17px] [&_svg]:shrink-0";
const check = "flex cursor-pointer items-start gap-[9px] text-[13.5px] text-muted-foreground [&_input]:mt-[3px] [&_input]:accent-primary";
const tag = "ml-2 px-[7px] py-[3px] align-[2px]";

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
    <div className="mx-auto max-w-[980px]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <Link
          to="/"
          className="flex items-center gap-2.5 font-display text-xl leading-none font-bold tracking-[-0.02em] text-foreground no-underline [&_svg]:size-[26px] [&_svg]:text-primary"
        >
          <OrcaMark />
          Orca
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link to="/" className={buttonVariants({ variant: "outline" })}>
            Back to console
          </Link>
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="flex flex-col gap-[18px] py-7">
        <div>
          <span className="eyebrow">Account</span>
          <h1 className="mt-1.5 mb-1 font-display text-[clamp(28px,3vw,38px)] leading-[1.05] font-[750] tracking-[-0.03em] wrap-anywhere">
            {session.user.name || session.user.email}
          </h1>
          <p className="wrap-anywhere text-muted-foreground">{session.user.email}</p>
        </div>
        {banner && <Notice tone={banner.tone}>{banner.text}</Notice>}

        <ProfileSection session={session} />
        {desktop && <ClaudeCodeSection bridge={desktop} />}
        {desktop && <ApiKeySection bridge={desktop} />}
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
    <section
      className={cn(
        "grid grid-cols-1 gap-x-10 gap-y-5 rounded-2xl border bg-panel p-[18px] min-[861px]:grid-cols-[minmax(0,280px)_minmax(0,1fr)] min-[861px]:p-6",
        danger && "border-[color-mix(in_oklab,var(--color-destructive)_35%,var(--color-border))]",
      )}
    >
      <div>
        <h2 className="mb-1.5 font-display text-[17px] leading-[1.2] font-bold">{title}</h2>
        <p className="text-[13.5px] leading-[1.55] wrap-anywhere text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
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
      <form className={form} onSubmit={submit}>
        {note && <Notice tone={note.tone}>{note.text}</Notice>}
        <Field label="Name" id="acct-name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Submit className="self-start" busy={busy} disabled={!name.trim() || name.trim() === session.user.name}>
          Save name
        </Submit>
      </form>
    </Section>
  );
}

/** The Claude Code login on this computer, which runs come through first. Signing in happens in Claude Code. */
function ClaudeCodeSection({ bridge }: { bridge: DesktopBridge }) {
  const [login, setLogin] = useState<ClaudeLoginStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setLogin(await bridge.claudeLogin());
    } catch (err) {
      setLogin({ signedIn: false, installed: false, email: null, plan: null, detail: bridgeError(err) });
    } finally {
      setChecking(false);
    }
  }, [bridge]);
  useEffect(() => void check(), [check]);

  const plan = login?.plan ? login.plan.charAt(0).toUpperCase() + login.plan.slice(1) : null;

  return (
    <Section
      title="Claude Code"
      description="Runs use the Claude Code login on this computer first, so agents work on your own Claude plan. Your API key below is only used when Claude Code isn't signed in."
    >
      <div className={form}>
        {login === null ? (
          <p className="text-muted-foreground">Checking Claude Code…</p>
        ) : login.signedIn ? (
          <ul className={list}>
            <li>
              <span className={item}>
                <span className="min-w-0 truncate">
                  Signed in{login.email ? ` as ${login.email}` : ""}
                  <Badge tone="tone-success" className={tag}>
                    {plan ? `Claude ${plan}` : "Signed in"}
                  </Badge>
                </span>
              </span>
            </li>
          </ul>
        ) : (
          <Notice tone="info">
            {login.installed ? (
              <>
                Claude Code isn't signed in. Run <code className="font-mono">claude auth login</code> in a terminal,
                then check again.
              </>
            ) : (
              <>
                Install{" "}
                <a href="https://claude.com/product/claude-code" target="_blank" rel="noreferrer" className="text-primary">
                  Claude Code
                </a>{" "}
                and run <code className="font-mono">claude auth login</code> in a terminal, then check again.
              </>
            )}
          </Notice>
        )}
        <Button variant="secondary" size="lg" className="self-start" onClick={check} disabled={checking}>
          {checking ? "Checking…" : "Check again"}
        </Button>
      </div>
    </Section>
  );
}

/** The user's Anthropic key, kept by the desktop app. The page sends a new key but never reads one back. */
function ApiKeySection({ bridge }: { bridge: DesktopBridge }) {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  useEffect(() => {
    bridge.keyStatus().then(setStatus, () => setStatus({ source: null, last4: null }));
  }, [bridge]);

  const submit = async (e: SyntheticEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      setStatus(await bridge.saveKey(key.trim()));
      setKey("");
      setNote({ tone: "success", text: "Key checked and saved." });
    } catch (err) {
      setNote({ tone: "error", text: bridgeError(err) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setNote(null);
    try {
      setStatus(await bridge.removeKey());
      setNote({ tone: "success", text: "Key removed from this computer." });
    } catch (err) {
      setNote({ tone: "error", text: bridgeError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Anthropic API key"
      description={
        <>
          Agents call Claude with your own key, billed to your Anthropic account. It's encrypted with this computer's
          keychain and never sent to Orca's servers.{" "}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-primary">
            Get a key
          </a>
        </>
      }
    >
      <form className={form} onSubmit={submit}>
        {note && <Notice tone={note.tone}>{note.text}</Notice>}
        {status === null ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : status.source ? (
          <ul className={list}>
            <li>
              <span className={item}>
                <span>
                  Key ending in <span className="font-mono">…{status.last4}</span>
                  {status.source === "saved" ? (
                    <Badge tone="tone-success" className={tag}>
                      Saved
                    </Badge>
                  ) : (
                    <Badge tone="tone-muted" className={tag}>
                      From .env
                    </Badge>
                  )}
                </span>
              </span>
              {status.source === "saved" && (
                <Button variant="link" onClick={remove} disabled={busy}>
                  Remove
                </Button>
              )}
            </li>
          </ul>
        ) : (
          <Notice tone="info">Add a key to start runs on this computer.</Notice>
        )}
        <PasswordField
          label={status?.source === "saved" ? "Replace key" : "API key"}
          id="acct-api-key"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-…"
          required
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <Submit className="self-start" busy={busy} disabled={!key.trim()}>
          Check and save
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
          {session.user.emailVerified ? (
            <Badge tone="tone-success" className={tag}>
              Verified
            </Badge>
          ) : (
            <Badge tone="tone-muted" className={tag}>
              Not verified
            </Badge>
          )}
        </>
      }
    >
      <form className={form} onSubmit={submit}>
        {note && <Notice tone={note.tone}>{note.text}</Notice>}
        <Field label="New email" id="acct-email" type="email" autoComplete="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        <Submit className="self-start" busy={busy} disabled={!newEmail.trim() || newEmail.trim().toLowerCase() === session.user.email.toLowerCase()}>
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
        <div className={form}>
          <p className="text-muted-foreground">To add one, we'll email you a link to set it.</p>
          <Link
            to={`/forgot-password?email=${encodeURIComponent(email)}`}
            className={buttonVariants({ variant: "secondary", size: "lg", className: "self-start" })}
          >
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
      <form className={form} onSubmit={submit}>
        {note && <Notice tone={note.tone}>{note.text}</Notice>}
        <PasswordField label="Current password" id="acct-current" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        <PasswordField label="New password" id="acct-new" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
        <label className={check}>
          <input type="checkbox" checked={signOutOthers} onChange={(e) => setSignOutOthers(e.target.checked)} />
          Sign out my other devices
        </label>
        <Submit className="self-start" busy={busy} disabled={!current || !next}>
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
      <div className={form}>
        {note && <Notice tone={note.tone}>{note.text}</Notice>}
        {accounts === null ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <ul className={list}>
            {accounts.map((a) => (
              <li key={a.id}>
                <span className={item}>
                  {a.providerId !== "credential" && <ProviderIcon provider={a.providerId as SocialProvider} />}
                  {PROVIDER_LABEL[a.providerId] ?? a.providerId}
                </span>
                {accounts.length > 1 && (
                  <Button variant="link" onClick={() => disconnect(a.id, a.providerId)} disabled={busy !== null}>
                    Disconnect
                  </Button>
                )}
              </li>
            ))}
            {available.map((p) => (
              <li key={p}>
                <span className={cn(item, "text-muted-foreground")}>
                  <ProviderIcon provider={p} />
                  {PROVIDER_LABEL[p]}
                </span>
                <Button variant="secondary" size="sm" onClick={() => connect(p)} disabled={busy !== null}>
                  Connect
                </Button>
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
      <div className={form}>
        {note && <Notice tone={note.tone}>{note.text}</Notice>}
        {sessions === null ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <ul className={list}>
            {sessions.map((s) => (
              <li key={s.id}>
                <span className={cn(item, "flex-col items-start gap-[3px]")}>
                  <span>
                    {describeDevice(s.userAgent)}
                    {s.id === currentId && (
                      <Badge tone="tone-success" className={tag}>
                        This device
                      </Badge>
                    )}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    Since {new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    {s.ipAddress ? ` · ${s.ipAddress}` : ""}
                  </span>
                </span>
                {s.id !== currentId && (
                  <Button variant="link" onClick={() => revoke(s.token)} disabled={busy}>
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {others > 0 && (
          <Button variant="secondary" size="lg" className="self-start" onClick={revokeOthers} disabled={busy}>
            Sign out of {others} other {others === 1 ? "device" : "devices"}
          </Button>
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
      <div className={form}>
        {note && <Notice tone={note.tone}>{note.text}</Notice>}
        {confirming ? (
          <form className={form} onSubmit={submit}>
            <label className={check}>
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              I understand my runs and settings will be deleted for good
            </label>
            <div className="flex flex-wrap gap-2.5">
              <Submit busy={busy} disabled={!understood} variant="destructive">
                Email me a deletion link
              </Submit>
              <Button variant="secondary" size="lg" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="destructive-outline" size="lg" className="self-start" onClick={() => setConfirming(true)}>
            Delete my account…
          </Button>
        )}
      </div>
    </Section>
  );
}
