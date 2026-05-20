import { create } from 'zustand';
import type { SOPDocument, SOPStep, SOPSpeaker, SOPAiSettings } from '@sop/shared';
import { api, ApiError } from '@/lib/api.ts';

const SAVE_DEBOUNCE_MS = 1500;

interface EditState {
  document: SOPDocument | null;
  dirtyStepNumbers: Set<number>;
  metaDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isRegeneratingSummary: boolean;
  loadError: string | null;
  saveError: string | null;
  lastSavedAt: number | null;
  selectedStepNumber: number | null;

  load(documentId: string): Promise<void>;
  selectStep(stepNumber: number): void;
  patchStep(stepNumber: number, patch: Partial<SOPStep>): void;
  replaceStep(stepNumber: number, newStep: SOPStep): void;
  setMeta(patch: { title?: string; speaker?: SOPSpeaker | null; aiSettings?: SOPAiSettings }): void;
  setSummary(text: string): void;
  insertStepAfter(afterStepNumber: number): Promise<void>;
  deleteStep(stepNumber: number): Promise<void>;
  addAsset(stepNumber: number, file: File): Promise<void>;
  removeAsset(stepNumber: number, name: string): Promise<void>;
  regenerateSummary(): Promise<void>;
  scheduleSave(): void;
  saveNow(): Promise<void>;
  reset(): void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function cancelTimer(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

export const useEditStore = create<EditState>((set, get) => ({
  document: null,
  dirtyStepNumbers: new Set(),
  metaDirty: false,
  isLoading: false,
  isSaving: false,
  isRegeneratingSummary: false,
  loadError: null,
  saveError: null,
  lastSavedAt: null,
  selectedStepNumber: null,

  async load(documentId) {
    cancelTimer();
    set({ isLoading: true, loadError: null });
    try {
      const document = await api.getDocument(documentId);
      set({
        document,
        dirtyStepNumbers: new Set(),
        metaDirty: false,
        isLoading: false,
        loadError: null,
        saveError: null,
        lastSavedAt: document.lastEditedAt,
        selectedStepNumber: document.steps[0]?.stepNumber ?? null,
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '加载失败';
      set({ isLoading: false, loadError: msg });
    }
  },

  selectStep(stepNumber) {
    set({ selectedStepNumber: stepNumber });
  },

  patchStep(stepNumber, patch) {
    const doc = get().document;
    if (!doc) return;
    const nextSteps = doc.steps.map((s) =>
      s.stepNumber === stepNumber ? { ...s, ...patch } : s,
    );
    const nextDirty = new Set(get().dirtyStepNumbers);
    nextDirty.add(stepNumber);
    set({
      document: { ...doc, steps: nextSteps },
      dirtyStepNumbers: nextDirty,
    });
    get().scheduleSave();
  },

  replaceStep(stepNumber, newStep) {
    const doc = get().document;
    if (!doc) return;
    const nextSteps = doc.steps.map((s) => (s.stepNumber === stepNumber ? newStep : s));
    set({
      document: { ...doc, steps: nextSteps, lastEditedAt: Date.now() },
      lastSavedAt: Date.now(),
    });
  },

  setMeta(patch) {
    const doc = get().document;
    if (!doc) return;
    set({
      document: {
        ...doc,
        title: patch.title ?? doc.title,
        speaker: patch.speaker !== undefined ? patch.speaker : doc.speaker,
        aiSettings: patch.aiSettings ?? doc.aiSettings,
      },
      metaDirty: true,
    });
    get().scheduleSave();
  },

  setSummary(text) {
    const doc = get().document;
    if (!doc) return;
    set({
      document: { ...doc, summary: text },
      metaDirty: true,
    });
    get().scheduleSave();
  },

  async insertStepAfter(afterStepNumber) {
    const doc = get().document;
    if (!doc) return;
    // 落盘前先把当前编辑中的脏数据 flush,避免插入端点返回的快照覆盖未保存的编辑
    await get().saveNow();
    try {
      const { document: updated, insertedStepNumber } = await api.insertStep(doc.id, {
        afterStepNumber,
      });
      set({
        document: updated,
        dirtyStepNumbers: new Set(),
        metaDirty: false,
        lastSavedAt: updated.lastEditedAt,
        selectedStepNumber: insertedStepNumber,
        saveError: null,
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '插入步骤失败';
      set({ saveError: msg });
    }
  },

  async deleteStep(stepNumber) {
    const doc = get().document;
    if (!doc) return;
    await get().saveNow();
    try {
      const updated = await api.deleteStep(doc.id, stepNumber);
      const remaining = updated.steps;
      const fallback = remaining[0]?.stepNumber ?? null;
      set({
        document: updated,
        dirtyStepNumbers: new Set(),
        metaDirty: false,
        lastSavedAt: updated.lastEditedAt,
        selectedStepNumber:
          get().selectedStepNumber === stepNumber || get().selectedStepNumber === null
            ? fallback
            : get().selectedStepNumber,
        saveError: null,
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '删除步骤失败';
      set({ saveError: msg });
    }
  },

  async addAsset(stepNumber, file) {
    const doc = get().document;
    if (!doc) return;
    try {
      const { step } = await api.uploadStepAsset(doc.id, stepNumber, file);
      get().replaceStep(stepNumber, step);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '素材上传失败';
      set({ saveError: msg });
    }
  },

  async removeAsset(stepNumber, name) {
    const doc = get().document;
    if (!doc) return;
    try {
      const step = await api.deleteStepAsset(doc.id, stepNumber, name);
      get().replaceStep(stepNumber, step);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '素材删除失败';
      set({ saveError: msg });
    }
  },

  async regenerateSummary() {
    const doc = get().document;
    if (!doc) return;
    set({ isRegeneratingSummary: true, saveError: null });
    try {
      const summary = await api.regenerateSummary(doc.id);
      const current = get().document;
      if (!current) return;
      set({
        document: { ...current, summary, lastEditedAt: Date.now() },
        lastSavedAt: Date.now(),
        isRegeneratingSummary: false,
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '总结生成失败';
      set({ saveError: msg, isRegeneratingSummary: false });
    }
  },

  scheduleSave() {
    cancelTimer();
    saveTimer = setTimeout(() => {
      void get().saveNow();
    }, SAVE_DEBOUNCE_MS);
  },

  async saveNow() {
    cancelTimer();
    const { document, dirtyStepNumbers, metaDirty } = get();
    if (!document) return;
    if (dirtyStepNumbers.size === 0 && !metaDirty) return;

    const patch: Parameters<typeof api.patchDocument>[1] = {};
    if (metaDirty) {
      patch.title = document.title;
      patch.speaker = document.speaker;
      patch.aiSettings = document.aiSettings;
      patch.summary = document.summary;
    }
    if (dirtyStepNumbers.size > 0) {
      patch.steps = document.steps
        .filter((s) => dirtyStepNumbers.has(s.stepNumber))
        .map((s) => ({
          stepNumber: s.stepNumber,
          title: s.title,
          shortDescription: s.shortDescription,
          instructionRichText: s.instructionRichText,
          codeBlock: s.codeBlock,
          screenshot: s.screenshot,
          accentColor: s.accentColor,
          timestampSec: s.timestampSec,
        }));
    }

    set({ isSaving: true, saveError: null });
    try {
      const updated = await api.patchDocument(document.id, patch);
      set({
        document: updated,
        dirtyStepNumbers: new Set(),
        metaDirty: false,
        isSaving: false,
        lastSavedAt: updated.lastEditedAt,
      });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '保存失败';
      set({ isSaving: false, saveError: msg });
    }
  },

  reset() {
    cancelTimer();
    set({
      document: null,
      dirtyStepNumbers: new Set(),
      metaDirty: false,
      isLoading: false,
      isSaving: false,
      isRegeneratingSummary: false,
      loadError: null,
      saveError: null,
      lastSavedAt: null,
      selectedStepNumber: null,
    });
  },
}));
