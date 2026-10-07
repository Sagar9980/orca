import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { OrcaMark } from "../components/icons";
import { Link } from "../router";
import { appUrl, authClient, describeError, loadAuthConfig, type AuthConfig, type SocialProvider } from "./client";

/** Split screen: the Orca story on the left, the form on the right. Stacks on phones. */
export function AuthLayout({ title, lede, children, footer }: { title: string; lede?: ReactNode; children?: ReactNode; footer?: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-story" aria-hidden="true">
        <div className="auth-brand">
          <OrcaMark />
          Orca
        </div>
        <div className="auth-sonar">
          <span />
          <span />
          <span />
        </div>
        <div className="auth-pitch">
          <p className="auth-pitch-head">Give it an idea. Orca runs the team.</p>
          <ul>
            <li><span className="eyebrow">Plans</span>Breaks your idea into steps</li>
            <li><span className="eyebrow">Spawns</span>Starts the agents each step needs</li>
            <li><span className="eyebrow">Asks</span>Comes to you only when a human must decide</li>
          </ul>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <Link to="/sign-in" className="auth-brand auth-brand-compact">
            <OrcaMark />
            Orca
          </Link>
          <h1>{title}</h1>
          {lede && <p className="auth-lede">{lede}</p>}
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode };

export function Field({ label, hint, id, ...input }: FieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <input id={fieldId} {...input} aria-describedby={hint ? `${fieldId}-hint` : undefined} />
      {hint && (
        <p className="field-hint" id={`${fieldId}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function PasswordField({ label, hint, id, ...input }: FieldProps) {
  const [shown, setShown] = useState(false);
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <div className="field">
      <div className="field-row">
        <label htmlFor={fieldId}>{label}</label>
        <button type="button" className="linkbtn" onClick={() => setShown((s) => !s)} aria-controls={fieldId}>
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      <input id={fieldId} type={shown ? "text" : "password"} {...input} aria-describedby={hint ? `${fieldId}-hint` : undefined} />
      {hint && (
        <p className="field-hint" id={`${fieldId}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Submit({ busy, children, ...rest }: { busy: boolean; children: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <button type="submit" className={`btn-primary ${rest.className ?? ""}`} disabled={busy || rest.disabled} aria-busy={busy}>
      {busy && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Notice({ tone, children }: { tone: "error" | "info" | "success"; children: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function useAuthConfig(): AuthConfig | null {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  useEffect(() => {
    let live = true;
    loadAuthConfig().then((c) => live && setConfig(c));
    return () => {
      live = false;
    };
  }, []);
  return config;
}

const PROVIDER_LABEL: Record<SocialProvider, string> = { github: "GitHub", google: "Google" };

/** "Continue with …" buttons for whichever providers the server has configured. */
export function SocialButtons({ onError }: { onError: (message: string) => void }) {
  const config = useAuthConfig();
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  if (!config?.socialProviders.length) return null;

  const go = async (provider: SocialProvider) => {
    setBusy(provider);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: appUrl("/"),
      errorCallbackURL: appUrl("/sign-in"),
    });
    // On success the browser is already leaving for the provider.
    if (error) {
      setBusy(null);
      onError(describeError(error));
    }
  };

  return (
    <>
      <div className="social">
        {config.socialProviders.map((p) => (
          <button key={p} type="button" className="btn-social" onClick={() => go(p)} disabled={busy !== null}>
            {busy === p ? <span className="spinner" aria-hidden="true" /> : <ProviderIcon provider={p} />}
            Continue with {PROVIDER_LABEL[p]}
          </button>
        ))}
      </div>
      <div className="divider">
        <span>or use email</span>
      </div>
    </>
  );
}

export function ProviderIcon({ provider }: { provider: SocialProvider }) {
  if (provider === "github") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
