import { useState } from 'react';
import { ImageIcon, RotateCw, Sparkles, Upload as UploadIcon } from 'lucide-react';
import clsx from 'clsx';
import type { SOPAiSettings, SOPStep } from '@sop/shared';
import { api } from '@/lib/api.ts';

const LEVEL_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Concise',
  2: 'Balanced',
  3: 'Detailed',
};

interface AISettingsPanelProps {
  documentId: string;
  step: SOPStep;
  aiSettings: SOPAiSettings;
  onSettingsChange: (next: SOPAiSettings) => void;
  onStepRegenerated: (step: SOPStep) => void;
  onOpenScreenshot: () => void;
  onUploadDirect: (file: File) => Promise<void>;
}

export function AISettingsPanel({
  documentId,
  step,
  aiSettings,
  onSettingsChange,
  onStepRegenerated,
  onOpenScreenshot,
  onUploadDirect,
}: AISettingsPanelProps) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [userHint, setUserHint] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleRegenerate() {
    setIsRegenerating(true);
    setError(null);
    try {
      const updated = await api.regenerateStep(documentId, step.stepNumber, {
        detailLevel: aiSettings.detailLevel,
        tone: aiSettings.tone,
        userHint: userHint.trim() || undefined,
      });
      onStepRegenerated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新生成失败');
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 sticky top-4">
      <section className="bg-surface-lowest border border-border-subtle rounded-card p-5 shadow-card">
        <h3 className="text-title-sm font-bold text-forest mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-aqua" />
          AI 调节
        </h3>

        <div className="flex flex-col gap-5">
          <div>
            <label className="flex justify-between text-[11px] font-bold text-mist uppercase tracking-wider mb-2">
              <span>详细程度</span>
              <span className="text-matcha">{LEVEL_LABELS[aiSettings.detailLevel]}</span>
            </label>
            <input
              type="range"
              min={1}
              max={3}
              step={1}
              value={aiSettings.detailLevel}
              onChange={(e) =>
                onSettingsChange({
                  ...aiSettings,
                  detailLevel: Number(e.target.value) as 1 | 2 | 3,
                })
              }
              className="w-full accent-matcha h-1.5 bg-surface-variant rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-mist mt-1">
              <span>Concise</span>
              <span>Balanced</span>
              <span>Detailed</span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-mist uppercase tracking-wider mb-2">
              受众语气
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['technical', 'beginner'] as const).map((tone) => (
                <button
                  key={tone}
                  type="button"
                  onClick={() => onSettingsChange({ ...aiSettings, tone })}
                  className={clsx(
                    'px-3 py-2 rounded-input text-sm transition-colors border',
                    aiSettings.tone === tone
                      ? 'bg-matcha-container/30 border-matcha text-matcha font-bold'
                      : 'bg-surface-bright border-border-subtle text-on-surface hover:bg-surface',
                  )}
                >
                  {tone === 'technical' ? 'Technical' : 'Beginner'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-mist uppercase tracking-wider mb-2">
              额外指示(可选)
            </label>
            <textarea
              value={userHint}
              onChange={(e) => setUserHint(e.target.value)}
              placeholder="比如:加一句关于性能的提示"
              rows={2}
              className="w-full bg-canvas border border-border-subtle rounded-input p-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-matcha-container resize-none"
            />
          </div>

          {error && (
            <div className="text-xs text-error bg-error-container/50 px-3 py-2 rounded-input">{error}</div>
          )}

          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="w-full py-2.5 bg-surface-high text-matcha font-bold rounded-input flex items-center justify-center gap-2 hover:bg-surface-highest transition-colors border border-matcha-container disabled:opacity-50"
          >
            <RotateCw className={clsx('w-4 h-4', isRegenerating && 'animate-spin')} />
            {isRegenerating ? '重新生成中...' : '重新生成本步骤'}
          </button>
        </div>
      </section>

      <section className="bg-surface-lowest border border-border-subtle rounded-card p-5 shadow-card">
        <h3 className="text-title-sm font-bold text-forest mb-4">媒体操作</h3>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onOpenScreenshot}
            className="w-full py-2 px-3 text-left bg-canvas border border-border-subtle text-on-surface rounded-input text-sm hover:bg-surface-bright transition-colors flex items-center gap-3"
          >
            <ImageIcon className="w-4 h-4 text-mist" />
            重新扫描 / 裁剪截图
          </button>
          <label className="w-full py-2 px-3 text-left bg-canvas border border-border-subtle text-on-surface rounded-input text-sm hover:bg-surface-bright transition-colors flex items-center gap-3 cursor-pointer">
            <UploadIcon className="w-4 h-4 text-mist" />
            上传新图片
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onUploadDirect(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </section>
    </div>
  );
}
