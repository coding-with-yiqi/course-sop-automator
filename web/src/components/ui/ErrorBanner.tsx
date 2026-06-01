import { AlertCircle } from 'lucide-react';
import clsx from 'clsx';

interface ErrorBannerProps {
  message: string;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * 统一错误提示横幅
 *
 * 用法:
 *   <ErrorBanner message={error} />
 *   <ErrorBanner message={error} size="sm" />
 */
export function ErrorBanner({ message, className, size = 'md' }: ErrorBannerProps) {
  return (
    <div
      className={clsx(
        'bg-error-container/40 border border-error/30 rounded-card text-on-error-container flex items-center gap-2',
        size === 'sm' ? 'px-3 py-2 text-sm' : 'px-4 py-3 text-sm',
        className,
      )}
    >
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
