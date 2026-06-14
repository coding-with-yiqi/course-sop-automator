import type { SOPDocument, SOPStep } from '@sop/shared';
import { log } from '../util/log.js';
import { richTextToPlain } from '../util/richtext.js';

interface YuqueConfig {
  token: string;
  namespace: string; // e.g. "garry/notes"
}

function stepToMarkdown(step: SOPStep): string {
  const lines: string[] = [];

  // Heading
  lines.push(`### 步骤 ${step.stepNumber}: ${step.title}`);
  lines.push('');

  // Short description
  if (step.shortDescription) {
    lines.push(step.shortDescription);
    lines.push('');
  }

  // Instruction (strip HTML, keep list/paragraph line breaks)
  if (step.instructionRichText) {
    const plain = richTextToPlain(step.instructionRichText);
    if (plain.trim()) {
      lines.push(plain);
      lines.push('');
    }
  }

  // Screenshots
  for (const ss of step.screenshots ?? []) {
    lines.push(`![${ss.alt}](${ss.url})`);
    lines.push('');
  }

  // Code block
  if (step.codeBlock?.content) {
    const lang = step.codeBlock.language;
    const filename = step.codeBlock.filename ? ` ${step.codeBlock.filename}` : '';
    lines.push(`\`\`\`${lang}${filename}`);
    lines.push(step.codeBlock.content);
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

function documentToMarkdown(doc: SOPDocument): string {
  const lines: string[] = [];

  lines.push(`# ${doc.title}`);
  lines.push('');

  if (doc.speaker?.name) {
    lines.push(`> ${doc.speaker.name} — ${doc.speaker.title}`);
    lines.push('');
  }

  if (doc.summary) {
    lines.push('## 课程总览');
    lines.push('');
    lines.push(doc.summary);
    lines.push('');
  }

  lines.push('## 操作步骤');
  lines.push('');

  for (const step of doc.steps) {
    lines.push(stepToMarkdown(step));
  }

  return lines.join('\n');
}

export async function syncToYuque(
  doc: SOPDocument,
  config: YuqueConfig,
): Promise<{ docUrl: string }> {
  const markdown = documentToMarkdown(doc);

  const response = await fetch(`https://www.yuque.com/api/v2/repos/${config.namespace}/docs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': config.token,
    },
    body: JSON.stringify({
      title: doc.title,
      body: markdown,
      format: 'markdown',
      public: 0, // private by default
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown error');
    throw new Error(`语雀 API 错误: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { data?: { slug?: string; id?: number } };
  const slug = data.data?.slug ?? '';
  const docUrl = `https://www.yuque.com/${config.namespace}/${slug}`;

  log.info({ docId: doc.id, yuqueSlug: slug }, 'synced to Yuque');
  return { docUrl };
}
