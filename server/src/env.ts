import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

// server cwd is the `server/` workspace dir under npm workspaces.
// Always load `.env` from the repo root so users keep a single secrets file.
const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(here, '../../.env') });

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  DATA_DIR: z.string().default('./data'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  KIMI_API_KEY: z.string().optional(),
  KIMI_BASE_URL: z.string().default('https://api.kimi.com/coding/v1'),
  KIMI_MODEL: z.string().default('kimi-for-coding'),
  KIMI_USER_AGENT: z.string().default('claude-cli/1.0'),
  NOTION_TOKEN: z.string().optional(),
  NOTION_PARENT_PAGE_ID: z.string().optional(),
  YUQUE_TOKEN: z.string().optional(),
  YUQUE_NAMESPACE: z.string().optional(),
});

export const env = schema.parse(process.env);
