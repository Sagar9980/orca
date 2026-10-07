import { index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { ProjectSource, RunStatus } from "@orca/shared";
import { user } from "./auth-schema.js";

// With time zone: Postgres then stores an exact instant, whatever the server's local zone is.
const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").defaultNow().notNull();

/** A desktop app install that has connected a folder. */
export const machine = pgTable(
  "machine",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Random id the desktop app generates and keeps; unique per user, not globally trusted. */
    deviceId: text("device_id").notNull(),
    name: text("name").notNull(),
    platform: text("platform").notNull(),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("machine_user_device_uq").on(t.userId, t.deviceId)],
);

/** One codebase a user works on. */
export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    source: text("source").$type<ProjectSource>().notNull(),
    defaultBranch: text("default_branch").notNull(),
    githubRepo: text("github_repo"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    lastOpenedAt: ts("last_opened_at"),
  },
  (t) => [uniqueIndex("project_user_slug_uq").on(t.userId, t.slug)],
);

/** Where a project sits on one machine. The same project can live at different paths on different computers. */
export const projectFolder = pgTable(
  "project_folder",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    machineId: text("machine_id")
      .notNull()
      .references(() => machine.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.machineId] }),
    uniqueIndex("project_folder_machine_path_uq").on(t.machineId, t.path),
  ],
);

/** A request the user made in a project. The orchestrator will fill in the rest. */
export const run = pgTable(
  "run",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").$type<RunStatus>().notNull().default("planning"),
    branch: text("branch").notNull(),
    budgetCents: integer("budget_cents").notNull(),
    createdAt: createdAt(),
    updatedAt: ts("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("run_project_created_idx").on(t.projectId, t.createdAt)],
);
