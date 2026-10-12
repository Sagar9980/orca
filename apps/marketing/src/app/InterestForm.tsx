"use client";

import { useActionState } from "react";
import { sendInterest, type InterestState } from "./actions";
import styles from "./InterestForm.module.css";

const initial: InterestState = { status: "idle", message: "" };

export function InterestForm() {
  const [state, action, pending] = useActionState(sendInterest, initial);

  return (
    <section className={styles.card} aria-labelledby="interest-title">
      <div className={styles.intro}>
        <h2 id="interest-title" className={styles.title}>
          Interested in Orca?
        </h2>
        <p className={styles.sub}>Leave your email and we&apos;ll get in touch.</p>
      </div>

      {state.status === "sent" ? (
        <p className={styles.done} role="status">
          <span className={styles.check} aria-hidden="true">
            ✓
          </span>
          Thanks. We&apos;ll reach you at <strong>{state.email}</strong>.
        </p>
      ) : (
        <form action={action} className={styles.form}>
          <div className={styles.row}>
            <label className={styles.srOnly} htmlFor="interest-email">
              Email
            </label>
            <input
              id="interest-email"
              className={styles.input}
              type="email"
              name="email"
              placeholder="you@company.com"
              autoComplete="email"
              maxLength={254}
              required
            />
            <button className={styles.button} type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
          <label className={styles.srOnly} htmlFor="interest-note">
            What would you build with Orca? (optional)
          </label>
          <input
            id="interest-note"
            className={styles.input}
            type="text"
            name="note"
            placeholder="What would you build with it? (optional)"
            maxLength={500}
          />
          {/* Left empty by people; bots that fill every field get ignored. */}
          <input className={styles.trap} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          {state.status === "error" && (
            <p className={styles.error} role="alert">
              {state.message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
