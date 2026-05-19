import fs from 'node:fs/promises';
import path from 'node:path';
import PizZip from 'pizzip';
import { env } from '../env.ts';
import { log } from '../util/log.ts';

/**
 * 解析 PPT / PDF 原稿为统一的 Markdown 大纲,供 LLM 阶段拼到 user prompt。
 *
 * 路由策略:
 *   .pptx → 本地 pizzip 抽 XML <a:t> 文本(零网络,毫秒级)
 *   .pdf  → 异步上传到 PaddleOCR (AI Studio) PP-OCR/VL,轮询拿 JSONL
 *   其他  → 抛错
 */
export async function parseSlides(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pptx') return parsePptx(filePath);
  if (ext === '.pdf') return parsePdf(filePath);
  throw new Error(`不支持的 PPT 格式: ${ext}(支持 .pptx / .pdf)`);
}

// ──────────────────────────────────────────────────────────
// PPTX:zip → ppt/slides/slide{N}.xml → <a:t>...</a:t>
// ──────────────────────────────────────────────────────────

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

async function parsePptx(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  const zip = new PizZip(buf);
  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const n = (s: string) => Number(s.match(/slide(\d+)\.xml/)![1]);
      return n(a) - n(b);
    });

  if (slideEntries.length === 0) {
    throw new Error('PPTX 中未找到任何 slide(可能是损坏的或非标准 PPTX)');
  }

  const out: string[] = [];
  slideEntries.forEach((name, idx) => {
    const xml = zip.files[name].asText();
    // Paragraph = <a:p>...</a:p>;run text = <a:t>...</a:t>.
    // 每段 join 内部 <a:t>,段之间换行,保留视觉结构。
    const paragraphs = [...xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)].map((m) => {
      const texts = [...m[1].matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((t) =>
        decodeXmlEntities(t[1]),
      );
      return texts.join('').trim();
    });
    const body = paragraphs.filter(Boolean).join('\n\n');
    out.push(`## Slide ${idx + 1}\n\n${body || '_(无文字)_'}`);
  });
  return out.join('\n\n---\n\n');
}

// ──────────────────────────────────────────────────────────
// PDF:异步 PaddleOCR job
// ──────────────────────────────────────────────────────────

interface JobSubmitResponse {
  data: { jobId: string };
}

interface JobStateResponse {
  data: {
    state: 'pending' | 'running' | 'done' | 'failed';
    errorMsg?: string;
    extractProgress?: {
      totalPages?: number;
      extractedPages?: number;
      startTime?: string;
      endTime?: string;
    };
    resultUrl?: {
      jsonUrl?: string;
    };
  };
}

interface LayoutParsingResult {
  markdown: { text: string };
}

interface JsonlLineResult {
  result: {
    layoutParsingResults: LayoutParsingResult[];
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function parsePdf(filePath: string): Promise<string> {
  if (!env.PADDLE_OCR_TOKEN) {
    throw new Error(
      'PDF 解析需要 PADDLE_OCR_TOKEN(在 .env 配置,从 aistudio.baidu.com/paddleocr/task 获取)',
    );
  }
  const headers = { Authorization: `bearer ${env.PADDLE_OCR_TOKEN}` };

  // ----- 1. 提交 job
  const fileBuf = await fs.readFile(filePath);
  const fileName = path.basename(filePath);
  const fd = new FormData();
  // Node 22 内置 FormData + Blob;给 file 字段加 filename 让 server 识别 MIME
  fd.append('file', new Blob([new Uint8Array(fileBuf)]), fileName);
  fd.append('model', env.PADDLE_OCR_MODEL);
  fd.append(
    'optionalPayload',
    JSON.stringify({
      useDocOrientationClassify: false,
      useDocUnwarping: false,
      useChartRecognition: false,
    }),
  );

  const submit = await fetch(env.PADDLE_OCR_JOB_URL, { method: 'POST', headers, body: fd });
  if (!submit.ok) {
    const text = await submit.text();
    throw new Error(`PaddleOCR submit 失败 ${submit.status}: ${text.slice(0, 300)}`);
  }
  const submitJson = (await submit.json()) as JobSubmitResponse;
  const jobId = submitJson.data?.jobId;
  if (!jobId) throw new Error('PaddleOCR submit 响应缺 jobId');
  log.info({ jobId }, 'PaddleOCR job submitted');

  // ----- 2. 轮询
  let jsonlUrl: string | undefined;
  const startedAt = Date.now();
  const MAX_WAIT_MS = 10 * 60_000; // 10 分钟硬上限
  while (true) {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error(`PaddleOCR job ${jobId} 超过 10 分钟未完成`);
    }
    const r = await fetch(`${env.PADDLE_OCR_JOB_URL}/${jobId}`, { headers });
    if (!r.ok) throw new Error(`PaddleOCR poll 失败 ${r.status}`);
    const body = (await r.json()) as JobStateResponse;
    const state = body.data.state;
    if (state === 'done') {
      jsonlUrl = body.data.resultUrl?.jsonUrl;
      if (!jsonlUrl) throw new Error('PaddleOCR done 但缺 jsonUrl');
      log.info({ jobId, pages: body.data.extractProgress?.extractedPages }, 'PaddleOCR job done');
      break;
    }
    if (state === 'failed') {
      throw new Error(`PaddleOCR job failed: ${body.data.errorMsg ?? '未知原因'}`);
    }
    await sleep(5000);
  }

  // ----- 3. 下载 JSONL 并解析每页 markdown
  const jsonlResp = await fetch(jsonlUrl);
  if (!jsonlResp.ok) throw new Error(`下载 JSONL 失败 ${jsonlResp.status}`);
  const jsonlText = await jsonlResp.text();
  const lines = jsonlText.split('\n').map((l) => l.trim()).filter(Boolean);
  const pages: string[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as JsonlLineResult;
      for (const lp of parsed.result?.layoutParsingResults ?? []) {
        if (lp.markdown?.text) pages.push(lp.markdown.text);
      }
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'JSONL line 解析失败,跳过');
    }
  }
  if (pages.length === 0) throw new Error('PaddleOCR 输出为空');
  return pages.map((md, i) => `## Page ${i + 1}\n\n${md.trim()}`).join('\n\n---\n\n');
}
