import type { HumanRequestType, PlanStep, SubAgentState } from "@orca/shared";

// The "Add payments" story from the README, scripted as example data.
// Each step: [from, to, kind, text, receiver's next activity, sender's next activity, human request].
// "you" as a target means the step asks the human and waits for an answer.

export type StepKind = "prompt" | "reply" | "question" | "issue" | "ask_human";

export interface HumanAsk {
  type: HumanRequestType;
  options?: string[];
  recommended?: string;
}

export type Step = [
  from: string,
  to: string,
  kind: StepKind,
  text: string,
  toActivity?: string,
  fromActivity?: string,
  ask?: HumanAsk,
];

export interface TeamScript {
  id: string;
  name: string;
  mission: string;
  summary: string;
  brief: string;
  finish: string;
  /** Queued until every other team has finished. */
  runsLast?: boolean;
  subs: { id: string; name: string; role: string; activity: string; state?: SubAgentState }[];
  steps: Step[];
}

export const RUN_TITLE = "Add complete payment features";
export const RUN_DETAIL = "Stripe, test mode";
export const RUN_BUDGET_USD = 10;
export const RUN_SUMMARY =
  "Payments are built and verified. 2 things need you: switch to live keys, and decide on refunds later.";

export const PLAN: PlanStep[] = [
  { id: "analyze", label: "Analyze", status: "done" },
  { id: "plan", label: "Plan", status: "done" },
  { id: "spawn", label: "Spawn", status: "done" },
  { id: "execute", label: "Execute", status: "active" },
  { id: "verify", label: "Verify", status: "pending" },
  { id: "report", label: "Report", status: "pending" },
];

