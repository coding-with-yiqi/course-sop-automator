# Matcha SOP · 教学视频自动转图文 SOP

本地运行的图文 SOP 自动化流水线。接收**课程视频 + 字幕**,通过 LLM(Kimi-k2.6)智能切片、抽取步骤、FFmpeg 抓帧 + dHash 去重,产出**结构化 HTML 操作说明书**。

## 快速开始

### 前置依赖

- **Node.js ≥ 20**(better-sqlite3 需要)
- **FFmpeg + ffprobe**(必须在 PATH 上)
  - macOS:`brew install ffmpeg`
  - Ubuntu:`sudo apt install ffmpeg`
  - Windows:从 https://www.gyan.dev/ffmpeg/builds/ 下载并加入 PATH
- **Kimi Coding Plan key**(`sk-kimi-...`),从 https://kimi.com 订阅获取

### 启动

```bash
npm install                            # 装所有 workspace(shared/server/web)依赖
cp .env.example .env                   # 填入 KIMI_API_KEY,其他保持默认
npm run dev                            # 同时启动 server (4000) 和 vite (5173)
```

浏览器打开 **http://localhost:5173**。

启动时 server 会检测 FFmpeg,缺失会阻断启动并打印安装指引。

### 用法

1. **Dashboard** (`/`):查看历史任务
2. **上传任务** (`/upload`):拖入视频 + 字幕(可选)→ 提交 → 看到 5 阶段管线实时进度 → 自动跳到编辑页
3. **编辑页** (`/documents/:id/edit`):三栏布局
   - 左:步骤总览(timeline)
   - 中:富文本(Tiptap)+ 代码(CodeMirror)+ 截图编辑
   - 右:AI 调节(详细程度 / 受众语气 / 重新生成单步)
4. **报告页** (`/documents/:id`):预览成品 + 导出独立 HTML(单文件,base64 内嵌图片)

## 架构

单仓 npm workspaces,三平级目录:

```
shared/      @sop/shared  — 跨端 TS 类型(Task / SOPDocument / StageEvent)
server/      @sop/server  — Fastify + SQLite + Drizzle + Kimi + FFmpeg
web/         @sop/web     — React 18 + Vite + Tailwind + Tiptap + CodeMirror + Shiki
```

### 后端核心管线(5 阶段)

`server/src/pipeline/orchestrator.ts` 串行调度:

1. **ingest** — ffprobe 取时长 + 解析 .srt/.vtt
2. **chunk** — 触发词检测 + ≤25 分钟语义切片 + 多数投票判定 theory/practice 模式
3. **llm** — Kimi 调用,zod 严校验 JSON 响应,失败重试 2 次降温度
4. **frames** — 每步 5 候选帧 + dHash 8x8 灰度 + Hamming ≤6 跨步去重
5. **assemble** — 写 documents 表 + emit done

进度通过 **SSE**(`/api/tasks/:id/stream`)实时推送,持久化到 `stage_events` 表,断线用 `Last-Event-ID` 重连。

### 数据持久化

```
data/
├── sop.db                                # SQLite(tasks / documents / stage_events)
├── uploads/{taskId}/source.{mp4,srt}     # 原始上传
├── chunks/{taskId}/segment-{i}.json      # 字幕切片中间产物
├── frames/{taskId}/{stepN}/              # 候选帧 + selected.jpg + uploaded.*
└── exports/{documentId}/                 # 导出的 HTML 文件
```

## 关键文件

- [CLAUDE.md](CLAUDE.md) — 项目元规则、设计系统、行为约束
- [resources/PRD.md](resources/PRD.md) — 产品需求(权威)
- [resources/DESIGN.md](resources/DESIGN.md) — Matcha Quartet 色板 + 双字体规范
- [todo.md](todo.md) — M7 多平台同步、未来增强、已知工程债

### 后端代码索引

