import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import sanitizeHtml from 'sanitize-html';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import sharp from 'sharp';
import type {
  SOPAiSettings,
  SOPCodeBlock,
  SOPDocument,
  SOPScreenshot,
  SOPSpeaker,
  SOPStep,
} from '@sop/shared';
import { db } from '../db/client.ts';
import { documents, tasks } from '../db/schema.ts';
import { paths } from '../util/paths.ts';
import { log } from '../util/log.ts';
import { extractFrames, candidateTimestamps } from '../ffmpeg/extract.ts';
import { kimi, KIMI_MODEL } from '../llm/kimi.ts';
import { renderDocumentHtml } from '../export/html.ts';

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'strong', 'em', 'code', 'a', 'br', 'span'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  selfClosing: ['br'],
};

function sanitize(richText: string): string {
  return sanitizeHtml(richText, SANITIZE_OPTIONS).trim();
}

function deserialize(row: typeof documents.$inferSelect): SOPDocument {
  return {
    id: row.id,
    taskId: row.taskId,
    title: row.title,
    speaker: row.speakerJson ? (JSON.parse(row.speakerJson) as SOPSpeaker) : null,
    steps: JSON.parse(row.stepsJson) as SOPStep[],
    aiSettings: JSON.parse(row.aiSettingsJson) as SOPAiSettings,
    lastEditedAt: row.lastEditedAt,
    createdAt: row.createdAt,
  };
}

function persistDocument(doc: SOPDocument): void {
  db.update(documents)
    .set({
      title: doc.title,
      speakerJson: doc.speaker ? JSON.stringify(doc.speaker) : null,
      stepsJson: JSON.stringify(doc.steps),
      aiSettingsJson: JSON.stringify(doc.aiSettings),
      lastEditedAt: Date.now(),
    })
    .where(eq(documents.id, doc.id))
    .run();
}

function loadDocument(id: string): SOPDocument | null {
  const row = db.select().from(documents).where(eq(documents.id, id)).get();
  return row ? deserialize(row) : null;
}

function loadTaskByDocument(documentId: string) {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.documentId, documentId))
    .get();
}

function findStep(doc: SOPDocument, stepNumber: number): SOPStep | undefined {
  return doc.steps.find((s) => s.stepNumber === stepNumber);
}

