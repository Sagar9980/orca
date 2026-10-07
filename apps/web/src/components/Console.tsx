import { useEffect, useState } from "react";
import { createDemoSource } from "../run/demoSource";
import { useRun } from "../run/useRun";
import { readPref, writePref } from "../lib/hooks";
import { clearQuery, useLocation } from "../router";
import { Notice } from "../auth/ui";
import { RunBar } from "./RunBar";
import { AgentRail } from "./AgentRail";
import { Stage } from "./Stage";

// Until the server streams real runs, the console plays a scripted demo run.
const source = createDemoSource();

interface Props {
  user: { name: string; email: string };
  onToggleTheme: () => void;
}

export function Console({ user, onToggleTheme }: Props) {
  const { state, send } = useRun(source);
  const [selectedId, setSelectedId] = useState(() => readPref("orca-agent"));
  const { query } = useLocation();
  const [welcome, setWelcome] = useState(() => query.get("verified") === "1");

  useEffect(() => {
    if (!welcome) return;
    clearQuery("verified");
    const t = setTimeout(() => setWelcome(false), 6000);
    return () => clearTimeout(t);
  }, [welcome]);

  if (!state) return <div className="boot">Starting Orca…</div>;

  const runId = state.run.id;
  const agent = (selectedId && state.agents[selectedId]) || Object.values(state.agents)[0];
  const paused = state.run.status === "paused";

  const select = (id: string) => {
    setSelectedId(id);
    writePref("orca-agent", id);
  };

  return (
    <div className={paused ? "app paused" : "app"}>
      <RunBar
        run={state.run}
        user={user}
        isDemo
        onPause={() => send({ type: "run.pause", runId })}
        onResume={() => send({ type: "run.resume", runId })}
        onRestart={() => send({ type: "run.create", idea: state.run.title })}
        onToggleTheme={onToggleTheme}
      />
      {welcome && (
        <div className="toast">
          <Notice tone="success">Your email is verified. Welcome to Orca, {user.name.split(" ")[0] || "there"}.</Notice>
        </div>
      )}
      <div className="shell">
        <AgentRail state={state} selectedId={agent?.id} onSelect={select} />
        {agent && (
          <Stage
            key={agent.id}
            state={state}
            agent={agent}
            paused={paused}
            onRespond={(requestId, response) => send({ type: "human.respond", runId, requestId, response })}
          />
        )}
      </div>
    </div>
  );
}
