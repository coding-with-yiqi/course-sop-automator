import OpenAI from 'openai';
import { env } from '../env.js';
import { getSetting } from '../db/client.js';

interface ProviderConfig {
  name: string;
  apiKey: string;
  baseURL: string;
  model: string;
  userAgent: string;
  /**
   * 该 provider 对 temperature 的约束。上游若改规则(如 Kimi 现在只收 1),
   * 只改这一处,所有调用点经 clampTemperature 自动夹紧。null = 不限制。
   */
  fixedTemperature: number | null;
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
      // kimi-for-coding 只接受 temperature=1,传其他值返回 400(2026-06 实测)。
      fixedTemperature: 1,
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
      fixedTemperature: null,
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
      fixedTemperature: null,
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

/** 当前 provider 名(kimi/deepseek/openai),无配置返回 null。供探针与日志用。 */
export function currentProviderName(): string | null {
  return resolveProvider()?.name ?? null;
}

/**
 * 把期望的 temperature 夹紧到当前 provider 允许的值。
 * Kimi 等若对 temperature 有固定约束(见 ProviderConfig.fixedTemperature),
 * 这里统一返回合法值,避免每个调用点各自硬编码、漏改一处就 400。
 */
export function clampTemperature(desired: number): number {
  const p = resolveProvider();
  if (p && p.fixedTemperature !== null) return p.fixedTemperature;
  return desired;
}

/**
 * 从 LLM 调用抛出的 err 中提取「能定位上游契约变更」的真实信息:
 * HTTP status + 上游返回体里的原始 message。OpenAI SDK 的 APIError
 * 把这些挂在 err.status / err.error / err.message 上。
 * 用于 catch 里 log.error,绝不可把它替换成固定文案后丢弃。
 */
export function describeLlmError(err: unknown): {
  provider: string | null;
  model: string;
  status?: number;
  upstreamMessage?: string;
  message: string;
} {
  const e = err as {
    status?: number;
    message?: string;
    error?: { message?: string; type?: string; code?: string };
  };
  const upstreamMessage = e?.error?.message;
  return {
    provider: currentProviderName(),
    model: currentModel(),
    status: e?.status,
    upstreamMessage,
    message: upstreamMessage ?? e?.message ?? String(err),
  };
}
