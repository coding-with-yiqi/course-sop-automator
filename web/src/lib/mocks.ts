export type DashboardTask =
  | {
      id: string;
      documentId: string;
      title: string;
      createdAt: string;
      status: 'processing';
      progress: number;
      progressLabel: string;
    }
  | {
      id: string;
      documentId: string;
      title: string;
      createdAt: string;
      status: 'completed';
      stepCount: number;
    }
  | {
      id: string;
      documentId: string;
      title: string;
      createdAt: string;
      status: 'failed';
      errorMessage: string;
    };

export interface DashboardStats {
  processing: number;
  completed: number;
  pendingExport: number;
}

export const MOCK_STATS: DashboardStats = {
  processing: 3,
  completed: 12,
  pendingExport: 5,
};

export const MOCK_TASKS: DashboardTask[] = [
  {
    id: 'task_1',
    documentId: 'doc_1',
    title: 'Python 基础数据分析实战课',
    createdAt: '创建于 10 分钟前',
    status: 'processing',
    progress: 70,
    progressLabel: 'AI 解析中...',
  },
  {
    id: 'task_2',
    documentId: 'doc_2',
    title: 'UX Design 核心原则指南',
    createdAt: '创建于 2024-05-20',
    status: 'completed',
    stepCount: 24,
  },
  {
    id: 'task_3',
    documentId: 'doc_3',
    title: '高级商业摄影教程素材',
    createdAt: '创建于 2024-05-19',
    status: 'failed',
    errorMessage: '解析失败: 文件格式不支持',
  },
];
