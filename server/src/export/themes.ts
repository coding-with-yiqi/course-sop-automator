import type { ThemeKey } from '@sop/shared';

/**
 * Export HTML themes. Each theme is a COMPLETE CSS string — it must style every
 * structural selector the shared HTML skeleton emits (.doc-header, .step,
 * pre.code, .step .body code, .screenshots, .screenshot, .stripe, footer …),
 * not just :root variables. Otherwise a non-default theme leaves code blocks /
 * screenshots unstyled. The HTML structure is identical across themes; only this
 * CSS changes, so the theme choice does NOT affect knowledge-base retrieval.
 *
 * CSS lives here (server only) and is never shipped to the web bundle.
 */

export const DEFAULT_THEME: ThemeKey = 'matcha';

// ── matcha (default) — verbatim from the original html.ts <style> ────────────
const MATCHA_CSS = `
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
    display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
    background: var(--surface-bright); border-radius: 999px; color: var(--matcha);
    font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase;
    margin-bottom: 16px;
  }
  h1.title { font-size: 34px; font-weight: 700; color: var(--forest); line-height: 1.4; letter-spacing: 0.03em; margin: 0 0 24px; }
  .speaker { display: inline-flex; align-items: center; gap: 16px; padding: 12px 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; }
  .speaker img { width: 56px; height: 56px; border-radius: 999px; object-fit: cover; }
  .speaker .name { font-size: 16px; font-weight: 700; color: var(--forest); }
  .speaker .title { font-size: 13px; color: var(--mist); margin-top: 2px; }
  .doc-header { padding-bottom: 32px; margin-bottom: 40px; border-bottom: 1px solid var(--border); }
  .summary { margin-top: 24px; padding: 18px 20px; background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--matcha-container); border-radius: 12px; }
  .summary-label { font-size: 11px; font-weight: 700; color: var(--matcha); letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 8px; }
  .summary p { margin: 0; color: var(--forest); font-size: 14.5px; line-height: 1.85; }
  .step { position: relative; padding-left: 24px; margin-bottom: 40px; }
  .step::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; border-radius: 999px; background: var(--accent, var(--matcha-container)); }
  .step h3 { font-size: 18px; font-weight: 700; color: var(--forest); margin: 0 0 8px; }
  .step .ts { display: inline-block; margin-left: 8px; padding: 2px 8px; background: var(--surface-bright); color: var(--matcha); border-radius: 8px; font-size: 11px; font-family: "SF Mono", Menlo, monospace; font-weight: 700; }
  .step .desc { color: var(--sage); margin: 0 0 16px; font-size: 14px; }
  .step .body { color: var(--forest); margin: 0 0 16px; font-size: 15.5px; line-height: 1.85; }
  .step .body code { background: var(--surface-bright); color: var(--matcha); padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: "SF Mono", Menlo, monospace; }
  .screenshots { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin: 16px 0; }
  .screenshot { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(26, 77, 23, 0.06); }
  .screenshot img { width: 100%; display: block; }
  pre.code { background: #1a3217; color: #ddf9d3; border-radius: 12px; padding: 16px; overflow-x: auto; font-family: "SF Mono", Menlo, monospace; font-size: 13.5px; line-height: 1.7; border: 1px solid #304d2d; }
  pre.code .filename { display: block; font-size: 11px; color: #a0b39e; margin-bottom: 8px; font-weight: 700; }
  pre.code code { color: inherit; background: transparent; padding: 0; }
  footer { margin-top: 64px; padding-top: 24px; border-top: 6px solid var(--matcha); color: var(--mist); font-size: 12px; text-align: center; }
`;

