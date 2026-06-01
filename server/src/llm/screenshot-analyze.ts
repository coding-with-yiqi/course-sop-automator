import { llmClient, KIMI_MODEL } from './client.ts';
import { log } from '../util/log.ts';

export interface ScreenshotAnalysis {
  summary: string;
  score: number; // 0-100，越高越推荐
  tags: string[];
}

export interface CandidateAnalysis {
  timestamp: number;
  summary: string;
  score: number;
  tags: string[];
}

const SYSTEM_PROMPT = `你是一位截图分析师。基于 OCR 提取出的图片文字内容，为每张候选截图生成简短的 quick summary 并给出推荐分数。

规则：
1. summary：最多 15 个字，描述这张图里展示的是什么（如"终端执行 git clone 命令"、"VS Code 插件安装界面"）
2. score：0-100 整数。判断依据：
   - 包含明确的操作界面 / 命令行 / 配置项 → 高分（80-100）
   - 纯文字/PPT 页面 / 过渡画面 → 中分（40-70）
   - 黑屏 / 模糊 / 无关内容 → 低分（0-30）
3. tags：1-3 个关键词标签，如 ["命令行", "git", "终端"]

输出严格 JSON 数组，每个元素格式：
{ "summary": string, "score": number, "tags": string[] }`;

/**
 * 对一批候选截图的 OCR 文本进行批量分析。
 * 输入每项包含 timestamp 和 ocrText，输出带 summary / score / tags 的分析结果。
 */
export async function analyzeCandidates(
  inputs: Array<{ timestamp: number; ocrText: string }>,
): Promise<CandidateAnalysis[]> {
  if (inputs.length === 0) return [];

  const userLines = inputs
    .map((item, i) => {
      const text = item.ocrText.trim() || '(无识别内容)';
      return `候选 ${i + 1} (t=${item.timestamp.toFixed(1)}s):\n${text}`;
    })
    .join('\n\n---\n\n');

  try {
    const response = await llmClient().chat.completions.create({
      model: KIMI_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userLines },
      ],
    });

    const content = response.choices[0]?.message?.content ?? '[]';
    const json = JSON.parse(
      content.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim(),
    ) as Array<{ summary?: string; score?: number; tags?: string[] }>;

    if (!Array.isArray(json) || json.length !== inputs.length) {
      log.warn(
        { expected: inputs.length, got: json?.length },
        'analyzeCandidates: LLM 返回数组长度不匹配',
      );
    }

    return inputs.map((item, i) => {
      const parsed = json[i] ?? {};
      return {
        timestamp: item.timestamp,
        summary: (parsed.summary ?? '未识别内容').slice(0, 30),
        score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 50))),
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 3) : [],
      };
    });
  } catch (err) {
    log.error({ err }, 'analyzeCandidates failed');
    return inputs.map((item) => ({
      timestamp: item.timestamp,
      summary: '分析失败',
      score: 50,
      tags: [],
    }));
  }
}

/**
 * 从多张已选截图的 OCR 文本中，推荐「哪几张值得保留」。
 * 返回每个索引的保留建议（true=推荐保留，false=建议删除）和理由。
 */
export async function recommendSelection(
  inputs: Array<{ ocrText: string; existing: boolean }>,
): Promise<Array<{ keep: boolean; reason: string }>> {
  if (inputs.length === 0) return [];

  const lines = inputs
    .map((item, i) => {
      const status = item.existing ? '[已选]' : '[候选]';
      const text = item.ocrText.trim() || '(无内容)';
      return `图 ${i + 1} ${status}:\n${text}`;
    })
    .join('\n\n---\n\n');

  const system = `你是截图选择助手。用户要从多张候选截图中选出最有教学价值的保留。

判断标准（优先级从高到低）：
1. 是否展示了明确的操作界面 / 命令行 / 配置项（教学价值最高）
2. 是否展示了步骤的关键结果 / 成功提示
3. 是否与其他截图有重复内容
4. 纯文字/PPT/过渡画面 → 建议剔除

对每张图给出：keep（true=建议保留, false=建议删除）和简短 reason（≤12字）。

输出严格 JSON 数组：
[{ "keep": boolean, "reason": string }]`;

  try {
    const response = await llmClient().chat.completions.create({
      model: KIMI_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: lines },
      ],
    });

    const content = response.choices[0]?.message?.content ?? '[]';
    const json = JSON.parse(
      content.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim(),
    ) as Array<{ keep?: boolean; reason?: string }>;

    return inputs.map((_, i) => ({
      keep: json[i]?.keep ?? true,
      reason: (json[i]?.reason ?? '').slice(0, 20) || '无建议',
    }));
  } catch (err) {
    log.error({ err }, 'recommendSelection failed');
    return inputs.map(() => ({ keep: true, reason: '分析失败' }));
  }
}
