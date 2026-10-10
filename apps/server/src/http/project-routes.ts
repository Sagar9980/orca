import { randomBytes } from "node:crypto";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { z } from "zod";
import {
  DEVICE_HEADER,
  RUN_BUDGET_CHOICES_USD,
  type DeviceInfo,
  type Project,
  type RunSummary,
} from "@orca/shared";
import { db } from "../db/index.js";
import { machine, project, projectFolder, run } from "../db/schema.js";
import { requireSession } from "./auth-routes.js";

const newId = () => randomBytes(12).toString("base64url");

// Git allows a lot in branch names; this keeps out whitespace, control characters and option-like names.
const branchName = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[^\s~^:?*[\\\x00-\x1f\x7f]+$/, "Not a valid branch name.")
  .refine((b) => !b.startsWith("-"), "Not a valid branch name.");

const device = z.object({
  id: z.string().trim().min(8).max(100),
  name: z.string().trim().min(1).max(120),
  platform: z.string().trim().min(1).max(40),
});

const createLocalProject = z.object({
  source: z.literal("local"),
  name: z.string().trim().min(1).max(80),
  path: z
    .string()
    .min(1)
    .max(4096)
    .refine((p) => path.isAbsolute(p) || path.win32.isAbsolute(p), "Use the folder's full path."),
  defaultBranch: branchName,
  githubRepo: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/)
    .nullish(),
  device,
});

const updateProject = z
  .object({ name: z.string().trim().min(1).max(80), defaultBranch: branchName })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to change.");

const createRun = z.object({
  title: z.string().trim().min(3, "Describe what to build in a few words.").max(2000),
  branch: branchName,
  budgetUsd: z.number().refine((n) => (RUN_BUDGET_CHOICES_USD as readonly number[]).includes(n), "Pick one of the spend limits."),
});

function invalid(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({ error: "invalid", message: error.issues[0]?.message ?? "Check the request and try again." });
}

const notFound = (reply: FastifyReply) =>
  reply.status(404).send({ error: "not_found", message: "That project doesn't exist, or it isn't yours." });

/** The machine the request comes from, if the desktop app sent its device id and has registered before. */
async function requestMachine(request: FastifyRequest): Promise<string | null> {
  const deviceId = request.headers[DEVICE_HEADER];
  if (typeof deviceId !== "string" || !deviceId) return null;
  const [row] = await db
    .select({ id: machine.id })
    .from(machine)
    .where(and(eq(machine.userId, request.session!.user.id), eq(machine.deviceId, deviceId)));
  return row?.id ?? null;
}

async function upsertMachine(userId: string, info: DeviceInfo): Promise<string> {
  const [row] = await db
    .insert(machine)
    .values({ id: newId(), userId, deviceId: info.id, name: info.name, platform: info.platform })
    .onConflictDoUpdate({
      target: [machine.userId, machine.deviceId],
      set: { name: info.name, platform: info.platform, lastSeenAt: new Date() },
    })
    .returning({ id: machine.id });
  return row!.id;
}

/** "My App" → "my-app"; adds -2, -3… when the user already has that slug. */
async function freeSlug(userId: string, name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "project";
  const taken = new Set(
    (
      await db
        .select({ slug: project.slug })
        .from(project)
        .where(and(eq(project.userId, userId), or(eq(project.slug, base), like(project.slug, `${base}-%`))))
    ).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** The project already at this path on this machine, if any. */
async function projectAtFolder(machineId: string, folderPath: string) {
  const [row] = await db
    .select({ slug: project.slug, name: project.name })
    .from(projectFolder)
    .innerJoin(project, eq(project.id, projectFolder.projectId))
    .where(and(eq(projectFolder.machineId, machineId), eq(projectFolder.path, folderPath)));
  return row;
}

const folderTaken = (reply: FastifyReply, existing: { slug: string; name: string }) =>
  reply.status(409).send({
    error: "exists",
    message: `This folder is already the project ${existing.name}.`,
    slug: existing.slug,
  });

/** The unique index an insert ran into (Postgres 23505), or null for any other error. Drizzle puts the pg error on `cause`. */
function uniqueViolation(err: unknown): string | null {
  const pg = ((err as { cause?: unknown })?.cause ?? err) as { code?: unknown; constraint?: unknown } | null;
  return pg?.code === "23505" && typeof pg.constraint === "string" ? pg.constraint : null;
}

const toRunSummary = (r: typeof run.$inferSelect): RunSummary => ({
  id: r.id,
  projectId: r.projectId,
  title: r.title,
  status: r.status,
  branch: r.branch,
  budgetUsd: r.budgetCents / 100,
  createdAt: r.createdAt.toISOString(),
});

const RUNS_PER_PROJECT = 50;

async function listProjects(userId: string, machineId: string | null): Promise<Project[]> {
  const rows = await db
    .select({ p: project, folder: projectFolder.path })
    .from(project)
    .leftJoin(
      projectFolder,
      and(eq(projectFolder.projectId, project.id), eq(projectFolder.machineId, machineId ?? "")),
    )
    .where(eq(project.userId, userId))
    .orderBy(desc(project.createdAt));
  if (!rows.length) return [];

  const runs = await db
    .select()
    .from(run)
    .where(
      inArray(
        run.projectId,
        rows.map((r) => r.p.id),
      ),
    )
    .orderBy(desc(run.createdAt));
  const byProject = new Map<string, RunSummary[]>();
  for (const r of runs) {
    const list = byProject.get(r.projectId) ?? [];
    if (list.length < RUNS_PER_PROJECT) list.push(toRunSummary(r));
    byProject.set(r.projectId, list);
  }

  return rows.map(({ p, folder }) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    source: p.source,
    defaultBranch: p.defaultBranch,
    githubRepo: p.githubRepo,
    folder,
    createdAt: p.createdAt.toISOString(),
    lastOpenedAt: p.lastOpenedAt?.toISOString() ?? null,
    runs: byProject.get(p.id) ?? [],
  }));
}

