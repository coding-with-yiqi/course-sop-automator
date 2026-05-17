import { Bot, CalendarDays, CircleAlert, Clock, FileText, MoreVertical, RefreshCw, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import type { DashboardTask } from '@/lib/mocks.ts';

interface TaskCardProps {
  task: DashboardTask;
}

export function TaskCard({ task }: TaskCardProps) {
  return (
    <div className="relative bg-surface-lowest rounded-xl p-5 border border-border-subtle shadow-card hover:shadow-card-hover transition-shadow overflow-hidden group">
      <div className={clsx('absolute left-0 top-0 bottom-0 w-1', accentColor(task))} aria-hidden="true" />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <TaskMeta task={task} />
        {task.status === 'processing' && <ProcessingProgress task={task} />}
        {task.status === 'failed' && <FailedProgress task={task} />}
        <TaskActions task={task} />
      </div>
    </div>
  );
}

function accentColor(task: DashboardTask): string {
  switch (task.status) {
    case 'processing':
      return 'bg-aqua-container';
    case 'completed':
      return 'bg-matcha-container';
    case 'failed':
      return 'bg-error';
  }
}

function TaskMeta({ task }: { task: DashboardTask }) {
  return (
    <div className="flex items-start gap-4 min-w-0">
      <TaskIcon task={task} />
      <div className="min-w-0">
        <h4 className="text-title-sm font-bold text-on-surface truncate">{task.title}</h4>
        <p className="text-body-sm text-mist flex items-center gap-1.5 font-light mt-1">
          {task.status === 'processing' ? (
            <Clock className="w-3.5 h-3.5" />
          ) : (
            <CalendarDays className="w-3.5 h-3.5" />
          )}
          <span>{task.createdAt}</span>
        </p>
      </div>
    </div>
  );
}

function TaskIcon({ task }: { task: DashboardTask }) {
  switch (task.status) {
    case 'processing':
      return (
        <div className="bg-surface rounded-lg p-3 text-matcha mt-1 shrink-0">
          <Bot className="w-5 h-5" />
        </div>
      );
    case 'completed':
      return (
        <div className="bg-surface-bright border border-border-subtle rounded-lg p-3 text-matcha mt-1 shrink-0">
          <FileText className="w-5 h-5" />
        </div>
      );
    case 'failed':
      return (
        <div className="bg-error-container rounded-lg p-3 text-error mt-1 shrink-0">
          <CircleAlert className="w-5 h-5" />
        </div>
      );
  }
}

function ProcessingProgress({
  task,
}: {
  task: Extract<DashboardTask, { status: 'processing' }>;
}) {
  return (
    <div className="flex-1 w-full md:max-w-[300px]">
      <div className="flex justify-between text-xs text-sage mb-1">
        <span>{task.progressLabel}</span>
        <span className="font-display">{task.progress}%</span>
      </div>
      <div className="h-2 w-full bg-surface-variant rounded-full overflow-hidden">
        <div
          className="h-full matcha-gradient rounded-full relative"
          style={{ width: `${task.progress}%` }}
        >
          <div className="absolute inset-0 bg-white/20 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function FailedProgress({
  task,
}: {
  task: Extract<DashboardTask, { status: 'failed' }>;
}) {
  return (
    <div className="flex-1 w-full md:max-w-[300px]">
      <div className="flex justify-between text-xs text-error mb-1 font-bold">
        <span>{task.errorMessage}</span>
      </div>
      <div className="h-2 w-full bg-error-container rounded-full overflow-hidden">
        <div className="h-full bg-error w-full rounded-full" />
      </div>
    </div>
  );
}

function TaskActions({ task }: { task: DashboardTask }) {
  switch (task.status) {
    case 'processing':
      return (
        <div className="flex items-center gap-3">
          <Chip variant="processing">处理中</Chip>
          <IconButton aria-label="删除" tone="danger">
            <Trash2 className="w-4 h-4" />
          </IconButton>
        </div>
      );
    case 'completed':
      return (
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="font-display text-display-num text-forest leading-none">{task.stepCount}</p>
            <p className="text-label-caps font-bold text-mist mt-1.5">生成步骤</p>
          </div>
          <div className="h-10 w-px bg-border-subtle hidden md:block" aria-hidden="true" />
          <Chip variant="completed">已完成</Chip>
          <div className="flex items-center gap-2">
            <Link
              to={`/documents/${task.documentId}/edit`}
              className="text-matcha border border-matcha hover:bg-surface-highest px-4 py-2 rounded-pill text-sm font-bold transition-colors"
            >
              查看
            </Link>
            <IconButton aria-label="更多">
              <MoreVertical className="w-4 h-4" />
            </IconButton>
          </div>
        </div>
      );
    case 'failed':
      return (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-error hover:bg-error-container px-3 py-1 rounded-pill text-xs font-bold transition-colors flex items-center gap-1 border border-error"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 重试
          </button>
          <IconButton aria-label="删除" tone="danger">
            <Trash2 className="w-4 h-4" />
          </IconButton>
        </div>
      );
  }
}

function Chip({ variant, children }: { variant: 'processing' | 'completed'; children: React.ReactNode }) {
  const classes =
    variant === 'processing'
      ? 'bg-chip-processing text-on-secondary-container'
      : 'bg-chip-completed text-matcha';
  return (
    <span className={clsx('px-3 py-1 rounded-pill text-xs font-bold whitespace-nowrap', classes)}>
      {children}
    </span>
  );
}

function IconButton({
  children,
  tone,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'danger' }) {
  const tones =
    tone === 'danger'
      ? 'text-mist hover:text-error hover:bg-error-container'
      : 'text-mist hover:text-on-surface hover:bg-surface';
  return (
    <button
      type="button"
      className={clsx('p-2 rounded-pill transition-colors', tones)}
      {...rest}
    >
      {children}
    </button>
  );
}
