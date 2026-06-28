import { EventType, type StreamEvent } from '@sagewright/shared';
import { useEffect, useRef, useState } from 'react';

const TYPES = Object.values(EventType);

const parseStreamPayload = (data: unknown): Record<string, unknown> | null => {
  if (typeof data !== 'string') return null;

  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const useTaskStream = (taskId: string): { events: StreamEvent[]; connected: boolean } => {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const seen = useRef<Set<number>>(new Set());

  useEffect(() => {
    seen.current = new Set();
    setEvents([]);
    setConnected(false);
    const es = new EventSource(`/api/tasks/${taskId}/stream`, { withCredentials: true });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    const onEvent = (type: string) => (e: MessageEvent) => {
      const seq = Number(e.lastEventId);
      const payload = parseStreamPayload(e.data);
      if (!payload) return;
      if (seen.current.has(seq)) return;
      seen.current.add(seq);
      setEvents((prev) =>
        [...prev, { seq, type: type as EventType, payload, createdAt: '' }]
          .sort((a, b) => a.seq - b.seq),
      );
    };
    for (const t of TYPES) es.addEventListener(t, onEvent(t));
    return () => es.close();
  }, [taskId]);

  return { events, connected };
};
