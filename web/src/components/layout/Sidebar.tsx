import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CloudUpload, Library, Settings, HelpCircle, LogOut } from 'lucide-react';
import clsx from 'clsx';

const NAV = [
  { to: '/', label: '工作台', icon: LayoutDashboard, end: true, disabled: false },
  { to: '/upload', label: '上传任务', icon: CloudUpload, end: false, disabled: false },
  { to: '/templates', label: '模板库', icon: Library, end: false, disabled: true },
  { to: '/settings', label: '设置', icon: Settings, end: false, disabled: true },
] as const;

export function Sidebar() {
  return (
    <nav className="hidden md:flex flex-col h-full w-sidebar bg-canvas border-r border-border-subtle p-4 gap-4 flex-shrink-0">
      <div className="mb-6 px-2">
        <h1 className="text-[20px] leading-tight font-bold text-forest">教学视频转 SOP</h1>
        <p className="text-[13px] text-mist mt-1">Matcha Automation</p>
      </div>

      <div className="flex flex-col gap-2 flex-grow">
        {NAV.map(({ to, label, icon: Icon, end, disabled }) => {
          if (disabled) {
            return (
              <span
                key={to}
                className="flex items-center gap-3 px-4 py-3 text-mist/60 rounded-xl text-[14px] cursor-not-allowed select-none"
                title="即将上线"
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </span>
            );
          }
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] transition-colors duration-200',
                  isActive
                    ? 'bg-matcha-container/40 text-matcha font-bold'
                    : 'text-sage hover:text-matcha hover:bg-matcha-container/20',
                )
              }
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </NavLink>
          );
        })}
      </div>

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
    </nav>
  );
}
