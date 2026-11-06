import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cva } from "class-variance-authority";
import { OrcaMark } from "../components/icons";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Spinner } from "../components/ui/spinner";
import { cn } from "../lib/utils";
import { Link } from "../router";
import { appUrl, authClient, describeError, loadAuthConfig, type AuthConfig, type SocialProvider } from "./client";

const brand = "relative z-1 inline-flex items-center gap-2.5 font-display text-xl leading-none font-bold tracking-[-0.02em] text-foreground no-underline [&_svg]:size-[26px] [&_svg]:text-primary";

/** Split screen: the Orca story on the left, the form on the right. Stacks on phones. */
export function AuthLayout({ title, lede, children, footer }: { title: string; lede?: ReactNode; children?: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-[1320px] grid-cols-1 overflow-hidden min-[861px]:min-h-[calc(100vh-44px-var(--tb))] min-[861px]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] min-[861px]:rounded-[22px] min-[861px]:border min-[861px]:bg-panel">
      <aside
        className="dot-grid relative hidden flex-col justify-between gap-8 overflow-hidden border-r bg-background px-10 py-9 min-[861px]:flex"
        aria-hidden="true"
      >
        <div className={brand}>
          <OrcaMark />
          Orca
        </div>
        <div className="auth-sonar absolute top-[46%] left-[62%] size-0">
          <span />
          <span />
          <span />
        </div>
        <div className="relative z-1 max-w-[30ch]">
          <p className="mb-[22px] font-display text-[clamp(30px,3.2vw,42px)] leading-[1.05] font-[750] tracking-[-0.03em] text-balance">
            Give it an idea. Orca runs the team.
          </p>
          <ul className="grid gap-3">
            {PITCH.map(([verb, text]) => (
              <li key={verb} className="grid grid-cols-[74px_1fr] items-baseline gap-2.5 text-sm text-muted-foreground">
                <span className="eyebrow text-primary">{verb}</span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="grid place-items-[start_center] py-6 min-[861px]:place-items-center min-[861px]:px-8 min-[861px]:py-12">
        <div className="flex w-full max-w-[400px] flex-col gap-[18px]">
          <Link to="/sign-in" className={cn(brand, "mb-2 min-[861px]:hidden")}>
            <OrcaMark />
            Orca
          </Link>
          <h1 className="font-display text-[32px] leading-[1.05] font-[750] tracking-[-0.025em] text-balance">{title}</h1>
          {lede && (
            <p className="-mt-1.5 mb-1 text-[14.5px] leading-[1.55] text-muted-foreground [&_strong]:font-semibold [&_strong]:wrap-anywhere [&_strong]:text-foreground">
              {lede}
            </p>
          )}
          {children}
          {footer && (
            <div className="border-t pt-4 text-[13.5px] text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-3">
              {footer}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

const PITCH = [
  ["Plans", "Breaks your idea into steps"],
  ["Spawns", "Starts the agents each step needs"],
  ["Asks", "Comes to you only when a human must decide"],
];

/** A form with its fields stacked. */
export const formStack = "flex flex-col gap-4";
/** Buttons and links under a message, e.g. "Resend the email". */
export const authSteps = "flex flex-col gap-3.5 text-sm text-muted-foreground";

const labelClass = "text-[13px] font-semibold";
const hintClass = "text-[12.5px] text-faint";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode };

export function Field({ label, hint, id, ...input }: FieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className={labelClass}>
        {label}
      </label>
      <Input id={fieldId} {...input} aria-describedby={hint ? `${fieldId}-hint` : undefined} />
      {hint && (
        <p className={hintClass} id={`${fieldId}-hint`}>
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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={fieldId} className={labelClass}>
          {label}
        </label>
        <Button variant="link" onClick={() => setShown((s) => !s)} aria-controls={fieldId}>
          {shown ? "Hide" : "Show"}
        </Button>
      </div>
      <Input
        id={fieldId}
        type={shown ? "text" : "password"}
        {...input}
        aria-describedby={hint ? `${fieldId}-hint` : undefined}
      />
      {hint && (
        <p className={hintClass} id={`${fieldId}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Submit({
  busy,
  children,
  disabled,
  variant = "default",
  className,
}: {
  busy: boolean;
  children: ReactNode;
  disabled?: boolean;
  variant?: "default" | "destructive";
  className?: string;
}) {
  return (
    <Button type="submit" size="lg" variant={variant} className={className} disabled={busy || disabled} aria-busy={busy}>
      {busy && <Spinner />}
      {children}
    </Button>
  );
}

const notice = cva(
  "rounded-lg border border-(--tone)/45 bg-(--tone)/11 px-3.5 py-[11px] text-[13.5px] leading-normal text-foreground [&_strong]:font-semibold [&_strong]:wrap-anywhere",
  {
    variants: {
      tone: { error: "tone-destructive", info: "tone-primary", success: "tone-success" },
    },
  },
);

export function Notice({ tone, children }: { tone: "error" | "info" | "success"; children: ReactNode }) {
  return (
    <div className={notice({ tone })} role={tone === "error" ? "alert" : "status"}>
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
      <div className="flex flex-col gap-2.5">
        {config.socialProviders.map((p) => (
          <Button
            key={p}
            variant="secondary"
            size="lg"
            className="w-full [&_svg]:size-[17px]"
            onClick={() => go(p)}
            disabled={busy !== null}
          >
            {busy === p ? <Spinner /> : <ProviderIcon provider={p} />}
            Continue with {PROVIDER_LABEL[p]}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-3 font-mono text-[11px] leading-none font-medium tracking-[0.1em] text-faint uppercase before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
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
