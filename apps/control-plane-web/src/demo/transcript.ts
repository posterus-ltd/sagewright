import type { Session } from '@sagewright/shared';

/** One printed span of the scripted session: `after` ms of "think time", then `text`. */
export interface TranscriptChunk {
  after: number;
  text: string;
}

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
};

/**
 * A believable, looping-free Claude-Code-style session that "works" on the given
 * prompt. Rendered by both the live terminal (WebSocket) and the headless transcript
 * (SSE) so the demo shows an agent reasoning, editing files, and passing tests.
 */
export const agentTranscript = (session: Session): TranscriptChunk[] => {
  const prompt = session.prompt ?? 'Make the requested change';
  const branch = session.branch ?? 'agent/work';
  return [
    { after: 200, text: `${C.dim}sagewright runner · claude-code · branch ${branch}${C.reset}\r\n\r\n` },
    { after: 350, text: `${C.cyan}❯${C.reset} ${prompt}\r\n\r\n` },
    { after: 700, text: `${C.magenta}●${C.reset} Reading the task and mapping the code involved…\r\n` },
    { after: 650, text: `${C.dim}  ⎿ scanning src/auth, src/api, and the shared schema${C.reset}\r\n` },
    { after: 800, text: `${C.magenta}●${C.reset} ${C.bold}Read${C.reset} src/auth/session.ts ${C.dim}(38 lines)${C.reset}\r\n` },
    { after: 500, text: `${C.magenta}●${C.reset} ${C.bold}Grep${C.reset} "throw new" ${C.dim}→ 6 call sites${C.reset}\r\n` },
    { after: 900, text: `\r\n${C.yellow}Plan${C.reset}\r\n` },
    { after: 300, text: `  1. Introduce a Result<T, E> helper\r\n` },
    { after: 300, text: `  2. Convert the auth service to return Result\r\n` },
    { after: 300, text: `  3. Update callers + tests\r\n\r\n` },
    { after: 900, text: `${C.magenta}●${C.reset} ${C.bold}Edit${C.reset} src/shared/result.ts\r\n` },
    { after: 700, text: `${C.green}  + export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };${C.reset}\r\n` },
    { after: 800, text: `${C.magenta}●${C.reset} ${C.bold}Edit${C.reset} src/auth/service.ts\r\n` },
    { after: 500, text: `${C.red}  - if (!user) throw new UnauthorizedError();${C.reset}\r\n` },
    { after: 500, text: `${C.green}  + if (!user) return err(new UnauthorizedError());${C.reset}\r\n` },
    { after: 900, text: `\r\n${C.magenta}●${C.reset} Running the suite…\r\n` },
    { after: 700, text: `${C.dim}  ⎿ npm exec nx -- run-many -t test${C.reset}\r\n` },
    { after: 1200, text: `${C.dim}  PASS  src/auth/service.test.ts${C.reset}\r\n` },
    { after: 500, text: `${C.dim}  PASS  src/shared/result.test.ts${C.reset}\r\n` },
    { after: 700, text: `${C.green}  ✓ 214 passed${C.reset} ${C.dim}(3.9s)${C.reset}\r\n\r\n` },
    { after: 700, text: `${C.green}●${C.reset} Done. ${C.dim}Auth now returns Result; all callers updated, suite green.${C.reset}\r\n` },
    { after: 500, text: `${C.dim}  ⎿ ready for review — type a follow-up to keep going${C.reset}\r\n\r\n` },
    { after: 400, text: `${C.cyan}❯${C.reset} ` },
  ];
};
