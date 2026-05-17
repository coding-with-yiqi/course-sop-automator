import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell.tsx';
import { Dashboard } from '@/pages/Dashboard.tsx';
import { Upload } from '@/pages/Upload.tsx';
import { EditDocument } from '@/pages/EditDocument.tsx';
import { ReportDocument } from '@/pages/ReportDocument.tsx';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/documents/:id/edit" element={<EditDocument />} />
        <Route path="/documents/:id" element={<ReportDocument />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
