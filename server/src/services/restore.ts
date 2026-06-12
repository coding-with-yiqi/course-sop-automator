/**
 * 文档恢复服务 — 从 exports 目录重建数据库记录
 *
 * 设计原则：
 * 1. 复用 paths.ts 的路径体系，绝不 hard code
 * 2. 恢复时验证数据完整性（视频/截图/帧是否存在）
 * 3. 支持增量恢复（已存在的文档跳过）
 * 4. 错误隔离：单个文档失败不影响其他
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../util/paths.js';
import { db } from '../db/client.js';
import { tasks, documents } from '../db/schema.js';
import { eq } from 'drizzle-orm';

interface RestoreResult {
  documentId: string;
  title: string;
  status: 'restored' | 'skipped' | 'failed';
  error?: string;
  hasVideo: boolean;
  hasFrames: boolean;
  stepCount: number;
}

/**
 * 从导出的 HTML 文件解析文档数据
 */
function parseExportHtml(filePath: string, documentId: string) {
  const html = readFileSync(filePath, 'utf-8');

  // Title
  const titleMatch = html.match(/<title>(.*?)<\/title>/);
  const title = titleMatch ? titleMatch[1].trim() : '未命名文档';

  // Speaker
  let speaker: Record<string, string> | undefined;
  const speakerMatch = html.match(/<div class="speaker"[^>]*>[\s\S]*?<\/div>/);
  if (speakerMatch) {
    const sh = speakerMatch[0];
    const nm = sh.match(/class="name"[^>]*>(.*?)</);
    const tm = sh.match(/class="title"[^>]*>(.*?)</);
    const im = sh.match(/src="(data:image[^"]*)"/);
    speaker = {
      name: nm ? nm[1].trim() : '',
      title: tm ? tm[1].trim() : '',
      avatarUrl: im ? im[1] : '',
    };
  }

  // Summary
  let summary: string | undefined;
  const summaryMatch = html.match(/<div class="summary"[^>]*>[\s\S]*?<p>(.*?)<\/p>/);
  if (summaryMatch) summary = summaryMatch[1].trim();

  // Steps
  const steps: any[] = [];
  const stepRegex = /<article class="step"[^>]*>[\s\S]*?<\/article>/g;
  let m;
  while ((m = stepRegex.exec(html)) !== null) {
    const stepHtml = m[0];

    // Parse accent color from style
    const styleMatch = stepHtml.match(/style="([^"]*)"/);
    let accentColor = 'matcha';
    if (styleMatch) {
      const hex = styleMatch[1].match(/--accent:\s*#([0-9A-Fa-f]{6})/)?.[1]?.toLowerCase();
      if (hex === '89d385' || hex === '256c2b') accentColor = 'matcha';
      else if (hex === '7bdffe' || hex === '00677d') accentColor = 'aqua';
      else if (hex === 'a5a5f0' || hex === '5555a5') accentColor = 'lavender';
      else if (hex === 'efccea') accentColor = 'blush';
    }

    // Step number, title, timestamp
    const h3Match = stepHtml.match(/<h3>[\s\S]*?<\/h3>/);
    let stepNumber = steps.length + 1;
    let stepTitle = `步骤 ${stepNumber}`;
    let timestampSec = 0;
    if (h3Match) {
      const h3Text = h3Match[0];
      const numMatch = h3Text.match(/步骤\s*(\d+)/);
      if (numMatch) stepNumber = parseInt(numMatch[1], 10);
      const titleMatch = h3Text.match(/:\s*([^<]+)/);
      if (titleMatch) stepTitle = titleMatch[1].trim();
      const tsMatch = h3Text.match(/<span class="ts">(.*?)<\/span>/);
      if (tsMatch) {
        const parts = tsMatch[1].trim().split(':').map(Number);
        if (parts.length === 2) timestampSec = parts[0] * 60 + parts[1];
        else if (parts.length === 3) timestampSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    }

    // Short description
    let shortDescription = '';
    const descMatch = stepHtml.match(/<p class="desc">(.*?)<\/p>/);
    if (descMatch) shortDescription = descMatch[1].trim();

    // Body (rich text)
    let instructionRichText = '';
    const bodyMatch = stepHtml.match(/<div class="body">([\s\S]*?)<\/div>/);
    if (bodyMatch) instructionRichText = bodyMatch[1].trim();

    // Screenshots — 关键修复：解码 HTML 实体
    const screenshots: any[] = [];
    const imgRegex = /<img src="(data:image[^"]*)"[^>]*>/g;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(stepHtml)) !== null) {
      // 修复 base64 中的 HTML 实体编码（&#x3D; → =）
      const url = imgMatch[1].replace(/&#x3D;/g, '=');
      screenshots.push({ url, alt: `截图 ${screenshots.length + 1}` });
    }

    // Code block
    let codeBlock: any | undefined;
    const codeMatch = stepHtml.match(/<pre class="code">[\s\S]*?<code[^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>/);
    if (codeMatch) {
      const langMatch = stepHtml.match(/<code class="language-(\w+)"/);
      const filenameMatch = stepHtml.match(/<div class="filename">(.*?)<\/div>/);
      codeBlock = {
        language: langMatch ? langMatch[1] : 'text',
        content: codeMatch[1]
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .trim(),
        filename: filenameMatch ? filenameMatch[1].trim() : undefined,
      };
    }

    steps.push({
      stepNumber,
      title: stepTitle,
      timestampSec,
      shortDescription,
      instructionRichText,
      screenshots,
      codeBlock,
      accentColor,
    });
  }

  if (steps.length === 0) return null;
  return { id: documentId, title, speaker, summary, steps };
}

