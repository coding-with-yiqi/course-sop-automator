import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ChevronRight, Copy, Edit3, ExternalLink, FileCode2 } from 'lucide-react';
import clsx from 'clsx';
import type { SOPDocument, SOPStep } from '@sop/shared';
import { useEditStore } from '@/stores/editStore.ts';
import { api } from '@/lib/api.ts';
import { SpeakerCard } from '@/components/sop/SpeakerCard.tsx';
import { CodeViewer } from '@/components/editor/CodeViewer.tsx';

const ACCENT_BAR: Record<SOPStep['accentColor'], string> = {
  matcha: 'bg-matcha-container',
  aqua: 'bg-aqua-container',
  lavender: 'bg-lavender-container',
  blush: 'bg-blush',
};

const SYNC_PLATFORMS: ReadonlyArray<{
  id: 'yuque' | 'notion' | 'yuanbao' | 'ima';
  label: string;
  letter: string;
  bg: string;
  fg: string;
}> = [
  { id: 'yuque', label: '同步到语雀', letter: 'Y', bg: 'bg-white', fg: 'text-green-600' },
  { id: 'notion', label: '同步到 Notion', letter: 'N', bg: 'bg-white', fg: 'text-black' },
  { id: 'yuanbao', label: '同步到元宝', letter: 'Y', bg: 'bg-white', fg: 'text-blue-600' },
  { id: 'ima', label: '同步到 ima 知识库', letter: 'I', bg: 'bg-white', fg: 'text-indigo-600' },
];

