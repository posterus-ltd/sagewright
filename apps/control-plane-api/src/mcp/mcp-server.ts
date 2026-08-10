import { Server } from '@modelcontextprotocol/sdk/server';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  TERMINAL_STATUSES,
  TriggerType,
  createScheduledPromptSchema,
  workflowInputSchema,
  type ScheduledPrompt,
} from '@sagewright/shared';
import { and, eq, notInArray } from 'drizzle-orm';
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
// agent can spawn more agents). Conservative fixed caps; promote to config if a
// deployment needs to tune them.
const MAX_SPAWN_DEPTH = 3; // a session this deep in the parent chain may not spawn further
const MAX_ACTIVE_CHILDREN = 5; // concurrent non-terminal children of one session
const MAX_ACTIVE_PER_USER = 25; // concurrent non-terminal sessions per user

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
const listRunnersArgs = z.object({});

/** The tools this server exposes; the values are the wire names an MCP client calls by. */
enum McpToolName {
  SPAWN_SESSION = 'spawn_session',
  SCHEDULE_JOB = 'schedule_job',
  CREATE_WORKFLOW = 'create_workflow',
  RUN_WORKFLOW = 'run_workflow',
  LIST_RUNNERS = 'list_runners',
  GET_SESSION = 'get_session',
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
  [McpToolName.GET_SESSION]: {
    description: 'Fetch the status of one of your sessions by id (e.g. one you spawned).',
    schema: getSessionArgs,
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
        if ((await countRows(deps, and(eq(sessions.createdBy, ctx.userId), NON_TERMINAL()))) >= MAX_ACTIVE_PER_USER) {
          return fail(`too many active sessions for this user (max ${MAX_ACTIVE_PER_USER})`);
        }

        const session = await deps.taskService.create(parsed.data, ctx.userId, { parentSessionId: ctx.callerSessionId });
        return ok({ sessionId: session.id, status: session.status, parentSessionId: ctx.callerSessionId });
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
