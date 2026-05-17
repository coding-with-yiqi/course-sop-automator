import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';
import { Copy } from 'lucide-react';
import type { SOPCodeBlock } from '@sop/shared';

const SHIKI_LANG_MAP: Record<string, string> = {
  jsx: 'jsx',
  tsx: 'tsx',
  ts: 'typescript',
  js: 'javascript',
  python: 'python',
  bash: 'bash',
  shell: 'bash',
  sh: 'bash',
  json: 'json',
  yaml: 'yaml',
  html: 'html',
  css: 'css',
  text: 'text',
};

interface CodeViewerProps {
  codeBlock: SOPCodeBlock;
}

export function CodeViewer({ codeBlock }: CodeViewerProps) {
  const [html, setHtml] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const lang = SHIKI_LANG_MAP[codeBlock.language] ?? 'text';

  useEffect(() => {
    let cancelled = false;
    codeToHtml(codeBlock.content, {
      lang,
      theme: 'github-dark',
    })
      .then((out) => {
        if (!cancelled) setHtml(out);
      })
      .catch(() => {
        if (!cancelled) setHtml(`<pre><code>${escape(codeBlock.content)}</code></pre>`);
      });
    return () => {
      cancelled = true;
    };
  }, [codeBlock.content, lang]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(codeBlock.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="bg-[#1a3217] rounded-card border border-[#304d2d] overflow-hidden shadow-inner relative">
      <div className="bg-[#152413] px-4 py-2 flex items-center gap-2 border-b border-[#304d2d]">
        <span className="w-3 h-3 rounded-full bg-[#ff5f56]" />
        <span className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
        <span className="w-3 h-3 rounded-full bg-[#27c93f]" />
        {codeBlock.filename && (
          <span className="ml-2 text-[#a0b39e] text-[12px] font-mono truncate">
            {codeBlock.filename}
          </span>
        )}
        <span className="ml-auto text-[#a0b39e] text-[11px] font-mono uppercase tracking-wider">
          {codeBlock.language}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="p-1 text-[#a0b39e] hover:text-white hover:bg-[#304d2d] rounded transition-colors"
          aria-label="复制代码"
          title={copied ? '已复制' : '复制'}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>
      <div
        className="shiki-host text-[13.5px] leading-relaxed overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
