import { CheckCircle2, CloudUpload, FileText, Film, Image as ImageIcon, Loader2, Sparkles, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import type { StageEvent, StageKey, StageMeta } from '@sop/shared';

const STAGE_ICONS: Record<StageKey, LucideIcon> = {
  ingest: CloudUpload,
  chunk: Film,
  llm: Sparkles,
  frames: ImageIcon,
  assemble: FileText,
};

interface StageCardProps {
  meta: StageMeta;
  event: StageEvent;
  fileName?: string | null;
  onCancel?: () => void;
}

export function StageCard({ meta, event, fileName, onCancel }: StageCardProps) {
  const Icon = STAGE_ICONS[meta.key];
  const status = event.status;
  const isRunning = status === 'running';
  const isSucceeded = status === 'succeeded';
  const isFailed = status === 'failed';
  const isQueued = status === 'queued';

  return (
    <div
      className={clsx(
        'glass-panel border rounded-card p-4 flex items-center gap-6 relative z-10 transition-all',
        isRunning && 'ai-shimmer shadow-card ring-1 ring-matcha-container/40 border-matcha-container/50',
        isSucceeded && 'opacity-70 border-border-subtle',
        isQueued && 'border-border-subtle bg-surface-lowest',
        isFailed && 'border-error/40 ring-1 ring-error/30',
      )}
    >
      <IconBubble Icon={Icon} status={status} />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-1 gap-3">
          <h4
            className={clsx(
              'text-body-md font-bold truncate',
              isQueued ? 'text-mist' : 'text-on-surface',
            )}
          >
            {meta.key === 'ingest' && fileName ? fileName : meta.label}
          </h4>
          <StatusBadge status={status} progress={event.progress} />
        </div>
        {isRunning && typeof event.progress === 'number' && (
          <div className="w-full bg-surface-low rounded-full h-1.5 overflow-hidden mb-2">
            <div
              className="bg-gradient-to-r from-matcha-container to-aqua-container h-1.5 rounded-full transition-[width] duration-300"
              style={{ width: `${Math.round(event.progress * 100)}%` }}
            />
          </div>
        )}
        <p
          className={clsx(
            'text-body-sm text-xs font-light',
            isQueued ? 'text-mist/70' : 'text-mist',
          )}
        >
          {messageFor(event, meta)}
        </p>
      </div>
      {isRunning && onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-mist hover:text-error shrink-0 transition-colors p-1"
          aria-label="取消"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function IconBubble({ Icon, status }: { Icon: LucideIcon; status: StageEvent['status'] }) {
  if (status === 'running') {
    return (
      <div className="w-12 h-12 rounded-full bg-surface-highest flex items-center justify-center border-2 border-matcha-container shrink-0 relative">
        <Icon className="w-5 h-5 text-matcha" />
        <Loader2 className="w-3.5 h-3.5 text-matcha absolute -bottom-1 -right-1 bg-canvas rounded-full p-0.5 animate-spin" />
      </div>
    );
  }
  if (status === 'succeeded') {
    return (
      <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-matcha" />
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="w-12 h-12 rounded-full bg-error-container flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-error" />
      </div>
    );
  }
  return (
    <div className="w-12 h-12 rounded-full border border-border-subtle bg-canvas flex items-center justify-center shrink-0">
      <Icon className="w-5 h-5 text-mist" />
    </div>
  );
}

function StatusBadge({
  status,
  progress,
}: {
  status: StageEvent['status'];
  progress?: number;
}) {
  if (status === 'running' && typeof progress === 'number') {
    return <span className="text-xs font-bold text-matcha shrink-0">{Math.round(progress * 100)}%</span>;
  }
  if (status === 'succeeded') {
    return <CheckCircle2 className="w-4 h-4 text-matcha shrink-0" />;
  }
  return null;
}

function messageFor(event: StageEvent, meta: StageMeta): string {
  if (event.message) return event.message;
  if (event.status === 'queued') return meta.description;
  if (event.status === 'running') return meta.description;
  if (event.status === 'succeeded') return '已完成';
  if (event.status === 'failed') return '失败';
  return meta.description;
}
