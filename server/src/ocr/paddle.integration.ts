/**
 * PaddleOCR 集成测试：选一张截图，走完提交→轮询→解析全流程，
 * 打印每一步原始返回，方便排查「空白无识别」问题。
 *
 * 运行方式（在 server/ 目录下）：
 *   npx tsx src/ocr/paddle.integration.ts
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env.js';

const TEST_IMAGE = process.argv[2] || 'data/frames/task_me9ftluwHkWc/18/selected.jpg';
const POLL_INTERVAL = 3000;
const MAX_POLL_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const imagePath = path.resolve(TEST_IMAGE);
  console.log('🖼️  测试图片:', imagePath);

  const stat = await fs.stat(imagePath).catch(() => null);
  if (!stat) {
    console.error('❌ 图片不存在');
    process.exit(1);
  }
  console.log('   大小:', stat.size, 'bytes');

  // 1. 提交 Job
  console.log('\n📤 提交 OCR Job...');
  const buffer = await fs.readFile(imagePath);
  const blob = new Blob([buffer], { type: 'image/jpeg' });
  const form = new FormData();
  form.append('file', blob, path.basename(imagePath));
  form.append('model', env.PADDLE_OCR_MODEL);

  console.log('   model:', env.PADDLE_OCR_MODEL);
  console.log('   token:', env.PADDLE_OCR_TOKEN?.slice(0, 8) + '...');

  const submitRes = await fetch(env.PADDLE_OCR_JOB_URL, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${env.PADDLE_OCR_TOKEN}`,
    },
    body: form,
  });

  console.log('   HTTP 状态:', submitRes.status);
  const submitJson = (await submitRes.json()) as Record<string, unknown>;
  console.log('   返回体:', JSON.stringify(submitJson, null, 2));

  const jobId = (submitJson.data as Record<string, unknown> | undefined)?.jobId as string | undefined;
  if (!jobId) {
    console.error('❌ 没有拿到 jobId');
    process.exit(1);
  }
  console.log('   jobId:', jobId);

  // 2. 轮询
  console.log('\n⏳ 轮询中...');
  const deadline = Date.now() + MAX_POLL_MS;
  let jsonlUrl: string | null = null;

  while (Date.now() < deadline) {
    const pollRes = await fetch(`${env.PADDLE_OCR_JOB_URL}/${jobId}`, {
      headers: { Authorization: `bearer ${env.PADDLE_OCR_TOKEN}` },
    });
    const pollJson = (await pollRes.json()) as Record<string, unknown>;
    const state = (pollJson.data as Record<string, unknown> | undefined)?.state as string | undefined;
    const progress = (pollJson.data as Record<string, unknown> | undefined)?.extractProgress as
      | Record<string, unknown>
      | undefined;

    console.log(`   [${new Date().toLocaleTimeString()}] state=${state}`, progress ? `pages=${progress.extractedPages}/${progress.totalPages}` : '');

    if (state === 'done') {
      jsonlUrl = ((pollJson.data as Record<string, unknown> | undefined)?.resultUrl as
        | Record<string, string>
        | undefined)?.jsonUrl ?? null;
      console.log('   ✅ 完成，jsonlUrl:', jsonlUrl);
      break;
    }
    if (state === 'failed') {
      console.error('   ❌ Job failed:', (pollJson.data as Record<string, unknown> | undefined)?.errorMsg);
      process.exit(1);
    }
    await sleep(POLL_INTERVAL);
  }

  if (!jsonlUrl) {
    console.error('❌ 轮询超时');
    process.exit(1);
  }

  // 3. 取 jsonl 并打印原始内容
  console.log('\n📥 下载 jsonl 结果...');
  const jsonlRes = await fetch(jsonlUrl);
  const jsonlText = await jsonlRes.text();
  console.log('   原始内容:');
  console.log('   ──────────────────────────────');
  console.log(jsonlText);
  console.log('   ──────────────────────────────');

  // 4. 尝试解析
  console.log('\n🔍 尝试解析:');
  const lines = jsonlText.trim().split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      console.log('   JSON 顶层 keys:', Object.keys(parsed).join(', '));

      const result = parsed.result as Record<string, unknown> | undefined;
      if (result) {
        console.log('   result  keys:', Object.keys(result).join(', '));

        const layouts = result.layoutParsingResults as Array<Record<string, unknown>> | undefined;
        if (layouts && layouts.length > 0) {
          console.log('   layoutParsingResults 长度:', layouts.length);
          const first = layouts[0];
          console.log('   第一项 keys:', Object.keys(first).join(', '));

          const md = first.markdown as Record<string, unknown> | undefined;
          if (md) {
            console.log('   markdown.text:', md.text ? `「${String(md.text).slice(0, 100)}...」` : '(空)');
          } else {
            console.log('   ⚠️  没有 markdown 字段');
          }
        } else {
          console.log('   ⚠️  layoutParsingResults 为空或不存在');
        }
      } else {
        console.log('   ⚠️  没有 result 字段');
      }
    } catch (err) {
      console.log('   ⚠️  解析失败:', (err as Error).message);
    }
  }

  console.log('\n✅ 测试完成');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
