import { Client } from '@notionhq/client';
import type { SOPDocument, SOPStep } from '@sop/shared';
import { log } from '../util/log.ts';

interface NotionConfig {
  token: string;
  parentPageId: string;
}

function richText(content: string) {
  return [{ type: 'text' as const, text: { content } }];
}

function codeBlock(content: string, language: string) {
  return {
    type: 'code' as const,
    code: {
      rich_text: richText(content),
      language: language === 'text' ? 'plain text' : language,
    },
  };
}

function headingBlock(text: string, level: 1 | 2 | 3 = 3) {
  const type = level === 1 ? 'heading_1' : level === 2 ? 'heading_2' : 'heading_3';
  return {
    type,
    [type]: { rich_text: richText(text) },
  };
}

function paragraphBlock(text: string) {
  return {
    type: 'paragraph' as const,
    paragraph: { rich_text: richText(text) },
  };
}

function imageBlock(url: string, alt: string) {
  return {
    type: 'image' as const,
    image: {
      type: 'external' as const,
      external: { url },
      caption: richText(alt),
    },
  };
}

function stepToBlocks(step: SOPStep): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];

  // Step heading
  blocks.push(headingBlock(`步骤 ${step.stepNumber}: ${step.title}`));

  // Short description
  if (step.shortDescription) {
    blocks.push(paragraphBlock(step.shortDescription));
  }

  // Instruction (strip HTML tags for Notion)
  if (step.instructionRichText) {
    const plain = step.instructionRichText.replace(/<[^>]+>/g, '');
    if (plain.trim()) {
      blocks.push(paragraphBlock(plain));
    }
  }

  // Screenshots
  for (const ss of step.screenshots ?? []) {
    // Notion external image requires public URL; local files can't be embedded directly
    // We'll add a placeholder paragraph instead
    blocks.push(paragraphBlock(`[截图: ${ss.alt}]`));
  }

  // Code block
  if (step.codeBlock?.content) {
    blocks.push(codeBlock(step.codeBlock.content, step.codeBlock.language));
  }

  return blocks;
}

export async function syncToNotion(
  doc: SOPDocument,
  config: NotionConfig,
): Promise<{ pageUrl: string }> {
  const notion = new Client({ auth: config.token });

  // Create page
  const page = await notion.pages.create({
    parent: { page_id: config.parentPageId },
    properties: {
      title: {
        title: richText(doc.title),
      },
    },
  });

  const blocks: Array<Record<string, unknown>> = [];

  // Summary
  if (doc.summary) {
    blocks.push(headingBlock('课程总览', 2));
    blocks.push(paragraphBlock(doc.summary));
  }

  // Steps
  blocks.push(headingBlock('操作步骤', 2));
  for (const step of doc.steps) {
    blocks.push(...stepToBlocks(step));
  }

  // Notion API has a limit of 100 blocks per request
  const BATCH = 100;
  for (let i = 0; i < blocks.length; i += BATCH) {
    await notion.blocks.children.append({
      block_id: page.id,
      children: blocks.slice(i, i + BATCH) as any,
    });
  }

  log.info({ pageId: page.id, docId: doc.id }, 'synced to Notion');
  return { pageUrl: (page as any).url ?? `https://notion.so/${page.id.replace(/-/g, '')}` };
}
