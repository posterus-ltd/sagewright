import { Server } from '@modelcontextprotocol/sdk/server';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  SessionOrigin,
  TERMINAL_STATUSES,
  TriggerType,
  canvasLayoutSchema,
  createScheduledPromptSchema,
  createSessionSchema,
  createShellSessionSchema,
  sessionLabel,
  sessionLeafIds,
  workflowInputSchema,
  workspacesSchema,
  type ScheduledPrompt,
} from '@sagewright/shared';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { z } from 'zod';

import type { AppDeps } from '../app';
import { scheduledPrompts, sessions } from '../db/schema';

/** The identity an MCP call runs as, resolved from the bearer token by requireMcpCaller. */
export interface McpCallerContext {
  /** The user the agent acts as — `createdBy` of everything it spawns. */
  userId: string;
  /** The session the agent is running in — the parent of anything it spawns. */
  callerSessionId: string;
}

// Guardrails against runaway agents-spawning-agents (a genuine fork-bomb risk once an
// agent can spawn more agents). The per-chain caps are fixed; the per-USER ceiling is
// configurable in user settings (`maxActiveSessions`), read live per spawn.
const MAX_SPAWN_DEPTH = 3; // a session this deep in the parent chain may not spawn further
const MAX_ACTIVE_CHILDREN = 5; // concurrent non-terminal children of one session

const NON_TERMINAL = () => notInArray(sessions.status, [...TERMINAL_STATUSES]);

/** How many ancestors the caller session has (0 for a top-level human session). Walks
 *  parent_session_id up to the cap; the FK graph is a DAG so it terminates regardless. */
const ancestorDepth = async (deps: AppDeps, sessionId: string): Promise<number> => {
  let depth = 0;
  let current: string | null = sessionId;
  while (current && depth <= MAX_SPAWN_DEPTH + 1) {
    const [row] = await deps.db
      .select({ parent: sessions.parentSessionId })
      .from(sessions)
      .where(eq(sessions.id, current))
      .limit(1);
    if (!row || !row.parent) break;
    depth += 1;
    current = row.parent;
  }
  return depth;
};

const countRows = async (deps: AppDeps, where: ReturnType<typeof and>): Promise<number> =>
  (await deps.db.select({ id: sessions.id }).from(sessions).where(where)).length;

/** The user's live cap on concurrent non-terminal sessions (from user settings). Returns
 *  the cap when the user is already at or over it (so the caller refuses the spawn), else
 *  null. Read per spawn so a settings change takes effect on the next call. */
const perUserCapReached = async (deps: AppDeps, userId: string): Promise<number | null> => {
  const { maxActiveSessions } = await deps.userSettingsService.get(userId);
  const active = await countRows(deps, and(eq(sessions.createdBy, userId), NON_TERMINAL()));
  return active >= maxActiveSessions ? maxActiveSessions : null;
};

const rowToScheduled = (r: typeof scheduledPrompts.$inferSelect): ScheduledPrompt => ({
  id: r.id,
  cron: r.cron,
  prompt: r.prompt,
  enabled: r.enabled,
  runnerImage: r.runnerImage,
  lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
  createdAt: r.createdAt.toISOString(),
});

// MCP tool results: `ok` returns JSON the model reads back; `fail` marks a tool-level
// error (bad input, quota, not found) visible to the model without aborting the call.
const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] });
const fail = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });

// Each tool's argument schema is a zod schema — the single source of truth that is both
// serialized into the JSON-Schema `inputSchema` the model sees (see TOOLS below) and used
// to validate incoming arguments in the CallTool handler. Keeping one schema per tool means
// the advertised shape and the enforced shape can never drift.

// A spawned session runs headless to completion, so a prompt is REQUIRED here (unlike the
// interactive createSessionSchema, where an empty session just drops the user into the
// harness). Without one the child would come up with PROMPT='' and do nothing.
const spawnSessionArgs = z.object({
  prompt: z.string().min(1).describe('What the spawned agent should do.'),
  runnerImage: z.string().optional().describe('Optional runner image override; defaults to your default runner.'),
});
const runWorkflowArgs = z.object({
  id: z.string().min(1).describe('The workflow id to run.'),
  input: z.string().optional().describe('Optional seed input for step 1.'),
});
const getSessionArgs = z.object({ id: z.string().min(1).describe('The session id.') });
const archiveSessionArgs = z.object({ id: z.string().min(1).describe('The session id to archive.') });
const listRunnersArgs = z.object({});
const listSessionsArgs = z.object({});
const getCanvasArgs = z.object({});
const getWorkspacesArgs = z.object({});

