import type {
  ApiEnvelope,
  CreateTaskResponse,
  Task,
  HealthResponse,
  SOPDocument,
  SOPStep,
  SOPSpeaker,
  SOPAiSettings,
} from '@sop/shared';

class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
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

export interface DocumentPatch {
  title?: string;
  speaker?: SOPSpeaker | null;
  aiSettings?: SOPAiSettings;
  steps?: Array<Partial<SOPStep> & { stepNumber: number }>;
}

export const api = {
  async health(): Promise<HealthResponse> {
    return unwrap<HealthResponse>(await fetch('/api/health'));
  },

  async listTasks(): Promise<Task[]> {
    const data = await unwrap<{ tasks: Task[] }>(await fetch('/api/tasks'));
    return data.tasks;
  },

  async getTask(id: string): Promise<Task> {
    const data = await unwrap<{ task: Task }>(await fetch(`/api/tasks/${id}`));
    return data.task;
  },

  async createTask(input: {
    title: string;
    video: File;
    subtitle?: File | null;
  }): Promise<CreateTaskResponse> {
    const fd = new FormData();
    fd.append('title', input.title);
    fd.append('video', input.video);
    if (input.subtitle) fd.append('subtitle', input.subtitle);
    return unwrap<CreateTaskResponse>(
      await fetch('/api/tasks', { method: 'POST', body: fd }),
    );
  },

  async getDocument(id: string): Promise<SOPDocument> {
    const data = await unwrap<{ document: SOPDocument }>(
      await fetch(`/api/documents/${id}`),
    );
    return data.document;
  },

  async patchDocument(id: string, patch: DocumentPatch): Promise<SOPDocument> {
    const data = await unwrap<{ document: SOPDocument }>(
      await fetch(`/api/documents/${id}`, {
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
      await fetch(`/api/documents/${docId}/steps/${stepNumber}/regenerate`, {
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
      await fetch(`/api/documents/${docId}/steps/${stepNumber}/screenshot/rescan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windowSec }),
      }),
    );
    return data.candidates;
  },

  async uploadScreenshot(
    docId: string,
    stepNumber: number,
    file: File,
  ): Promise<string> {
    const fd = new FormData();
    fd.append('image', file);
    const data = await unwrap<{ url: string }>(
      await fetch(`/api/documents/${docId}/steps/${stepNumber}/screenshot/upload`, {
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
      await fetch(`/api/documents/${docId}/steps/${stepNumber}/screenshot/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    return data.step;
  },

  async exportHtml(docId: string): Promise<{ downloadUrl: string; fileName: string }> {
    return unwrap<{ downloadUrl: string; fileName: string }>(
      await fetch(`/api/documents/${docId}/export/html`, {
        method: 'POST',
      }),
    );
  },
};

export { ApiError };
