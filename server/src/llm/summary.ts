import type { SOPStep } from '@sop/shared';
import { llmClient, KIMI_MODEL } from './client.js';

interface SummaryInput {
  title: string;
  steps: Pick<SOPStep, 'stepNumber' | 'title' | 'shortDescription'>[];
}

/**
 * Generate a 100-180 char Chinese course summary from the step outline.
 * Throws on Kimi failure; callers decide whether to fail the pipeline
 * or just drop summary and continue.
 */
export async function generateCourseSummary(input: SummaryInput): Promise<string> {
  const steps = input.steps.map(
    (s) => `${s.stepNumber}. ${s.title}${s.shortDescription ? ` — ${s.shortDescription}` : ''}`,
  );
  const system =
    '你是课程总结助手。给定一份按步骤组织的教学 SOP 大纲,用一段连贯的中文 100-180 字概括整堂课在讲什么、按什么顺序展开、面向谁。只输出 JSON: { "summary": string },不要列点。';
  const user = `课程标题: ${input.title}

步骤列表:
${steps.join('\n')}

请输出 JSON。`;

  const response = await llmClient().chat.completions.create({
    model: KIMI_MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const content = response.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(content) as { summary?: string };
  return (parsed.summary ?? '').slice(0, 1000);
}