/** The tools this server exposes; the values are the wire names an MCP client calls by. */
enum McpToolName {
  SPAWN_SESSION = 'spawn_session',
  SPAWN_INTERACTIVE_SESSION = 'spawn_interactive_session',
  SPAWN_SHELL = 'spawn_shell',
  ARCHIVE_SESSION = 'archive_session',
  SCHEDULE_JOB = 'schedule_job',
  CREATE_WORKFLOW = 'create_workflow',
  RUN_WORKFLOW = 'run_workflow',
  LIST_RUNNERS = 'list_runners',
  LIST_SESSIONS = 'list_sessions',
  GET_SESSION = 'get_session',
  GET_CANVAS = 'get_canvas',
  SET_CANVAS = 'set_canvas',
  GET_WORKSPACES = 'get_workspaces',
  SET_WORKSPACES = 'set_workspaces',
}

interface McpToolDef {
  description: string;
  /** Serialized to the wire `inputSchema` AND used to validate calls in the handler. */
  schema: z.ZodType;
}

// Keyed by tool name so the CallTool handler can fetch a tool's schema by id in O(1).
// `satisfies` (rather than a `: Record<…>` annotation) preserves each entry's NARROW schema
// type, so `parsed.data` stays typed at the call sites; the Record constraint still forces
// every McpToolName to have a definition.
const TOOL_DEFS = {
  [McpToolName.SPAWN_SESSION]: {
    description:
      'Spawn a new headless agent session as a child of the current session. The child ' +
      'runs the given prompt to completion and appears under this session in the run graph.',
    schema: spawnSessionArgs,
  },
  [McpToolName.SPAWN_INTERACTIVE_SESSION]: {
    description:
      'Spawn a standalone, persisted INTERACTIVE agent session on the user\'s behalf (tagged ' +
      '"delegated"). Unlike spawn_session it is not a headless child: it appears in the Sessions ' +
      'list, can be placed on the canvas, and stays resumable between turns. Omit the prompt to ' +
      'start an empty session. Returns its id.',
    schema: createSessionSchema,
  },
  [McpToolName.SPAWN_SHELL]: {
    description:
      'Spawn a no-agent CLI widget: the given command runs in a persistent terminal on the basic ' +
      'CLI runner (e.g. "watch -n1 date" for a clock, "htop", "npm run dev"). It appears in the ' +
      'Sessions list and can be placed on the canvas, tagged "delegated". Returns its id.',
    schema: createShellSessionSchema,
  },
  [McpToolName.ARCHIVE_SESSION]: {
    description: 'Archive one of your sessions by id — hides it from the active list; the row and its history remain.',
    schema: archiveSessionArgs,
  },
  [McpToolName.SCHEDULE_JOB]: {
    description: 'Schedule a recurring headless prompt on a cron expression. Fires as your user.',
    schema: createScheduledPromptSchema,
  },
  [McpToolName.CREATE_WORKFLOW]: {
    description:
      'Create a multi-step workflow definition (a sequenced, self-validating run). ' +
      'Returns its id; use run_workflow to execute it. At least one validation step is required.',
    schema: workflowInputSchema,
  },
  [McpToolName.RUN_WORKFLOW]: {
    description: 'Trigger a run of an existing workflow by id. Optional input seeds the first step.',
    schema: runWorkflowArgs,
  },
  [McpToolName.LIST_RUNNERS]: {
    description: 'List the runner images available to spawn sessions / workflow steps with.',
    schema: listRunnersArgs,
  },
  [McpToolName.LIST_SESSIONS]: {
    description:
      'List your standalone sessions (id, kind, label, status, origin) — the ones placeable on the ' +
      'canvas. Use it to find session ids to arrange with set_canvas.',
    schema: listSessionsArgs,
  },
  [McpToolName.GET_SESSION]: {
    description: 'Fetch the status of one of your sessions by id (e.g. one you spawned).',
    schema: getSessionArgs,
  },
  [McpToolName.GET_CANVAS]: {
    description: 'Read the user\'s current canvas layout: the placed session widgets (id, x, y, size, color) and the viewport.',
    schema: getCanvasArgs,
  },
  [McpToolName.SET_CANVAS]: {
    description:
      'Replace the user\'s canvas layout: position session widgets (placements) and set the viewport. ' +
      'Every placement.sessionId must be one of your own sessions. Combine with spawn_interactive_session / ' +
      'spawn_shell to build and arrange a working dev canvas. Changes are visible to the user live.',
    schema: canvasLayoutSchema,
  },
  [McpToolName.GET_WORKSPACES]: {
    description: 'Read the user\'s saved workspaces (named tiling layouts of sessions).',
    schema: getWorkspacesArgs,
  },
  [McpToolName.SET_WORKSPACES]: {
    description:
      'Replace the user\'s workspaces: named tiling layouts, each a binary tree of panes holding session ' +
      'ids (or `empty:*` slots). A tree leaf is either a session id you own or an `empty:*` placeholder; a ' +
      'split is { direction: "row"|"column", first, second, splitPercentage }. Every real session leaf must ' +
      'be one of your own sessions. Combine with spawn_interactive_session / spawn_shell to build and tile a ' +
      'working dev layout. Changes are visible to the user live.',
    schema: workspacesSchema,
  },
} satisfies Record<McpToolName, McpToolDef>;

