import { useEffect, useState } from "react";

const SERVER_URL = "http://127.0.0.1:4000";

export function App() {
  const [server, setServer] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    fetch(`${SERVER_URL}/health`)
      .then((res) => setServer(res.ok ? "online" : "offline"))
      .catch(() => setServer("offline"));
  }, []);

  return (
    <main className="app">
      <h1>Orca</h1>
      <p>Give it an idea. It orchestrates the rest.</p>
      <p className="status">Server: {server}</p>
    </main>
  );
}
