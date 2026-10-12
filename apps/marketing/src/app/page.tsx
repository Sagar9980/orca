import styles from "./page.module.css";

// The sonar: Orca in the middle sends work out to agents around it, one after another.
const C = 300;
const R = 220;
const TASKS = ["plan", "build", "test", "break", "secure", "review"];
const CYCLE_S = TASKS.length; // one agent lights up per second

const agents = TASKS.map((label, i) => {
  const a = ((-90 + i * 60) * Math.PI) / 180;
  const [cos, sin] = [Math.cos(a), Math.sin(a)];
  return {
    label,
    delay: `${i}s`,
    x: C + R * cos,
    y: C + R * sin,
    wire: { x1: C + 44 * cos, y1: C + 44 * sin, x2: C + (R - 14) * cos, y2: C + (R - 14) * sin },
    lx: C + (R + 30) * cos,
    ly: C + (R + 30) * sin + 5,
    anchor: (cos > 0.1 ? "start" : cos < -0.1 ? "end" : "middle") as "start" | "end" | "middle",
  };
});

const CHAT: [who: "you" | "orca", text: string][] = [
  ["you", "Add payments to my app."],
  ["orca", "Stripe fits your stack. Go with it?"],
  ["you", "Yes."],
  ["orca", "On it. I'll check back if I need your Stripe login."],
];

function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="4.2" fill="currentColor" />
      <path d="M16 6.5a9.5 9.5 0 0 1 9.5 9.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M16 25.5A9.5 9.5 0 0 1 6.5 16" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M16 1.5A14.5 14.5 0 0 1 30.5 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".45" />
      <path d="M16 30.5A14.5 14.5 0 0 1 1.5 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".45" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <span className={styles.mark}>
          <Mark />
        </span>
        Orca
      </header>

      <main className={styles.hero}>
        <section className={styles.copy}>
          <p className={styles.eyebrow}>
            <span className={styles.dot} />
            Agent orchestration
          </p>
          <h1 className={styles.title}>
            <span className={styles.titleLine}>Stop prompting.</span>
            <span className={`${styles.titleLine} ${styles.accent}`}>Start delegating.</span>
          </h1>
          <p className={styles.lede}>
            Tell Orca what you want built, in plain words. It plans the work, runs a team of AI agents, and checks the
            results itself. It only comes back to you for what only you can decide.
          </p>

          <ol className={styles.chat} aria-label="An example exchange with Orca">
            {CHAT.map(([who, text], i) => (
              <li key={i} className={styles.line} data-who={who} style={{ animationDelay: `${0.5 + i * 0.9}s` }}>
                <span className={styles.who}>{who}</span>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className={styles.sonar} aria-hidden="true">
          <div className={styles.halo} />
          <div className={styles.sweep} />
          <svg viewBox="0 0 600 600">
            {[80, 150, 220, 290].map((r) => (
              <circle key={r} className={r === 220 ? styles.orbit : styles.ring} cx={C} cy={C} r={r} />
            ))}
            {[0, 1.5, 3].map((d) => (
              <circle key={d} className={styles.ping} cx={C} cy={C} r={290} style={{ animationDelay: `${d}s` }} />
            ))}

            {agents.map((a) => (
              <g key={a.label}>
                <line className={styles.wire} {...a.wire} />
                <line
                  className={styles.packet}
                  {...a.wire}
                  style={{ animationDelay: a.delay, animationDuration: `${CYCLE_S}s` }}
                />
                <circle
                  className={styles.agentHalo}
                  cx={a.x}
                  cy={a.y}
                  r={20}
                  style={{ animationDelay: a.delay, animationDuration: `${CYCLE_S}s` }}
                />
                <circle className={styles.agent} cx={a.x} cy={a.y} r={11} />
                <circle
                  className={styles.agentCore}
                  cx={a.x}
                  cy={a.y}
                  r={4.5}
                  style={{ animationDelay: a.delay, animationDuration: `${CYCLE_S}s` }}
                />
                <text className={styles.label} x={a.lx} y={a.ly} textAnchor={a.anchor}>
                  {a.label}
                </text>
              </g>
            ))}

            <circle className={styles.core} cx={C} cy={C} r={40} />
            <svg x={C - 18} y={C - 18} width="36" height="36" viewBox="0 0 32 32" className={styles.coreMark}>
              <circle cx="16" cy="16" r="4.2" fill="currentColor" />
              <path d="M16 6.5a9.5 9.5 0 0 1 9.5 9.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none" />
              <path d="M16 25.5A9.5 9.5 0 0 1 6.5 16" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none" />
            </svg>
          </svg>
        </div>
      </main>

      <footer className={styles.foot}>© 2026 Orca</footer>
    </div>
  );
}
