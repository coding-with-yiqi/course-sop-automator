import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.tsx';
import { TopStripe } from './TopStripe.tsx';
import { TopAppBar } from './TopAppBar.tsx';

export function AppShell() {
  return (
    <div className="flex h-full bg-canvas">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopStripe />
        <main className="flex-1 overflow-auto">
          <TopAppBar />
          <div className="max-w-page mx-auto px-8 py-10">
            <Outlet />
          </div>
        </main>
        <TopStripe />
      </div>
    </div>
  );
}
