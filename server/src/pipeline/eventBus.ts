import { EventEmitter } from 'node:events';
import { eq, and, gt, asc } from 'drizzle-orm';
import type { StageEvent, DoneEvent, ErrorEvent } from '@sop/shared';
import { db } from '../db/client.js';
import { stageEvents } from '../db/schema.js';

export type StreamEventName = 'stage' | 'log' | 'error' | 'done';
export type StreamEventPayload = StageEvent | LogPayload | ErrorEvent | DoneEvent;

export interface LogPayload {
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface PersistedStreamEvent {
  id: number;
  taskId: string;
  name: StreamEventName;
  stage: string | null;
  payload: StreamEventPayload;
  createdAt: number;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

function channelFor(taskId: string): string {
  return `task:${taskId}`;
}

function envelope(name: StreamEventName, payload: StreamEventPayload): string {
  return JSON.stringify({ name, payload });
}

function parseEnvelope(json: string): { name: StreamEventName; payload: StreamEventPayload } {
  return JSON.parse(json);
}

export interface EmitOptions {
  taskId: string;
  name: StreamEventName;
  stage?: string | null;
  payload: StreamEventPayload;
}

export function emit({ taskId, name, stage = null, payload }: EmitOptions): PersistedStreamEvent {
  const now = Date.now();
  const inserted = db
    .insert(stageEvents)
    .values({
      taskId,
      stage: stage ?? null,
      payloadJson: envelope(name, payload),
      createdAt: now,
    })
    .returning()
    .get();
  const event: PersistedStreamEvent = {
    id: inserted.id,
    taskId,
    name,
    stage: inserted.stage,
    payload,
    createdAt: now,
  };
  emitter.emit(channelFor(taskId), event);
  return event;
}

export function replay(taskId: string, afterEventId = 0): PersistedStreamEvent[] {
  const rows = db
    .select()
    .from(stageEvents)
    .where(and(eq(stageEvents.taskId, taskId), gt(stageEvents.id, afterEventId)))
    .orderBy(asc(stageEvents.id))
    .all();
  return rows.map((row) => {
    const { name, payload } = parseEnvelope(row.payloadJson);
    return {
      id: row.id,
      taskId: row.taskId,
      name,
      stage: row.stage,
      payload,
      createdAt: row.createdAt,
    };
  });
}

export function subscribe(
  taskId: string,
  handler: (event: PersistedStreamEvent) => void,
): () => void {
  const channel = channelFor(taskId);
  emitter.on(channel, handler);
  return () => emitter.off(channel, handler);
}
