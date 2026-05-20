import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import sanitizeHtml from 'sanitize-html';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import sharp from 'sharp';
import type {
  AccentColor,
  SOPAiSettings,
  SOPCodeBlock,
  SOPDocument,
  SOPScreenshot,
  SOPSpeaker,
  SOPStep,
  SOPStepAsset,
} from '@sop/shared';
import { db } from '../db/client.ts';
import { documents, tasks } from '../db/schema.ts';
import { paths } from '../util/paths.ts';
import { log } from '../util/log.ts';
import { extractFrames, candidateTimestamps } from '../ffmpeg/extract.ts';
import { kimi, KIMI_MODEL } from '../llm/kimi.ts';
import { generateCourseSummary } from '../llm/summary.ts';
import { renderDocumentHtml } from '../export/html.ts';
import { parseSlides } from '../slides/parse.ts';

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'strong', 'em', 'code', 'a', 'br', 'span'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  selfClosing: ['br'],
};

const ASSET_PREVIEW_MAX = 2000;
const ACCENT_CYCLE: readonly AccentColor[] = ['matcha', 'aqua', 'lavender', 'blush'];

function sanitize(richText: string): string {
  return sanitizeHtml(richText, SANITIZE_OPTIONS).trim();
}

function deserialize(row: typeof documents.$inferSelect): SOPDocument {
  return {
    id: row.id,
    taskId: row.taskId,
    title: row.title,
    speaker: row.speakerJson ? (JSON.parse(row.speakerJson) as SOPSpeaker) : null,
    summary: row.summaryText ?? '',
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
      summaryText: doc.summary || null,
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

function videoUrlFromTask(task: typeof tasks.$inferSelect): string {
  const ext = path.extname(task.videoFileName) || '.mp4';
  return `/files/uploads/${task.id}/video${ext}`;
}

function findStep(doc: SOPDocument, stepNumber: number): SOPStep | undefined {
  return doc.steps.find((s) => s.stepNumber === stepNumber);
}

function renumber(doc: SOPDocument): void {
  doc.steps.forEach((s, idx) => {
    s.stepNumber = idx + 1;
  });
}

async function readAssetPreview(absPath: string, mime: string): Promise<string> {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.md' || ext === '.txt' || mime.startsWith('text/')) {
    const buf = await fs.readFile(absPath, 'utf8');
    return buf.slice(0, ASSET_PREVIEW_MAX);
  }
  if (ext === '.pdf' || mime === 'application/pdf') {
    try {
      const md = await parseSlides(absPath);
      return md.slice(0, ASSET_PREVIEW_MAX);
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'asset PDF 解析失败');
      return '';
    }
  }
  return '';
}

function buildAssetBlock(assets: SOPStepAsset[] | undefined): string {
  if (!assets || assets.length === 0) return '';
  const parts = assets
    .filter((a) => a.textPreview && a.textPreview.trim().length > 0)
    .map((a) => `《${a.name}》:\n${a.textPreview}`);
  if (parts.length === 0) return '';
  return `\n用户提供的补充素材(请结合纳入,可与原意冲突时优先用户素材):\n${parts.join('\n\n')}`;
}

