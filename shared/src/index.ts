export const PIPELINE_STAGES = [
  'ingest',
  'chunk',
  'llm',
  'frames',
  'assemble',
] as const;

export type StageKey = (typeof PIPELINE_STAGES)[number];

export type StageStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface StageMeta {
  key: StageKey;
  label: string;
  icon: string;
  description: string;
}

export const PIPELINE_STAGE_META: Record<StageKey, StageMeta> = {
  ingest: {
    key: 'ingest',
    label: '上传与校验',
    icon: 'cloud-upload',
    description: '接收视频与字幕,校验时长',
  },
  chunk: {
    key: 'chunk',
    label: '视频分块与场景识别',
    icon: 'film',
    description: '按字幕语义切分,保证每段 ≤ 25 分钟',
  },
  llm: {
    key: 'llm',
    label: '操作步骤抽取',
    icon: 'sparkles',
    description: 'LLM 提炼操作步骤,去除口语流水',
  },
  frames: {
    key: 'frames',
    label: '关键帧抓取',
    icon: 'image',
    description: 'FFmpeg 按时间戳抓帧并去重',
  },
  assemble: {
    key: 'assemble',
    label: '组装文档',
    icon: 'file-text',
    description: '组装 HTML 文档',
  },
};

export type Granularity = 'coarse' | 'normal' | 'fine';

export const GRANULARITY_OPTIONS: { value: Granularity; label: string; description: string }[] = [
  {
    value: 'coarse',
    label: '粗放概览',
    description: '每段抽 2-6 个高层步骤,只保留核心节点',
  },
  {
    value: 'normal',
    label: '平衡',
    description: '理论每个知识点 1 步、实操每个动作 1 步',
  },
  {
    value: 'fine',
    label: '精细拆解',
    description: '把每个独立指令、子动作都拆成单独一步',
  },
];

export interface StageEvent {
  stage: StageKey;
  status: StageStatus;
  progress?: number;
  message?: string;
}

export interface DoneEvent {
  documentId: string;
}

export interface ErrorEvent {
  stage?: StageKey;
  code: string;
  message: string;
  recoverable?: boolean;
}

export interface Task {
  id: string;
  documentId: string;
  title: string;
  status: TaskStatus;
  currentStage: StageKey | null;
  progress: number;
  errorJson: string | null;
  videoFileName: string;
  subtitleFileName: string | null;
  slidesFileName: string | null;
  videoDurationSec: number | null;
  createdAt: number;
  updatedAt: number;
  stepCount?: number;
}

export interface CreateTaskResponse {
  taskId: string;
  documentId: string;
}

export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export interface HealthResponse {
  ffmpeg: 'ok' | 'missing';
  ffprobe: 'ok' | 'missing';
  llm: 'ok' | 'no_key';
}

export interface SOPSpeaker {
  name: string;
  title: string;
  avatarUrl: string | null;
}

export interface SOPCodeBlock {
  language: string;
  filename?: string | null;
  content: string;
}

export interface SOPScreenshot {
  url: string;
  alt: string;
}

export interface SOPStepAsset {
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  textPreview?: string;
}

export type AccentColor = 'matcha' | 'aqua' | 'lavender' | 'blush';

export interface SOPStep {
  stepNumber: number;
  title: string;
  shortDescription: string;
  instructionRichText: string;
  timestampSec: number;
  screenshot: SOPScreenshot | null;
  codeBlock: SOPCodeBlock | null;
  accentColor: AccentColor;
  status: 'pending' | 'editing' | 'completed';
  assets?: SOPStepAsset[];
}

export interface SOPAiSettings {
  detailLevel: 1 | 2 | 3;
  tone: 'technical' | 'beginner';
}

export interface SOPDocument {
  id: string;
  taskId: string;
  title: string;
  speaker: SOPSpeaker | null;
  summary: string;
  steps: SOPStep[];
  aiSettings: SOPAiSettings;
  lastEditedAt: number;
  createdAt: number;
  videoUrl?: string | null;
}