export function registerDocumentRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>('/api/documents/:id', async (req, reply) => {
    const doc = loadDocument(req.params.id);
    if (!doc) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: '文档不存在' } });
    }
    return { ok: true, data: { document: doc } };
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<Pick<SOPDocument, 'title' | 'speaker' | 'aiSettings'>> & {
      steps?: Array<Partial<SOPStep> & { stepNumber: number }>;
    };
  }>('/api/documents/:id', async (req, reply) => {
    const doc = loadDocument(req.params.id);
    if (!doc) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: '文档不存在' } });
    }
    const patch = req.body;

    if (typeof patch.title === 'string') doc.title = patch.title.slice(0, 200);
    if (patch.speaker !== undefined) doc.speaker = patch.speaker;
    if (patch.aiSettings) doc.aiSettings = patch.aiSettings;

    if (Array.isArray(patch.steps)) {
      for (const partial of patch.steps) {
        const target = findStep(doc, partial.stepNumber);
        if (!target) continue;
        if (typeof partial.title === 'string') target.title = partial.title.slice(0, 120);
        if (typeof partial.shortDescription === 'string') {
          target.shortDescription = partial.shortDescription.slice(0, 200);
        }
        if (typeof partial.instructionRichText === 'string') {
          target.instructionRichText = sanitize(partial.instructionRichText);
        }
        if (partial.codeBlock !== undefined) {
          target.codeBlock = partial.codeBlock as SOPCodeBlock | null;
        }
        if (partial.screenshot !== undefined) {
          target.screenshot = partial.screenshot as SOPScreenshot | null;
        }
        if (partial.accentColor) target.accentColor = partial.accentColor;
      }
    }

    persistDocument(doc);
    return { ok: true, data: { document: doc } };
  });

  app.post<{
    Params: { id: string; n: string };
    Body: { detailLevel?: 1 | 2 | 3; tone?: 'technical' | 'beginner'; userHint?: string };
  }>('/api/documents/:id/steps/:n/regenerate', async (req, reply) => {
    const doc = loadDocument(req.params.id);
    if (!doc) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: '文档不存在' } });
    }
    const stepNumber = Number(req.params.n);
    const step = findStep(doc, stepNumber);
    if (!step) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: '步骤不存在' } });
    }
    const detailLevel = req.body.detailLevel ?? doc.aiSettings.detailLevel;
    const tone = req.body.tone ?? doc.aiSettings.tone;
    const userHint = req.body.userHint?.trim();

    const detailMap: Record<1 | 2 | 3, string> = {
      1: '极简,instructionRichText 限 1 句',
      2: '平衡,instructionRichText 2 句',
      3: '详细,instructionRichText 3 句,补充「为什么」',
    };
    const toneMap: Record<'technical' | 'beginner', string> = {
      technical: '受众是有经验的工程师,使用专业术语',
      beginner: '受众是新手,遇到术语先解释再使用',
    };

    const system = `你是单步重写助手。基于原步骤的标题/描述/代码,只重写 title/shortDescription/instructionRichText 三项,保持 codeBlock 不变。输出严格 JSON,字段为 { "title": string, "shortDescription": string, "instructionRichText": string }。允许 <code>行内</code> 标签,禁止其他 HTML。`;
    const user = `当前步骤 #${stepNumber}:
原标题: ${step.title}
原描述: ${step.shortDescription}
原正文(允许 <code>): ${step.instructionRichText}
原代码(${step.codeBlock?.language ?? '无'}):
${step.codeBlock?.content ?? '(无代码块)'}

要求:
- 详细程度: ${detailMap[detailLevel]}
- 受众: ${toneMap[tone]}
${userHint ? `- 用户额外指示: ${userHint}` : ''}

输出 JSON。`;

    try {
      const response = await kimi().chat.completions.create({
        model: KIMI_MODEL,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      const content = response.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content) as {
        title?: string;
        shortDescription?: string;
        instructionRichText?: string;
      };
      if (parsed.title) step.title = parsed.title.slice(0, 120);
      if (parsed.shortDescription) step.shortDescription = parsed.shortDescription.slice(0, 200);
      if (parsed.instructionRichText) {
        step.instructionRichText = sanitize(parsed.instructionRichText);
      }
      doc.aiSettings = { detailLevel, tone };
      persistDocument(doc);
      return { ok: true, data: { step } };
    } catch (err) {
      log.error({ err }, 'regenerate failed');
      return reply
        .status(502)
        .send({ ok: false, error: { code: 'LLM_FAILED', message: '重新生成失败,请重试' } });
    }
  });

  app.post<{
    Params: { id: string; n: string };
    Body: { windowSec?: number };
  }>('/api/documents/:id/steps/:n/screenshot/rescan', async (req, reply) => {
    const doc = loadDocument(req.params.id);
    if (!doc) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: '文档不存在' } });
    }
    const task = loadTaskByDocument(doc.id);
    if (!task) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: '任务不存在' } });
    }
    const stepNumber = Number(req.params.n);
    const step = findStep(doc, stepNumber);
    if (!step) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: '步骤不存在' } });
    }
    const window = Math.min(Math.max(req.body.windowSec ?? 5, 1), 30);
    const duration = task.videoDurationSec ?? step.timestampSec + window;
    const stepIdx = stepNumber - 1;
    const dir = paths.frames(task.id, stepIdx);
    await fs.mkdir(dir, { recursive: true });
    const videoPath = path.join(paths.uploads(task.id), pickVideoFile(task.videoFileName));
    const candidates = candidateTimestamps(step.timestampSec, duration, window);
    const targets = candidates.map((ts, idx) => ({
      timestampSec: ts,
      outPath: path.join(dir, `candidate-${idx}.jpg`),
    }));
    try {
      await extractFrames(videoPath, targets);
    } catch (err) {
      log.error({ err }, 'rescan ffmpeg failed');
      return reply
        .status(500)
        .send({ ok: false, error: { code: 'FFMPEG_FAILED', message: '重抓帧失败' } });
    }
    const items = targets.map((t, idx) => ({
      url: `/files/${path.relative(paths.root, t.outPath)}`,
      timestamp: candidates[idx],
    }));
    return { ok: true, data: { candidates: items } };
  });

  app.post<{
    Params: { id: string; n: string };
  }>('/api/documents/:id/steps/:n/screenshot/upload', async (req, reply) => {
    const doc = loadDocument(req.params.id);
    if (!doc) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: '文档不存在' } });
    }
    const task = loadTaskByDocument(doc.id);
    if (!task) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: '任务不存在' } });
    }
    const stepNumber = Number(req.params.n);
    const step = findStep(doc, stepNumber);
    if (!step) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: '步骤不存在' } });
    }
    const part = await req.file();
    if (!part || !part.mimetype.startsWith('image/')) {
      return reply
        .status(415)
        .send({ ok: false, error: { code: 'BAD_MIME', message: '请上传图片文件' } });
    }
    const stepIdx = stepNumber - 1;
    const dir = paths.frames(task.id, stepIdx);
    await fs.mkdir(dir, { recursive: true });
    const ext = path.extname(part.filename) || '.jpg';
    const outPath = path.join(dir, `uploaded${ext}`);
    await streamPipeline(part.file, createWriteStream(outPath));
    const url = `/files/${path.relative(paths.root, outPath)}`;
    return { ok: true, data: { url } };
  });

  app.post<{
    Params: { id: string; n: string };
    Body: { url: string; crop?: { x: number; y: number; w: number; h: number } };
  }>('/api/documents/:id/steps/:n/screenshot/select', async (req, reply) => {
    const doc = loadDocument(req.params.id);
    if (!doc) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: '文档不存在' } });
    }
    const task = loadTaskByDocument(doc.id);
    if (!task) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: '任务不存在' } });
    }
    const stepNumber = Number(req.params.n);
    const step = findStep(doc, stepNumber);
    if (!step) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: '步骤不存在' } });
    }
    const sourceRel = req.body.url.replace(/^\/files\//, '');
    const sourceAbs = path.resolve(paths.root, sourceRel);
    if (!sourceAbs.startsWith(paths.root)) {
      return reply
        .status(400)
        .send({ ok: false, error: { code: 'BAD_PATH', message: '非法路径' } });
    }
    const stepIdx = stepNumber - 1;
    const dir = paths.frames(task.id, stepIdx);
    await fs.mkdir(dir, { recursive: true });
    const outPath = path.join(dir, 'selected.jpg');

    if (req.body.crop) {
      const { x, y, w, h } = req.body.crop;
      await sharp(sourceAbs)
        .extract({ left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h) })
        .jpeg({ quality: 90 })
        .toFile(outPath);
    } else {
      await fs.copyFile(sourceAbs, outPath);
    }
    const url = `/files/${path.relative(paths.root, outPath)}?t=${Date.now()}`;
    step.screenshot = { url, alt: step.title };
    persistDocument(doc);
    return { ok: true, data: { step } };
  });

  app.post<{ Params: { id: string } }>('/api/documents/:id/export/html', async (req, reply) => {
    const doc = loadDocument(req.params.id);
    if (!doc) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: '文档不存在' } });
    }
    try {
      const result = await renderDocumentHtml(doc);
      return {
        ok: true,
        data: {
          downloadUrl: result.downloadUrl,
          fileName: result.fileName,
        },
      };
    } catch (err) {
      log.error({ err }, 'export html failed');
      return reply
        .status(500)
        .send({ ok: false, error: { code: 'EXPORT_FAILED', message: '导出失败' } });
    }
  });
}

function pickVideoFile(originalName: string): string {
  const ext = path.extname(originalName) || '.mp4';
  return `video${ext}`;
}
