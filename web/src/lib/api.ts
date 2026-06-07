import type {
  ApiEnvelope,
  CreateTaskResponse,
  Granularity,
  Task,
  HealthResponse,
  SOPDocument,
  SOPStep,
  SOPStepAsset,
  SOPSpeaker,
  SOPAiSettings,
} from '@sop/shared';

class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * In Electron production builds the frontend is served from a custom app://
 * protocol (or file:// in older builds) and there is no Vite dev-server proxy.
 * We detect that case and prepend the local server origin (the main process
 * starts the server on a known port).
 */
const API_BASE =
  typeof window !== 'undefined' && /^(file|app):$/.test(window.location.protocol)
    ? 'http://127.0.0.1:4000'
    : '';

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * Resolve a server-relative file URL (e.g. "/files/uploads/...") to an
 * absolute URL. Under file:// (Electron) a bare "/files/..." would resolve
 * against the filesystem root and fail, so we prepend the server origin.
 * Pass-through for already-absolute (http/blob/data) URLs.
 */
export function fileUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (/^(https?:|blob:|data:)/.test(url)) return url;
  return `${API_BASE}${url}`;
}

async function unwrap<T>(res: Response): Promise<T> {
  const json = (await res.json()) as ApiEnvelope<T>;
  if (!json.ok) throw new ApiError(json.error.code, json.error.message);
  return json.data;
}

export interface ScreenshotCandidate {
  url: string;
  timestamp: number;
}

export interface CandidateAnalysis {
  timestamp: number;
  summary: string;
  score: number;
  tags: string[];
}

export interface DocumentPatch {
  title?: string;
  speaker?: SOPSpeaker | null;
  aiSettings?: SOPAiSettings;
  summary?: string;
  steps?: Array<Partial<SOPStep> & { stepNumber: number }>;
}

