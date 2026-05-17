import { useEffect, useState } from 'react';
import type { DoneEvent, ErrorEvent, StageEvent, StageKey } from '@sop/shared';
import { PIPELINE_STAGES } from '@sop/shared';

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface TaskStreamState {
  stages: Record<StageKey, StageEvent>;
  documentId: string | null;
  error: ErrorEvent | null;
  connectionState: ConnectionState;
}

function initialStages(): Record<StageKey, StageEvent> {
  const map = {} as Record<StageKey, StageEvent>;
  for (const stage of PIPELINE_STAGES) {
    map[stage] = { stage, status: 'queued' };
  }
  return map;
}

export function useTaskStream(taskId: string | null): TaskStreamState {
  const [stages, setStages] = useState<Record<StageKey, StageEvent>>(initialStages);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [error, setError] = useState<ErrorEvent | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');

  useEffect(() => {
    if (!taskId) {
      setStages(initialStages());
      setDocumentId(null);
      setError(null);
      setConnectionState('idle');
      return;
    }

    setConnectionState('connecting');
    const es = new EventSource(`/api/tasks/${taskId}/stream`);

    es.addEventListener('stage', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as StageEvent;
        setStages((prev) => ({ ...prev, [data.stage]: data }));
      } catch (err) {
        console.warn('Failed to parse stage event', err);
      }
    });

    es.addEventListener('done', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as DoneEvent;
        setDocumentId(data.documentId);
        setConnectionState('closed');
        es.close();
      } catch (err) {
        console.warn('Failed to parse done event', err);
      }
    });

    es.addEventListener('error', (event) => {
      const msgEvent = event as MessageEvent;
      if (msgEvent.data) {
        try {
          setError(JSON.parse(msgEvent.data) as ErrorEvent);
        } catch (err) {
          console.warn('Failed to parse error event', err);
        }
      } else if (es.readyState === EventSource.CLOSED) {
        setConnectionState('closed');
      } else {
        setConnectionState('error');
      }
    });

    es.onopen = () => setConnectionState('open');

    return () => {
      es.close();
    };
  }, [taskId]);

  return { stages, documentId, error, connectionState };
}
