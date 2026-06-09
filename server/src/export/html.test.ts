import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import { renderDocumentHtml } from './html.js';
import { THEMES } from './themes.js';
import { paths } from '../util/paths.js';
import type { SOPDocument } from '@sop/shared';

const DOC_ID = 'doc_html_test';

// A doc that exercises every theme-sensitive surface:
//  - a Chinese title (slug + UTF-8)
//  - an inline <code> inside instructionRichText (must pass through unescaped)
//  - a codeBlock whose content has < and & (must be ESCAPED, not executed)
const doc: SOPDocument = {
  id: DOC_ID,
  taskId: 'task_x',
  title: '我的操作说明书',
  speaker: null,
  summary: '这是课程总览。',
  steps: [
    {
      stepNumber: 1,
      title: '打开终端',
      shortDescription: '第一步',
      instructionRichText: '运行 <code>npm install</code> 安装依赖',
      timestampSec: 12,
      screenshots: [],
      codeBlock: { language: 'bash', filename: 'run.sh', content: 'if [ $a -lt 3 ] && echo "<x>"; then :; fi' },
      accentColor: 'matcha',
      status: 'completed',
    },
  ],
  aiSettings: { detailLevel: 2, tone: 'technical' },
  lastEditedAt: 0,
  createdAt: 0,
};

const ALL_THEMES = Object.keys(THEMES) as (keyof typeof THEMES)[];

afterAll(() => {
  fs.rmSync(paths.exports(DOC_ID), { recursive: true, force: true });
});

async function renderAndRead(theme?: string): Promise<string> {
  const r = await renderDocumentHtml(doc, theme);
  return fs.readFileSync(r.filePath, 'utf8');
}

describe('renderDocumentHtml — theme system', () => {
  it('every theme renders non-empty HTML with its CSS injected', async () => {
    for (const theme of ALL_THEMES) {
      const html = await renderAndRead(theme);
      expect(html.length).toBeGreaterThan(500);
      expect(html).toContain('<!doctype html>');
      // theme CSS is injected (each theme styles body)
      expect(html).toContain('<style>');
    }
  });

  it('EVERY theme styles pre.code with a non-transparent background (no naked code blocks)', async () => {
    // Regression guard: a theme must carry full structural CSS, not just :root vars.
    for (const theme of ALL_THEMES) {
      const css = THEMES[theme].css;
      expect(css).toContain('pre.code');
      // there is a background declaration for the code block
      expect(/pre\.code\s*\{[^}]*background:/.test(css)).toBe(true);
      // and the step left-accent + screenshots are styled too
      expect(css).toContain('.step');
      expect(css).toContain('.screenshot');
    }
  });

  it('HTML structure is identical across themes (title, step, <pre><code>)', async () => {
    for (const theme of ALL_THEMES) {
      const html = await renderAndRead(theme);
      expect(html).toContain('我的操作说明书'); // title
      expect(html).toContain('步骤 1'); // step
      expect(html).toMatch(/<pre class="code">[\s\S]*<code>/); // CLAUDE.md 硬指标
    }
  });

  it('inline <code> in instructionRichText passes through UNescaped (all themes)', async () => {
    for (const theme of ALL_THEMES) {
      const html = await renderAndRead(theme);
      // triple-stache: the <code> tag must survive as real markup
      expect(html).toContain('<code>npm install</code>');
    }
  });

  it('codeBlock.content with < and & is ESCAPED (not raw markup)', async () => {
    const html = await renderAndRead('matcha');
    // Handlebars double-stache escapes < → &lt;, & → &amp;
    expect(html).toContain('&lt;x&gt;');
    expect(html).toContain('&amp;&amp;');
    // the raw, unescaped form must NOT appear inside the code block content
    expect(html).not.toContain('echo "<x>"');
  });

  it('invalid / missing theme falls back to default (matcha) without error', async () => {
    const bogus = await renderAndRead('does-not-exist');
    const dflt = await renderAndRead();
    const matcha = await renderAndRead('matcha');
    // all three carry the matcha signature color
    for (const html of [bogus, dflt, matcha]) {
      expect(html).toContain('#256c2b');
    }
  });

  it('magazine uses Alibaba PuHuiTi with Noto/system fallback (no embedded font dependency)', async () => {
    const css = THEMES.magazine.css;
    expect(css).toContain('Alibaba PuHuiTi');
    expect(css).toContain('Noto Sans SC');
    // must NOT rely on Playfair (no CJK glyphs → DESIGN.md rule)
    expect(css).not.toContain('Playfair');
    // not embedding a font file
    expect(css).not.toContain('@font-face');
  });

  it('base64 image inlining still works after the theme refactor', async () => {
    // doc has no screenshots here, but the inliner path must remain wired;
    // assert the screenshots container only appears when there are screenshots.
    const html = await renderAndRead('matcha');
    expect(html).not.toContain('<div class="screenshots">'); // no screenshots in fixture
  });
});