export const api = {
  async health(): Promise<HealthResponse> {
    return unwrap<HealthResponse>(await fetch(apiUrl('/api/health')));
  },

  async listTasks(): Promise<Task[]> {
    const data = await unwrap<{ tasks: Task[] }>(await fetch(apiUrl('/api/tasks')));
    return data.tasks;
  },

  async getTask(id: string): Promise<Task> {
    const data = await unwrap<{ task: Task }>(await fetch(apiUrl(`/api/tasks/${id}`)));
    return data.task;
  },

  async createTask(input: {
    title: string;
    video: File;
    subtitle?: File | null;
    slides?: File | null;
    granularity?: Granularity;
  }): Promise<CreateTaskResponse> {
    const fd = new FormData();
    fd.append('title', input.title);
    if (input.granularity) fd.append('granularity', input.granularity);
    fd.append('video', input.video);
    if (input.subtitle) fd.append('subtitle', input.subtitle);
    if (input.slides) fd.append('slides', input.slides);
    return unwrap<CreateTaskResponse>(
      await fetch(apiUrl('/api/tasks'), { method: 'POST', body: fd }),
    );
  },

  async retryTask(id: string): Promise<CreateTaskResponse> {
    return unwrap<CreateTaskResponse>(
      await fetch(apiUrl(`/api/tasks/${id}/retry`), { method: 'POST' }),
    );
  },

  async deleteTask(id: string): Promise<void> {
    await unwrap<{ taskId: string }>(
      await fetch(apiUrl(`/api/tasks/${id}`), { method: 'DELETE' }),
    );
  },

  async getDocument(id: string): Promise<SOPDocument> {
    const data = await unwrap<{ document: SOPDocument }>(
      await fetch(apiUrl(`/api/documents/${id}`)),
    );
    return data.document;
  },

  async patchDocument(id: string, patch: DocumentPatch): Promise<SOPDocument> {
    const data = await unwrap<{ document: SOPDocument }>(
      await fetch(apiUrl(`/api/documents/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    );
    return data.document;
  },

  async regenerateStep(
    docId: string,
    stepNumber: number,
    body: { detailLevel?: 1 | 2 | 3; tone?: 'technical' | 'beginner'; userHint?: string },
  ): Promise<SOPStep> {
    const data = await unwrap<{ step: SOPStep }>(
      await fetch(apiUrl(`/api/documents/${docId}/steps/${stepNumber}/regenerate`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    return data.step;
  },

  async rescanScreenshot(
    docId: string,
    stepNumber: number,
    windowSec = 5,
  ): Promise<ScreenshotCandidate[]> {
    const data = await unwrap<{ candidates: ScreenshotCandidate[] }>(
      await fetch(apiUrl(`/api/documents/${docId}/steps/${stepNumber}/screenshot/rescan`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windowSec }),
      }),
    );
    return data.candidates;
  },

  async autoCapture(
    docId: string,
    stepNumber: number,
    windowSec = 5,
  ): Promise<SOPStep> {
    const data = await unwrap<{ step: SOPStep }>(
      await fetch(apiUrl(`/api/documents/${docId}/steps/${stepNumber}/screenshot/auto-capture`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windowSec }),
      }),
    );
    return data.step;
  },

  async analyzeCandidates(
    docId: string,
    stepNumber: number,
    candidates: ScreenshotCandidate[],
  ): Promise<CandidateAnalysis[]> {
    const data = await unwrap<{ analyses: CandidateAnalysis[] }>(
      await fetch(apiUrl(`/api/documents/${docId}/steps/${stepNumber}/screenshot/analyze`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates }),
      }),
    );
    return data.analyses;
  },

  async uploadScreenshot(
    docId: string,
    stepNumber: number,
    file: File,
  ): Promise<string> {
    const fd = new FormData();
    fd.append('image', file);
    const data = await unwrap<{ url: string }>(
      await fetch(apiUrl(`/api/documents/${docId}/steps/${stepNumber}/screenshot/upload`), {
        method: 'POST',
        body: fd,
      }),
    );
    return data.url;
  },

  async selectScreenshot(
    docId: string,
    stepNumber: number,
    body: { url: string; crop?: { x: number; y: number; w: number; h: number } },
  ): Promise<SOPStep> {
    const data = await unwrap<{ step: SOPStep }>(
      await fetch(apiUrl(`/api/documents/${docId}/steps/${stepNumber}/screenshot/select`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    return data.step;
  },

  async deleteScreenshot(docId: string, stepNumber: number, idx: number): Promise<SOPStep> {
    const data = await unwrap<{ step: SOPStep }>(
      await fetch(apiUrl(`/api/documents/${docId}/steps/${stepNumber}/screenshots/${idx}`), {
        method: 'DELETE',
      }),
    );
    return data.step;
  },

  async reorderScreenshots(docId: string, stepNumber: number, order: number[]): Promise<SOPStep> {
    const data = await unwrap<{ step: SOPStep }>(
      await fetch(apiUrl(`/api/documents/${docId}/steps/${stepNumber}/screenshots/reorder`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      }),
    );
    return data.step;
  },

  async exportHtml(docId: string): Promise<{ downloadUrl: string; fileName: string }> {
    return unwrap<{ downloadUrl: string; fileName: string }>(
      await fetch(apiUrl(`/api/documents/${docId}/export/html`), {
        method: 'POST',
      }),
    );
  },

  async insertStep(
    docId: string,
    body: { afterStepNumber: number; title?: string; timestampSec?: number },
  ): Promise<{ document: SOPDocument; insertedStepNumber: number }> {
    return unwrap<{ document: SOPDocument; insertedStepNumber: number }>(
      await fetch(apiUrl(`/api/documents/${docId}/steps/insert`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  },

  async deleteStep(docId: string, stepNumber: number): Promise<SOPDocument> {
    const data = await unwrap<{ document: SOPDocument }>(
      await fetch(apiUrl(`/api/documents/${docId}/steps/${stepNumber}`), { method: 'DELETE' }),
    );
    return data.document;
  },

  async uploadStepAsset(
    docId: string,
    stepNumber: number,
    file: File,
  ): Promise<{ step: SOPStep; asset: SOPStepAsset }> {
    const fd = new FormData();
    fd.append('file', file);
    return unwrap<{ step: SOPStep; asset: SOPStepAsset }>(
      await fetch(apiUrl(`/api/documents/${docId}/steps/${stepNumber}/assets`), {
        method: 'POST',
        body: fd,
      }),
    );
  },

  async deleteStepAsset(docId: string, stepNumber: number, assetName: string): Promise<SOPStep> {
    const data = await unwrap<{ step: SOPStep }>(
      await fetch(
        apiUrl(`/api/documents/${docId}/steps/${stepNumber}/assets/${encodeURIComponent(assetName)}`),
        { method: 'DELETE' },
      ),
    );
    return data.step;
  },

  async regenerateSummary(docId: string): Promise<string> {
    const data = await unwrap<{ summary: string }>(
      await fetch(apiUrl(`/api/documents/${docId}/summary/regenerate`), { method: 'POST' }),
    );
    return data.summary;
  },

  // Settings
  async getSettings(): Promise<Record<string, string>> {
    const data = await unwrap<Record<string, string>>(await fetch(apiUrl('/api/settings')));
    return data;
  },

  async updateSettings(settings: Record<string, string>): Promise<void> {
    await fetch(apiUrl('/api/settings'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  },

  // Sync
  async syncToNotion(
    docId: string,
    config: { token: string; parentPageId: string },
  ): Promise<{ url: string }> {
    return unwrap<{ url: string }>(
      await fetch(apiUrl(`/api/documents/${docId}/sync/notion`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      }),
    );
  },

  async syncToYuque(
    docId: string,
    config: { token: string; namespace: string },
  ): Promise<{ url: string }> {
    return unwrap<{ url: string }>(
      await fetch(apiUrl(`/api/documents/${docId}/sync/yuque`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      }),
    );
  },
};

export { ApiError };
