import { z } from 'zod';

/**
 * A user's persisted settings. Modeled as one typed object — not a loose key/value bag —
 * so every setting keeps its own type and validation while the HTTP surface stays generic
 * (`GET /api/settings`, `PATCH /api/settings`). Adding a setting = one field here plus its
 * column; no new endpoint.
 */
/** Hard ceiling on the configurable per-user active-session cap — the fork-bomb backstop
 *  can be tuned but not disabled. */
export const MAX_ACTIVE_SESSIONS_LIMIT = 100;

export const userSettingsSchema = z.object({
  /** Runner image new sessions start with. `null` → fall back to the operator default. */
  defaultRunnerImage: z.string().min(1).nullable(),
  /** Whether this user's agents may call the `/mcp` endpoint. */
  mcpEnabled: z.boolean(),
  /** Cap on concurrent non-terminal sessions this user's agents may spawn over MCP —
   *  the guardrail against runaway agents-spawning-agents. */
  maxActiveSessions: z.number().int().min(1).max(MAX_ACTIVE_SESSIONS_LIMIT),
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

/** A PATCH body: any subset of settings. Omitted keys are left as-is. */
export const userSettingsPatchSchema = userSettingsSchema.partial();
export type UserSettingsPatch = z.infer<typeof userSettingsPatchSchema>;

/** Served to a user who has never saved a setting; mirrors the column defaults. */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  defaultRunnerImage: null,
  mcpEnabled: true,
  maxActiveSessions: 25,
};
