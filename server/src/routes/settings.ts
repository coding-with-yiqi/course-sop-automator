import type { FastifyInstance } from 'fastify';
import { db, getSetting, setSetting } from '../db/client.ts';
import { settings } from '../db/schema.ts';
import { sql } from '../db/client.ts';

const ALLOWED_KEYS = [
  'KIMI_API_KEY',
  'PADDLE_OCR_TOKEN',
  'NOTION_TOKEN',
  'NOTION_PARENT_PAGE_ID',
  'YUQUE_TOKEN',
  'YUQUE_NAMESPACE',
] as const;

type SettingKey = (typeof ALLOWED_KEYS)[number];

export function registerSettingsRoutes(app: FastifyInstance): void {
  app.get('/api/settings', async () => {
    const rows = db.select().from(settings).all();
    const data: Record<string, string> = {};
    for (const row of rows) {
      if (ALLOWED_KEYS.includes(row.key as SettingKey)) {
        data[row.key] = row.value;
      }
    }
    return { ok: true, data };
  });

  app.patch<{
    Body: Partial<Record<SettingKey, string>>;
  }>('/api/settings', async (req, reply) => {
    const body = req.body;
    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_KEYS.includes(key as SettingKey)) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'BAD_REQUEST', message: `非法配置项: ${key}` },
        });
      }
      if (typeof value === 'string') {
        setSetting(key, value);
      }
    }
    return { ok: true };
  });

  app.delete<{ Params: { key: string } }>('/api/settings/:key', async (req, reply) => {
    const key = req.params.key;
    if (!ALLOWED_KEYS.includes(key as SettingKey)) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'BAD_REQUEST', message: `非法配置项: ${key}` },
      });
    }
    db.delete(settings).where(sql`${settings.key} = ${key}`).run();
    return { ok: true };
  });
}
