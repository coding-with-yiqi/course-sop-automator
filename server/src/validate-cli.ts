#!/usr/bin/env tsx
/**
 * CLI: npm --workspace server run validate -- <documentId>
 *
 * Runs PRD §6 ② check (no more than 3 sentences per step verbatim from
 * the subtitle). Exit code 0 = pass, 1 = at least one step over the
 * threshold.
 */
import { eq } from 'drizzle-orm';
import path from 'node:path';
import { db } from './db/client.js';
import { documents, tasks } from './db/schema.js';
import { paths } from './util/paths.js';
import { parseSubtitleFile } from './subtitles/parse.js';
import { checkStepLeaks } from './validation/lcs.js';
import type { SOPStep } from '@sop/shared';

async function main(): Promise<void> {
  const docId = process.argv[2];
  if (!docId) {
    console.error('用法: npm --workspace server run validate -- <documentId>');
    process.exit(2);
  }
  const doc = db.select().from(documents).where(eq(documents.id, docId)).get();
  if (!doc) {
    console.error(`文档不存在: ${docId}`);
    process.exit(2);
  }
  const task = db.select().from(tasks).where(eq(tasks.documentId, docId)).get();
  if (!task) {
    console.error(`任务不存在(文档: ${docId})`);
    process.exit(2);
  }
  if (!task.subtitleFileName) {
    console.error('该任务无字幕文件,无法校验');
    process.exit(2);
  }
  const subtitlePath = path.join(
    paths.uploads(task.id),
    `subtitle${path.extname(task.subtitleFileName) || '.srt'}`,
  );
  const cues = await parseSubtitleFile(subtitlePath);

  const steps = JSON.parse(doc.stepsJson) as SOPStep[];
  let allPassed = true;
  console.log(`\n校验 PRD §6② — 文档「${doc.title}」(${steps.length} 步骤)\n`);
  for (const step of steps) {
    const report = checkStepLeaks(step, cues);
    const tag = report.passed ? '✓' : '✗';
    console.log(`${tag}  Step ${report.stepNumber}: ${report.stepTitle}`);
    if (report.leaks.length > 0) {
      console.log(`   命中 ${report.leaks.length} 处原句:`);
      for (const leak of report.leaks) {
        console.log(`     · "${leak.stepSentence}"`);
        console.log(`       ↳ 原字幕: "${leak.matchedCue}"`);
      }
    }
    if (!report.passed) allPassed = false;
  }
  console.log('\n' + (allPassed ? '✓ 全部步骤通过' : '✗ 存在步骤超过 3 句原句泄露'));
  process.exit(allPassed ? 0 : 1);
}

void main();
