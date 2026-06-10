import OpenAI from 'openai';
import { env } from '../env.js';
import { getSetting } from '../db/client.js';

interface ProviderConfig {
  name: string;
  apiKey: string;
  baseURL: string;
  model: string;
  userAgent: string;
}

function resolveProvider(): ProviderConfig | null {
  // Priority: Kimi > DeepSeek > OpenAI
  const kimiKey = getSetting('KIMI_API_KEY') || env.KIMI_API_KEY;
  if (kimiKey) {
    return {
      name: 'kimi',
      apiKey: kimiKey,
      baseURL: env.KIMI_BASE_URL,
      model: env.KIMI_MODEL,
      userAgent: env.KIMI_USER_AGENT,
    };
  }

  const dsKey = getSetting('DEEPSEEK_API_KEY') || env.DEEPSEEK_API_KEY;
  if (dsKey) {
    return {
      name: 'deepseek',
      apiKey: dsKey,
      baseURL: env.DEEPSEEK_BASE_URL,
      model: env.DEEPSEEK_MODEL,
      userAgent: env.DEEPSEEK_USER_AGENT,
    };
  }

  const oaiKey = getSetting('OPENAI_API_KEY') || env.OPENAI_API_KEY;
  if (oaiKey) {
    return {
      name: 'openai',
      apiKey: oaiKey,
      baseURL: env.OPENAI_BASE_URL,
      model: env.OPENAI_MODEL,
      userAgent: env.OPENAI_USER_AGENT,
    };
  }

  return null;
}

let _client: OpenAI | null = null;
let _clientKey: string | null = null;

export function llmClient(): OpenAI {
  const provider = resolveProvider();
  if (!provider) {
    throw new Error(
      '未配置 AI API Key: 请在「设置」页填写 Kimi / DeepSeek / OpenAI 的 API Key',
    );
  }

  // Rebuild the cached client when the key changes.
  if (_client && _clientKey === provider.apiKey) return _client;

  _client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    defaultHeaders: {
      'User-Agent': provider.userAgent,
    },
    maxRetries: 0,
  });
  _clientKey = provider.apiKey;
  return _client;
}

export function currentModel(): string {
  const p = resolveProvider();
  return p?.model ?? env.KIMI_MODEL;
}
