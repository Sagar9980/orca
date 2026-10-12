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

/** The Orca mark: a fin over a wave. Same drawing as OrcaMark in apps/web/src/components/icons.tsx. */
function Mark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg width={26} height={26} {...props} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M3 21.5c6.5-.6 10.6-6.6 12.4-18.3 1.7 1 2.9 3 2.9 6.4 0 6.2 2.6 9.9 6.7 11.9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 25.2c3-1.4 5.4-1.4 8 0s5 1.4 8 0 5.2-1.4 8 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity=".55"
      />
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
            <Mark x={C - 17} y={C - 19} width={34} height={34} className={styles.coreMark} />
          </svg>
        </div>
      </main>

      <footer className={styles.foot}>© 2026 Orca</footer>
    </div>
  );
}