/** Serializes a tool's zod schema into the JSON-Schema `inputSchema` MCP advertises.
 *  `io: 'input'` renders the caller-facing shape, so fields with a default (e.g.
 *  schedule_job's `enabled`) are advertised optional rather than required. Zod refinements
 *  (the workflow definition's superRefine, the trigger's refine) don't map to JSON Schema
 *  and are omitted here — they still run when the handler parses the arguments. The stray
 *  `$schema` dialect marker is dropped to keep the advertised shape lean. */
const toInputSchema = (schema: z.ZodType): Tool['inputSchema'] => {
  const { $schema: _dialect, ...json } = z.toJSONSchema(schema, { io: 'input' });
  return json as Tool['inputSchema'];
};

const TOOLS: Tool[] = Object.entries(TOOL_DEFS).map(([name, { description, schema }]) => ({
  name,
  description,
  inputSchema: toInputSchema(schema),
}));

/**
 * Builds an MCP server exposing the control plane's session / scheduling / workflow
 * seams as tools, bound to one caller's resolved identity. The handlers are thin
 * adapters over the SAME services the HTTP routes use (taskService, scheduler,
 * workflowService/Driver), so behaviour and validation stay consistent. A fresh server
 * is built per request (stateless transport) capturing `ctx` in the closure.
 */
