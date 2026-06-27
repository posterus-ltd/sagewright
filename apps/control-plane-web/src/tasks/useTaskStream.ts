import { EventType, type StreamEvent } from '@sagewright/shared';
import { useEffect, useRef, useState } from 'react';

const TYPES = Object.values(EventType);

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
      if (seen.current.has(seq)) return;
      seen.current.add(seq);
      setEvents((prev) =>
        [...prev, { seq, type: type as EventType, payload: JSON.parse(e.data) as Record<string, unknown>, createdAt: '' }]
          .sort((a, b) => a.seq - b.seq),
      );
    };
    for (const t of TYPES) es.addEventListener(t, onEvent(t));
    return () => es.close();
  }, [taskId]);

  return { events, connected };
};