async function ownProject(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)));
  return row;
}

/** Projects and their runs. Every route needs a session and only sees the signed-in user's rows. */
export async function projectRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireSession);

  app.get("/api/projects", async (request) => {
    const userId = request.session!.user.id;
    return { projects: await listProjects(userId, await requestMachine(request)) };
  });

  app.post("/api/projects", async (request, reply) => {
    const parsed = createLocalProject.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error);
    const input = parsed.data;
    const userId = request.session!.user.id;
    const machineId = await upsertMachine(userId, input.device);
    // "/a/b/" and "/a/b" are the same folder.
    const folderPath = path.normalize(input.path).replace(/(?<=.)[\\/]+$/, "");

    const existing = await projectAtFolder(machineId, folderPath);
    if (existing) return folderTaken(reply, existing);

    const id = newId();
    // A request made at the same moment can take the folder or the slug between the checks and the insert;
    // the unique indexes catch that, and we answer as if the checks had seen it.
    for (let attempt = 1; ; attempt++) {
      const slug = await freeSlug(userId, input.name);
      try {
        await db.transaction(async (tx) => {
          await tx.insert(project).values({
            id,
            userId,
            slug,
            name: input.name,
            source: "local",
            defaultBranch: input.defaultBranch,
            githubRepo: input.githubRepo ?? null,
            lastOpenedAt: new Date(),
          });
          await tx.insert(projectFolder).values({ projectId: id, machineId, path: folderPath });
        });
        break;
      } catch (err) {
        const index = uniqueViolation(err);
        if (index === "project_folder_machine_path_uq") {
          const taken = await projectAtFolder(machineId, folderPath);
          if (taken) return folderTaken(reply, taken);
        }
        if (index === "project_user_slug_uq" && attempt < 3) continue;
        throw err;
      }
    }

    const created = (await listProjects(userId, machineId)).find((p) => p.id === id);
    return reply.status(201).send({ project: created });
  });

  app.patch<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const parsed = updateProject.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error);
    const userId = request.session!.user.id;
    if (!(await ownProject(userId, request.params.id))) return notFound(reply);
    await db.update(project).set(parsed.data).where(eq(project.id, request.params.id));
    const updated = (await listProjects(userId, await requestMachine(request))).find((p) => p.id === request.params.id);
    return { project: updated };
  });

  // Disconnecting only removes Orca's record. The folder and the repo are never touched.
  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const userId = request.session!.user.id;
    const deleted = await db
      .delete(project)
      .where(and(eq(project.id, request.params.id), eq(project.userId, userId)))
      .returning({ id: project.id });
    if (!deleted.length) return notFound(reply);
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>("/api/projects/:id/runs", async (request, reply) => {
    const parsed = createRun.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error);
    const userId = request.session!.user.id;
    const owned = await ownProject(userId, request.params.id);
    if (!owned) return notFound(reply);

    const [row] = await db
      .insert(run)
      .values({
        id: newId(),
        projectId: owned.id,
        userId,
        title: parsed.data.title,
        branch: parsed.data.branch,
        budgetCents: Math.round(parsed.data.budgetUsd * 100),
      })
      .returning();
    await db.update(project).set({ lastOpenedAt: new Date() }).where(eq(project.id, owned.id));
    return reply.status(201).send({ run: toRunSummary(row!) });
  });
}
