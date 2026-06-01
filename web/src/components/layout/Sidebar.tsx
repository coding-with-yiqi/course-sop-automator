import { NavLink } from 'react-router-dom';
import {
  CloudUpload,
  HelpCircle,
  LayoutDashboard,
  Library,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from 'lucide-react';
import clsx from 'clsx';

const NAV = [
  { to: '/', label: '工作台', icon: LayoutDashboard, end: true, disabled: false },
  { to: '/upload', label: '上传任务', icon: CloudUpload, end: false, disabled: false },
  { to: '/templates', label: '模板库', icon: Library, end: false, disabled: true },
  { to: '/settings', label: '设置', icon: Settings, end: false, disabled: false },
] as const;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <nav
      className={clsx(
        'hidden md:flex flex-col h-full bg-canvas border-r border-border-subtle gap-4 flex-shrink-0 transition-[width] duration-200',
        collapsed ? 'w-sidebar-collapsed items-center px-2 py-4' : 'w-sidebar p-4',
      )}
    >
      <div
        className={clsx(
          'mb-6 flex items-center',
          collapsed ? 'flex-col gap-3 w-full' : 'justify-between gap-2 px-2',
        )}
      >
        {!collapsed && (
          <h1 className="text-[18px] leading-tight font-bold text-forest">教学视频转学习文档</h1>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          className="p-2 text-mist hover:text-matcha hover:bg-matcha-container/20 rounded-lg transition-colors shrink-0"
        >
          {collapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
      </div>

      <div className={clsx('flex flex-col gap-2 flex-grow', collapsed && 'w-full')}>
        {NAV.map(({ to, label, icon: Icon, end, disabled }) => {
          if (disabled) {
            return (
              <span
                key={to}
                className={clsx(
                  'flex items-center gap-3 py-3 text-mist/60 rounded-xl text-[14px] cursor-not-allowed select-none',
                  collapsed ? 'justify-center px-2' : 'px-4',
                )}
                title={collapsed ? `${label}(即将上线)` : '即将上线'}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </span>
            );
          }
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 py-3 rounded-xl text-[14px] transition-colors duration-200',
                  collapsed ? 'justify-center px-2' : 'px-4',
                  isActive
                    ? 'bg-matcha-container/40 text-matcha font-bold'
                    : 'text-sage hover:text-matcha hover:bg-matcha-container/20',
                )
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          );
        })}
      </div>

      {collapsed ? (
        <div className="mt-auto flex flex-col gap-2 items-center w-full">
          <a
            title="帮助中心"
            aria-label="帮助中心"
            className="p-2 text-mist hover:text-matcha hover:bg-matcha-container/20 rounded-lg transition-colors"
            href="#"
          >
            <HelpCircle className="w-5 h-5" />
          </a>
          <a
            title="退出"
            aria-label="退出"
            className="p-2 text-mist hover:text-matcha hover:bg-matcha-container/20 rounded-lg transition-colors"
            href="#"
          >
            <LogOut className="w-5 h-5" />
          </a>
        </div>
      ) : (
        <div className="mt-auto flex flex-col gap-4">
          <div className="bg-matcha-container/15 rounded-xl p-4 border border-border-subtle">
            <p className="text-[13px] text-sage mb-3 leading-relaxed">本地运行,数据不出本机。</p>
            <button
              type="button"
              className="w-full py-2 px-4 rounded-pill text-sm font-bold text-forest border border-matcha hover:bg-matcha-container/30 transition-colors"
            >
              查看版本信息
            </button>
          </div>
          <div className="border-t border-border-subtle pt-4 flex flex-col gap-1">
            <a className="flex items-center gap-3 px-4 py-2 text-mist hover:text-matcha transition-colors text-sm" href="#">
              <HelpCircle className="w-4 h-4" />
              <span>帮助中心</span>
            </a>
            <a className="flex items-center gap-3 px-4 py-2 text-mist hover:text-matcha transition-colors text-sm" href="#">
              <LogOut className="w-4 h-4" />
              <span>退出</span>
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
