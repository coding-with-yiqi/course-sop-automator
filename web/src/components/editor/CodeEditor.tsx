import { useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html as htmlLang } from '@codemirror/lang-html';
import { css as cssLang } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import type { SOPCodeBlock } from '@sop/shared';
import { Copy } from 'lucide-react';

const LANGUAGES = [
  { id: 'jsx', label: 'JSX' },
  { id: 'ts', label: 'TypeScript' },
  { id: 'js', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'bash', label: 'Bash' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'text', label: 'Text' },
] as const;

function extensionFor(language: string) {
  switch (language) {
    case 'jsx':
    case 'ts':
    case 'tsx':
      return javascript({ jsx: true, typescript: true });
    case 'js':
      return javascript();
    case 'python':
      return python();
    case 'json':
      return json();
    case 'yaml':
      return yaml();
    case 'html':
      return htmlLang();
    case 'css':
      return cssLang();
    default:
      return undefined;
  }
}

interface CodeEditorProps {
  codeBlock: SOPCodeBlock | null;
  onChange: (next: SOPCodeBlock) => void;
  onCopy?: () => void;
}

export function CodeEditor({ codeBlock, onChange, onCopy }: CodeEditorProps) {
  const language = codeBlock?.language ?? 'text';
  const filename = codeBlock?.filename ?? '';
  const content = codeBlock?.content ?? '';

  const extensions = useMemo(() => {
    const ext = extensionFor(language);
    const base = [EditorView.lineWrapping];
    return ext ? [ext, ...base] : base;
  }, [language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      onCopy?.();
    } catch {
      // ignore — older browsers / non-secure context
    }
  };

  return (
    <div className="bg-[#1a3217] rounded-xl border border-[#304d2d] overflow-hidden shadow-inner relative">
      <div className="bg-[#152413] px-4 py-2 flex items-center gap-2 border-b border-[#304d2d]">
        <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
        <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
        <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
        <input
          value={filename}
          onChange={(e) =>
            onChange({
              language,
              filename: e.target.value,
              content,
            })
          }
          placeholder="filename"
          className="ml-2 bg-transparent text-[#a0b39e] text-[12px] font-mono outline-none flex-1"
        />
        <select
          value={language}
          onChange={(e) =>
            onChange({
              language: e.target.value,
              filename,
              content,
            })
          }
          className="bg-[#1a3217] text-[#a0b39e] text-[11px] font-mono rounded px-2 py-0.5 border border-[#304d2d] outline-none"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.id} value={lang.id}>
              {lang.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleCopy}
          className="p-1 text-[#a0b39e] hover:text-white hover:bg-[#304d2d] rounded transition-colors"
          aria-label="复制代码"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>
      <CodeMirror
        value={content}
        extensions={extensions}
        theme="dark"
        basicSetup={{
          lineNumbers: false,
          highlightActiveLine: false,
          foldGutter: false,
        }}
        height="auto"
        minHeight="80px"
        maxHeight="320px"
        onChange={(next) =>
          onChange({
            language,
            filename,
            content: next,
          })
        }
        className="text-[13.5px] font-mono"
      />
    </div>
  );
}
