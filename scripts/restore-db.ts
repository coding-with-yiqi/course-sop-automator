/**
 * 从导出的 HTML 文件恢复数据库记录
 * 用法: cd server && npx tsx ../scripts/restore-db.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const EXPORTS_DIR = join(process.cwd(), 'data', 'exports');
const DB_PATH = join(process.cwd(), 'data', 'sop.db');

interface Speaker {
  name?: string;
  title?: string;
  avatarUrl?: string;
}

interface CodeBlock {
  language: string;
  content: string;
  filename?: string;
}

interface Screenshot {
  url: string;
  alt: string;
}

interface Step {
  stepNumber: number;
  title: string;
  timestampSec: number;
  shortDescription: string;
  instructionRichText: string;
  screenshots: Screenshot[];
  codeBlock?: CodeBlock;
  accentColor: string;
}

interface ParsedDoc {
  id: string;
  title: string;
  speaker?: Speaker;
  summary?: string;
  steps: Step[];
  htmlFile: string;
}

function parseTimeToSec(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function parseAccentFromStyle(style: string): string {
  const m = style.match(/--accent:\s*#([0-9A-Fa-f]{6})/);
  if (!m) return 'matcha';
  const hex = m[1].toLowerCase();
  // Map hex to accent color names based on DESIGN.md palette
  if (hex === '89d385' || hex === '256c2b') return 'matcha';
  if (hex === '7bdffe' || hex === '00677d') return 'aqua';
  if (hex === 'a5a5f0' || hex === '5555a5') return 'lavender';
  if (hex === 'efccea') return 'blush';
  return 'matcha';
}

function parseHtmlFile(filePath: string, docId: string): ParsedDoc | null {
  const html = readFileSync(filePath, 'utf-8');

  // Extract title
  const titleMatch = html.match(/<title>(.*?)<\/title>/);
  const title = titleMatch ? titleMatch[1].trim() : '未命名文档';

  // Extract speaker
  let speaker: Speaker | undefined;
  const speakerMatch = html.match(/<div class="speaker"[^>]*>[\s\S]*?<\/div>/);
  if (speakerMatch) {
    const speakerHtml = speakerMatch[0];
    const nameMatch = speakerHtml.match(/class="name"[^>]*>(.*?)</);
    const titleMatch2 = speakerHtml.match(/class="title"[^>]*>(.*?)</);
    const imgMatch = speakerHtml.match(/src="(data:image[^"]*)"/);
    speaker = {
      name: nameMatch ? nameMatch[1].trim() : undefined,
      title: titleMatch2 ? titleMatch2[1].trim() : undefined,
      avatarUrl: imgMatch ? imgMatch[1] : undefined,
    };
  }

  // Extract summary
  let summary: string | undefined;
  const summaryMatch = html.match(/<div class="summary"[^>]*>[\s\S]*?<p>(.*?)<\/p>/);
  if (summaryMatch) {
    summary = summaryMatch[1].trim();
  }

  // Extract steps
  const steps: Step[] = [];
  const stepRegex = /<article class="step"[^>]*>([\s\S]*?)<\/article>/g;
  let stepMatch;
  while ((stepMatch = stepRegex.exec(html)) !== null) {
    const stepHtml = stepMatch[0];
    const styleMatch = stepHtml.match(/style="([^"]*)"/);
    const accentColor = styleMatch ? parseAccentFromStyle(styleMatch[1]) : 'matcha';

    // Step number and title
    const h3Match = stepHtml.match(/<h3>([\s\S]*?)<\/h3>/);
    let stepNumber = steps.length + 1;
    let stepTitle = `步骤 ${stepNumber}`;
    let timestampSec = 0;
    if (h3Match) {
      const h3Text = h3Match[1];
      const numMatch = h3Text.match(/步骤\s*(\d+)/);
      if (numMatch) stepNumber = parseInt(numMatch[1], 10);
      const titleMatch3 = h3Text.match(/:\s*([^<]+)/);
      if (titleMatch3) stepTitle = titleMatch3[1].trim();
      const tsMatch = h3Text.match(/<span class="ts">(.*?)<\/span>/);
      if (tsMatch) timestampSec = parseTimeToSec(tsMatch[1].trim());
    }

    // Short description
    let shortDescription = '';
    const descMatch = stepHtml.match(/<p class="desc">(.*?)<\/p>/);
    if (descMatch) shortDescription = descMatch[1].trim();

    // Body (rich text)
    let instructionRichText = '';
    const bodyMatch = stepHtml.match(/<div class="body">([\s\S]*?)<\/div>/);
    if (bodyMatch) {
      instructionRichText = bodyMatch[1].trim();
    }

    // Screenshots
    const screenshots: Screenshot[] = [];
    const imgRegex = /<img src="(data:image[^"]*)"[^>]*>/g;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(stepHtml)) !== null) {
      screenshots.push({
        url: imgMatch[1],
        alt: `截图 ${screenshots.length + 1}`,
      });
    }

    // Code block
    let codeBlock: CodeBlock | undefined;
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

  if (steps.length === 0) {
    console.warn(`  ⚠️ 未解析到步骤: ${filePath}`);
    return null;
  }

  return { id: docId, title, speaker, summary, steps, htmlFile: filePath };
}

function main() {
  const db = new Database(DB_PATH);

  // Get all doc directories
  const docDirs = readdirSync(EXPORTS_DIR)
    .filter((d) => d.startsWith('doc_'))
    .map((d) => join(EXPORTS_DIR, d));

  console.log(`找到 ${docDirs.length} 个文档目录`);

  let restoredCount = 0;

  for (const docDir of docDirs) {
    const docId = docDir.split('/').pop()!;
    const htmlFiles = readdirSync(docDir).filter((f) => f.endsWith('.html'));

    if (htmlFiles.length === 0) {
      console.log(`  ⚠️ ${docId} 无 HTML 文件`);
      continue;
    }

    // Use the latest (highest timestamp) HTML file
    const latestHtml = htmlFiles.sort().pop()!;
    const filePath = join(docDir, latestHtml);

    console.log(`\n📄 ${docId}: ${latestHtml}`);

    const doc = parseHtmlFile(filePath, docId);
    if (!doc) continue;

    console.log(`  标题: ${doc.title}`);
    console.log(`  步骤: ${doc.steps.length} 个`);
    console.log(`  讲者: ${doc.speaker?.name ?? '无'}`);
    console.log(`  摘要: ${doc.summary ? '有' : '无'}`);

    // Check if already exists
    const existing = db.prepare('SELECT id FROM documents WHERE id = ?').get(doc.id);
    if (existing) {
      console.log(`  ⏭️ 已存在，跳过`);
      continue;
    }

    // Generate task_id from doc_id (doc_XXX → task_XXX)
    const taskId = doc.id.replace('doc_', 'task_');
    const now = Date.now();

    // Insert task
    db.prepare(`
      INSERT INTO tasks (id, document_id, title, status, current_stage, progress,
        video_file_name, subtitle_file_name, video_duration_sec, created_at, updated_at,
        slides_file_name, granularity)
      VALUES (?, ?, ?, 'succeeded', 'assemble', 1.0, ?, NULL, NULL, ?, ?, NULL, NULL)
    `).run(
      taskId,
      doc.id,
      doc.title,
      'restored-from-export',
      now,
      now,
    );

    // Insert document
    db.prepare(`
      INSERT INTO documents (id, task_id, title, speaker_json, steps_json,
        ai_settings_json, last_edited_at, created_at, summary_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      doc.id,
      taskId,
      doc.title,
      JSON.stringify(doc.speaker ?? {}),
      JSON.stringify(doc.steps),
      JSON.stringify({}),
      now,
      now,
      doc.summary ?? null,
    );

    console.log(`  ✅ 已恢复`);
    restoredCount++;
  }

  db.close();
  console.log(`\n🎉 共恢复 ${restoredCount} 个文档`);
}

main();
