import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerSettingsRoutes } from './settings.ts';
import { db } from '../db/client.ts';
import { settings } from '../db/schema.ts';

async function buildApp() {
  const app = Fastify();
  registerSettingsRoutes(app);
  await app.ready();
  return app;
}

describe('Settings API', () => {
  beforeEach(() => {
    // Clean settings table before each test
    db.delete(settings).run();
  });

  it('GET /api/settings returns empty object when no settings', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({});
  });

  it('PATCH /api/settings stores allowed keys', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { KIMI_API_KEY: 'sk-test-key' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);

    // Verify it was stored
    const getRes = await app.inject({ method: 'GET', url: '/api/settings' });
    const getBody = JSON.parse(getRes.body);
    expect(getBody.data.KIMI_API_KEY).toBe('sk-test-key');
  });

  it('PATCH /api/settings rejects unknown keys', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { UNKNOWN_KEY: 'value' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('DELETE /api/settings/:key removes a setting', async () => {
    const app = await buildApp();
    // First set a value
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      payload: { KIMI_API_KEY: 'sk-test' },
    });

    // Then delete it
    const delRes = await app.inject({
      method: 'DELETE',
      url: '/api/settings/KIMI_API_KEY',
    });
    expect(delRes.statusCode).toBe(200);

    // Verify it's gone
    const getRes = await app.inject({ method: 'GET', url: '/api/settings' });
    const getBody = JSON.parse(getRes.body);
    expect(getBody.data.KIMI_API_KEY).toBeUndefined();
  });

  it('DELETE /api/settings/:key rejects unknown keys', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/settings/UNKNOWN_KEY',
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });
});
