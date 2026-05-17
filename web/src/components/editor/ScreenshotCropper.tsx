import { useEffect, useRef, useState } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import { Crop as CropIcon, ImageIcon, Upload, X, Check } from 'lucide-react';
import clsx from 'clsx';
import type { SOPStep } from '@sop/shared';
import { api, type ScreenshotCandidate } from '@/lib/api.ts';

interface ScreenshotCropperProps {
  open: boolean;
  onClose: () => void;
  documentId: string;
  stepNumber: number;
  currentUrl: string | null;
  onSelected: (step: SOPStep) => void;
}

type Mode = 'choose' | 'crop';

export function ScreenshotCropper({
  open,
  onClose,
  documentId,
  stepNumber,
  currentUrl,
  onSelected,
}: ScreenshotCropperProps) {
  const [candidates, setCandidates] = useState<ScreenshotCandidate[]>([]);
  const [activeUrl, setActiveUrl] = useState<string | null>(currentUrl);
  const [mode, setMode] = useState<Mode>('choose');
  const [crop, setCrop] = useState<Crop | undefined>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode('choose');
    setCrop(undefined);
    setCompletedCrop(null);
    setError(null);
    setActiveUrl(currentUrl);
  }, [open, currentUrl]);

  if (!open) return null;

  async function handleRescan() {
    setIsWorking(true);
    setError(null);
    try {
      const list = await api.rescanScreenshot(documentId, stepNumber);
      setCandidates(list);
      if (list.length) setActiveUrl(list[Math.floor(list.length / 2)].url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重抓失败');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    setIsWorking(true);
    setError(null);
    try {
      const url = await api.uploadScreenshot(documentId, stepNumber, file);
      setActiveUrl(url);
      setCandidates([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleSave() {
    if (!activeUrl) return;
    setIsWorking(true);
    setError(null);
    try {
      const body: Parameters<typeof api.selectScreenshot>[2] = { url: activeUrl };
      if (mode === 'crop' && completedCrop && imgRef.current) {
        const img = imgRef.current;
        const scaleX = img.naturalWidth / img.width;
        const scaleY = img.naturalHeight / img.height;
        body.crop = {
          x: completedCrop.x * scaleX,
          y: completedCrop.y * scaleY,
          w: completedCrop.width * scaleX,
          h: completedCrop.height * scaleY,
        };
      }
      const step = await api.selectScreenshot(documentId, stepNumber, body);
      onSelected(step);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-forest/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-canvas rounded-card border border-border-subtle shadow-card-hover w-full max-w-3xl max-h-[90vh] flex flex-col">
        <header className="px-6 py-4 border-b border-border-subtle flex justify-between items-center">
          <h3 className="text-title-sm font-bold text-forest flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-matcha" />
            截图编辑 · Step {stepNumber}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-mist hover:text-on-surface rounded-full hover:bg-surface transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-6">
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              type="button"
              onClick={handleRescan}
              disabled={isWorking}
              className="px-3 py-1.5 bg-surface-lowest border border-border-subtle text-on-surface rounded-input text-sm hover:bg-surface transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <ImageIcon className="w-4 h-4" /> 重新扫描候选
            </button>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={isWorking}
              className="px-3 py-1.5 bg-surface-lowest border border-border-subtle text-on-surface rounded-input text-sm hover:bg-surface transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" /> 上传图片
            </button>
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => setMode(mode === 'crop' ? 'choose' : 'crop')}
              disabled={!activeUrl || isWorking}
              className={clsx(
                'px-3 py-1.5 border rounded-input text-sm transition-colors flex items-center gap-2 disabled:opacity-50',
                mode === 'crop'
                  ? 'bg-matcha-container border-matcha text-matcha font-bold'
                  : 'bg-surface-lowest border-border-subtle text-on-surface hover:bg-surface',
              )}
            >
              <CropIcon className="w-4 h-4" /> {mode === 'crop' ? '裁剪中' : '裁剪'}
            </button>
          </div>

          {error && (
            <div className="bg-error-container text-on-error-container text-sm px-3 py-2 rounded-input mb-4">
              {error}
            </div>
          )}

          {candidates.length > 0 && (
            <div className="grid grid-cols-5 gap-2 mb-4">
              {candidates.map((c) => (
                <button
                  type="button"
                  key={c.url}
                  onClick={() => {
                    setActiveUrl(c.url);
                    setMode('choose');
                  }}
                  className={clsx(
                    'aspect-video rounded-input overflow-hidden border-2 transition-all',
                    activeUrl === c.url ? 'border-matcha shadow-card-hover' : 'border-border-subtle hover:border-matcha-container',
                  )}
                  title={`t=${c.timestamp.toFixed(1)}s`}
                >
                  <img src={c.url} alt={`候选 ${c.timestamp}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <div className="bg-canvas border border-border-subtle rounded-input p-4 flex justify-center items-center min-h-[280px]">
            {activeUrl ? (
              mode === 'crop' ? (
                <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)}>
                  <img ref={imgRef} src={activeUrl} alt="待裁剪" className="max-w-full max-h-[60vh]" />
                </ReactCrop>
              ) : (
                <img src={activeUrl} alt="当前选中" className="max-w-full max-h-[60vh] rounded-input" />
              )
            ) : (
              <p className="text-mist text-sm">还没有图片。点「重新扫描候选」或「上传图片」开始。</p>
            )}
          </div>
        </div>

        <footer className="px-6 py-4 border-t border-border-subtle flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-mist hover:text-on-surface text-sm font-bold"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!activeUrl || isWorking}
            className="matcha-gradient text-white px-5 py-2 rounded-pill font-bold text-sm shadow-card hover:shadow-card-hover transition-all inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            {isWorking ? '处理中...' : '保存截图'}
          </button>
        </footer>
      </div>
    </div>
  );
}
