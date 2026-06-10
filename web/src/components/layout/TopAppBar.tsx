import { Link, useLocation } from 'react-router-dom';
import { Bell, CircleUserRound, Plus } from 'lucide-react';
import clsx from 'clsx';

const TABS = [
  { key: 'dashboard', label: '工作台' },
  // { key: 'status', label: '自动化状态' },   // hidden for shipping
  // { key: 'history', label: '历史记录' },    // hidden for shipping
] as const;

type ActiveTab = (typeof TABS)[number]['key'];

interface TopAppBarProps {
  activeTab?: ActiveTab;
  showNewTask?: boolean;
}

export function TopAppBar({ activeTab = 'dashboard', showNewTask = true }: TopAppBarProps) {
  const location = useLocation();
  // Tabs are decorative for MVP — no real sub-routes yet.
  void location;
  return (
    <header className="sticky top-0 z-40 hidden md:block glass-panel border-b border-border-subtle">
      <div className="max-w-canvas mx-auto h-16 px-8 flex justify-between items-center">
        <nav className="flex gap-6 items-center">
          {TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <span
                key={tab.key}
                className={clsx(
                  'py-4 text-sm transition-colors',
                  isActive
                    ? 'text-matcha font-bold border-b-2 border-matcha'
                    : 'text-mist hover:text-matcha cursor-default',
                )}
              >
                {tab.label}
              </span>
            );
          })}
        </nav>
        <div className="flex items-center gap-4">
          {showNewTask && (
            <Link
              to="/upload"
              className="matcha-gradient text-white px-4 py-2 rounded-pill font-bold text-sm shadow-card hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              新建任务
            </Link>
          )}
          <div className="flex gap-3 text-mist">
            <button type="button" className="hover:text-matcha transition-colors" aria-label="通知">
              <Bell className="w-5 h-5" />
            </button>
            <button type="button" className="hover:text-matcha transition-colors" aria-label="账户">
              <CircleUserRound className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
