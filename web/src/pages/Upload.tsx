import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Captions, CloudUpload, FileText, Sparkles, Video, X } from 'lucide-react';
import clsx from 'clsx';
import { api, ApiError } from '@/lib/api.ts';
import { useTaskStream } from '@/lib/sse.ts';
import { StageList } from '@/components/pipeline/StageList.tsx';

const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/x-matroska,.mp4,.mov,.mkv';
const SUBTITLE_ACCEPT = '.srt,.vtt';
const SLIDES_ACCEPT = '.pptx,.pdf';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function Upload() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialTaskId = params.get('taskId');

  const [video, setVideo] = useState<File | null>(null);
  const [subtitle, setSubtitle] = useState<File | null>(null);
  const [slides, setSlides] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(initialTaskId);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { stages, documentId, error: streamError, connectionState } = useTaskStream(taskId);

  useEffect(() => {
    if (documentId) {
      const t = setTimeout(() => navigate(`/documents/${documentId}/edit`), 800);
      return () => clearTimeout(t);
    }
    return;
  }, [documentId, navigate]);

  if (taskId) {
    return (
      <PipelineView
        fileName={video?.name ?? null}
        stages={stages}
        connectionState={connectionState}
        streamError={streamError}
        documentId={documentId}
      />
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!video) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.createTask({
        title: title.trim() || video.name,
        video,
        subtitle,
        slides,
      });
      setTaskId(res.taskId);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '上传失败,请重试';
      setSubmitError(message);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
      <header>
        <h2 className="text-headline-lg font-bold text-forest mb-2">上传课程素材</h2>
        <p className="text-body-md text-sage font-light">
          上传视频与字幕,AI 会自动切片、抽取步骤、抓取关键帧并生成图文 SOP。
        </p>
      </header>

      <VideoDropzone file={video} onFile={setVideo} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SubtitleSlot file={subtitle} onFile={setSubtitle} />
        <SlidesSlot file={slides} onFile={setSlides} />
        <TitleInput value={title} onChange={setTitle} placeholder={video?.name ?? '可选,留空将使用视频文件名'} />
      </div>

      {submitError && (
        <div className="bg-error-container text-on-error-container px-4 py-3 rounded-card text-sm">
          {submitError}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!video || submitting}
          className={clsx(
            'matcha-gradient text-white px-8 py-3 rounded-pill font-bold text-base shadow-card inline-flex items-center gap-2',
            'transition-all hover:shadow-card-hover hover:-translate-y-0.5',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:hover:shadow-card',
          )}
        >
          <Sparkles className="w-5 h-5" />
          {submitting ? '正在上传...' : '开始自动化处理'}
        </button>
      </div>
    </form>
  );
}

function VideoDropzone({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={clsx(
        'rounded-[24px] border-2 border-dashed p-12 text-center cursor-pointer transition-all',
        'group flex flex-col items-center gap-3',
        dragOver
          ? 'border-matcha bg-matcha-container/20'
          : 'border-matcha-container/60 bg-surface-lowest hover:bg-matcha-container/10',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <SelectedFile file={file} onRemove={() => onFile(null)} icon={<Video className="w-6 h-6 text-matcha" />} />
      ) : (
        <>
          <div className="w-16 h-16 rounded-full bg-matcha-container/30 flex items-center justify-center group-hover:scale-110 transition-transform">
            <CloudUpload className="w-8 h-8 text-matcha" />
          </div>
          <p className="text-body-md font-bold text-forest">
            点击此处上传视频,或拖入文件
          </p>
          <p className="text-body-sm text-mist font-light">MP4 / MOV / MKV(最大 5GB)</p>
        </>
      )}
    </div>
  );
}

