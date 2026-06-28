import { EventType } from '@sagewright/shared';
import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTaskStream } from './useTaskStream';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  constructor(public url: string) { FakeEventSource.instances.push(this); }
  addEventListener(type: string, cb: (e: MessageEvent) => void) { (this.listeners[type] ??= []).push(cb); }
  emit(type: string, data: unknown, lastEventId: string) {
    for (const cb of this.listeners[type] ?? []) cb({ data: JSON.stringify(data), lastEventId } as MessageEvent);
  }
  emitRaw(type: string, data: unknown, lastEventId: string) {
    for (const cb of this.listeners[type] ?? []) cb({ data, lastEventId } as MessageEvent);
  }
  close() {}
}

describe('useTaskStream', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource as never);
  });

  it('accumulates events in order and dedups by seq', async () => {
    const { result } = renderHook(() => useTaskStream('t1'));
    const es = FakeEventSource.instances[0];
    act(() => { es.emit(EventType.ASSISTANT, { text: 'a' }, '1'); });
    act(() => { es.emit(EventType.ASSISTANT, { text: 'a' }, '1'); }); // dup seq
    await waitFor(() => expect(result.current.events).toHaveLength(1));
  });

  it('starts with connected === false', () => {
    const { result } = renderHook(() => useTaskStream('t1'));
    expect(result.current.connected).toBe(false);
  });

  it('sets connected to true after onopen fires', async () => {
    const { result } = renderHook(() => useTaskStream('t1'));
    const es = FakeEventSource.instances[0];
    act(() => { es.onopen?.(); });
    await waitFor(() => expect(result.current.connected).toBe(true));
  });

  it('ignores malformed reconnect payloads instead of throwing', () => {
    const { result } = renderHook(() => useTaskStream('t1'));
    const es = FakeEventSource.instances[0];

    act(() => { es.emitRaw(EventType.ASSISTANT, undefined, '1'); });

    expect(result.current.events).toHaveLength(0);
  });

  it('resets dedup set when taskId changes so seq-1 event from new task is not dropped', async () => {
    const { result, rerender } = renderHook((p: { taskId: string }) => useTaskStream(p.taskId), {
      initialProps: { taskId: 't1' },
    });

    // Emit seq-1 on first task
    const es1 = FakeEventSource.instances[0];
    act(() => { es1.emit(EventType.ASSISTANT, { text: 'from-t1' }, '1'); });
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    // Switch to t2
    rerender({ taskId: 't2' });

    // After rerender a new FakeEventSource instance should exist
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    const es2 = FakeEventSource.instances[1];

    // Emit seq-1 again on the new task — should NOT be dropped
    act(() => { es2.emit(EventType.ASSISTANT, { text: 'from-t2' }, '1'); });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].payload).toEqual({ text: 'from-t2' });
  });
});