export function registerDocumentRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>('/api/documents/:id', async (req, reply) => {
    const doc = loadDocument(req.params.id);
    if (!doc) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: '文档不存在' } });
    }
    const task = loadTaskByDocument(doc.id);
    if (task) {
      doc.videoUrl = videoUrlFromTask(task);
    }
    return { ok: true, data: { document: doc } };
  });

  app.patch<{
    Params: { id: string };
    Body: Partial<Pick<SOPDocument, 'title' | 'speaker' | 'aiSettings' | 'summary'>> & {
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
    if (typeof patch.summary === 'string') doc.summary = patch.summary.slice(0, 4000);

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
        if (typeof partial.timestampSec === 'number' && partial.timestampSec >= 0) {
          target.timestampSec = partial.timestampSec;
        }
      }
    }

    persistDocument(doc);
    const task = loadTaskByDocument(doc.id);
    if (task) doc.videoUrl = videoUrlFromTask(task);
    return { ok: true, data: { document: doc } };
  });

  // 中间插入一步:返回 afterStepNumber 之后的新步骤,后续步骤序号顺延 +1
  app.post<{
    Params: { id: string };
    Body: { afterStepNumber: number; title?: string; timestampSec?: number };
  }>('/api/documents/:id/steps/insert', async (req, reply) => {
    const doc = loadDocument(req.params.id);
    if (!doc) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: '文档不存在' } });
    }
    const after = Number(req.body.afterStepNumber);
    if (!Number.isFinite(after) || after < 0) {
      return reply
        .status(400)
        .send({ ok: false, error: { code: 'BAD_REQUEST', message: 'afterStepNumber 非法' } });
    }
    const insertIdx = doc.steps.findIndex((s) => s.stepNumber === after);
    // 如果传 0,在最前面插;找不到时也插到末尾
    let targetIdx: number;
    if (after === 0) targetIdx = 0;
    else if (insertIdx === -1) targetIdx = doc.steps.length;
    else targetIdx = insertIdx + 1;

    const prevTs = doc.steps[targetIdx - 1]?.timestampSec ?? 0;
    const nextTs = doc.steps[targetIdx]?.timestampSec ?? prevTs + 30;
    const interpolated = Math.max(prevTs, Math.min((prevTs + nextTs) / 2, nextTs));
    const ts =
      typeof req.body.timestampSec === 'number' && req.body.timestampSec >= 0
        ? req.body.timestampSec
        : interpolated;

    const newStep: SOPStep = {
      stepNumber: 0, // 临时占位,renumber 会改
      title: req.body.title?.slice(0, 120) || '新步骤',
      shortDescription: '',
      instructionRichText: '',
      timestampSec: ts,
      screenshot: null,
      codeBlock: null,
      accentColor: ACCENT_CYCLE[targetIdx % ACCENT_CYCLE.length],
      status: 'editing',
      assets: [],
    };
    doc.steps.splice(targetIdx, 0, newStep);
    renumber(doc);

    persistDocument(doc);
    const task = loadTaskByDocument(doc.id);
    if (task) doc.videoUrl = videoUrlFromTask(task);
    return { ok: true, data: { document: doc, insertedStepNumber: newStep.stepNumber } };
  });

  // 删除一步,序号顺延
  app.delete<{ Params: { id: string; n: string } }>(
    '/api/documents/:id/steps/:n',
    async (req, reply) => {
      const doc = loadDocument(req.params.id);
      if (!doc) {
        return reply
          .status(404)
          .send({ ok: false, error: { code: 'NOT_FOUND', message: '文档不存在' } });
      }
      const stepNumber = Number(req.params.n);
      const idx = doc.steps.findIndex((s) => s.stepNumber === stepNumber);
      if (idx === -1) {
        return reply
          .status(404)
          .send({ ok: false, error: { code: 'NOT_FOUND', message: '步骤不存在' } });
      }
      doc.steps.splice(idx, 1);
      renumber(doc);
      persistDocument(doc);
      return { ok: true, data: { document: doc } };
    },
  );

  // 每节素材上传(.md / .txt / .pdf)
  app.post<{ Params: { id: string; n: string } }>(
    '/api/documents/:id/steps/:n/assets',
    async (req, reply) => {
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
      if (!part) {
        return reply
          .status(400)
          .send({ ok: false, error: { code: 'NO_FILE', message: '缺少文件' } });
      }
      const ext = path.extname(part.filename).toLowerCase();
      const allowed = ['.md', '.txt', '.pdf'];
      if (!allowed.includes(ext)) {
        part.file.resume();
        return reply.status(415).send({
          ok: false,
          error: { code: 'BAD_MIME', message: '仅支持 .md / .txt / .pdf' },
        });
      }
      const dir = paths.assets(task.id, stepNumber);
      await fs.mkdir(dir, { recursive: true });
      // 保留原始文件名(同名覆盖)
      const safeName = path.basename(part.filename).replace(/[/\\]/g, '_');
      const outPath = path.join(dir, safeName);
      await streamPipeline(part.file, createWriteStream(outPath));
      const stat = await fs.stat(outPath);
      const textPreview = await readAssetPreview(outPath, part.mimetype);
      const asset: SOPStepAsset = {
        name: safeName,
        url: `/files/${path.relative(paths.root, outPath)}`,
        mimeType: part.mimetype || `application/${ext.slice(1)}`,
        sizeBytes: stat.size,
        textPreview: textPreview || undefined,
      };
      const list = step.assets ?? [];
      const filtered = list.filter((a) => a.name !== safeName);
      filtered.push(asset);
      step.assets = filtered;
      persistDocument(doc);
      return { ok: true, data: { step, asset } };
    },
  );

  app.delete<{ Params: { id: string; n: string; name: string } }>(
    '/api/documents/:id/steps/:n/assets/:name',
    async (req, reply) => {
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
      if (!step || !step.assets) {
        return reply
          .status(404)
          .send({ ok: false, error: { code: 'NOT_FOUND', message: '素材不存在' } });
      }
      const decoded = decodeURIComponent(req.params.name);
      const next = step.assets.filter((a) => a.name !== decoded);
      step.assets = next;
      persistDocument(doc);
      const filePath = path.join(paths.assets(task.id, stepNumber), decoded);
      await fs.rm(filePath, { force: true }).catch(() => undefined);
      return { ok: true, data: { step } };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/documents/:id/summary/regenerate',
    async (req, reply) => {
      const doc = loadDocument(req.params.id);
      if (!doc) {
        return reply
          .status(404)
          .send({ ok: false, error: { code: 'NOT_FOUND', message: '文档不存在' } });
      }
      try {
        const summary = await generateCourseSummary({ title: doc.title, steps: doc.steps });
        doc.summary = summary;
        persistDocument(doc);
        return { ok: true, data: { summary } };
      } catch (err) {
        log.error({ err }, 'summary regenerate failed');
        return reply.status(502).send({
          ok: false,
          error: { code: 'LLM_FAILED', message: '总结生成失败,请重试' },
        });
      }
    },
  );

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

    const assetBlock = buildAssetBlock(step.assets);

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
${assetBlock}

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
