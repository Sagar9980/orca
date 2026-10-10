import { useEffect, useRef, type ComponentType } from "react";
import { authClient } from "./auth/client";
import { Account } from "./auth/Account";
import { ForgotPassword, Goodbye, ResetPassword, SignIn, SignUp } from "./auth/pages";
import { useTheme } from "./lib/hooks";
import { resetProjects } from "./projects/store";
import { Link, navigate, useLocation } from "./router";
import { Shell, type ShellRoute } from "./shell/Shell";

/** Pages for signed-out visitors. Signed-in visitors are sent to the app. */
const GUEST_ONLY: Record<string, ComponentType> = {
  "/sign-in": SignIn,
  "/sign-up": SignUp,
  "/forgot-password": ForgotPassword,
};
/** Pages anyone can open: they come from email links. */
const PUBLIC: Record<string, ComponentType> = {
  "/reset-password": ResetPassword,
  "/goodbye": Goodbye,
};

function shellRoute(path: string): ShellRoute | null {
  if (path === "/") return { view: "home" };
  const m = path.match(/^\/p\/([^/]+)(?:\/r\/([^/]+))?$/);
  if (!m) return null;
  try {
    const slug = decodeURIComponent(m[1]!);
    return m[2] ? { view: "run", slug, runId: decodeURIComponent(m[2]) } : { view: "project", slug };
  } catch {
    return null;
  }
}

export function App() {
  const toggleTheme = useTheme();
  const { path } = useLocation();
  const { data: session, isPending, error } = authClient.useSession();
  // The client re-checks the session after sign-up, sign-in and so on. Only the first
  // check shows the loading screen; later ones must not unmount the page that's open.
  const checked = useRef(false);
  if (!isPending) checked.current = true;

  // A different person (or nobody) is signed in: drop the previous user's projects.
  const userId = session?.user.id ?? null;
  const lastUser = useRef(userId);
  useEffect(() => {
    if (lastUser.current !== userId) resetProjects();
    lastUser.current = userId;
  }, [userId]);

  const Public: ComponentType | undefined = PUBLIC[path];
  const GuestOnly: ComponentType | undefined = GUEST_ONLY[path];
  const route = shellRoute(path);
  const known = Public || GuestOnly || route || path === "/account";

  if (Public) return <Public />;
  if (isPending && !checked.current) return <div className="boot">Starting Orca…</div>;
  if (error && !session) {
    return (
      <div className="boot">
        <p>Can't reach the Orca server. Check that it's running, then reload.</p>
      </div>
    );
  }
  if (!known) return <NotFound />;

  if (!session) {
    if (GuestOnly) return <GuestOnly />;
    // Keep the query (e.g. ?error= from a failed verification link) for the sign-in page.
    return <Redirect to={`/sign-in${window.location.search}`} />;
  }
  if (GuestOnly) return <Redirect to="/" />;
  if (path === "/account") return <Account session={session} />;
  return <Shell route={route!} user={session.user} onToggleTheme={toggleTheme} />;
}

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return <div className="boot">Starting Orca…</div>;
}

function NotFound() {
  return (
    <div className="boot">
      <p>There's nothing at this address.</p>
      <Link to="/">Go to Orca</Link>
    </div>
  );
}
