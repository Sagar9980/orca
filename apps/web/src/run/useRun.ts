import { useCallback, useEffect, useReducer } from "react";
import { applyEvent, type ClientCommand, type RunEvent, type RunState } from "@orca/shared";
import type { RunSource } from "./source";

const reducer = (state: RunState | undefined, event: RunEvent) => applyEvent(state, event);

export function useRun(source: RunSource) {
  const [state, dispatch] = useReducer(reducer, undefined);

  useEffect(() => source.subscribe(dispatch), [source]);

  const send = useCallback((command: ClientCommand) => source.send(command), [source]);

  return { state, send };
}
