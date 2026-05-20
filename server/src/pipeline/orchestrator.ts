import { eq } from 'drizzle-orm';
import path from 'node:path';
import fs from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { PIPELINE_STAGES } from '@sop/shared';
import type { SOPDocument, SOPStep, StageKey } from '@sop/shared';
import { db } from '../db/client.ts';
import { tasks, documents } from '../db/schema.ts';
import { paths, ensureDir } from '../util/paths.ts';
import { log } from '../util/log.ts';
import { emit } from './eventBus.ts';
import { parseSubtitleFile, type Cue } from '../subtitles/parse.ts';
import { segmentSubtitles, type Chunk } from '../subtitles/segment.ts';
import { probeVideo } from '../ffmpeg/probe.ts';
import { extractFrames, candidateTimestamps } from '../ffmpeg/extract.ts';
import { findDuplicates } from '../ffmpeg/dedupe.ts';
import { kimi, KIMI_MODEL } from '../llm/kimi.ts';
import { SYSTEM_PROMPT, buildUserPrompt } from '../llm/prompts.ts';
import { LlmResponseSchema, type LlmStep } from '../llm/schema.ts';
import { generateCourseSummary } from '../llm/summary.ts';
import { parseSlides } from '../slides/parse.ts';

interface RunContext {
  taskId: string;
  documentId: string;
  title: string;
  videoPath: string;
  subtitlePath: string | null;
  slidesPath: string | null;
}

interface StageProgress {
  message?: string;
  progress?: number;
}

function reportStart(taskId: string, stage: StageKey, message: string): void {
  emit({
    taskId,
    name: 'stage',
    stage,
    payload: { stage, status: 'running', progress: 0, message },
  });
  db.update(tasks)
    .set({ currentStage: stage, status: 'running', updatedAt: Date.now() })
    .where(eq(tasks.id, taskId))
    .run();
}

function reportProgress(taskId: string, stage: StageKey, p: StageProgress): void {
  emit({
    taskId,
    name: 'stage',
    stage,
    payload: { stage, status: 'running', progress: p.progress ?? 0, message: p.message },
  });
}

function reportDone(taskId: string, stage: StageKey, message: string): void {
  emit({
    taskId,
    name: 'stage',
    stage,
    payload: { stage, status: 'succeeded', progress: 1, message },
  });
}

const ACCENT_CYCLE = ['matcha', 'aqua', 'lavender', 'blush'] as const;