function SubtitleSlot({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="rounded-card border border-dashed border-border-subtle bg-surface-lowest p-5 cursor-pointer hover:border-matcha-container transition-colors"
    >
      <input
        ref={inputRef}
        type="file"
        accept={SUBTITLE_ACCEPT}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <SelectedFile file={file} onRemove={() => onFile(null)} icon={<Captions className="w-5 h-5 text-matcha" />} compact />
      ) : (
        <div className="flex items-center gap-3 text-mist">
          <Captions className="w-5 h-5" />
          <div>
            <p className="text-body-md font-bold text-forest">上传字幕(可选)</p>
            <p className="text-body-sm font-light">支持 .srt / .vtt</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SlidesSlot({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="rounded-card border border-dashed border-border-subtle bg-surface-lowest p-5 cursor-pointer hover:border-matcha-container transition-colors"
    >
      <input
        ref={inputRef}
        type="file"
        accept={SLIDES_ACCEPT}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <SelectedFile file={file} onRemove={() => onFile(null)} icon={<FileText className="w-5 h-5 text-matcha" />} compact />
      ) : (
        <div className="flex items-center gap-3 text-mist">
          <FileText className="w-5 h-5" />
          <div>
            <p className="text-body-md font-bold text-forest">PPT 原稿(可选)</p>
            <p className="text-body-sm font-light">支持 .pptx / .pdf,帮助 AI 识别代码</p>
          </div>
        </div>
      )}
    </div>
  );
}

function TitleInput({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder: string }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-lowest p-5">
      <label className="text-body-md font-bold text-forest block mb-2">任务名称</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-canvas px-3 py-2 rounded-input border border-border-subtle focus:outline-none focus:ring-2 focus:ring-matcha-container text-body-sm"
      />
    </div>
  );
}

function SelectedFile({
  file,
  onRemove,
  icon,
  compact = false,
}: {
  file: File;
  onRemove: () => void;
  icon: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={clsx('flex items-center gap-3 text-left', compact ? 'w-full' : 'flex-col gap-2')}
      onClick={(e) => e.stopPropagation()}
    >
      {!compact && <div className="w-16 h-16 rounded-full bg-matcha-container/30 flex items-center justify-center">{icon}</div>}
      {compact && icon}
      <div className={clsx(compact && 'flex-1 min-w-0')}>
        <p className="text-body-md font-bold text-forest truncate" title={file.name}>
          {file.name}
        </p>
        <p className="text-body-sm text-mist font-light">{formatBytes(file.size)}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-mist hover:text-error p-2 rounded-pill hover:bg-error-container transition-colors shrink-0"
        aria-label="移除"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function PipelineView({
  fileName,
  stages,
  connectionState,
  streamError,
  documentId,
}: {
  fileName: string | null;
  stages: ReturnType<typeof useTaskStream>['stages'];
  connectionState: ReturnType<typeof useTaskStream>['connectionState'];
  streamError: ReturnType<typeof useTaskStream>['error'];
  documentId: string | null;
}) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-headline-lg font-bold text-forest mb-2">
            <Sparkles className="inline-block w-7 h-7 mr-2 text-matcha" />
            处理管线
          </h2>
          <p className="text-body-md text-sage font-light">
            AI 正在按 5 个阶段处理你的素材,完成后会自动跳转到编辑器。
          </p>
        </div>
        <ConnectionPill state={connectionState} />
      </header>

      {streamError && (
        <div className="bg-error-container text-on-error-container px-4 py-3 rounded-card text-sm">
          管线失败:{streamError.message}
        </div>
      )}

      <StageList stages={stages} fileName={fileName} />

      {documentId && (
        <div className="text-center text-mist text-body-sm font-light">
          管线完成,即将跳转到编辑器...
        </div>
      )}
    </div>
  );
}

function ConnectionPill({ state }: { state: ReturnType<typeof useTaskStream>['connectionState'] }) {
  const label =
    state === 'open'
      ? '实时连接中'
      : state === 'connecting'
        ? '正在连接...'
        : state === 'closed'
          ? '已断开'
          : state === 'error'
            ? '连接错误'
            : '空闲';
  const dot =
    state === 'open'
      ? 'bg-matcha animate-pulse'
      : state === 'connecting'
        ? 'bg-aqua animate-pulse'
        : state === 'error'
          ? 'bg-error'
          : 'bg-mist';
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-surface-lowest border border-border-subtle text-body-sm text-mist">
      <span className={clsx('w-2 h-2 rounded-full', dot)} />
      {label}
    </span>
  );
}
