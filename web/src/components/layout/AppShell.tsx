import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.tsx';
import { TopStripe } from './TopStripe.tsx';
import { TopAppBar } from './TopAppBar.tsx';

const SIDEBAR_KEY = 'sidebar-collapsed';

export function AppShell() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
    } catch {
      // ignore storage errors (private mode, etc.)
    }
  }, [collapsed]);

  return (
    <div className="flex h-full bg-canvas">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopStripe />
        <main className="flex-1 overflow-auto">
          <TopAppBar />
          <div className="max-w-page mx-auto px-6 lg:px-10 py-10">
            <Outlet />
          </div>
        </main>
        <TopStripe />
      </div>
    </div>
  );
}
