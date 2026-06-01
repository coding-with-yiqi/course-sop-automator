import { useState } from 'react';
import { Copy, Quote, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import type { SOPStep } from '@sop/shared';
import { RichTextEditor } from './RichTextEditor.tsx';
import { CodeEditor } from './CodeEditor.tsx';

interface StepEditorProps {
  step: SOPStep;
  onPatch: (patch: Partial<SOPStep>) => void;
  onOpenScreenshot: () => void;
  onDelete?: () => void;
}

const ACCENT_BAR: Record<SOPStep['accentColor'], string> = {
  matcha: 'bg-matcha',
  aqua: 'bg-aqua',
  lavender: 'bg-lavender',
  blush: 'bg-blush',
};

export function StepEditor({ step, onPatch, onOpenScreenshot, onDelete }: StepEditorProps) {
  const [copied, setCopied] = useState(false);

  function handleCopyCode() {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleDelete() {
    if (!onDelete) return;
    onDelete();
  }

  return (
    <div className="bg-surface-lowest rounded-card border border-border-subtle overflow-hidden relative group">
      <div className={clsx('absolute left-0 top-0 bottom-0 w-1', ACCENT_BAR[step.accentColor])} aria-hidden="true" />

      <header className="px-6 py-4 border-b border-border-subtle flex justify-between items-center bg-surface-bright">
        <div className="flex items-center gap-3 min-w-0">
          <span className="px-3 py-1 bg-lavender-container/40 text-lavender rounded-pill text-[12px] font-bold whitespace-nowrap">
            步骤 {step.stepNumber}
          </span>
          <input
            value={step.title}
            onChange={(e) => onPatch({ title: e.target.value })}
            className="text-title-sm font-bold text-on-surface bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-matcha-container rounded px-1 flex-1 min-w-0"
          />
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            className="p-1.5 text-mist hover:text-matcha transition-colors"
            title="复制步骤"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!onDelete}
            className="p-1.5 text-mist hover:text-error transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="删除步骤"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      <ScreenshotArea step={step} onOpenScreenshot={onOpenScreenshot} />

      <div className="px-6 py-6">
        <ShortDescriptionInput value={step.shortDescription} onChange={(v) => onPatch({ shortDescription: v })} />

        <div className="border-l-4 border-matcha bg-canvas p-5 rounded-r-card shadow-card mb-6 relative">
          <Quote className="absolute top-3 right-4 w-7 h-7 text-matcha-container/60" aria-hidden="true" />
          <h3 className="text-title-sm font-bold text-forest mb-2">AI 生成的指令</h3>
          <RichTextEditor
            value={step.instructionRichText}
            onChange={(html) => onPatch({ instructionRichText: html })}
          />
        </div>

        <div className="mt-4">
          <div className="flex justify-between items-center mb-2 px-1">
            <span className="text-[12px] font-bold text-mist uppercase tracking-wider">
              生成的代码片段
            </span>
            {copied && <span className="text-[11px] text-matcha font-bold">已复制 ✓</span>}
          </div>
          {step.codeBlock ? (
            <CodeEditor
              codeBlock={step.codeBlock}
              onChange={(next) => onPatch({ codeBlock: next })}
              onCopy={handleCopyCode}
            />
          ) : (
            <button
              type="button"
              onClick={() =>
                onPatch({
                  codeBlock: {
                    language: 'text',
                    filename: '',
                    content: '',
                  },
                })
              }
              className="w-full py-3 border border-dashed border-border-subtle text-mist rounded-input text-sm hover:bg-surface-bright hover:text-matcha transition-colors"
            >
              + 添加代码块
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ShortDescriptionInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-4">
      <label className="block text-[11px] font-bold text-mist uppercase tracking-wider mb-1.5">
        时间线一行预览
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-canvas border border-border-subtle rounded-input px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-matcha-container"
      />
    </div>
  );
}

function ScreenshotArea({
  step,
  onOpenScreenshot,
}: {
  step: SOPStep;
  onOpenScreenshot: () => void;
}) {
  const count = step.screenshots?.length ?? 0;

  if (count === 0) {
    return (
      <div className="px-6 py-10 bg-canvas border-b border-border-subtle flex justify-center">
        <button
          type="button"
          onClick={onOpenScreenshot}
          className="px-4 py-2 bg-surface-lowest border border-dashed border-border-subtle text-mist rounded-input text-sm hover:bg-surface-bright hover:text-matcha transition-colors"
        >
          + 添加截图
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 bg-canvas border-b border-border-subtle relative group/screen space-y-4">
      {step.screenshots.map((ss, i) => (
        <div key={ss.url} className="flex justify-center">
          <img
            alt={ss.alt}
            src={ss.url}
            className="rounded-input shadow-card max-h-[260px] w-auto border border-border-subtle object-cover"
            title={`截图 ${i + 1}/${count}`}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={onOpenScreenshot}
        className="absolute bottom-4 right-8 glass-panel px-3 py-1.5 rounded-input border border-border-subtle shadow-card flex items-center gap-2 text-sm text-on-surface hover:bg-surface transition-colors opacity-0 group-hover/screen:opacity-100"
      >
        编辑截图 {count > 0 ? `(${count})` : ''}
      </button>
    </div>
  );
}
