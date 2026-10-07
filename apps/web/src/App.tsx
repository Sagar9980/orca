import { useState } from "react";
import { createDemoSource } from "./run/demoSource";
import { useRun } from "./run/useRun";
import { readPref, useTheme, writePref } from "./lib/hooks";
import { RunBar } from "./components/RunBar";
import { AgentRail } from "./components/AgentRail";
import { Stage } from "./components/Stage";

// Until the server streams real runs, the console plays a scripted demo run.
const source = createDemoSource();

export function App() {
  const { state, send } = useRun(source);
  const [selectedId, setSelectedId] = useState(() => readPref("orca-agent"));
  const toggleTheme = useTheme();

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
        isDemo
        onPause={() => send({ type: "run.pause", runId })}
        onResume={() => send({ type: "run.resume", runId })}
        onRestart={() => send({ type: "run.create", idea: state.run.title })}
        onToggleTheme={toggleTheme}
      />
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