| 路径 | 用途 |
|---|---|
| [server/src/index.ts](server/src/index.ts) | Fastify 启动 + FFmpeg 检测 + 注册路由 |
| [server/src/pipeline/orchestrator.ts](server/src/pipeline/orchestrator.ts) | 5 阶段调度,fence 残留清理 |
| [server/src/pipeline/eventBus.ts](server/src/pipeline/eventBus.ts) | EventEmitter + 持久化 + SSE replay |
| [server/src/llm/kimi.ts](server/src/llm/kimi.ts) | OpenAI SDK 指向 Kimi,UA 伪装为 `claude-cli/1.0` |
| [server/src/llm/prompts.ts](server/src/llm/prompts.ts) | 8 条绝对规则的 SYSTEM_PROMPT |
| [server/src/ffmpeg/dedupe.ts](server/src/ffmpeg/dedupe.ts) | dHash + Hamming(PRD 硬指标 ③) |
| [server/src/subtitles/segment.ts](server/src/subtitles/segment.ts) | ≤25min 切片 + 多数投票 mode |
| [server/src/export/html.ts](server/src/export/html.ts) | Handlebars 模板,内嵌 base64 图 |
| [server/src/validation/lcs.ts](server/src/validation/lcs.ts) | PRD ② 原句泄露校验 |

### 前端代码索引

| 路径 | 用途 |
|---|---|
| [web/src/pages/Dashboard.tsx](web/src/pages/Dashboard.tsx) | 工作台,真接 `/api/tasks` 5s 轮询 |
| [web/src/pages/Upload.tsx](web/src/pages/Upload.tsx) | 上传 + 管线视图 + SSE |
| [web/src/pages/EditDocument.tsx](web/src/pages/EditDocument.tsx) | 三栏编辑器 |
| [web/src/pages/ReportDocument.tsx](web/src/pages/ReportDocument.tsx) | 报告页 + 导出 |
| [web/src/stores/editStore.ts](web/src/stores/editStore.ts) | zustand,1.5s debounce 自动保存 |
| [web/src/lib/sse.ts](web/src/lib/sse.ts) | `useTaskStream` hook |
| [web/src/components/editor/RichTextEditor.tsx](web/src/components/editor/RichTextEditor.tsx) | Tiptap 富文本(行内 code) |
| [web/src/components/editor/CodeEditor.tsx](web/src/components/editor/CodeEditor.tsx) | CodeMirror 6 可编辑代码 |
| [web/src/components/editor/CodeViewer.tsx](web/src/components/editor/CodeViewer.tsx) | Shiki 只读高亮 |
| [web/src/tailwind.config.ts](web/tailwind.config.ts) | Matcha Quartet 色板 + 字号 token |

## 工具命令

```bash
npm run dev                                                    # 同跑前后端
npm --workspace web run build                                  # 构建前端到 web/dist
npm --workspace server run build                               # 编译后端到 server/dist
npm --workspace server run validate -- <documentId>            # PRD ② 原句泄露校验
```

## 设计约束

UI 严格遵守 [resources/DESIGN.md](resources/DESIGN.md):
- 配色:Matcha Quartet(matcha / aqua / lavender / blush)+ canvas (`#F6FCF4`) 底
- 字体:**Noto Sans SC** 中文 / **Playfair Display** 仅限英文数字(永不与中文混排)
- 圆角:卡片 18px / 按钮 100px / 输入 12px
- Glassmorphism + 6px 渐变 stripe(matcha → blush)

## 安全 / ToS 备注

- **Kimi Coding Plan key 通过 UA 伪装** 调用 Chat Completions(`KIMI_USER_AGENT=claude-cli/1.0`)。Moonshot 加严检测可能封号 — 详见 [todo.md](todo.md) 的安全章节
- `.env` 在 `.gitignore` 里,**永不提交** API key
- `npm audit` 有 10 个漏洞(fast-uri / esbuild dev),本地单机不阻塞,生产前需要升级 Fastify 5 / Vite 6