const FENCE_PREFIX_RE = /^[a-z+#0-9-]{1,16}\s*\r?\n/i;
const FENCE_DELIM_RE = /^```[a-z+#0-9-]*\s*\r?\n|```\s*$/gi;

function sanitizeCodeBlock<T extends { content: string }>(block: T): T {
  let content = block.content.replace(FENCE_DELIM_RE, '');
  // Drop a single line that is just the language tag (e.g. "python\n…").
  const head = content.match(FENCE_PREFIX_RE);
  if (head && /^[a-z+#0-9-]+$/i.test(head[0].trim())) {
    content = content.slice(head[0].length);
  }
  return { ...block, content: content.trimEnd() };
}

async function stageIngest(
  ctx: RunContext,
): Promise<{ durationSec: number; cues: Cue[]; slidesMarkdown: string | null }> {
  reportStart(ctx.taskId, 'ingest', '校验视频与字幕');
  const { durationSec } = await probeVideo(ctx.videoPath);
  reportProgress(ctx.taskId, 'ingest', { progress: 0.4, message: `视频时长 ${Math.round(durationSec)}s` });

  if (!ctx.subtitlePath) {
    throw new Error('MVP 当前要求传入字幕文件(.srt / .vtt)');
  }
  const cues = await parseSubtitleFile(ctx.subtitlePath);
  reportProgress(ctx.taskId, 'ingest', { progress: 0.7, message: `字幕 cues: ${cues.length}` });

  let slidesMarkdown: string | null = null;
  if (ctx.slidesPath) {
    try {
      reportProgress(ctx.taskId, 'ingest', { progress: 0.8, message: '解析 PPT/PDF 原稿' });
      slidesMarkdown = await parseSlides(ctx.slidesPath);
      const slidesOut = path.join(paths.chunks(ctx.taskId), 'slides.md');
      ensureDir(path.dirname(slidesOut));
      await fs.writeFile(slidesOut, slidesMarkdown, 'utf8');
      reportProgress(ctx.taskId, 'ingest', {
        progress: 0.95,
        message: `PPT 解析完成(${slidesMarkdown.length} 字符)`,
      });
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'PPT 解析失败,继续无 PPT 模式');
      slidesMarkdown = null;
    }
  }

  db.update(tasks)
    .set({ videoDurationSec: durationSec, updatedAt: Date.now() })
    .where(eq(tasks.id, ctx.taskId))
    .run();

  const slidesNote = slidesMarkdown ? ` · PPT ${slidesMarkdown.length} 字符` : '';
  reportDone(ctx.taskId, 'ingest', `视频 ${Math.round(durationSec)}s · 字幕 ${cues.length} 句${slidesNote}`);
  return { durationSec, cues, slidesMarkdown };
}

async function stageChunk(
  ctx: RunContext,
  cues: Cue[],
): Promise<Chunk[]> {
  reportStart(ctx.taskId, 'chunk', '按字幕语义切片');
  const chunks = segmentSubtitles(cues, { maxChunkSec: 1500, minChunkSec: 60 });

  ensureDir(paths.chunks(ctx.taskId));
  await Promise.all(
    chunks.map((chunk) =>
      fs.writeFile(
        path.join(paths.chunks(ctx.taskId), `segment-${chunk.index}.json`),
        JSON.stringify(chunk, null, 2),
        'utf8',
      ),
    ),
  );

  reportDone(
    ctx.taskId,
    'chunk',
    `切成 ${chunks.length} 段,最长 ${Math.round(Math.max(...chunks.map((c) => (c.endMs - c.startMs) / 1000)))}s`,
  );
  return chunks;
}

async function callKimi(chunk: Chunk, slidesMarkdown: string | null): Promise<LlmStep[]> {
  const startSec = chunk.startMs / 1000;
  const endSec = chunk.endMs / 1000;
  const user = buildUserPrompt({
    mode: chunk.mode,
    startSec,
    endSec,
    cues: chunk.cues,
    slidesMarkdown,
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const temperature = attempt === 0 ? 0.2 : 0;
    const response = await kimi().chat.completions.create({
      model: KIMI_MODEL,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      log.warn({ attempt }, 'Kimi returned empty content');
      continue;
    }
    try {
      const parsed = JSON.parse(content);
      const result = LlmResponseSchema.parse(parsed);
      return result.steps.map((step) => ({
        ...step,
        timestampSec: Math.min(Math.max(step.timestampSec, startSec), endSec - 0.5),
        codeBlock: step.codeBlock ? sanitizeCodeBlock(step.codeBlock) : null,
      }));
    } catch (err) {
      log.warn({ attempt, err: (err as Error).message, content: content.slice(0, 200) }, 'LLM response invalid');
    }
  }
  throw new Error('Kimi 返回的 JSON 多次校验失败');
}

async function stageLlm(
  ctx: RunContext,
  chunks: Chunk[],
  slidesMarkdown: string | null,
): Promise<LlmStep[]> {
  reportStart(ctx.taskId, 'llm', `调用 Kimi(${chunks.length} 段${slidesMarkdown ? ' · 含 PPT 原稿' : ''})`);
  const all: LlmStep[] = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    reportProgress(ctx.taskId, 'llm', {
      progress: i / chunks.length,
      message: `Kimi 处理段 ${i + 1}/${chunks.length}(${chunk.mode})`,
    });
    const steps = await callKimi(chunk, slidesMarkdown);
    all.push(...steps);
  }
  reportDone(ctx.taskId, 'llm', `共抽取 ${all.length} 个步骤`);
  return all;
}

async function stageFrames(
  ctx: RunContext,
  steps: LlmStep[],
  durationSec: number,
): Promise<Map<number, { framePath: string; relativeUrl: string } | null>> {
  reportStart(ctx.taskId, 'frames', `抓取 ${steps.length} 个关键帧`);

  // 1. For each step, extract 5 candidates and keep the middle one as the representative.
  // If extraction fails (long video / no packets at that timestamp / corrupted segment),
  // the step simply ends up without a screenshot — the pipeline still completes.
  const selected = new Map<number, string>();
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const candidates = candidateTimestamps(step.timestampSec, durationSec);
    const outDir = paths.frames(ctx.taskId, i);
    await fs.mkdir(outDir, { recursive: true });
    const targets = candidates.map((ts, idx) => ({
      timestampSec: ts,
      outPath: path.join(outDir, `candidate-${idx}.jpg`),
    }));
    const results = await extractFrames(ctx.videoPath, targets);
    const oks = results.filter((r) => r.ok);
    if (oks.length > 0) {
      const mid = oks[Math.floor(oks.length / 2)];
      const selectedPath = path.join(outDir, 'selected.jpg');
      await fs.copyFile(mid.target.outPath, selectedPath);
      selected.set(i, selectedPath);
    }
    reportProgress(ctx.taskId, 'frames', {
      progress: (i + 1) / steps.length / 2,
      message: `抓帧 ${i + 1}/${steps.length}(成功 ${oks.length}/${targets.length})`,
    });
  }

  // 2. Cross-step dHash dedupe.
  reportProgress(ctx.taskId, 'frames', { progress: 0.6, message: '关键帧去重(dHash + Hamming)' });
  const dropSet = await findDuplicates(
    [...selected.entries()].map(([index, framePath]) => ({ index, framePath })),
    { threshold: 6 },
  );
  reportProgress(ctx.taskId, 'frames', {
    progress: 0.9,
    message: `去重剔除 ${dropSet.size} 张相似帧`,
  });

  const result = new Map<number, { framePath: string; relativeUrl: string } | null>();
  for (const [index, framePath] of selected.entries()) {
    if (dropSet.has(index)) {
      result.set(index, null);
    } else {
      const rel = path.relative(paths.root, framePath);
      result.set(index, { framePath, relativeUrl: `/files/${rel}` });
    }
  }
  reportDone(
    ctx.taskId,
    'frames',
    `${selected.size - dropSet.size}/${selected.size} 张去重后保留`,
  );
  return result;
}

async function stageAssemble(
  ctx: RunContext,
  llmSteps: LlmStep[],
  framesByIndex: Map<number, { framePath: string; relativeUrl: string } | null>,
): Promise<SOPDocument> {
  reportStart(ctx.taskId, 'assemble', '组装教学文档');

  const sopSteps: SOPStep[] = llmSteps.map((step, idx) => {
    const frame = framesByIndex.get(idx) ?? null;
    return {
      stepNumber: idx + 1,
      title: step.title,
      shortDescription: step.shortDescription,
      instructionRichText: step.instructionRichText,
      timestampSec: step.timestampSec,
      screenshot: frame ? { url: frame.relativeUrl, alt: step.title } : null,
      codeBlock: step.codeBlock ?? null,
      accentColor: step.accentColor ?? ACCENT_CYCLE[idx % ACCENT_CYCLE.length],
      status: 'completed',
    };
  });

  // 课程级摘要(失败时不阻塞主管线,留空让用户后续在编辑页一键重新生成)
  let summary = '';
  try {
    reportProgress(ctx.taskId, 'assemble', { progress: 0.5, message: '生成课程总结' });
    summary = await generateCourseSummary({ title: ctx.title, steps: sopSteps });
  } catch (err) {
    log.warn({ err: (err as Error).message }, '课程总结生成失败,保持空摘要');
  }

  const now = Date.now();
  const doc: SOPDocument = {
    id: ctx.documentId,
    taskId: ctx.taskId,
    title: ctx.title,
    speaker: null,
    summary,
    steps: sopSteps,
    aiSettings: { detailLevel: 2, tone: 'technical' },
    lastEditedAt: now,
    createdAt: now,
  };

  db.insert(documents)
    .values({
      id: doc.id,
      taskId: doc.taskId,
      title: doc.title,
      speakerJson: null,
      stepsJson: JSON.stringify(doc.steps),
      aiSettingsJson: JSON.stringify(doc.aiSettings),
      summaryText: summary || null,
      lastEditedAt: now,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: documents.id,
      set: {
        title: doc.title,
        stepsJson: JSON.stringify(doc.steps),
        aiSettingsJson: JSON.stringify(doc.aiSettings),
        summaryText: summary || null,
        lastEditedAt: now,
      },
    })
    .run();

  reportDone(ctx.taskId, 'assemble', `已落库 ${sopSteps.length} 个步骤`);
  return doc;
}

export async function runPipeline(taskId: string, documentId: string): Promise<void> {
  const row = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!row) {
    log.error({ taskId }, 'pipeline started for missing task');
    return;
  }

  const videoPath = path.join(paths.uploads(taskId), pickVideoFile(row.videoFileName));
  const subtitlePath = row.subtitleFileName
    ? path.join(paths.uploads(taskId), pickSubtitleFile(row.subtitleFileName))
    : null;
  const slidesPath = row.slidesFileName
    ? path.join(paths.uploads(taskId), pickSlidesFile(row.slidesFileName))
    : null;

  const ctx: RunContext = {
    taskId,
    documentId,
    title: row.title,
    videoPath,
    subtitlePath,
    slidesPath,
  };

  try {
    const { durationSec, cues, slidesMarkdown } = await stageIngest(ctx);
    const chunks = await stageChunk(ctx, cues);
    const llmSteps = await stageLlm(ctx, chunks, slidesMarkdown);
    const frames = await stageFrames(ctx, llmSteps, durationSec);
    await stageAssemble(ctx, llmSteps, frames);

    db.update(tasks)
      .set({ status: 'succeeded', currentStage: null, progress: 1, updatedAt: Date.now() })
      .where(eq(tasks.id, taskId))
      .run();
    emit({ taskId, name: 'done', payload: { documentId } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err, taskId }, 'pipeline failed');
    emit({
      taskId,
      name: 'error',
      payload: { code: 'PIPELINE_FAILED', message, recoverable: false },
    });
    db.update(tasks)
      .set({
        status: 'failed',
        errorJson: JSON.stringify({ code: 'PIPELINE_FAILED', message }),
        updatedAt: Date.now(),
      })
      .where(eq(tasks.id, taskId))
      .run();
  }
}

function pickVideoFile(originalName: string): string {
  const ext = path.extname(originalName) || '.mp4';
  return `video${ext}`;
}

function pickSubtitleFile(originalName: string): string {
  const ext = path.extname(originalName) || '.srt';
  return `subtitle${ext}`;
}

function pickSlidesFile(originalName: string): string {
  const ext = path.extname(originalName) || '.pptx';
  return `slides${ext}`;
}

// Backwards-compat alias matching the stage list in shared/.
export const STAGES_IN_ORDER = PIPELINE_STAGES;

// Re-export nanoid in case callers need it later.
export { nanoid };
