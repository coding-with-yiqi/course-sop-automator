import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

// server cwd is the `server/` workspace dir under npm workspaces.
// Always load `.env` from the repo root so users keep a single secrets file.
const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(here, '../../.env') });

// In Electron the main process already sets DATA_DIR before spawning the
// server, so we respect that override rather than falling back to defaults.
function getDefaultDataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.env.ELECTRON_MODE === 'true') {
    const os = require('node:os');
    const path = require('node:path');
    const platform = os.platform();
    if (platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'course-sop-automator', 'data');
    }
    if (platform === 'win32') {
      return path.join(os.homedir(), 'AppData', 'Roaming', 'course-sop-automator', 'data');
    }
    return path.join(os.homedir(), '.config', 'course-sop-automator', 'data');
  }
  return './data';
}

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  DATA_DIR: z.string().default(getDefaultDataDir()),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  KIMI_API_KEY: z.string().optional(),
  KIMI_BASE_URL: z.string().default('https://api.kimi.com/coding/v1'),
  KIMI_MODEL: z.string().default('kimi-for-coding'),
  KIMI_USER_AGENT: z.string().default('claude-cli/1.0'),
  PADDLE_OCR_TOKEN: z.string().optional(),
  PADDLE_OCR_JOB_URL: z.string().default('https://paddleocr.aistudio-app.com/api/v2/ocr/jobs'),
  PADDLE_OCR_MODEL: z.string().default('PaddleOCR-VL-1.5'),
  NOTION_TOKEN: z.string().optional(),
  NOTION_PARENT_PAGE_ID: z.string().optional(),
  YUQUE_TOKEN: z.string().optional(),
  YUQUE_NAMESPACE: z.string().optional(),
});

export const env = schema.parse(process.env);
