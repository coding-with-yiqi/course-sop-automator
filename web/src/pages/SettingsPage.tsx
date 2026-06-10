import { useEffect, useState } from 'react';
import { Save, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { api, ApiError } from '@/lib/api.ts';

interface SettingField {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  type: 'password' | 'text';
  group: 'llm';
}

const FIELDS: SettingField[] = [
  {
    key: 'KIMI_API_KEY',
    label: 'Kimi API Key',
    description: 'Kimi k2.6 模型，推荐用于中文课程',
    placeholder: 'sk-xxxxxxxx',
    type: 'password',
    group: 'llm',
  },
  {
    key: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek API Key',
    description: 'DeepSeek V3 模型，性价比高',
    placeholder: 'sk-xxxxxxxx',
    type: 'password',
    group: 'llm',
  },
  {
    key: 'OPENAI_API_KEY',
    label: 'OpenAI API Key',
    description: 'GPT-4o 等模型',
    placeholder: 'sk-xxxxxxxx',
    type: 'password',
    group: 'llm',
  },
];

const GROUP_META: Record<string, { title: string; icon: typeof Sparkles; color: string }> = {
  llm: { title: 'AI 模型', icon: Sparkles, color: 'text-matcha' },
};

export function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.getSettings();
        if (!cancelled) {
          setValues(data);
          setOriginal(data);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : '加载配置失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const hasChanges = Object.entries(values).some(
    ([k, v]) => v !== (original[k] ?? ''),
  ) || Object.keys(original).some((k) => !(k in values) && values[k] !== '');

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v.trim()) payload[k] = v.trim();
      }
      await api.updateSettings(payload);
      setOriginal({ ...values });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-8 max-w-2xl">
        <header>
          <h2 className="text-headline-lg font-bold text-forest mb-2">设置</h2>
          <p className="text-body-md text-sage font-light">加载配置中...</p>
        </header>
      </div>
    );
  }

  const groups = Object.entries(GROUP_META) as [string, typeof GROUP_META[string]][];

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-headline-lg font-bold text-forest mb-2">设置</h2>
          <p className="text-body-md text-sage font-light">
            配置 AI 模型的 API 密钥。支持 Kimi、DeepSeek、OpenAI，优先使用第一个有 Key 的提供商。数据仅保存在本地数据库中。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-matcha text-sm font-bold">
              <CheckCircle2 className="w-4 h-4" />
              已保存
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={clsx(
              'px-5 py-2 rounded-pill font-bold text-sm inline-flex items-center gap-2 transition-all',
              hasChanges
                ? 'matcha-gradient text-white shadow-card hover:shadow-card-hover hover:-translate-y-0.5'
                : 'bg-surface-lowest text-mist border border-border-subtle cursor-not-allowed',
            )}
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-error-container/40 border border-error/30 rounded-card p-4 text-on-error-container text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {groups.map(([groupKey, meta]) => {
        const groupFields = FIELDS.filter((f) => f.group === groupKey);
        const Icon = meta.icon;
        return (
          <section
            key={groupKey}
            className="glass-panel rounded-card shadow-card border border-border-subtle p-6"
          >
            <div className="flex items-center gap-2 mb-5">
              <Icon className={clsx('w-5 h-5', meta.color)} />
              <h3 className="text-title-sm font-bold text-forest">{meta.title}</h3>
            </div>
            <div className="flex flex-col gap-5">
              {groupFields.map((field) => (
                <div key={field.key} className="flex flex-col gap-1.5">
                  <label className="text-body-sm font-bold text-forest">
                    {field.label}
                  </label>
                  <p className="text-body-sm text-mist font-light">{field.description}</p>
                  <input
                    type={field.type}
                    value={values[field.key] ?? ''}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    placeholder={field.placeholder}
                    className={clsx(
                      'w-full px-4 py-2.5 bg-surface-lowest border rounded-input text-body-md text-on-surface',
                      'focus:outline-none focus:ring-2 focus:ring-matcha-container focus:border-matcha',
                      'placeholder:text-mist/50',
                      values[field.key] !== (original[field.key] ?? '')
                        ? 'border-matcha'
                        : 'border-border-subtle',
                    )}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
