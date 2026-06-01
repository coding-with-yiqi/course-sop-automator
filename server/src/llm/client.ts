import OpenAI from 'openai';
import { env } from '../env.ts';

let _client: OpenAI | null = null;

export function llmClient(): OpenAI {
  if (_client) return _client;
  if (!env.KIMI_API_KEY) {
    throw new Error('KIMI_API_KEY is not set in .env');
  }
  _client = new OpenAI({
    apiKey: env.KIMI_API_KEY,
    baseURL: env.KIMI_BASE_URL,
    defaultHeaders: {
      'User-Agent': env.KIMI_USER_AGENT,
    },
    maxRetries: 0,
  });
  return _client;
}

export const KIMI_MODEL = env.KIMI_MODEL;
