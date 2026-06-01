import { useEffect, useRef, useState } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import { Crop as CropIcon, ImageIcon, Upload, X, ChevronDown, Trash2, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import clsx from 'clsx';
import type { SOPStep, SOPScreenshot } from '@sop/shared';
import { api, type ScreenshotCandidate, type CandidateAnalysis } from '@/lib/api.ts';

const WINDOW_OPTIONS = [
  { value: 5, label: '5秒' },
  { value: 15, label: '15秒' },
  { value: 30, label: '30秒' },
  { value: 60, label: '1分钟' },
  { value: 120, label: '2分钟' },
  { value: 180, label: '3分钟' },
] as const;

interface ScreenshotCropperProps {
  open: boolean;
  onClose: () => void;
  documentId: string;
  stepNumber: number;
  screenshots: SOPScreenshot[];
  onUpdated: (step: SOPStep) => void;
}

type Mode = 'choose' | 'crop';

export function ScreenshotCropper({
  open,
  onClose,
  documentId,
  stepNumber,
  screenshots,
  onUpdated,
}: ScreenshotCropperProps) {
  const [list, setList] = useState<SOPScreenshot[]>(screenshots);
  const [candidates, setCandidates] = useState<ScreenshotCandidate[]>([]);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('choose');
  const [crop, setCrop] = useState<Crop | undefined>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowSec, setWindowSec] = useState<number>(30);
  const [analyses, setAnalyses] = useState<Map<string, CandidateAnalysis>>(new Map());
  const [analyzing, setAnalyzing] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setList(screenshots);
    setMode('choose');
    setCrop(undefined);
    setCompletedCrop(null);
    setError(null);
    setActiveUrl(null);
    setCandidates([]);
    setAnalyses(new Map());
  }, [open, screenshots]);

  if (!open) return null;

  async function handleRescan() {
    setIsWorking(true);
    setError(null);
    setAnalyses(new Map());
    try {
      const items = await api.rescanScreenshot(documentId, stepNumber, windowSec);
      setCandidates(items);
      if (items.length) setActiveUrl(items[Math.floor(items.length / 2)].url);

      // 自动分析候选
      if (items.length > 0) {
        setAnalyzing(true);
        try {
          const results = await api.analyzeCandidates(documentId, stepNumber, items);
          const map = new Map<string, CandidateAnalysis>();
          for (const r of results) {
            const cand = items.find((c) => Math.abs(c.timestamp - r.timestamp) < 0.01);
            if (cand) map.set(cand.url, r);
          }
          setAnalyses(map);
        } catch (err) {
          console.warn('分析失败', err);
        } finally {
          setAnalyzing(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '重抓失败');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleAutoCapture() {
    setIsWorking(true);
    setError(null);
    setCandidates([]);
    setAnalyses(new Map());
    try {
      const step = await api.autoCapture(documentId, stepNumber, windowSec);
      setList(step.screenshots);
      onUpdated(step);
    } catch (err) {
      setError(err instanceof Error ? err.message : '抓取失败');
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

  async function handleAppend() {
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
      setList(step.screenshots);
      setActiveUrl(null);
      setCandidates([]);
      setMode('choose');
      onUpdated(step);
    } catch (err) {
      setError(err instanceof Error ? err.message : '追加失败');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDelete(idx: number) {
    setIsWorking(true);
    setError(null);
    try {
      const step = await api.deleteScreenshot(documentId, stepNumber, idx);
      setList(step.screenshots);
      onUpdated(step);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleReorder(idx: number, dir: -1 | 1) {
    const next = [...list];
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= next.length) return;
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    setIsWorking(true);
    try {
      const step = await api.reorderScreenshots(documentId, stepNumber, next.map((_, i) => i));
      setList(step.screenshots);
      onUpdated(step);
    } catch (err) {
      setError(err instanceof Error ? err.message : '排序失败');
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-forest/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-canvas rounded-card border border-border-subtle shadow-card-hover w-full max-w-3xl max-h-[92vh] flex flex-col">
        <header className="px-6 py-4 border-b border-border-subtle flex justify-between items-center">
          <h3 className="text-title-sm font-bold text-forest flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-matcha" />
            截图编辑 · 步骤 {stepNumber}
            <span className="text-mist font-normal text-body-sm">({list.length} 张)</span>
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

        <div className="flex-1 overflow-auto p-6 space-y-4">
          {/* 已有截图列表 */}
          {list.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-mist uppercase tracking-wider">已有截图</p>
              <div className="flex flex-wrap gap-2">
                {list.map((ss, i) => (
                  <div key={`${ss.url}-${i}`} className="relative group/slide">
                    <img
                      src={ss.url}
                      alt={ss.alt}
                      className="h-20 w-auto rounded-input border border-border-subtle object-cover"
                    />
                    <div className="absolute inset-0 bg-forest/50 rounded-input opacity-0 group-hover/slide:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleReorder(i, -1)}
                        disabled={i === 0 || isWorking}
                        className="p-1 text-white hover:text-matcha-container disabled:opacity-30"
                        title="前移"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReorder(i, 1)}
                        disabled={i === list.length - 1 || isWorking}
                        className="p-1 text-white hover:text-matcha-container disabled:opacity-30"
                        title="后移"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(i)}
                        disabled={isWorking}
                        className="p-1 text-white hover:text-error disabled:opacity-30"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-matcha text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-card">
                      {i + 1}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 候选区操作栏 */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-mist uppercase tracking-wider">添加截图</p>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <select
                  value={windowSec}
                  onChange={(e) => setWindowSec(Number(e.target.value))}
                  disabled={isWorking}
                  className="appearance-none bg-surface-lowest border border-border-subtle text-on-surface rounded-input text-sm px-3 py-1.5 pr-8 hover:bg-surface transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {WINDOW_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-mist" />
              </div>
              <button
                type="button"
                onClick={handleRescan}
                disabled={isWorking}
                className="px-3 py-1.5 bg-surface-lowest border border-border-subtle text-on-surface rounded-input text-sm hover:bg-surface transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <ImageIcon className="w-4 h-4" /> 扫描候选
              </button>
              <button
                type="button"
                onClick={handleAutoCapture}
                disabled={isWorking}
                className="px-3 py-1.5 bg-matcha-container/60 border border-matcha/30 text-matcha rounded-input text-sm hover:bg-matcha-container transition-colors flex items-center gap-2 disabled:opacity-50 font-bold"
              >
                <ImageIcon className="w-4 h-4" /> 一键抓取全部
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
          </div>

          {error && (
            <div className="bg-error-container text-on-error-container text-sm px-3 py-2 rounded-input">
              {error}
            </div>
          )}

          {candidates.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold text-mist uppercase tracking-wider">
                  扫描候选 {analyzing && '· AI 分析中...'}
                </p>
                {analyses.size > 0 && (
                  <p className="text-[11px] text-matcha font-bold">
                    已分析 {analyses.size} 张 · 绿色=推荐
                  </p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {candidates.map((c) => {
                  const a = analyses.get(c.url);
                  const score = a?.score ?? 0;
                  const isRecommended = score >= 70;
                  const isSelected = activeUrl === c.url;
                  return (
                    <button
                      type="button"
                      key={c.url}
                      onClick={() => {
                        setActiveUrl(c.url);
                        setMode('choose');
                      }}
                      className={clsx(
                        'rounded-input overflow-hidden border-2 transition-all text-left',
                        isSelected
                          ? 'border-matcha shadow-card-hover'
                          : isRecommended
                            ? 'border-matcha/40 hover:border-matcha'
                            : 'border-border-subtle hover:border-matcha-container',
                      )}
                    >
                      <div className="aspect-video relative">
                        <img src={c.url} alt={`候选 ${c.timestamp}`} className="w-full h-full object-cover" />
                        {isRecommended && (
                          <span className="absolute top-1.5 right-1.5 bg-matcha text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            推荐
                          </span>
                        )}
                      </div>
                      <div className="px-2 py-1.5 bg-surface-bright/50">
                        <p className="text-[11px] text-on-surface truncate" title={a?.summary}>
                          {a?.summary || '分析中...'}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <div className="flex-1 h-1 bg-border-subtle rounded-full overflow-hidden">
                            <div
                              className={clsx(
                                'h-full rounded-full',
                                score >= 70 ? 'bg-matcha' : score >= 40 ? 'bg-aqua' : 'bg-mist',
                              )}
                              style={{ width: `${score}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-mist tabular-nums">{score}</span>
                        </div>
                        {a && a.tags.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {a.tags.map((tag) => (
                              <span key={tag} className="text-[9px] bg-lavender-container/40 text-lavender px-1 py-0.5 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-canvas border border-border-subtle rounded-input p-4 flex justify-center items-center min-h-[260px]">
            {activeUrl ? (
              mode === 'crop' ? (
                <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)}>
                  <img ref={imgRef} src={activeUrl} alt="待裁剪" className="max-w-full max-h-[50vh]" />
                </ReactCrop>
              ) : (
                <img src={activeUrl} alt="当前选中" className="max-w-full max-h-[50vh] rounded-input" />
              )
            ) : (
              <p className="text-mist text-sm">点「重新扫描候选」或「上传图片」预览新图，然后追加到步骤中。</p>
            )}
          </div>
        </div>

        <footer className="px-6 py-4 border-t border-border-subtle flex justify-between items-center">
          <span className="text-sm text-mist">
            {activeUrl ? '预览中 · 可裁剪后追加' : '选择或上传图片以追加'}
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-mist hover:text-on-surface text-sm font-bold"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={handleAppend}
              disabled={!activeUrl || isWorking}
              className="matcha-gradient text-white px-5 py-2 rounded-pill font-bold text-sm shadow-card hover:shadow-card-hover transition-all inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {isWorking ? '处理中...' : '追加截图'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
