import type { ClientCommand, RunEvent } from "@orca/shared";
import { bridgeError, type DesktopBridge, type DesktopRunInput } from "../lib/desktop";
import type { RunSource } from "./source";

/**
 * A real agent run in the desktop app's main process. Nothing starts until the page sends "run.create", so
 * opening a run never spends anything by itself. The run keeps going if the page closes; reopening it replays
 * its events so far. `onError` gets problems the run can't report itself, such as a missing API key.
 */
export function createDesktopSource(
  bridge: DesktopBridge,
  input: DesktopRunInput,
  onError: (message: string) => void,
): RunSource {
  const listeners = new Set<(event: RunEvent) => void>();
  const deliver = (events: RunEvent[]) => events.forEach((e) => listeners.forEach((l) => l(e)));

  return {
    subscribe(listener) {
      listeners.add(listener);
      // Live events wait until the replay arrives, so none land before "run.started". Duplicates are fine:
      // the reducer drops any event at or below the last seq it applied.
      let ready = false;
      const early: RunEvent[] = [];
      const stop = bridge.onRunEvent((event) => {
        if (event.runId !== input.runId) return;
        if (ready) listener(event);
        else early.push(event);
      });
      void bridge
        .runAttach(input.runId)
        .catch(() => [])
        .then((events) => {
          ready = true;
          [...events, ...early].forEach(listener);
        });
      return () => {
        stop();
        listeners.delete(listener);
      };
    },
    send(command: ClientCommand) {
      const request = command.type === "run.create" ? bridge.runStart(input).then(deliver) : bridge.runCommand(command);
      request.catch((err: unknown) => onError(bridgeError(err)));
    },
  };
}