export const buildMcpServer = (deps: AppDeps, ctx: McpCallerContext): Server => {
  const server = new Server(
    { name: 'sagewright-control-plane', version: '0.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const args = rawArgs ?? {};

    switch (name) {
      case McpToolName.SPAWN_SESSION: {
        const parsed = TOOL_DEFS[McpToolName.SPAWN_SESSION].schema.safeParse(args);
        if (!parsed.success) return fail(`invalid input: ${parsed.error.issues[0]?.message ?? 'bad request'}`);

        // Guardrails BEFORE spawning so a rejected request never leaves a FAILED row.
        const depth = await ancestorDepth(deps, ctx.callerSessionId);
        if (depth + 1 > MAX_SPAWN_DEPTH) return fail(`spawn depth limit reached (max ${MAX_SPAWN_DEPTH})`);
        if ((await countRows(deps, and(eq(sessions.parentSessionId, ctx.callerSessionId), NON_TERMINAL()))) >= MAX_ACTIVE_CHILDREN) {
          return fail(`too many active child sessions (max ${MAX_ACTIVE_CHILDREN})`);
        }
        const cap = await perUserCapReached(deps, ctx.userId);
        if (cap !== null) return fail(`too many active sessions for this user (max ${cap})`);

        const session = await deps.taskService.create(parsed.data, ctx.userId, { parentSessionId: ctx.callerSessionId });
        return ok({ sessionId: session.id, status: session.status, parentSessionId: ctx.callerSessionId });
      }

      case McpToolName.SPAWN_INTERACTIVE_SESSION: {
        const parsed = TOOL_DEFS[McpToolName.SPAWN_INTERACTIVE_SESSION].schema.safeParse(args);
        if (!parsed.success) return fail(`invalid input: ${parsed.error.issues[0]?.message ?? 'bad request'}`);
        // Standalone (no parentSessionId) so it lands in the Sessions list / canvas; the
        // per-user cap is the fork-bomb backstop for these.
        const cap = await perUserCapReached(deps, ctx.userId);
        if (cap !== null) return fail(`too many active sessions for this user (max ${cap})`);
        const session = await deps.taskService.create(parsed.data, ctx.userId, { origin: SessionOrigin.AGENT });
        return ok({ sessionId: session.id, kind: session.kind, status: session.status });
      }

      case McpToolName.SPAWN_SHELL: {
        const parsed = TOOL_DEFS[McpToolName.SPAWN_SHELL].schema.safeParse(args);
        if (!parsed.success) return fail(`invalid input: ${parsed.error.issues[0]?.message ?? 'bad request'}`);
        const cap = await perUserCapReached(deps, ctx.userId);
        if (cap !== null) return fail(`too many active sessions for this user (max ${cap})`);
        const session = await deps.taskService.create(
          { runnerImage: parsed.data.runnerImage },
          ctx.userId,
          { command: parsed.data.command, origin: SessionOrigin.AGENT },
        );
        return ok({ sessionId: session.id, kind: session.kind, status: session.status });
      }

      case McpToolName.ARCHIVE_SESSION: {
        const parsed = TOOL_DEFS[McpToolName.ARCHIVE_SESSION].schema.safeParse(args);
        if (!parsed.success) return fail(`invalid input: ${parsed.error.issues[0]?.message ?? 'bad request'}`);
        const session = await deps.taskService.get(parsed.data.id);
        // Owner-scoped, mirroring the HTTP routes: someone else's session reads as absent.
        if (!session || session.createdBy !== ctx.userId) return fail('not found');
        await deps.taskService.archive(parsed.data.id);
        return ok({ id: parsed.data.id, archived: true });
      }

      case McpToolName.SCHEDULE_JOB: {
        const parsed = TOOL_DEFS[McpToolName.SCHEDULE_JOB].schema.safeParse(args);
        if (!parsed.success) return fail(`invalid input: ${parsed.error.issues[0]?.message ?? 'bad request'}`);
        const body = parsed.data;
        if (!deps.scheduler.isValidCron(body.cron)) return fail('invalid cron');
        if (body.runnerImage) {
          const runners = await deps.runnerRegistry.list();
          if (!runners.some((w) => w.image === body.runnerImage)) return fail(`unknown runner image: ${body.runnerImage}`);
        }
        const [row] = await deps.db
          .insert(scheduledPrompts)
          .values({ cron: body.cron, prompt: body.prompt, enabled: body.enabled, runnerImage: body.runnerImage ?? null, createdBy: ctx.userId })
          .returning();
        await deps.scheduler.sync();
        return ok(rowToScheduled(row!));
      }

      case McpToolName.CREATE_WORKFLOW: {
        const parsed = TOOL_DEFS[McpToolName.CREATE_WORKFLOW].schema.safeParse(args);
        if (!parsed.success) return fail(`invalid workflow: ${parsed.error.issues[0]?.message ?? 'bad request'}`);
        const def = parsed.data.definition;
        const runners = await deps.runnerRegistry.list();
        const known = new Set(runners.map((w) => w.image));
        const missing = def.steps.map((s) => s.runnerImage).find((image) => !known.has(image));
        if (missing) return fail(`unknown runner image: ${missing}`);
        if (def.trigger.type === TriggerType.CRON && def.trigger.cron && !deps.scheduler.isValidCron(def.trigger.cron)) {
          return fail('invalid cron');
        }
        const wf = await deps.workflowService.create(parsed.data, ctx.userId);
        await deps.scheduler.sync();
        return ok({ id: wf.id, name: wf.name, enabled: wf.enabled });
      }

      case McpToolName.RUN_WORKFLOW: {
        const parsed = TOOL_DEFS[McpToolName.RUN_WORKFLOW].schema.safeParse(args);
        if (!parsed.success) return fail(`invalid input: ${parsed.error.issues[0]?.message ?? 'bad request'}`);
        const run = await deps.workflowDriver.start(parsed.data.id, ctx.userId, parsed.data.input);
        if (!run) return fail('workflow not found');
        return ok({ runId: run.id, workflowId: run.workflowId, status: run.status });
      }

      case McpToolName.LIST_RUNNERS: {
        const runners = await deps.runnerRegistry.list();
        return ok(runners);
      }

      case McpToolName.LIST_SESSIONS: {
        // Standalone sessions only (same scope as the Sessions page / canvas), owned by the caller.
        const list = await deps.taskService.list(ctx.userId);
        return ok(
          list.map((s) => ({
            id: s.id,
            kind: s.kind,
            label: sessionLabel(s),
            status: s.status,
            origin: s.origin,
            archived: s.archivedAt !== null,
          })),
        );
      }

      case McpToolName.GET_CANVAS: {
        return ok(await deps.canvasLayoutService.get(ctx.userId));
      }

      case McpToolName.SET_CANVAS: {
        const parsed = TOOL_DEFS[McpToolName.SET_CANVAS].schema.safeParse(args);
        if (!parsed.success) return fail(`invalid canvas layout: ${parsed.error.issues[0]?.message ?? 'bad request'}`);
        // Only the caller's own sessions may be placed — reject a layout that references a
        // foreign or non-existent session id, so the agent can't surface another user's work.
        const ids = [...new Set(parsed.data.placements.map((p) => p.sessionId))];
        if (ids.length) {
          const owned = await deps.db
            .select({ id: sessions.id })
            .from(sessions)
            .where(and(inArray(sessions.id, ids), eq(sessions.createdBy, ctx.userId)));
          const ownedIds = new Set(owned.map((r) => r.id));
          const foreign = ids.find((id) => !ownedIds.has(id));
          if (foreign) return fail(`placement references a session you don't own or that doesn't exist: ${foreign}`);
        }
        await deps.canvasLayoutService.set(ctx.userId, parsed.data);
        return ok({ placements: parsed.data.placements.length });
      }

      case McpToolName.GET_WORKSPACES: {
        return ok(await deps.workspacesService.get(ctx.userId));
      }

      case McpToolName.SET_WORKSPACES: {
        const parsed = TOOL_DEFS[McpToolName.SET_WORKSPACES].schema.safeParse(args);
        if (!parsed.success) return fail(`invalid workspaces: ${parsed.error.issues[0]?.message ?? 'bad request'}`);
        // Only the caller's own sessions may be placed — reject a layout that references a
        // foreign or non-existent session id (exactly like set_canvas), so the agent can't
        // surface another user's work. `sessionLeafIds` skips `empty:*` slots; gather across
        // every workspace's tree and dedupe before the single ownership check.
        const ids = [...new Set(parsed.data.workspaces.flatMap((w) => sessionLeafIds(w.tree)))];
        if (ids.length) {
          const owned = await deps.db
            .select({ id: sessions.id })
            .from(sessions)
            .where(and(inArray(sessions.id, ids), eq(sessions.createdBy, ctx.userId)));
          const ownedIds = new Set(owned.map((r) => r.id));
          const foreign = ids.find((id) => !ownedIds.has(id));
          if (foreign) return fail(`workspace references a session you don't own or that doesn't exist: ${foreign}`);
        }
        await deps.workspacesService.set(ctx.userId, parsed.data);
        return ok({ workspaces: parsed.data.workspaces.length });
      }

      case McpToolName.GET_SESSION: {
        const parsed = TOOL_DEFS[McpToolName.GET_SESSION].schema.safeParse(args);
        if (!parsed.success) return fail(`invalid input: ${parsed.error.issues[0]?.message ?? 'bad request'}`);
        const session = await deps.taskService.get(parsed.data.id);
        // Owner-scoped, mirroring the HTTP routes: someone else's session reads as absent.
        if (!session || session.createdBy !== ctx.userId) return fail('not found');
        return ok({
          id: session.id,
          kind: session.kind,
          status: session.status,
          prompt: session.prompt,
          branch: session.branch,
          prUrl: session.prUrl,
          parentSessionId: session.parentSessionId,
          error: session.error,
          createdAt: session.createdAt,
        });
      }

      default:
        return fail(`unknown tool: ${name}`);
    }
  });

  return server;
};
