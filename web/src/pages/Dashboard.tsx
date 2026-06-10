import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CloudUpload, Download, RotateCw, Sparkles, Wand2 } from 'lucide-react';
import type { Task } from '@sop/shared';
import { StatsCard } from '@/components/dashboard/StatsCard.tsx';
import { TaskCard } from '@/components/dashboard/TaskCard.tsx';
import { api, ApiError } from '@/lib/api.ts';
import { ErrorBanner } from '@/components/ui/ErrorBanner.tsx';
import type { DashboardTask } from '@/lib/mocks.ts';

const STAGE_LABELS: Record<string, string> = {
  ingest: '校验输入',
  chunk: '语义切片',
  llm: 'AI 抽取步骤',
  frames: '抓取关键帧',
  assemble: '组装文档',
};

function relativeTime(ts: number): string {
  const delta = Math.round((Date.now() - ts) / 1000);
  if (delta < 60) return `创建于 ${delta} 秒前`;
  if (delta < 3600) return `创建于 ${Math.round(delta / 60)} 分钟前`;
  if (delta < 86400) return `创建于 ${Math.round(delta / 3600)} 小时前`;
  return `创建于 ${new Date(ts).toLocaleDateString('zh-CN')}`;
}

function toDashboardTask(task: Task): DashboardTask {
  const base = {
    id: task.id,
    documentId: task.documentId,
    title: task.title,
    createdAt: relativeTime(task.createdAt),
  };
  if (task.status === 'failed') {
    let message = '解析失败';
    try {
      if (task.errorJson) {
        const parsed = JSON.parse(task.errorJson) as { message?: string };
        if (parsed.message) message = parsed.message;
      }
    } catch {
      // ignore
    }
    return { ...base, status: 'failed', errorMessage: message };
  }
  if (task.status === 'succeeded') {
    return { ...base, status: 'completed', stepCount: task.stepCount ?? 0 };
  }
  // queued or running → processing
  const label = task.currentStage ? STAGE_LABELS[task.currentStage] ?? task.currentStage : '排队中';
  return {
    ...base,
    status: 'processing',
    progress: Math.round((task.progress ?? 0) * 100),
    progressLabel: `${label}...`,
  };
}

interface Stats {
  processing: number;
  completed: number;
  pendingExport: number;
}

function computeStats(tasks: Task[]): Stats {
  let processing = 0;
  let completed = 0;
  for (const t of tasks) {
    if (t.status === 'running' || t.status === 'queued') processing += 1;
    else if (t.status === 'succeeded') completed += 1;
  }
  return { processing, completed, pendingExport: completed };
}

export function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const list = await api.listTasks();
        if (!cancelled) setTasks(list);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof ApiError ? err.message : '加载任务失败';
          setError(msg);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    // Re-poll every 5s while there are running tasks (cheap and predictable).
    const interval = setInterval(() => {
      void load();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const markBusy = (id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleRetry = async (id: string) => {
    markBusy(id, true);
    setError(null);
    // Optimistic flip first so the user sees the failed banner disappear instantly.
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: 'queued', currentStage: null, progress: 0, errorJson: null }
          : t,
      ),
    );
    try {
      await api.retryTask(id);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '重试失败';
      setError(msg);
    } finally {
      markBusy(id, false);
    }
  };

  const handleDelete = async (id: string) => {
    markBusy(id, true);
    setError(null);
    try {
      await api.deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '删除失败';
      setError(msg);
    } finally {
      markBusy(id, false);
    }
  };

  const stats = computeStats(tasks);
  const dashboardTasks = tasks.map(toDashboardTask);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-headline-lg font-bold text-forest mb-2">工作台</h2>
          <p className="text-body-md font-light text-sage">管理你的教学文档任务和处理进度。</p>
        </div>
        <Link
          to="/upload"
          className="matcha-gradient text-white px-6 py-3 rounded-pill font-bold text-base shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5 inline-flex items-center gap-2 self-start md:self-auto"
        >
          <Sparkles className="w-5 h-5" />
          新建任务
        </Link>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard
          icon={RotateCw}
          label="处理中"
          value={stats.processing}
          description="任务正在由 AI 解析"
        />
        <StatsCard
          icon={CheckCircle2}
          label="已完成"
          value={stats.completed}
          description="本周成功生成的文档"
          accentTop
        />
        <StatsCard
          icon={Download}
          label="待导出"
          value={stats.pendingExport}
          description="文档已准备好下载"
        />
      </section>

      <section>
        <h3 className="text-title-sm font-bold text-forest mb-4">最近任务</h3>

        {error && <ErrorBanner message={error} className="mb-4" />}

        {isLoading && tasks.length === 0 ? (
          <LoadingSkeleton />
        ) : tasks.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-4">
            {dashboardTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                busy={busyIds.has(task.id)}
                onRetry={handleRetry}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-surface-lowest rounded-card border border-border-subtle p-5 h-20 animate-pulse"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col gap-8">
      {/* Hero CTA */}
      <div className="bg-surface-lowest border border-dashed border-border-subtle rounded-card p-12 flex flex-col items-center text-center gap-4">
        <div className="w-20 h-20 rounded-full bg-matcha-container/30 flex items-center justify-center">
          <Sparkles className="w-9 h-9 text-matcha" />
        </div>
        <h4 className="text-headline-sm font-bold text-forest">开始创建教学文档</h4>
        <p className="text-body-md text-mist font-light max-w-lg">
          上传课程视频,AI 会自动切片、抽取步骤、抓取关键帧,生成图文教学文档。支持 .srt / .vtt / .txt 字幕,无字幕时可自动转录。
        </p>
        <Link
          to="/upload"
          className="mt-2 inline-flex items-center gap-2 px-6 py-3 matcha-gradient text-white rounded-pill font-bold text-base shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5"
        >
          <CloudUpload className="w-5 h-5" />
          上传第一个视频
        </Link>
      </div>

      {/* 3-step guide */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StepCard
          step={1}
          icon={CloudUpload}
          title="上传素材"
          description="选择视频 + 字幕文件(.srt/.vtt/.txt),可选上传 PPT 原稿辅助 AI 识别"
        />
        <StepCard
          step={2}
          icon={Wand2}
          title="AI 自动处理"
          description="语义切片、步骤抽取、关键帧抓取、代码块识别 — 全自动流水线"
        />
        <StepCard
          step={3}
          icon={CheckCircle2}
          title="编辑导出"
          description="微调步骤内容、管理截图、一键导出 HTML 或同步到 Notion/语雀"
        />
      </div>
    </div>
  );
}

function StepCard({
  step,
  icon: Icon,
  title,
  description,
}: {
  step: number;
  icon: typeof CloudUpload;
  title: string;
  description: string;
}) {
  return (
    <div className="glass-panel rounded-card border border-border-subtle p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="w-7 h-7 rounded-full bg-matcha-container/40 text-matcha text-xs font-bold flex items-center justify-center">
          {step}
        </span>
        <Icon className="w-5 h-5 text-matcha" />
      </div>
      <h5 className="text-body-md font-bold text-forest">{title}</h5>
      <p className="text-body-sm text-mist font-light leading-relaxed">{description}</p>
    </div>
  );
}
