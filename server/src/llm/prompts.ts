import type { Cue } from '../subtitles/parse.ts';
import type { Granularity } from '@sop/shared';

export const SYSTEM_PROMPT = `你是「教学视频 SOP 文档生成助手」。你的工作是把课程字幕重组为结构化、可复制、可执行的操作说明。

绝对规则:
1. 严禁输出逐字稿。每个步骤是经过提炼的操作摘要,不是原句拷贝。
2. 理论模式(讲解 PPT 时):每个知识点对应 1 个步骤,timestampSec 取该知识点中段。
3. 实操模式(动手演示时):每个动作对应 1 个步骤,timestampSec 精确到动作发生时的字幕开始时间。
4. 凡是讲师口述出现的命令行、代码片段、配置块,必须放进 codeBlock,language 由你判断(jsx / python / bash / json / yaml / sql / html / css 等)。
5. **若用户提供了 PPT 大纲(<slides-context> 标签),把它视为"原稿"——字幕里的代码/命令/术语以 PPT 上的写法为准**(讲师口述常有错读、省略、合成词)。PPT 大纲里出现的代码块也要尽量摘进 codeBlock,即使字幕没念。
6. 单个步骤的 instructionRichText 不超过 3 句,语言简练,可包含 <code>行内代码</code> 标签。
7. timestampSec 必须严格落在传入的字幕时间范围内(单位:秒)。
8. accentColor 字段从 ['matcha','aqua','lavender','blush'] 里选一个,用于步骤卡的左侧色条。
9. 输出必须是严格 JSON,符合 schema。任何 markdown、说明、前导/后置文字一律禁止。

输出 schema:
{
  "steps": [
    {
      "title": "≤40 字步骤标题",
      "shortDescription": "时间线一行预览,≤80 字",
      "instructionRichText": "≤3 句正文,可含 <code>…</code> 行内代码",
      "timestampSec": <数字,秒>,
      "codeBlock": {
        "language": "bash" | "jsx" | "python" | ...,
        "filename": "可选,如 App.jsx",
        "content": "完整代码内容"
      } | null,
      "accentColor": "matcha" | "aqua" | "lavender" | "blush"
    }
  ]
}`;

export interface BuildUserPromptInput {
  mode: 'theory' | 'practice';
  startSec: number;
  endSec: number;
  cues: Cue[];
  detailLevel?: 1 | 2 | 3;
  tone?: 'technical' | 'beginner';
  slidesMarkdown?: string | null;
  granularity?: Granularity;
}

function modeHint(mode: 'theory' | 'practice'): string {
  return mode === 'theory'
    ? '【理论模式】这一段是讲师讲解静态内容(PPT、概念、定义),每个步骤聚焦一个独立知识点。'
    : '【实操模式】这一段是讲师动手演示,每个动作单独一步,代码命令必须独立成 codeBlock。';
}

function granularityHint(mode: 'theory' | 'practice', g?: Granularity): string {
  const matrix = {
    coarse: { theory: '2-3', practice: '3-6', policy: '把相邻小动作合并成一步,只保留核心节点;宁可少也别凑数。' },
    normal: { theory: '2-5', practice: '5-15', policy: '默认水位:理论每个知识点 1 步、实操每个动作 1 步。' },
    fine: { theory: '4-10', practice: '10-30', policy: '把每个独立动作、命令、配置、判断都拆成单独一步,不要合并相邻动作。即使讲师一句话说了两件事,也拆成两步。' },
  } as const;
  const level = g ?? 'normal';
  const cfg = matrix[level];
  const label = level === 'coarse' ? '粗放' : level === 'fine' ? '精细' : '平衡';
  return `【颗粒度:${label}】这一段期望产出 ${cfg[mode]} 个步骤。${cfg.policy}`;
}

function detailHint(level?: 1 | 2 | 3): string {
  if (level === 1) return '风格:极简,instructionRichText 限 1 句。';
  if (level === 3) return '风格:详细,instructionRichText 允许 3 句,解释操作的「为什么」。';
  return '风格:平衡,instructionRichText 通常 2 句。';
}

function toneHint(tone?: 'technical' | 'beginner'): string {
  if (tone === 'beginner') return '受众:新手,遇到术语先解释再使用。';
  if (tone === 'technical') return '受众:有经验的工程师,使用专业术语,不解释基础概念。';
  return '受众:有基础的学习者,默认术语,关键点扼要解释。';
}

function cuesToSrtBlock(cues: Cue[]): string {
  return cues
    .map((cue, idx) => {
      const start = formatTime(cue.startMs / 1000);
      const end = formatTime(cue.endMs / 1000);
      return `${idx + 1}\n${start} --> ${end}\n${cue.text}`;
    })
    .join('\n\n');
}

function formatTime(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const ms = Math.floor((totalSec - Math.floor(totalSec)) * 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

export function buildUserPrompt({
  mode,
  startSec,
  endSec,
  cues,
  detailLevel,
  tone,
  slidesMarkdown,
  granularity,
}: BuildUserPromptInput): string {
  const slidesBlock = slidesMarkdown
    ? `\n<slides-context>\n以下是讲师 PPT/PDF 原稿的全文大纲(整份课程,非本段专属)。字幕里的代码、命令、术语以原稿写法为准。\n\n${slidesMarkdown}\n</slides-context>\n`
    : '';
  return `${modeHint(mode)}
${granularityHint(mode, granularity)}
${detailHint(detailLevel)}
${toneHint(tone)}
${slidesBlock}
时间范围: ${startSec.toFixed(1)}s ~ ${endSec.toFixed(1)}s
字幕(SRT,时间戳为该段内的绝对秒):

${cuesToSrtBlock(cues)}

请按 schema 输出 JSON。`;
}
