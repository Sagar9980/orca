import type { ClientCommand, RunEvent } from "@orca/shared";

/**
 * Where run events come from. The UI only talks to this interface, so the
 * in-browser demo can later be swapped for the server's live stream.
 */
export interface RunSource {
  /** Starts delivering events. New subscribers first receive the run so far. */
  subscribe(listener: (event: RunEvent) => void): () => void;
  send(command: ClientCommand): void;
  /** Stops any work the source does on its own (timers, scripted agents). */
  close?(): void;
}
