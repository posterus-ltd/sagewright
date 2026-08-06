/**
 * verify-sse-reconnect.ts
 *
 * Spike script: proves the SSE reconnect contract.
 *
 * Run with:
 *   npx tsx scripts/verify-sse-reconnect.ts <taskId> <cookie>
 *
 * Requires a live control-plane-api server + an existing task that is streaming events.
 *
 * Protocol:
 *   1. Open GET /api/tasks/:id/stream — collect N frames, abort.
 *   2. Reopen with header "last-event-id: <lastSeq>" — collect remaining frames.
 *   3. Assert concatenated seqs are contiguous 1..M with no duplicates.
 *   4. Print PASS or FAIL.
 */

const BASE_URL = process.env.CONTROL_PLANE_URL ?? 'http://localhost:3001';
const COLLECT_FIRST = 5;

interface SseFrame {
  id: number;
  event: string;
  data: unknown;
}

const parseSseChunk = (chunk: string): SseFrame[] => {
  const frames: SseFrame[] = [];
  for (const block of chunk.split('\n\n')) {
    const lines = block.split('\n').filter(Boolean);
    if (lines.length === 0) continue;
    let id = 0;
    let event = 'message';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('id: ')) id = Number(line.slice(4));
      else if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (id > 0) frames.push({ id, event, data: JSON.parse(data || 'null') });
  }
  return frames;
};

const collectFrames = async (
  taskId: string,
  cookie: string,
  maxFrames: number,
  lastEventId?: number,
): Promise<SseFrame[]> => {
  const controller = new AbortController();
  const headers: Record<string, string> = { cookie };
  if (lastEventId !== undefined) headers['last-event-id'] = String(lastEventId);

  const res = await fetch(`${BASE_URL}/api/tasks/${taskId}/stream`, {
    headers,
    signal: controller.signal,
  });

  if (!res.ok || !res.body) throw new Error(`Stream open failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const collected: SseFrame[] = [];
  let buffer = '';

  try {
    while (collected.length < maxFrames) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const frames = parseSseChunk(chunk + '\n\n');
        collected.push(...frames);
        if (collected.length >= maxFrames) break;
      }
    }
  } finally {
    controller.abort();
    reader.releaseLock();
  }

  return collected.slice(0, maxFrames);
};

const assertContiguous = (frames: SseFrame[]): { ok: boolean; detail: string } => {
  const seqs = frames.map((f) => f.id);
  for (let i = 1; i < seqs.length; i++) {
    const prev = seqs[i - 1];
    const curr = seqs[i];
    if (prev === undefined || curr === undefined) continue;
    if (curr !== prev + 1) {
      return { ok: false, detail: `Gap between seq ${prev} and ${curr} at index ${i}` };
    }
  }
  const unique = new Set(seqs);
  if (unique.size !== seqs.length) {
    return { ok: false, detail: `Duplicate seqs found: ${seqs.join(', ')}` };
  }
  return { ok: true, detail: `Contiguous seqs ${seqs[0]}..${seqs[seqs.length - 1]}` };
};

const main = async (): Promise<void> => {
  const [, , taskId, cookie] = process.argv;
  if (!taskId || !cookie) {
    console.error('Usage: npx tsx scripts/verify-sse-reconnect.ts <taskId> <cookie>');
    process.exit(1);
  }

  console.log(`[1] Opening stream for task ${taskId}, collecting ${COLLECT_FIRST} frames…`);
  const firstBatch = await collectFrames(taskId, cookie, COLLECT_FIRST);
  console.log(`    Collected: ${firstBatch.map((f) => f.id).join(', ')}`);

  const lastSeq = firstBatch[firstBatch.length - 1]?.id ?? 0;
  console.log(`[2] Reopening with last-event-id: ${lastSeq}…`);
  const secondBatch = await collectFrames(taskId, cookie, 20, lastSeq);
  console.log(`    Collected: ${secondBatch.map((f) => f.id).join(', ')}`);

  const allFrames = [...firstBatch, ...secondBatch];
  console.log(`[3] Total frames: ${allFrames.length}`);

  if (allFrames.length === 0) {
    console.log('\nINCONCLUSIVE: no events collected — start a task and retry');
    process.exit(1);
  }

  if (secondBatch.length === 0 && firstBatch.length > 0) {
    console.log('\nINCONCLUSIVE: second batch returned no events — task may have already finished; start a new task and retry');
    process.exit(1);
  }

  if (secondBatch.length > 0) {
    const expectedFirst = lastSeq + 1;
    const actualFirst = secondBatch[0]!.id;
    if (actualFirst !== expectedFirst) {
      console.log(`\nFAIL — reconnect gap: expected second batch to start at seq ${expectedFirst}, got ${actualFirst}`);
      process.exit(1);
    }
  }

  const result = assertContiguous(allFrames);
  if (result.ok) {
    console.log(`\nPASS — ${result.detail}`);
    process.exit(0);
  } else {
    console.log(`\nFAIL — ${result.detail}`);
    process.exit(1);
  }
};

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
