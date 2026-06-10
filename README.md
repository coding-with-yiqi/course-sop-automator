# Course SOP Automator

> 把课程视频自动变成图文操作说明书。

一个本地运行的自动化流水线,接收 `.mp4` 视频 + 字幕文件,通过 LLM 智能切片、抽取步骤、FFmpeg 抓帧 + dHash 去重,产出结构化的 HTML 教学文档。支持多主题导出、可选字幕自动转录、PPT 原稿注入。

---

## 产品定位

面向讲师与课程学员。核心场景:

1. **讲师** 录制了一段操作演示视频(如「如何用 Docker 部署服务」)
2. 上传视频 + 字幕(`.srt`/`.vtt`/`.txt`,可选;无字幕时系统自动转录)
3. AI 自动切片、抽取步骤、抓取关键帧、识别代码块
4. 输出 `.html` 单文件,可直接拖入 AI 知识库供学员检索

**输出标准**: 代码块包在 `<pre><code>` 中,截图 base64 内嵌,单文件可离线阅读。支持 5 套视觉主题。

---

## 功能清单

| 功能 | 状态 | 说明 |
|------|------|------|
| 视频上传 | ✅ | 支持 `.mp4`/`.mov`/`.mkv`,拖拽上传 |
| 字幕(可选) | ✅ | `.srt`/`.vtt`/`.txt`,无字幕时 whisper 自动转录 |
| PPT 原稿注入 | ✅ | `.pptx`/`.pdf` → markdown → LLM prompt |
| AI 步骤抽取 | ✅ | LLM 语义切片,区分理论/实操模式 |
| 关键帧抓取 | ✅ | FFmpeg 精准抓帧 + dHash 去重 |
| 编辑页 | ✅ | 富文本/代码块/截图/AI 调节/素材管理 |
| 多主题导出 | ✅ | 抹茶/极简/技术深色/Notion/杂志 5 套主题 |
| 悬浮视频 | ✅ | 右下角可播放原视频,支持 seek |
| 多 LLM 支持 | ✅ | Kimi / DeepSeek / OpenAI 自动切换 |
| 多平台同步 | ⏸ | 待排期(Notion/语雀/元宝/ima) |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + Vite + TypeScript + Tailwind CSS |
| 后端 | Fastify + TypeScript |
| 数据库 | SQLite(better-sqlite3) + Drizzle ORM |
| 视频处理 | 本机 FFmpeg(静态二进制捆绑) |
| 去重 | sharp + dHash(Hamming ≤6) |
| 转录 | whisper.cpp(本地编译,模型按需下载) |
| LLM | Kimi / DeepSeek / OpenAI 兼容 OpenAI SDK |
| 导出 | Handlebars + 内联 base64 |

---

## 安装(推荐用 AI Agent)

### 环境要求

- **Node.js 22+**
- **FFmpeg + ffprobe**(命令行可用即可)
- **macOS**(打包 App)或任意平台(源码运行 Web 模式)

### 用 Claude Code 安装

```bash
# 1. 克隆仓库
git clone <repo-url>
cd course-sop-automator

# 2. 安装依赖
npm install

# 3. 配置 API Key(三选一,优先顺序 Kimi > DeepSeek > OpenAI)
echo "KIMI_API_KEY=sk-your-key" > .env
# 或 echo "DEEPSEEK_API_KEY=sk-your-key" > .env
# 或 echo "OPENAI_API_KEY=sk-your-key" > .env

# 4. 启动开发服务
npm run dev
```

然后打开浏览器访问 `http://localhost:5173`。

### macOS 打包 App

```bash
# 需要 Apple Silicon Mac
npm run dist:mac
# 产物: release/Course SOP Automator-0.1.0-arm64.dmg
```

---

## 使用流程

1. **上传** — 拖入 `.mp4` 视频 + 字幕(`.srt`/`.vtt`/`.txt`,可选)
2. **等待** — SSE 实时显示进度:ingest → chunk → LLM → frames → assemble
3. **编辑** — 调整步骤内容、替换截图、修改代码块
4. **导出** — 选主题 → 下载 `.html` 单文件

**无字幕?** 系统会自动用本机 whisper 转录(首次需下载 190MB 模型)。

---

## 项目结构

```
├── electron/          # Electron 主进程(macOS App 打包)
├── server/            # Fastify 后端 API
├── web/               # React 前端
├── shared/            # 共享类型与常量
├── bin/               # 捆绑的 FFmpeg 二进制(gitignored)
└── scripts/           # 构建脚本
```

---

## 开发

```bash
# 类型检查
npx tsc --noEmit -p server/tsconfig.json
npx tsc --noEmit -p web/tsconfig.json

# 测试
npm run test          # server + web + electron

# 单独启动
npm run dev           # server(:4000) + web(:5173) 同时
```

---

## License

MIT