export const TEAMS: TeamScript[] = [
  {
    id: "builder",
    name: "Builder",
    mission: "Implement checkout, webhooks and billing tables across apps/server and apps/web.",
    summary: "Reading the plan",
    brief: "Implement payments per plan v2. 6 tasks, Stripe test mode.",
    finish: "All 6 build tasks done. Handing off to Tester.",
    subs: [
      { id: "lead", name: "Build Lead", role: "Splits the work", activity: "Reading plan.md · 6 tasks", state: "working" },
      { id: "schema", name: "Schema", role: "Database models", activity: "Ready for a task" },
      { id: "routes", name: "Routes", role: "API endpoints", activity: "Ready for a task" },
      { id: "hooks", name: "Webhooks", role: "Event handler", activity: "Ready for a task" },
      { id: "ui", name: "Checkout UI", role: "Pricing and redirect", activity: "Ready for a task" },
      { id: "lint", name: "Type Check", role: "tsc and eslint", activity: "Watching apps/*" },
    ],
    steps: [
      ["lead", "schema", "prompt", "Add subscriptions and invoices tables. Keep stripe_customer_id on users.", "Writing 0042_billing.sql", "Assigning next task"],
      ["lead", "routes", "prompt", "Build POST /api/checkout. Read price IDs from env, not code.", "Scaffolding routes/checkout.ts"],
      ["routes", "schema", "question", "Which column holds the plan tier?", "Looking up the tier column"],
      ["schema", "routes", "reply", "subscriptions.tier, enum: free | pro | team.", "Mapping price → tier", "Migration 0042 applied · 3 tables"],
      ["lead", "hooks", "prompt", "Handle checkout.session.completed and invoice.paid. Verify signatures.", "Writing webhooks/stripe.ts"],
      ["ui", "routes", "question", "What does /api/checkout return?", "Writing response type"],
      ["routes", "ui", "reply", "{ url: string }. Redirect the browser to it.", "Building PricingPage.tsx", "Route done · 2 endpoints"],
      ["hooks", "lint", "prompt", "Handler is done. Type check it.", "Checking 7 files"],
      ["lint", "hooks", "issue", "2 errors at stripe.ts:48. event.data.object is untyped.", "Narrowing event types", "2 type errors"],
      ["hooks", "lint", "prompt", "Narrowed to Stripe.Invoice. Run it again.", "Re-checking 7 files"],
      ["lint", "lead", "reply", "Clean. 0 errors, 0 warnings.", "Collecting results", "Clean build"],
    ],
  },
  {
    id: "integrator",
    name: "Integrator",
    mission: "Set up the Stripe side: products, prices, webhook endpoint and keys. Pauses for a human login.",
    summary: "Opening the Stripe dashboard",
    brief: "Configure Stripe test mode. Ask the user to log in; never handle their password.",
    finish: "Stripe is configured. 6 env vars set, 0 secrets in plaintext.",
    subs: [
      { id: "pilot", name: "Browser Pilot", role: "Drives dashboard.stripe.com", activity: "Opened the Stripe login page", state: "working" },
      { id: "catalog", name: "Catalog", role: "Products and prices", activity: "Ready for a task" },
      { id: "whsetup", name: "Webhook Setup", role: "Endpoint and secret", activity: "Ready for a task" },
      { id: "vault", name: "Vault", role: "Secret storage", activity: "Sealed · 0 secrets" },
      { id: "env", name: "Env Writer", role: ".env and deploy vars", activity: "Ready for a task" },
    ],
    steps: [
      ["pilot", "you", "ask_human", "Log in to dashboard.stripe.com in the browser window so I can continue. I never see your password.", "Session active · test mode", undefined, { type: "credential" }],
      ["pilot", "catalog", "prompt", "Session is ready. Create Pro at $19/mo and Team at $49/mo.", "Creating 2 products, 2 prices"],
      ["catalog", "env", "prompt", "Add price_1Pq8Pro and price_1Pq8Team as STRIPE_PRICE_PRO and STRIPE_PRICE_TEAM.", "Writing apps/server/.env", "2 prices live"],
      ["pilot", "whsetup", "prompt", "Register {API_URL}/webhooks/stripe for 4 events.", "Endpoint we_1Pq9 created"],
      ["whsetup", "vault", "prompt", "Store the signing secret whsec_••••. Never log it.", "Sealed vault://stripe/webhook_secret", "Endpoint verified"],
      ["env", "vault", "question", "I need a reference to the webhook secret, not the value.", "Resolving reference"],
      ["vault", "env", "reply", "Use vault://stripe/webhook_secret.", "6 vars written · 0 plaintext", "1 secret sealed"],
      ["env", "pilot", "reply", "Config complete. You can close the session.", "Closing browser session", "Config written"],
    ],
  },
  {
    id: "tester",
    name: "Tester",
    mission: "Write and run unit and integration tests for the billing module against Stripe test mode.",
    summary: "Drafting test cases",
    brief: "Cover billing end to end. Report failures straight to Builder.",
    finish: "Billing suite green. 20 tests, 91% line coverage.",
    subs: [
      { id: "lead", name: "Test Lead", role: "Plans the suite", activity: "Drafting 20 test cases", state: "working" },
      { id: "fixtures", name: "Fixtures", role: "Test data", activity: "Ready for a task" },
      { id: "unit", name: "Unit", role: "Fast, isolated tests", activity: "Ready for a task" },
      { id: "integ", name: "Integration", role: "Checkout round trip", activity: "Ready for a task" },
      { id: "cov", name: "Coverage", role: "Lines and branches", activity: "Ready for a task" },
    ],
    steps: [
      ["lead", "fixtures", "prompt", "Build 3 customers: new, active Pro, canceled Team.", "Generating fixtures/billing.ts"],
      ["lead", "unit", "prompt", "Cover price lookup and tier mapping. Include an unknown price ID.", "Writing 14 unit tests"],
      ["unit", "fixtures", "question", "I need a customer with an expired card.", "Adding an expired card"],
      ["fixtures", "unit", "reply", "Added customer_expired, card exp 01/24.", "Running 14 tests", "4 fixtures ready"],
      ["lead", "integ", "prompt", "Run checkout → webhook → DB against Stripe test mode.", "Running 6 integration tests"],
      ["integ", "lead", "issue", 'invoice.paid test failed. Subscription stays "incomplete".', "Sent failure to Builder", "1 of 6 failed"],
      ["lead", "integ", "prompt", "Builder pushed a fix to handler.ts. Run the suite again.", "Re-running 6 tests"],
      ["integ", "cov", "prompt", "All 6 pass. Collect coverage.", "Measuring coverage", "6 of 6 pass"],
      ["cov", "lead", "reply", "Billing module: 91% lines, 84% branches.", "Writing the summary", "Report attached"],
    ],
  },
  {
    id: "uitester",
    name: "UI Tester",
    mission: "Drive a real browser through pricing, checkout and success pages with Stripe test cards.",
    summary: "Opening /pricing",
    brief: "Walk the checkout flow at mobile and desktop widths. Use test cards only.",
    finish: "Checkout flow verified. 2 cases, 1 layout issue sent to Builder.",
    subs: [
      { id: "nav", name: "Navigator", role: "Moves through pages", activity: "On /pricing at 390px", state: "working" },
      { id: "cards", name: "Card Filler", role: "Enters test cards", activity: "Ready for a task" },
      { id: "shots", name: "Screenshots", role: "Captures each step", activity: "Ready for a task" },
      { id: "diff", name: "Visual Diff", role: "Compares to baseline", activity: "Ready for a task" },
      { id: "console", name: "Console Watch", role: "Errors and warnings", activity: "Listening · 0 errors", state: "working" },
    ],
    steps: [
      ["nav", "cards", "prompt", "Pro is selected and the checkout form is open. Pay with the success card.", "Typing 4242 4242 4242 4242"],
      ["cards", "nav", "reply", "Payment accepted. Redirected to /billing/success.", "Waiting for the page to settle", "Payment accepted"],
      ["nav", "shots", "prompt", "Capture /billing/success at 390px and 1280px.", "2 screenshots saved"],
      ["shots", "diff", "prompt", "Compare against the billing-success baseline.", "Diffing 2 images", "Sent for diff"],
      ["diff", "nav", "issue", "The plan badge overlaps the heading at 390px.", "Sent layout issue to Builder", "1 layout issue"],
      ["console", "nav", "reply", "No console errors. 1 warning: logo is missing alt text.", "Noted 1 warning", "1 warning logged"],
      ["nav", "cards", "prompt", "Now try 4000 0000 0000 0002. It should be declined.", "Testing the declined card"],
      ["cards", "nav", "reply", 'Decline message shown: "Your card was declined."', "Flow complete · 2 cases", "2 of 2 cases pass"],
    ],
  },
  {
    id: "fault",
    name: "Fault Tolerance",
    mission: "Break things on purpose: replay webhooks, drop the network mid-payment, check retries and idempotency.",
    summary: "Picking failure modes",
    brief: "Probe failure modes for payments. Duplicate charges are the top risk.",
    finish: "Payments survive replays and drops. 1 issue found and fixed.",
    subs: [
      { id: "chaos", name: "Chaos Lead", role: "Picks the next failure", activity: "Picking 4 failure modes", state: "working" },
      { id: "replay", name: "Replayer", role: "Resends webhook events", activity: "Ready for a task" },
      { id: "idem", name: "Idempotency", role: "Checks for duplicates", activity: "Ready for a task" },
      { id: "net", name: "Net Dropper", role: "Cuts connections", activity: "Ready for a task" },
      { id: "retry", name: "Retry Auditor", role: "Traces client retries", activity: "Ready for a task" },
    ],
    steps: [
      ["chaos", "replay", "prompt", "Send invoice.paid twice with the same event ID.", "Replaying evt_1PqR twice"],
      ["replay", "idem", "question", "Did the second delivery write a row?", "Counting invoice rows"],
      ["idem", "replay", "issue", "Yes. 2 invoice rows for one event. Not idempotent.", "Holding for a fix", "Duplicate found"],
      ["chaos", "net", "prompt", "Drop the network 400ms after the user clicks Pay.", "Cutting the connection"],
      ["net", "retry", "prompt", "The client saw a timeout. Check that it retried safely.", "Tracing retries", "Connection dropped"],
      ["retry", "chaos", "reply", "Retried once with the same Idempotency-Key. No double charge.", "Queuing the replay check", "1 safe retry"],
      ["chaos", "idem", "prompt", "Builder added a unique index on event_id. Check again.", "Re-running the replay"],
      ["idem", "chaos", "reply", "Second delivery ignored. 1 row. Passing.", "Writing findings", "Idempotent"],
    ],
  },
  {
    id: "threshold",
    name: "Threshold",
    mission: "Load the checkout and webhook routes. Find rate limits, burst behavior and projected cost.",
    summary: "Warming up load",
    brief: "Find the breaking points for checkout and webhooks. Stay under $1 of test spend.",
    finish: "Limits documented. 30 req/s per IP, queue holds 200-event bursts.",
    subs: [
      { id: "load", name: "Load Gen", role: "Ramps traffic", activity: "Warming up · 12 req/s", state: "working" },
      { id: "rate", name: "Rate Probe", role: "Finds 429s", activity: "Ready for a task" },
      { id: "burst", name: "Burst", role: "Webhook floods", activity: "Ready for a task" },
      { id: "cost", name: "Cost Meter", role: "Tracks spend", activity: "$0.00 this run", state: "working" },
    ],
    steps: [
      ["load", "rate", "prompt", "Ramp /api/checkout to 50 req/s for 60s.", "Ramping 12 → 50 req/s"],
      ["rate", "load", "reply", "429s start at 30 req/s per IP. p95 is 180ms below that.", "Logging the limit", "Limit found: 30 req/s"],
      ["load", "burst", "prompt", "Fire 200 webhooks in 2 seconds.", "Bursting 200 events"],
      ["burst", "cost", "question", "What did that run cost?", "Summing API calls"],
      ["cost", "burst", "reply", "$0.04 in test mode. About $11/day at launch volume.", "Watching queue lag", "Within budget"],
      ["burst", "load", "reply", "The queue absorbed all 200. Max lag 1.4s.", "Writing limits.md", "Queue drained"],
    ],
  },
  {
    id: "security",
    name: "Security Reviewer",
    mission: "Check secrets, auth, input validation, dependencies and webhook signatures.",
    summary: "Scanning for secrets",
    brief: "Review the payments diff for secret leaks, auth gaps and unsafe input.",
    finish: "1 issue patched. No secrets exposed, signatures verified.",
    subs: [
      { id: "secrets", name: "Secrets Scan", role: "Keys in code and logs", activity: "Scanning 23 files", state: "working" },
      { id: "sig", name: "Signature", role: "Webhook verification", activity: "Ready for a task" },
      { id: "auth", name: "Auth Check", role: "Who can call what", activity: "Mapping 4 routes", state: "working" },
      { id: "input", name: "Input Guard", role: "Request validation", activity: "Ready for a task" },
      { id: "deps", name: "Dep Audit", role: "Package advisories", activity: "Ready for a task" },
    ],
    steps: [
      ["secrets", "sig", "prompt", "No keys in the repo. Confirm the webhook route verifies signatures.", "Reading webhooks/stripe.ts", "0 keys found"],
      ["sig", "secrets", "reply", "constructEvent() runs on the raw body. Verified.", "Checking logs for secrets", "Signatures pass"],
      ["auth", "input", "prompt", "/api/checkout takes priceId from the client. Check it.", "Validating the request body"],
      ["input", "auth", "issue", "Any price ID is accepted. A user could pick a cheaper price.", "Writing an allowlist", "Allowlist missing"],
      ["auth", "input", "prompt", "Limit priceId to the 2 known prices. Send the patch to Builder.", "Patch sent to Builder"],
      ["secrets", "deps", "prompt", "Audit the new stripe package.", "Checking advisories"],
      ["deps", "secrets", "reply", "stripe@16.2.0 has no known advisories.", "Writing the review", "0 vulnerable packages"],
    ],
  },
  {
    id: "reviewer",
    name: "Reviewer",
    mission: "Final pass: check the diff against acceptance criteria and write the report you will read.",
    summary: "Starts after verification",
    brief: "Check the work against 9 acceptance criteria and draft the final report.",
    finish: "Report ready. 2 items need you: live keys and refunds.",
    runsLast: true,
    subs: [
      { id: "criteria", name: "Criteria", role: "Acceptance checks", activity: "Loaded 9 criteria" },
      { id: "diff", name: "Diff Reader", role: "Reads every change", activity: "Ready for a task" },
      { id: "consist", name: "Consistency", role: "Matches house style", activity: "Ready for a task" },
      { id: "report", name: "Report Writer", role: "Summary for you", activity: "Ready for a task" },
    ],
    steps: [
      ["criteria", "diff", "prompt", "Check the diff against all 9 acceptance criteria.", "Reading 23 changed files"],
      ["diff", "consist", "prompt", "New routes call fetch directly. The rest of the app uses apiClient.", "Comparing patterns"],
      ["consist", "diff", "reply", "Flag it as minor. Not blocking.", "Finishing the read", "1 minor note"],
      ["diff", "criteria", "reply", "8 of 9 criteria met. Refunds are not built yet.", "Deciding what to escalate", "8 of 9 met"],
      ["criteria", "you", "ask_human", "Refunds aren't built yet. Ship payments without refunds, or build them first?", "Writing the final report", undefined, {
        type: "decision",
        options: ["Ship without refunds", "Build refunds first"],
        recommended: "Ship without refunds",
      }],
      ["criteria", "report", "prompt", "Draft the summary. List live keys and refunds as steps for the user.", "Writing the summary"],
      ["report", "criteria", "reply", "Summary ready. 2 items need the user.", "Sending to Orca", "Report ready"],
    ],
  },
];
