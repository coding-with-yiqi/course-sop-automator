import { useEffect, useRef, useState } from 'react';
import { GripVertical, X } from 'lucide-react';
import { fileUrl } from '@/lib/api.ts';

const STORAGE_KEY = 'floating-video-player';

interface PersistedState {
  x: number;
  y: number;
  closed: boolean;
}

interface FloatingVideoPlayerProps {
  videoUrl: string | null | undefined;
  timestampSec: number;
  stepTitle: string;
  stepNumber: number;
}

function loadState(): PersistedState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      x: Number.isFinite(parsed.x) ? Number(parsed.x) : defaultState().x,
      y: Number.isFinite(parsed.y) ? Number(parsed.y) : defaultState().y,
      closed: Boolean(parsed.closed),
    };
  } catch {
    return defaultState();
  }
}

function defaultState(): PersistedState {
  if (typeof window === 'undefined') return { x: 100, y: 100, closed: false };
  const w = window.innerWidth;
  const h = window.innerHeight;
  return { x: Math.max(12, w - 400), y: Math.max(12, h - 260), closed: false };
}

function persist(state: PersistedState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function FloatingVideoPlayer({
  videoUrl,
  timestampSec,
  stepTitle,
  stepNumber,
}: FloatingVideoPlayerProps) {
  const [state, setState] = useState<PersistedState>(() => loadState());
  const [dragging, setDragging] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  useEffect(() => {
    persist(state);
  }, [state]);

  useEffect(() => {
    if (!videoUrl || !videoRef.current) return;
    const v = videoRef.current;
    // 切步骤时强制跳到对应时间戳;`fastSeek` 在不支持时回退到 currentTime 赋值。
    const target = Math.max(0, timestampSec);
    const seek = () => {
      try {
        v.currentTime = target;
      } catch {
        /* 元数据未加载,等下次 metadata 事件 */
      }
    };
    if (v.readyState >= 1) seek();
    else v.addEventListener('loadedmetadata', seek, { once: true });
    return () => v.removeEventListener('loadedmetadata', seek);
  }, [timestampSec, videoUrl, stepNumber]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const nextX = e.clientX - dragOffsetRef.current.dx;
      const nextY = e.clientY - dragOffsetRef.current.dy;
      const margin = 8;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const clampedX = Math.min(Math.max(margin, nextX), w - margin - 120);
      const clampedY = Math.min(Math.max(margin, nextY), h - margin - 80);
      setState((prev) => ({ ...prev, x: clampedX, y: clampedY }));
    };
    const onUp = () => setDragging(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  function handleHeaderMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragOffsetRef.current = {
      dx: e.clientX - state.x,
      dy: e.clientY - state.y,
    };
    setDragging(true);
  }

  if (!videoUrl) return null;

  if (state.closed) {
    return (
      <button
        type="button"
        onClick={() => setState((s) => ({ ...s, closed: false }))}
        className="fixed bottom-4 right-4 z-50 matcha-gradient text-white px-4 py-2 rounded-pill text-xs font-bold shadow-card hover:shadow-card-hover"
      >
        ▶ 打开视频回放
      </button>
    );
  }

  return (
    <div
      style={{ left: state.x, top: state.y, width: 360 }}
      className="fixed z-50 bg-surface-lowest border border-border-subtle rounded-card shadow-card-hover overflow-hidden select-none"
    >
      <header
        onMouseDown={handleHeaderMouseDown}
        className="px-3 py-2 bg-surface-bright border-b border-border-subtle flex items-center gap-2 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-3.5 h-3.5 text-mist shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-mist truncate">
            步骤 {stepNumber} · {formatTime(timestampSec)}
          </div>
          <div className="text-body-sm text-on-surface font-bold truncate">{stepTitle}</div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setState((s) => ({ ...s, closed: true }));
          }}
          title="关闭"
          className="p-1 text-mist hover:text-error transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </header>
      <video
        ref={videoRef}
        src={fileUrl(videoUrl)}
        controls
        preload="metadata"
        className="w-full bg-black aspect-video"
      />
    </div>
  );
}