/**
 * 恢复单个文档
 */
function restoreDocument(docId: string): RestoreResult {
  const exportsDir = paths.exports(docId);
  const taskId = docId.replace('doc_', 'task_');

  // Check if already exists
  const existing = db.select().from(documents).where(eq(documents.id, docId)).get();
  if (existing) {
    return {
      documentId: docId,
      title: existing.title,
      status: 'skipped',
      hasVideo: existsSync(paths.uploads(taskId)),
      hasFrames: existsSync(join(paths.root, 'frames', taskId)),
      stepCount: 0,
    };
  }

  // Find latest HTML export
  if (!existsSync(exportsDir)) {
    return { documentId: docId, title: '', status: 'failed', error: 'exports 目录不存在', hasVideo: false, hasFrames: false, stepCount: 0 };
  }

  const htmlFiles = readdirSync(exportsDir).filter(f => f.endsWith('.html'));
  if (htmlFiles.length === 0) {
    return { documentId: docId, title: '', status: 'failed', error: '无 HTML 文件', hasVideo: false, hasFrames: false, stepCount: 0 };
  }

  const latestHtml = htmlFiles.sort().pop()!;
  const filePath = join(exportsDir, latestHtml);

  // Parse HTML
  const doc = parseExportHtml(filePath, docId);
  if (!doc) {
    return { documentId: docId, title: '', status: 'failed', error: 'HTML 解析失败', hasVideo: false, hasFrames: false, stepCount: 0 };
  }

  // Check for associated data files
  const hasVideo = existsSync(paths.uploads(taskId)) && existsSync(join(paths.uploads(taskId), 'video.mp4'));
  const hasFrames = existsSync(join(paths.root, 'frames', taskId));

  // Insert into database
  const now = Date.now();
  db.insert(tasks).values({
    id: taskId,
    documentId: docId,
    title: doc.title,
    status: 'succeeded',
    currentStage: 'assemble',
    progress: 1.0,
    videoFileName: hasVideo ? 'video.mp4' : 'restored-from-export',
    subtitleFileName: null,
    videoDurationSec: null,
    createdAt: now,
    updatedAt: now,
  }).run();

  db.insert(documents).values({
    id: docId,
    taskId,
    title: doc.title,
    speakerJson: JSON.stringify(doc.speaker ?? {}),
    stepsJson: JSON.stringify(doc.steps),
    aiSettingsJson: JSON.stringify({}),
    summaryText: doc.summary ?? null,
    lastEditedAt: now,
    createdAt: now,
  }).run();

  return {
    documentId: docId,
    title: doc.title,
    status: 'restored',
    hasVideo,
    hasFrames,
    stepCount: doc.steps.length,
  };
}

/**
 * 扫描并恢复所有 exports 目录下的文档
 */
export function restoreAllExports(): RestoreResult[] {
  const exportsRoot = join(paths.root, 'exports');
  if (!existsSync(exportsRoot)) return [];

  const docDirs = readdirSync(exportsRoot).filter(d => d.startsWith('doc_'));
  const results: RestoreResult[] = [];

  for (const docId of docDirs) {
    try {
      results.push(restoreDocument(docId));
    } catch (err) {
      results.push({
        documentId: docId,
        title: '',
        status: 'failed',
        error: err instanceof Error ? err.message : '未知错误',
        hasVideo: false,
        hasFrames: false,
        stepCount: 0,
      });
    }
  }

  return results;
}

/**
 * 恢复指定文档（用于 API 调用）
 */
export function restoreDocumentById(docId: string): RestoreResult {
  return restoreDocument(docId);
}
