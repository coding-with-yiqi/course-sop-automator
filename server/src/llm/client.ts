import OpenAI from 'openai';
import { env } from '../env.js';
import { getSetting } from '../db/client.js';

let _client: OpenAI | null = null;
let _clientKey: string | null = null;

/**
 * Resolve the Kimi API key: the in-app Settings page (DB) takes precedence over
 * the .env value, so a user who configures the key in the UI doesn't also need a
 * .env file. Falls back to env for headless / dev setups.
 */
function resolveApiKey(): string | undefined {
  return getSetting('KIMI_API_KEY') || env.KIMI_API_KEY;
}

export function llmClient(): OpenAI {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error('未配置 Kimi API Key:请在「设置」页填写,或在 .env 设置 KIMI_API_KEY');
  }
  // Rebuild the cached client when the key changes (e.g. user updated it in the
  // Settings page) so a fresh key takes effect without a server restart.
  if (_client && _clientKey === apiKey) return _client;
  _client = new OpenAI({
    apiKey,
    baseURL: env.KIMI_BASE_URL,
    defaultHeaders: {
      'User-Agent': env.KIMI_USER_AGENT,
    },
    maxRetries: 0,
  });
  _clientKey = apiKey;
  return _client;
}

export const KIMI_MODEL = env.KIMI_MODEL;
