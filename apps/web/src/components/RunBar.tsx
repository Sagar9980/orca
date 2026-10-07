import type { Run } from "@orca/shared";
import { useNow } from "../lib/hooks";
import { formatClock, initials } from "../lib/labels";
import { Link } from "../router";
import { OrcaMark, PauseIcon, PlayIcon, ThemeIcon } from "./icons";

interface Props {
  run: Run;
  user: { name: string; email: string };
  isDemo: boolean;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onToggleTheme: () => void;
}

export function RunBar({ run, user, isDemo, onPause, onResume, onRestart, onToggleTheme }: Props) {
  const finished = Boolean(run.finishedAt);
  const paused = run.status === "paused";
  const now = useNow(1000, !finished && !paused);
  const end = run.finishedAt ? Date.parse(run.finishedAt) : now;
  const elapsed = formatClock(end - Date.parse(run.startedAt));
  const { spentUsd, limitUsd } = run.budget;
  const pct = Math.min(100, (spentUsd / limitUsd) * 100);

  return (
    <header className="runbar">
      <div className="brand">
        <OrcaMark />
        Orca
      </div>
      <div className="run">
        <span className="eyebrow">
          {finished ? "Run complete" : paused ? "Paused" : "Running"}
          {isDemo ? " · example data" : ""}
        </span>
        <span className="run-title">
          {run.title} {run.detail && <span>· {run.detail}</span>}
        </span>
      </div>
      <div className="meters">
        <div className="meter">
          <span className="eyebrow">Elapsed</span>
          <b>{elapsed}</b>
        </div>
        <div className="meter">
          <span className="eyebrow">Spend</span>
          <b>
            ${spentUsd.toFixed(2)} / ${limitUsd}
          </b>
        </div>
        <div className="meter">
          <span className="eyebrow">Budget</span>
          <span
            className="budget"
            role="meter"
            aria-label="Budget used"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <i style={{ width: `${pct}%` }} />
          </span>
        </div>
      </div>
      <div className="ctrls">
        {finished ? (
          <button className="btn" type="button" onClick={onRestart}>
            <PlayIcon />
            <span>Start a new demo run</span>
          </button>
        ) : (
          <button className="btn" type="button" onClick={paused ? onResume : onPause}>
            {paused ? <PlayIcon /> : <PauseIcon />}
            <span>{paused ? "Resume run" : "Pause run"}</span>
          </button>
        )}
        <button className="btn" type="button" onClick={onToggleTheme} aria-label="Switch theme">
          <ThemeIcon />
          Theme
        </button>
        <Link to="/account" className="btn user-btn" aria-label={`Account settings for ${user.name || user.email}`}>
          <span className="user-av">{initials(user.name || user.email)}</span>
          <span className="user-name">{user.name.split(" ")[0] || "Account"}</span>
        </Link>
      </div>
    </header>
  );
}
