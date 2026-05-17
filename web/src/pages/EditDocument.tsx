import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, EditIcon, Save, Sparkles } from 'lucide-react';
import type { SOPStep } from '@sop/shared';
import { useEditStore } from '@/stores/editStore.ts';
import { StepsTimeline } from '@/components/editor/StepsTimeline.tsx';
import { StepEditor } from '@/components/editor/StepEditor.tsx';
import { AISettingsPanel } from '@/components/editor/AISettingsPanel.tsx';
import { ScreenshotCropper } from '@/components/editor/ScreenshotCropper.tsx';
import { api } from '@/lib/api.ts';

export function EditDocument() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const document = useEditStore((s) => s.document);
  const dirtyCount = useEditStore((s) => s.dirtyStepNumbers.size + (s.metaDirty ? 1 : 0));
  const isLoading = useEditStore((s) => s.isLoading);
  const isSaving = useEditStore((s) => s.isSaving);
  const loadError = useEditStore((s) => s.loadError);
  const saveError = useEditStore((s) => s.saveError);
  const lastSavedAt = useEditStore((s) => s.lastSavedAt);
  const selectedStepNumber = useEditStore((s) => s.selectedStepNumber);
  const load = useEditStore((s) => s.load);
  const selectStep = useEditStore((s) => s.selectStep);
  const patchStep = useEditStore((s) => s.patchStep);
  const replaceStep = useEditStore((s) => s.replaceStep);
  const setMeta = useEditStore((s) => s.setMeta);
  const saveNow = useEditStore((s) => s.saveNow);
  const reset = useEditStore((s) => s.reset);

  const [screenshotOpen, setScreenshotOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    void load(id);
    return () => reset();
  }, [id, load, reset]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void saveNow();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [saveNow]);

  if (isLoading) {
    return <div className="text-center text-mist py-20">加载文档中...</div>;
  }
  if (loadError || !document) {
    return (
      <div className="bg-error-container/40 border border-error/30 rounded-card p-6 text-on-error-container">
        {loadError ?? '文档不存在'}
      </div>
    );
  }

  const selectedStep =
    document.steps.find((s) => s.stepNumber === selectedStepNumber) ?? document.steps[0];

  async function handleDirectUpload(file: File) {
    if (!selectedStep) return;
    try {
      const url = await api.uploadScreenshot(document!.id, selectedStep.stepNumber, file);
      const step = await api.selectScreenshot(document!.id, selectedStep.stepNumber, { url });
      replaceStep(step.stepNumber, step);
    } catch (err) {
      console.error('upload failed', err);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            to="/"
            className="p-2 bg-surface-lowest border border-border-subtle rounded-input hover:bg-surface transition-colors text-mist shrink-0"
            aria-label="返回工作台"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-surface-bright border border-matcha text-matcha rounded text-[10px] font-bold uppercase tracking-wider">
                Draft
              </span>
              <SaveStatus
                isSaving={isSaving}
                dirtyCount={dirtyCount}
                lastSavedAt={lastSavedAt}
                saveError={saveError}
              />
            </div>
            <h1 className="text-headline-lg font-bold text-forest flex items-center gap-3 min-w-0">
              <input
                value={document.title}
                onChange={(e) => setMeta({ title: e.target.value })}
                className="bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-matcha-container rounded px-1 min-w-0 flex-1"
              />
              <EditIcon className="w-5 h-5 text-matcha-container shrink-0" />
            </h1>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void saveNow()}
            disabled={dirtyCount === 0 || isSaving}
            className="px-4 py-2 bg-surface-lowest border border-border-subtle text-on-surface text-sm font-bold rounded-input hover:bg-surface transition-colors inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            保存草稿
          </button>
          <button
            type="button"
            onClick={() => navigate(`/documents/${document.id}`)}
            className="matcha-gradient text-white px-6 py-2 rounded-pill font-bold text-sm shadow-card hover:shadow-card-hover transition-all inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            导出 SOP
          </button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-6 items-start">
        <aside className="col-span-12 lg:col-span-3">
          <StepsTimeline
            steps={document.steps}
            selectedStepNumber={selectedStepNumber}
            onSelect={selectStep}
          />
        </aside>

        <section className="col-span-12 lg:col-span-6 flex flex-col gap-6">
          {selectedStep ? (
            <StepEditor
              step={selectedStep}
              onPatch={(patch) => patchStep(selectedStep.stepNumber, patch)}
              onOpenScreenshot={() => setScreenshotOpen(true)}
            />
          ) : (
            <div className="text-center text-mist py-20">还没有步骤</div>
          )}
        </section>

        <aside className="col-span-12 lg:col-span-3">
          {selectedStep && (
            <AISettingsPanel
              documentId={document.id}
              step={selectedStep}
              aiSettings={document.aiSettings}
              onSettingsChange={(next) => setMeta({ aiSettings: next })}
              onStepRegenerated={(updated: SOPStep) => replaceStep(updated.stepNumber, updated)}
              onOpenScreenshot={() => setScreenshotOpen(true)}
              onUploadDirect={handleDirectUpload}
            />
          )}
        </aside>
      </div>

      {selectedStep && (
        <ScreenshotCropper
          open={screenshotOpen}
          onClose={() => setScreenshotOpen(false)}
          documentId={document.id}
          stepNumber={selectedStep.stepNumber}
          currentUrl={selectedStep.screenshot?.url ?? null}
          onSelected={(step) => replaceStep(step.stepNumber, step)}
        />
      )}
    </div>
  );
}

function SaveStatus({
  isSaving,
  dirtyCount,
  lastSavedAt,
  saveError,
}: {
  isSaving: boolean;
  dirtyCount: number;
  lastSavedAt: number | null;
  saveError: string | null;
}) {
  if (saveError) {
    return <span className="text-mist font-body-sm text-error">保存失败:{saveError}</span>;
  }
  if (isSaving) {
    return <span className="text-mist font-body-sm">保存中...</span>;
  }
  if (dirtyCount > 0) {
    return <span className="text-mist font-body-sm">{dirtyCount} 处未保存</span>;
  }
  return <span className="text-mist font-body-sm">{lastSavedAt ? `已保存 ${formatRel(lastSavedAt)}` : '未编辑'}</span>;
}

function formatRel(ts: number): string {
  const delta = Math.round((Date.now() - ts) / 1000);
  if (delta < 5) return '刚刚';
  if (delta < 60) return `${delta}s 前`;
  if (delta < 3600) return `${Math.round(delta / 60)} 分钟前`;
  return new Date(ts).toLocaleString('zh-CN');
}