// ── minimal — high-contrast black & white, print-first ───────────────────────
const MINIMAL_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #ffffff; color: #1a1a1a; line-height: 1.75; font-weight: 400; }
  .stripe { height: 2px; background: #1a1a1a; }
  .container { max-width: 820px; margin: 0 auto; padding: 56px 32px; }
  .badge { display: inline-block; padding: 4px 0; color: #555; font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 16px; border-bottom: 1px solid #1a1a1a; }
  h1.title { font-size: 32px; font-weight: 800; color: #000; line-height: 1.35; margin: 0 0 24px; }
  .speaker { display: inline-flex; align-items: center; gap: 14px; padding: 10px 0; }
  .speaker img { width: 48px; height: 48px; border-radius: 999px; object-fit: cover; filter: grayscale(1); }
  .speaker .name { font-size: 15px; font-weight: 700; color: #000; }
  .speaker .title { font-size: 13px; color: #666; margin-top: 2px; }
  .doc-header { padding-bottom: 28px; margin-bottom: 36px; border-bottom: 2px solid #1a1a1a; }
  .summary { margin-top: 20px; padding: 16px 18px; background: #f5f5f5; border-left: 3px solid #1a1a1a; }
  .summary-label { font-size: 11px; font-weight: 700; color: #333; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 8px; }
  .summary p { margin: 0; color: #1a1a1a; font-size: 14.5px; line-height: 1.8; }
  .step { position: relative; padding-left: 20px; margin-bottom: 36px; }
  .step::before { content: ""; position: absolute; left: 0; top: 2px; bottom: 2px; width: 3px; background: #1a1a1a; }
  .step h3 { font-size: 18px; font-weight: 700; color: #000; margin: 0 0 8px; }
  .step .ts { display: inline-block; margin-left: 8px; padding: 1px 6px; background: #eee; color: #333; border-radius: 3px; font-size: 11px; font-family: "SF Mono", Menlo, monospace; font-weight: 700; }
  .step .desc { color: #555; margin: 0 0 14px; font-size: 14px; }
  .step .body { color: #1a1a1a; margin: 0 0 16px; font-size: 15.5px; line-height: 1.8; }
  .step .body code { background: #eee; color: #000; padding: 2px 6px; border-radius: 3px; font-size: 13px; font-family: "SF Mono", Menlo, monospace; }
  .screenshots { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin: 16px 0; }
  .screenshot { border: 1px solid #ccc; overflow: hidden; }
  .screenshot img { width: 100%; display: block; }
  pre.code { background: #f4f4f4; color: #1a1a1a; border-radius: 4px; padding: 16px; overflow-x: auto; font-family: "SF Mono", Menlo, monospace; font-size: 13.5px; line-height: 1.7; border: 1px solid #ccc; }
  pre.code .filename { display: block; font-size: 11px; color: #777; margin-bottom: 8px; font-weight: 700; }
  pre.code code { color: inherit; background: transparent; padding: 0; }
  footer { margin-top: 56px; padding-top: 20px; border-top: 1px solid #1a1a1a; color: #777; font-size: 12px; text-align: center; }
  @media print { body { background: #fff; } .container { padding: 0; } }
`;

// ── terminal — light body, DEEP CODE BLOCK as the star (not whole-page dark) ──
const TERMINAL_CSS = `
  :root { --accent2: #2dd4bf; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fafafa; color: #222; line-height: 1.7; font-weight: 400; }
  .stripe { height: 4px; background: linear-gradient(to right, #0f172a, #2dd4bf); }
  .container { max-width: 900px; margin: 0 auto; padding: 48px 32px; }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; background: #0f172a; border-radius: 6px; color: #2dd4bf; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 16px; font-family: "SF Mono", Menlo, monospace; }
  h1.title { font-size: 32px; font-weight: 800; color: #0f172a; line-height: 1.35; margin: 0 0 24px; }
  .speaker { display: inline-flex; align-items: center; gap: 14px; padding: 12px 18px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; }
  .speaker img { width: 52px; height: 52px; border-radius: 8px; object-fit: cover; }
  .speaker .name { font-size: 15px; font-weight: 700; color: #0f172a; }
  .speaker .title { font-size: 13px; color: #64748b; margin-top: 2px; }
  .doc-header { padding-bottom: 30px; margin-bottom: 38px; border-bottom: 1px solid #e2e8f0; }
  .summary { margin-top: 22px; padding: 16px 18px; background: #fff; border: 1px solid #e2e8f0; border-left: 4px solid #2dd4bf; border-radius: 8px; }
  .summary-label { font-size: 11px; font-weight: 700; color: #0f766e; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 8px; }
  .summary p { margin: 0; color: #1e293b; font-size: 14.5px; line-height: 1.8; }
  .step { position: relative; padding-left: 22px; margin-bottom: 38px; }
  .step::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; border-radius: 4px; background: var(--accent, #2dd4bf); }
  .step h3 { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 8px; }
  .step .ts { display: inline-block; margin-left: 8px; padding: 1px 7px; background: #0f172a; color: #2dd4bf; border-radius: 4px; font-size: 11px; font-family: "SF Mono", Menlo, monospace; font-weight: 700; }
  .step .desc { color: #64748b; margin: 0 0 14px; font-size: 14px; }
  .step .body { color: #1e293b; margin: 0 0 16px; font-size: 15.5px; line-height: 1.8; }
  .step .body code { background: #0f172a; color: #2dd4bf; padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: "SF Mono", Menlo, monospace; }
  .screenshots { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin: 16px 0; }
  .screenshot { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  .screenshot img { width: 100%; display: block; }
  pre.code { background: #0b1120; color: #e2e8f0; border-radius: 10px; padding: 18px; overflow-x: auto; font-family: "SF Mono", Menlo, monospace; font-size: 14px; line-height: 1.75; border: 1px solid #1e293b; box-shadow: 0 4px 16px rgba(15,23,42,0.12); }
  pre.code .filename { display: block; font-size: 11px; color: #5eead4; margin-bottom: 10px; font-weight: 700; }
  pre.code code { color: inherit; background: transparent; padding: 0; }
  footer { margin-top: 60px; padding-top: 22px; border-top: 4px solid #0f172a; color: #94a3b8; font-size: 12px; text-align: center; font-family: "SF Mono", Menlo, monospace; }
`;

// ── notion — off-white + slate, archival/document feel ───────────────────────
const NOTION_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fbfbfa; color: #37352f; line-height: 1.75; font-weight: 400; }
  .stripe { height: 3px; background: #e9e9e7; }
  .container { max-width: 860px; margin: 0 auto; padding: 52px 56px; }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: #f1f1ef; border-radius: 4px; color: #787774; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 18px; }
  h1.title { font-size: 36px; font-weight: 700; color: #37352f; line-height: 1.3; margin: 0 0 24px; }
  .speaker { display: inline-flex; align-items: center; gap: 14px; padding: 10px 14px; background: #f7f7f5; border: 1px solid #e9e9e7; border-radius: 8px; }
  .speaker img { width: 48px; height: 48px; border-radius: 999px; object-fit: cover; }
  .speaker .name { font-size: 15px; font-weight: 600; color: #37352f; }
  .speaker .title { font-size: 13px; color: #787774; margin-top: 2px; }
  .doc-header { padding-bottom: 28px; margin-bottom: 36px; border-bottom: 1px solid #e9e9e7; }
  .summary { margin-top: 20px; padding: 16px 18px; background: #f7f7f5; border: 1px solid #e9e9e7; border-left: 3px solid #9b9a97; border-radius: 6px; }
  .summary-label { font-size: 11px; font-weight: 700; color: #787774; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; }
  .summary p { margin: 0; color: #37352f; font-size: 15px; line-height: 1.8; }
  .step { position: relative; padding-left: 22px; margin-bottom: 36px; }
  .step::before { content: ""; position: absolute; left: 0; top: 1px; bottom: 1px; width: 3px; border-radius: 3px; background: var(--accent, #9b9a97); }
  .step h3 { font-size: 19px; font-weight: 600; color: #37352f; margin: 0 0 8px; }
  .step .ts { display: inline-block; margin-left: 8px; padding: 1px 7px; background: #f1f1ef; color: #787774; border-radius: 4px; font-size: 11px; font-family: "SF Mono", Menlo, monospace; font-weight: 600; }
  .step .desc { color: #787774; margin: 0 0 14px; font-size: 14px; }
  .step .body { color: #37352f; margin: 0 0 16px; font-size: 16px; line-height: 1.8; }
  .step .body code { background: #f1f1ef; color: #eb5757; padding: 2px 6px; border-radius: 4px; font-size: 13.5px; font-family: "SF Mono", Menlo, monospace; }
  .screenshots { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin: 16px 0; }
  .screenshot { border: 1px solid #e9e9e7; border-radius: 6px; overflow: hidden; }
  .screenshot img { width: 100%; display: block; }
  pre.code { background: #f7f6f3; color: #37352f; border-radius: 6px; padding: 16px; overflow-x: auto; font-family: "SF Mono", Menlo, monospace; font-size: 13.5px; line-height: 1.7; border: 1px solid #e9e9e7; }
  pre.code .filename { display: block; font-size: 11px; color: #9b9a97; margin-bottom: 8px; font-weight: 600; }
  pre.code code { color: inherit; background: transparent; padding: 0; }
  footer { margin-top: 56px; padding-top: 20px; border-top: 1px solid #e9e9e7; color: #9b9a97; font-size: 12px; text-align: center; }
`;

// ── magazine — bold editorial. Alibaba PuHuiTi big titles (NOT embedded; system
//    fallback per user). NO Playfair (it lacks CJS glyphs → DESIGN.md rule). ───
const MAGAZINE_CSS = `
  :root { --blush: #efccea; --ink: #2a2a2a; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Alibaba PuHuiTi 3.0", "Alibaba PuHuiTi", "Noto Sans SC", -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; background: #fffdf8; color: #2a2a2a; line-height: 1.8; font-weight: 400; }
  .stripe { height: 8px; background: linear-gradient(to right, #2a2a2a 60%, #efccea); }
  .container { max-width: 840px; margin: 0 auto; padding: 64px 40px; }
  .badge { display: inline-block; padding: 6px 0; color: #b07ba6; font-size: 12px; font-weight: 800; letter-spacing: 0.25em; text-transform: uppercase; margin-bottom: 20px; }
  h1.title { font-size: 48px; font-weight: 900; color: #1a1a1a; line-height: 1.15; letter-spacing: -0.01em; margin: 0 0 28px; }
  .speaker { display: inline-flex; align-items: center; gap: 16px; padding: 14px 0; border-top: 2px solid #2a2a2a; }
  .speaker img { width: 56px; height: 56px; border-radius: 999px; object-fit: cover; }
  .speaker .name { font-size: 17px; font-weight: 800; color: #1a1a1a; }
  .speaker .title { font-size: 13px; color: #888; margin-top: 2px; }
  .doc-header { padding-bottom: 36px; margin-bottom: 44px; border-bottom: 3px solid #2a2a2a; }
  .summary { margin-top: 26px; padding: 20px 24px; background: #faf3f8; border-left: 5px solid #efccea; border-radius: 2px; }
  .summary-label { font-size: 11px; font-weight: 800; color: #b07ba6; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 8px; }
  .summary p { margin: 0; color: #2a2a2a; font-size: 15.5px; line-height: 1.9; }
  .step { position: relative; padding-left: 0; margin-bottom: 48px; }
  .step::before { content: ""; display: block; width: 48px; height: 4px; background: var(--accent, #efccea); margin-bottom: 14px; }
  .step h3 { font-size: 24px; font-weight: 800; color: #1a1a1a; line-height: 1.3; margin: 0 0 10px; }
  .step .ts { display: inline-block; margin-left: 10px; padding: 2px 8px; background: #2a2a2a; color: #fffdf8; border-radius: 2px; font-size: 11px; font-family: "SF Mono", Menlo, monospace; font-weight: 700; vertical-align: middle; }
  .step .desc { color: #888; margin: 0 0 16px; font-size: 15px; font-style: italic; }
  .step .body { color: #2a2a2a; margin: 0 0 18px; font-size: 16.5px; line-height: 1.9; }
  .step .body code { background: #faf3f8; color: #b07ba6; padding: 2px 6px; border-radius: 2px; font-size: 14px; font-family: "SF Mono", Menlo, monospace; }
  .screenshots { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin: 20px 0; }
  .screenshot { border: 1px solid #e8e0e6; border-radius: 2px; overflow: hidden; box-shadow: 0 4px 16px rgba(42,42,42,0.08); }
  .screenshot img { width: 100%; display: block; }
  pre.code { background: #1a1a1a; color: #f5f5f5; border-radius: 2px; padding: 18px; overflow-x: auto; font-family: "SF Mono", Menlo, monospace; font-size: 13.5px; line-height: 1.75; border: none; }
  pre.code .filename { display: block; font-size: 11px; color: #c9a9c4; margin-bottom: 10px; font-weight: 700; }
  pre.code code { color: inherit; background: transparent; padding: 0; }
  footer { margin-top: 72px; padding-top: 26px; border-top: 3px solid #2a2a2a; color: #888; font-size: 12px; text-align: center; letter-spacing: 0.1em; }
`;

export const THEMES: Record<ThemeKey, { css: string }> = {
  matcha: { css: MATCHA_CSS },
  minimal: { css: MINIMAL_CSS },
  terminal: { css: TERMINAL_CSS },
  notion: { css: NOTION_CSS },
  magazine: { css: MAGAZINE_CSS },
};

/** Resolve an arbitrary (possibly invalid) theme key to a valid one. */
export function resolveTheme(key: string | null | undefined): ThemeKey {
  return key && key in THEMES ? (key as ThemeKey) : DEFAULT_THEME;
}
