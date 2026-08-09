import { Server } from '@modelcontextprotocol/sdk/server';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
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

// A spawned session runs headless to completion, so a prompt is REQUIRED here (unlike the
// interactive createSessionSchema, where an empty session just drops the user into the
// harness). Without one the child would come up with PROMPT='' and do nothing.
const spawnSessionArgs = z.object({ prompt: z.string().min(1), runnerImage: z.string().optional() });
const runWorkflowArgs = z.object({ id: z.string().min(1), input: z.string().optional() });
const getSessionArgs = z.object({ id: z.string().min(1) });

const TOOLS = [
  {
    name: 'spawn_session',
    description:
      'Spawn a new headless agent session as a child of the current session. The child ' +
      'runs the given prompt to completion and appears under this session in the run graph.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What the spawned agent should do.' },
        runnerImage: { type: 'string', description: 'Optional runner image override; defaults to your default runner.' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
  {
    name: 'schedule_job',
    description: 'Schedule a recurring headless prompt on a cron expression. Fires as your user.',
    inputSchema: {
      type: 'object',
      properties: {
        cron: { type: 'string', description: 'Standard 5-field cron expression.' },
        prompt: { type: 'string', description: 'The prompt the scheduled agent runs each fire.' },
        enabled: { type: 'boolean', description: 'Whether the schedule is active (default true).' },
        runnerImage: { type: 'string', description: 'Optional runner image override.' },
      },
      required: ['cron', 'prompt'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_workflow',
    description:
      'Create a multi-step workflow definition (a sequenced, self-validating run). ' +
      'Returns its id; use run_workflow to execute it.',
    inputSchema: {
      type: 'object',
      properties: {
        definition: {
          type: 'object',
          description:
            'WorkflowDefinition: { name, trigger:{ type:"manual"|"cron", cron? }, maxIterations>=1, ' +
            'steps:[{ key, name, goal, runnerImage, kind:"work"|"validation", onFailureGoTo?, validateCommands? }] }. ' +
            'At least one validation step is required.',
        },
        enabled: { type: 'boolean', description: 'Whether the workflow is active (default true).' },
      },
      required: ['definition'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_workflow',
    description: 'Trigger a run of an existing workflow by id. Optional input seeds the first step.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The workflow id to run.' },
        input: { type: 'string', description: 'Optional seed input for step 1.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_runners',
    description: 'List the runner images available to spawn sessions / workflow steps with.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_session',
    description: 'Fetch the status of one of your sessions by id (e.g. one you spawned).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The session id.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
];

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
      case 'spawn_session': {
        const parsed = spawnSessionArgs.safeParse(args);
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

      case 'schedule_job': {
        const parsed = createScheduledPromptSchema.safeParse(args);
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

      case 'create_workflow': {
        const parsed = workflowInputSchema.safeParse(args);
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

      case 'run_workflow': {
        const parsed = runWorkflowArgs.safeParse(args);
        if (!parsed.success) return fail(`invalid input: ${parsed.error.issues[0]?.message ?? 'bad request'}`);
        const run = await deps.workflowDriver.start(parsed.data.id, ctx.userId, parsed.data.input);
        if (!run) return fail('workflow not found');
        return ok({ runId: run.id, workflowId: run.workflowId, status: run.status });
      }

      case 'list_runners': {
        const runners = await deps.runnerRegistry.list();
        return ok(runners);
      }

      case 'get_session': {
        const parsed = getSessionArgs.safeParse(args);
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
