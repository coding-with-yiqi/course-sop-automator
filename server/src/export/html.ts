import Handlebars from 'handlebars';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { SOPDocument, SOPStep } from '@sop/shared';
import { paths } from '../util/paths.ts';
import { log } from '../util/log.ts';

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
<style>
  :root {
    --matcha: #256c2b;
    --matcha-container: #89d385;
    --canvas: #f6fcf4;
    --forest: #1a4d17;
    --sage: #3d5c3a;
    --mist: #6b7c65;
    --border: #e2efe0;
    --surface: #ffffff;
    --surface-bright: #ecffe3;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: var(--canvas);
    color: var(--forest);
    line-height: 1.7;
    font-weight: 300;
  }
  .stripe { height: 6px; background: linear-gradient(to right, #89d385, #efccea); }
  .container { max-width: 880px; margin: 0 auto; padding: 48px 32px; }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--surface-bright);
    border-radius: 999px;
    color: var(--matcha);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    margin-bottom: 16px;
  }
  h1.title {
    font-size: 34px;
    font-weight: 700;
    color: var(--forest);
    line-height: 1.4;
    letter-spacing: 0.03em;
    margin: 0 0 24px;
  }
  .speaker {
    display: inline-flex;
    align-items: center;
    gap: 16px;
    padding: 12px 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
  }
  .speaker img {
    width: 56px;
    height: 56px;
    border-radius: 999px;
    object-fit: cover;
  }
  .speaker .name { font-size: 16px; font-weight: 700; color: var(--forest); }
  .speaker .title { font-size: 13px; color: var(--mist); margin-top: 2px; }
  .doc-header { padding-bottom: 32px; margin-bottom: 40px; border-bottom: 1px solid var(--border); }

  .step {
    position: relative;
    padding-left: 24px;
    margin-bottom: 40px;
  }
  .step::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    border-radius: 999px;
    background: var(--accent, var(--matcha-container));
  }
  .step h3 {
    font-size: 18px;
    font-weight: 700;
    color: var(--forest);
    margin: 0 0 8px;
  }
  .step .ts {
    display: inline-block;
    margin-left: 8px;
    padding: 2px 8px;
    background: var(--surface-bright);
    color: var(--matcha);
    border-radius: 8px;
    font-size: 11px;
    font-family: "SF Mono", Menlo, monospace;
    font-weight: 700;
  }
  .step .desc { color: var(--sage); margin: 0 0 16px; font-size: 14px; }
  .step .body { color: var(--forest); margin: 0 0 16px; font-size: 15.5px; line-height: 1.85; }
  .step .body code {
    background: var(--surface-bright);
    color: var(--matcha);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
    font-family: "SF Mono", Menlo, monospace;
  }
  .screenshot {
    margin: 16px 0;
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(26, 77, 23, 0.06);
  }
  .screenshot img { width: 100%; display: block; }

  pre.code {
    background: #1a3217;
    color: #ddf9d3;
    border-radius: 12px;
    padding: 16px;
    overflow-x: auto;
    font-family: "SF Mono", Menlo, monospace;
    font-size: 13.5px;
    line-height: 1.7;
    border: 1px solid #304d2d;
  }
  pre.code .filename {
    display: block;
    font-size: 11px;
    color: #a0b39e;
    margin-bottom: 8px;
    font-weight: 700;
  }
  pre.code code { color: inherit; background: transparent; padding: 0; }

  footer {
    margin-top: 64px;
    padding-top: 24px;
    border-top: 6px solid var(--matcha);
    color: var(--mist);
    font-size: 12px;
    text-align: center;
  }
</style>
</head>
<body>
<div class="stripe"></div>
<main class="container">
  <header class="doc-header">
    <div class="badge">AI Generated · Matcha SOP</div>
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
      {{#if screenshot}}
      <div class="screenshot">
        <img src="{{screenshot.url}}" alt="{{screenshot.alt}}" />
      </div>
      {{/if}}
      {{#if codeBlock}}
      <pre class="code"><span class="filename">{{#if codeBlock.filename}}{{codeBlock.filename}} · {{/if}}{{codeBlock.language}}</span><code>{{codeBlock.content}}</code></pre>
      {{/if}}
    </article>
    {{/each}}
  </section>

  <footer>
    © {{year}} Matcha SOP — Generated locally from your course video.
  </footer>
</main>
</body>
</html>`;

const template = Handlebars.compile(TEMPLATE_SOURCE, { noEscape: false });

async function inlineImageAsDataUrl(rawUrl: string): Promise<string> {
  // Map /files/<rel> back to data dir absolute path.
  const rel = rawUrl.replace(/^\/files\//, '').split('?')[0];
  const abs = path.resolve(paths.root, rel);
  if (!abs.startsWith(paths.root)) {
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

export async function renderDocumentHtml(doc: SOPDocument): Promise<RenderResult> {
  // Inline every screenshot and speaker avatar to data URLs so the HTML
  // is self-contained (knowledge-base ingestion friendly, single file).
  const steps = await Promise.all(
    doc.steps.map(async (step) => {
      const next = { ...step };
      if (step.screenshot?.url) {
        const dataUrl = await inlineImageAsDataUrl(step.screenshot.url);
        next.screenshot = { ...step.screenshot, url: dataUrl };
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
    speaker,
    steps,
    year: new Date().getFullYear(),
  });

  const outDir = paths.exports(doc.id);
  await fs.mkdir(outDir, { recursive: true });
  const fileName = `${slugify(doc.title)}-${Date.now()}.html`;
  const filePath = path.join(outDir, fileName);
  await fs.writeFile(filePath, html, 'utf8');

  const rel = path.relative(paths.root, filePath);
  return {
    filePath,
    fileName,
    downloadUrl: `/files/${rel}`,
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