export function ReportDocument() {
  const { id } = useParams<{ id: string }>();
  const document = useEditStore((s) => s.document);
  const isLoading = useEditStore((s) => s.isLoading);
  const loadError = useEditStore((s) => s.loadError);
  const lastSavedAt = useEditStore((s) => s.lastSavedAt);
  const load = useEditStore((s) => s.load);
  const setMeta = useEditStore((s) => s.setMeta);
  const reset = useEditStore((s) => s.reset);

  useEffect(() => {
    if (!id) return;
    void load(id);
    return () => reset();
  }, [id, load, reset]);

  if (isLoading) return <div className="text-center text-mist py-20">加载文档中...</div>;
  if (loadError || !document) {
    return (
      <div className="bg-error-container/40 border border-error/30 rounded-card p-6 text-on-error-container">
        {loadError ?? '文档不存在'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link
            to={`/documents/${document.id}/edit`}
            className="p-2 bg-surface-lowest border border-border-subtle rounded-input hover:bg-surface transition-colors text-mist"
            aria-label="回到编辑"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="px-2 py-0.5 bg-surface-bright border border-matcha text-matcha rounded text-[10px] font-bold uppercase tracking-wider">
                就绪
              </span>
              <span className="text-mist text-body-sm font-light">
                {lastSavedAt ? `生成于 ${new Date(lastSavedAt).toLocaleString('zh-CN')}` : ''}
              </span>
            </div>
            <h1 className="text-headline-md font-bold text-forest">{document.title}</h1>
          </div>
        </div>
        <Link
          to={`/documents/${document.id}/edit`}
          className="px-4 py-2 bg-surface-lowest border border-border-subtle text-on-surface text-sm font-bold rounded-input hover:bg-surface transition-colors inline-flex items-center gap-2"
        >
          <Edit3 className="w-4 h-4" />
          回到编辑
        </Link>
      </header>

      <div className="flex gap-6 items-start">
        <article className="flex-1 glass-panel rounded-card shadow-card p-10 overflow-y-auto max-h-[calc(100vh-12rem)] border border-border-subtle">
          <DocumentPreview
            document={document}
            onSpeakerSave={(speaker) => setMeta({ speaker })}
          />
        </article>

        <aside className="w-[280px] flex flex-col gap-4 shrink-0 sticky top-4">
          <ExportPanel documentId={document.id} />
          <StatusCard lastSavedAt={lastSavedAt} />
        </aside>
      </div>
    </div>
  );
}

function DocumentPreview({
  document,
  onSpeakerSave,
}: {
  document: SOPDocument;
  onSpeakerSave: (speaker: SOPDocument['speaker']) => void;
}) {
  return (
    <>
      <header className="mb-10 pb-8 border-b border-border-subtle">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface rounded-pill text-matcha text-[11px] font-bold uppercase tracking-widest mb-4">
          <CheckCircle2 className="w-3.5 h-3.5" />
          AI 生成
        </span>
        <h1 className="text-headline-lg font-bold text-forest mb-6">{document.title}</h1>
        <SpeakerCard speaker={document.speaker} onSave={onSpeakerSave} />
        {document.summary && document.summary.trim().length > 0 && (
          <div className="mt-6 p-5 bg-surface-lowest border border-border-subtle border-l-4 border-l-matcha-container rounded-card">
            <div className="text-[10px] font-bold text-matcha tracking-widest uppercase mb-2">
              课程总览
            </div>
            <p className="text-body-md text-forest leading-relaxed">{document.summary}</p>
          </div>
        )}
      </header>
      <section className="space-y-10">
        {document.steps.map((step) => (
          <StepView key={step.stepNumber} step={step} />
        ))}
      </section>
    </>
  );
}

function StepView({ step }: { step: SOPStep }) {
  return (
    <article className="relative pl-6">
      <span
        className={clsx('absolute left-0 top-0 bottom-0 w-1 rounded-pill', ACCENT_BAR[step.accentColor])}
        aria-hidden="true"
      />
      <h3 className="text-title-sm font-bold text-forest mb-2 flex items-baseline gap-2">
        步骤 {step.stepNumber}: {step.title}
        <span className="text-[11px] font-mono text-matcha bg-surface-bright px-2 py-0.5 rounded">
          {formatTime(step.timestampSec)}
        </span>
      </h3>
      <p className="text-body-sm text-mist mb-3 font-light">{step.shortDescription}</p>
      <div
        className="text-body-md text-on-surface leading-relaxed mb-4 [&_code]:bg-surface-bright [&_code]:text-matcha [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-[13px]"
        dangerouslySetInnerHTML={{ __html: step.instructionRichText }}
      />
      {step.screenshots && step.screenshots.length > 0 && (
        <div className="my-4 space-y-4">
          {step.screenshots.map((ss, i) => (
            <div key={`${ss.url}-${i}`} className="flex justify-center">
              <div className="rounded-card overflow-hidden border border-border-subtle shadow-card max-w-full">
                <img src={ss.url} alt={ss.alt} className="max-h-[400px] w-auto block" />
              </div>
            </div>
          ))}
        </div>
      )}
      {step.codeBlock && (
        <div className="mt-4">
          <CodeViewer codeBlock={step.codeBlock} />
        </div>
      )}
    </article>
  );
}

function ExportPanel({ documentId }: { documentId: string }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const docText = useDocumentAsText();

  async function handleDownload() {
    setExporting(true);
    setError(null);
    try {
      const result = await api.exportHtml(documentId);
      // Trigger browser download via temporary <a>.
      const a = window.document.createElement('a');
      a.href = result.downloadUrl;
      a.download = result.fileName;
      window.document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
    }
  }

  async function handleCopyAll() {
    try {
      await navigator.clipboard.writeText(docText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('复制失败');
    }
  }

  return (
    <section className="glass-panel p-5 rounded-card shadow-card border border-border-subtle">
      <h2 className="text-title-sm font-bold text-forest mb-4 flex items-center gap-2">
        <ExternalLink className="w-5 h-5 text-matcha" /> 导出选项
      </h2>
      <div className="space-y-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={exporting}
          className="w-full flex items-center justify-between p-3 bg-surface-lowest border border-border-subtle rounded-input hover:border-matcha transition-colors group disabled:opacity-50"
        >
          <span className="flex items-center gap-3">
            <FileCode2 className="w-4 h-4 text-matcha" />
            <span className="text-body-md text-on-surface group-hover:text-matcha font-bold">
              {exporting ? '生成中...' : '导出 HTML'}
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-mist" />
        </button>
        <button
          type="button"
          onClick={handleCopyAll}
          className="w-full flex items-center justify-between p-3 bg-surface-lowest border border-border-subtle rounded-input hover:border-aqua transition-colors group"
        >
          <span className="flex items-center gap-3">
            <Copy className="w-4 h-4 text-aqua" />
            <span className="text-body-md text-on-surface group-hover:text-aqua font-bold">
              {copied ? '已复制 ✓' : '复制全文'}
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-mist" />
        </button>
      </div>
      <div className="pt-4 mt-4 border-t border-border-subtle">
        <p className="text-[11px] font-bold text-mist uppercase tracking-wider mb-3">
          一键同步 (M7 接入)
        </p>
        <div className="space-y-2">
          {SYNC_PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled
              title="即将上线"
              className="w-full flex items-center gap-3 p-3 bg-surface rounded-input transition-colors text-left opacity-70 cursor-not-allowed"
            >
              <span className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold', p.bg, p.fg)}>
                {p.letter}
              </span>
              <span className="text-body-md text-on-surface">{p.label}</span>
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p className="mt-3 text-error text-body-sm bg-error-container/50 px-3 py-2 rounded-input">{error}</p>
      )}
    </section>
  );
}

function StatusCard({ lastSavedAt }: { lastSavedAt: number | null }) {
  return (
    <section className="bg-surface-bright border border-border-subtle p-4 rounded-card">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full bg-matcha animate-pulse" />
        <span className="text-body-sm text-sage font-bold">文档就绪</span>
      </div>
      <p className="text-body-sm text-mist text-xs font-light">
        {lastSavedAt ? `上次自动保存:${formatRel(lastSavedAt)}` : '尚未保存'}
      </p>
    </section>
  );
}

function useDocumentAsText(): string {
  const document = useEditStore((s) => s.document);
  return useMemo(() => {
    if (!document) return '';
    const lines: string[] = [`# ${document.title}`];
    if (document.speaker?.name) {
      lines.push('', `> ${document.speaker.name} — ${document.speaker.title}`, '');
    }
    if (document.summary && document.summary.trim().length > 0) {
      lines.push('', '## 课程总览', document.summary);
    }
    document.steps.forEach((step) => {
      lines.push('', `## 步骤 ${step.stepNumber}: ${step.title}`);
      if (step.shortDescription) lines.push(step.shortDescription);
      const plain = step.instructionRichText
        .replace(/<code>(.*?)<\/code>/g, '`$1`')
        .replace(/<[^>]+>/g, '');
      lines.push(plain);
      if (step.codeBlock) {
        lines.push('', `\`\`\`${step.codeBlock.language}`);
        if (step.codeBlock.filename) lines.push(`// ${step.codeBlock.filename}`);
        lines.push(step.codeBlock.content, '```');
      }
    });
    return lines.join('\n');
  }, [document]);
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatRel(ts: number): string {
  const delta = Math.round((Date.now() - ts) / 1000);
  if (delta < 5) return '刚刚';
  if (delta < 60) return `${delta}s 前`;
  if (delta < 3600) return `${Math.round(delta / 60)} 分钟前`;
  return new Date(ts).toLocaleString('zh-CN');
}
