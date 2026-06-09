import Handlebars from 'handlebars';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SOPDocument, SOPStep, ThemeKey } from '@sop/shared';
import { paths, isSafePath } from '../util/paths.js';
import { log } from '../util/log.js';
import { THEMES, DEFAULT_THEME, resolveTheme } from './themes.js';

const ACCENT_HEX: Record<SOPStep['accentColor'], string> = {
  matcha: '#89D385',
  aqua: '#7BDFFE',
  lavender: '#BCBBFF',
  blush: '#EFCCEA',
};

Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
Handlebars.registerHelper('accentHex', (color: SOPStep['accentColor']) =>
  ACCENT_HEX[color] ?? ACCENT_HEX.matcha,
);
Handlebars.registerHelper('formatTime', (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
});

const TEMPLATE_SOURCE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{{title}}</title>
<style>{{{themeCss}}}</style>
</head>
<body>
<div class="stripe"></div>
<main class="container">
  <header class="doc-header">
    <div class="badge">AI 生成 · 教学视频转学习文档</div>
    <h1 class="title">{{title}}</h1>
    {{#if speaker}}
    <div class="speaker">
      {{#if speaker.avatarUrl}}<img src="{{speaker.avatarUrl}}" alt="{{speaker.name}}" />{{/if}}
      <div>
        <div class="name">{{speaker.name}}</div>
        <div class="title">{{speaker.title}}</div>
      </div>
    </div>
    {{/if}}
    {{#if summary}}
    <div class="summary">
      <div class="summary-label">课程总览</div>
      <p>{{summary}}</p>
    </div>
    {{/if}}
  </header>

  <section class="steps">
    {{#each steps}}
    <article class="step" style="--accent: {{accentHex accentColor}};">
      <h3>
        步骤 {{stepNumber}}: {{title}}
        <span class="ts">{{formatTime timestampSec}}</span>
      </h3>
      <p class="desc">{{shortDescription}}</p>
      <div class="body">{{{instructionRichText}}}</div>
      {{#if screenshots}}
      <div class="screenshots">
        {{#each screenshots}}
        <div class="screenshot">
          <img src="{{url}}" alt="{{alt}}" />
        </div>
        {{/each}}
      </div>
      {{/if}}
      {{#if codeBlock}}
      <pre class="code"><span class="filename">{{#if codeBlock.filename}}{{codeBlock.filename}} · {{/if}}{{codeBlock.language}}</span><code>{{codeBlock.content}}</code></pre>
      {{/if}}
    </article>
    {{/each}}
  </section>

  <footer>
    © {{year}} 教学视频转学习文档 · 本地生成
  </footer>
</main>
</body>
</html>`;

const template = Handlebars.compile(TEMPLATE_SOURCE, { noEscape: false });

async function inlineImageAsDataUrl(rawUrl: string): Promise<string> {
  // Map /files/<rel> back to data dir absolute path.
  const rel = rawUrl.replace(/^\/files\//, '').split('?')[0];
  const abs = path.resolve(paths.root, rel);
  if (!isSafePath(abs)) {
    return rawUrl;
  }
  try {
    const buf = await fs.readFile(abs);
    const ext = path.extname(abs).slice(1).toLowerCase() || 'jpeg';
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (err) {
    log.warn({ err, abs }, 'inline image failed, keeping original url');
    return rawUrl;
  }
}

export interface RenderResult {
  filePath: string;
  fileName: string;
  downloadUrl: string;
}

export async function renderDocumentHtml(
  doc: SOPDocument,
  theme?: ThemeKey | string | null,
): Promise<RenderResult> {
  const themeKey = resolveTheme(theme); // invalid/missing → DEFAULT_THEME
  // Inline every screenshot and speaker avatar to data URLs so the HTML
  // is self-contained (knowledge-base ingestion friendly, single file).
  const steps = await Promise.all(
    doc.steps.map(async (step) => {
      const next = { ...step };
      if (step.screenshots?.length) {
        next.screenshots = await Promise.all(
          step.screenshots.map(async (ss) => ({
            ...ss,
            url: await inlineImageAsDataUrl(ss.url),
          })),
        );
      }
      return next;
    }),
  );
  const speaker = doc.speaker ? { ...doc.speaker } : null;
  if (speaker?.avatarUrl) {
    speaker.avatarUrl = await inlineImageAsDataUrl(speaker.avatarUrl);
  }

  const html = template({
    title: doc.title,
    summary: doc.summary,
    speaker,
    steps,
    year: new Date().getFullYear(),
    themeCss: THEMES[themeKey].css,
  });

  const outDir = paths.exports(doc.id);
  await fs.mkdir(outDir, { recursive: true });
  // Include the theme in the file name so exporting multiple themes of the same
  // doc doesn't clobber, and the user can tell them apart.
  const themePart = themeKey === DEFAULT_THEME ? '' : `-${themeKey}`;
  const fileName = `${slugify(doc.title)}${themePart}-${Date.now()}.html`;
  const filePath = path.join(outDir, fileName);
  await fs.writeFile(filePath, html, 'utf8');

  // Serve via a dedicated download route rather than /files/ static: the latter
  // (@fastify/static, wildcard:false) 404s on URL-encoded non-ASCII (Chinese)
  // file names. The download route streams by docId + encoded name and sets a
  // Content-Disposition so the browser keeps the friendly Chinese file name.
  return {
    filePath,
    fileName,
    downloadUrl: `/api/documents/${doc.id}/export/download?name=${encodeURIComponent(fileName)}`,
  };
}

function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sop';
}
