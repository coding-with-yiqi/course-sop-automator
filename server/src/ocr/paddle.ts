import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env.ts';
import { log } from '../util/log.ts';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 60_000;

interface SubmitResponse {
  data: { jobId: string };
}

interface JobStatusResponse {
  data: {
    state: 'pending' | 'running' | 'done' | 'failed';
    errorMsg?: string;
    extractProgress?: {
      totalPages?: number;
      extractedPages?: number;
      startTime?: string;
      endTime?: string;
    };
    resultUrl?: { jsonUrl?: string };
  };
}

interface JsonlLine {
  result: {
    layoutParsingResults: Array<{
      markdown: { text: string; images: Record<string, string> };
      outputImages: Record<string, string>;
    }>;
  };
}

export interface OcrResult {
  text: string;
}

async function postJob(imagePath: string): Promise<string | null> {
  const buffer = await fs.readFile(imagePath);
  const blob = new Blob([buffer], { type: 'image/jpeg' });
  const form = new FormData();
  form.append('file', blob, path.basename(imagePath));
  form.append('model', env.PADDLE_OCR_MODEL);

  const res = await fetch(env.PADDLE_OCR_JOB_URL, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${env.PADDLE_OCR_TOKEN}`,
    },
    body: form,
  });

  if (!res.ok) {
    log.warn({ status: res.status, path: imagePath }, 'PaddleOCR submit job failed');
    return null;
  }

  const json = (await res.json()) as SubmitResponse;
  return json.data?.jobId ?? null;
}

async function pollJob(jobId: string): Promise<string | null> {
  const deadline = Date.now() + MAX_POLL_MS;
  const url = `${env.PADDLE_OCR_JOB_URL}/${jobId}`;

  while (Date.now() < deadline) {
    const res = await fetch(url, {
      headers: { Authorization: `bearer ${env.PADDLE_OCR_TOKEN}` },
    });

    if (!res.ok) {
      log.warn({ status: res.status, jobId }, 'PaddleOCR poll failed');
      return null;
    }

    const json = (await res.json()) as JobStatusResponse;
    const state = json.data?.state;

    if (state === 'done') {
      const jsonlUrl = json.data?.resultUrl?.jsonUrl;
      if (!jsonlUrl) {
        log.warn({ jobId }, 'PaddleOCR job done but no jsonlUrl');
        return null;
      }
      return jsonlUrl;
    }

    if (state === 'failed') {
      log.warn({ jobId, error: json.data?.errorMsg }, 'PaddleOCR job failed');
      return null;
    }

    // pending / running — wait and retry
    await sleep(POLL_INTERVAL_MS);
  }

  log.warn({ jobId }, 'PaddleOCR poll timeout');
  return null;
}

async function fetchJsonlText(jsonlUrl: string): Promise<string> {
  const res = await fetch(jsonlUrl);
  if (!res.ok) {
    log.warn({ status: res.status }, 'PaddleOCR jsonl fetch failed');
    return '';
  }

  const text = await res.text();
  const lines = text.trim().split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as JsonlLine;
      const results = parsed.result?.layoutParsingResults ?? [];
      if (results.length > 0) {
        return results[0].markdown.text.trim();
      }
    } catch {
      // skip malformed line
    }
  }

  return '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 对单张本地图片做 OCR（提交 Job → 轮询 → 取结果）。
 * 失败时返回空 text，不阻塞上层流程。
 */
export async function ocrImage(imagePath: string): Promise<OcrResult> {
  if (!env.PADDLE_OCR_TOKEN) {
    return { text: '' };
  }

  const jobId = await postJob(imagePath);
  if (!jobId) return { text: '' };

  const jsonlUrl = await pollJob(jobId);
  if (!jsonlUrl) return { text: '' };

  const text = await fetchJsonlText(jsonlUrl);
  return { text };
}

interface OcrJob {
  path: string;
  jobId: string | null;
}

/**
 * 批量 OCR：并发提交所有 Job，然后并发轮询等待完成。
 * 总耗时 ≈ 最慢一张的处理时间，而非串行之和。
 */
export async function batchOcr(imagePaths: string[]): Promise<OcrResult[]> {
  if (!env.PADDLE_OCR_TOKEN || imagePaths.length === 0) {
    return imagePaths.map(() => ({ text: '' }));
  }

  // Phase 1: 并发提交所有 Job
  const jobs: OcrJob[] = await Promise.all(
    imagePaths.map(async (path) => {
      const jobId = await postJob(path);
      return { path, jobId };
    }),
  );

  // Phase 2: 并发轮询所有 Job（各自独立轮询）
  const results = await Promise.all(
    jobs.map(async ({ path, jobId }) => {
      if (!jobId) return { text: '' };
      const jsonlUrl = await pollJob(jobId);
      if (!jsonlUrl) return { text: '' };
      const text = await fetchJsonlText(jsonlUrl);
      return { text };
    }),
  );

  return results;
}
