import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerTaskRoutes } from './tasks.js';
import { db } from '../db/client.js';
import { tasks, documents, stageEvents } from '../db/schema.js';

async function buildApp() {
  const app = Fastify();
  await registerTaskRoutes(app);
  await app.ready();
  return app;
}

function seedSucceededTask(id = 'task_test_sse') {
  // A succeeded task makes the SSE handler write headers then end() immediately,
  // so inject() returns instead of hanging on the keep-alive stream.
  const now = Date.now();
  db.delete(stageEvents).run();
  db.delete(documents).run();
  db.delete(tasks).run();
  db.insert(tasks)
    .values({
      id,
      documentId: `${id}_doc`,
      title: 'T',
      status: 'succeeded',
      progress: 1,
      videoFileName: 'video.mp4',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

describe('SSE stream route — CORS headers (progress-bar-stuck bug)', () => {
  beforeEach(() => seedSucceededTask());

  it('echoes the request Origin so the app:// renderer EventSource is not blocked', async () => {
    // The bug: this route uses reply.raw.writeHead, bypassing @fastify/cors, so
    // without manual CORS headers the packaged renderer's EventSource is blocked
    // → "已断开" → progress bars never move. Guard the manual headers.
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/tasks/task_test_sse/stream',
      headers: { origin: 'app://renderer', 'last-event-id': '0' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('app://renderer');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['vary']).toContain('Origin');
    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  it('falls back to * when no Origin header is present', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/tasks/task_test_sse/stream',
    });
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('404 for unknown task', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/tasks/nope/stream' });
    expect(res.statusCode).toBe(404);
  });
});
