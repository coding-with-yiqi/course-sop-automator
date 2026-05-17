import { useRef, useState } from 'react';
import { Camera, Check, Pencil, User, X } from 'lucide-react';
import type { SOPSpeaker } from '@sop/shared';

interface SpeakerCardProps {
  speaker: SOPSpeaker | null;
  onSave: (next: SOPSpeaker | null) => void;
}

export function SpeakerCard({ speaker, onSave }: SpeakerCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SOPSpeaker>(
    speaker ?? { name: '', title: '', avatarUrl: null },
  );
  const fileRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(speaker ?? { name: '', title: '', avatarUrl: null });
    setEditing(true);
  }

  function commit() {
    if (!draft.name.trim()) {
      onSave(null);
    } else {
      onSave({
        name: draft.name.trim(),
        title: draft.title.trim(),
        avatarUrl: draft.avatarUrl,
      });
    }
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
  }

  function handleAvatar(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDraft((d) => ({ ...d, avatarUrl: String(reader.result) }));
    };
    reader.readAsDataURL(file);
  }

  if (!editing) {
    if (!speaker || !speaker.name) {
      return (
        <button
          type="button"
          onClick={startEdit}
          className="inline-flex items-center gap-3 p-4 bg-surface-lowest rounded-card border border-dashed border-border-subtle text-mist hover:border-matcha-container hover:text-matcha transition-colors"
        >
          <User className="w-5 h-5" />
          <span className="text-sm">+ 添加讲师信息</span>
        </button>
      );
    }
    return (
      <div className="inline-flex items-center gap-4 p-3 bg-surface-lowest rounded-card border border-border-subtle group relative">
        {speaker.avatarUrl ? (
          <img
            src={speaker.avatarUrl}
            alt={speaker.name}
            className="w-14 h-14 rounded-full object-cover border border-border-subtle"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-matcha-container/40 flex items-center justify-center text-matcha">
            <User className="w-6 h-6" />
          </div>
        )}
        <div>
          <p className="text-title-sm font-bold text-on-surface leading-tight">{speaker.name}</p>
          <p className="text-body-sm text-mist mt-0.5 font-light">{speaker.title}</p>
        </div>
        <button
          type="button"
          onClick={startEdit}
          className="absolute top-2 right-2 p-1.5 text-mist hover:text-matcha hover:bg-surface rounded-pill opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="编辑讲师"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 p-4 bg-surface-lowest rounded-card border border-matcha-container shadow-card max-w-md">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="relative w-14 h-14 shrink-0 rounded-full bg-matcha-container/40 flex items-center justify-center overflow-hidden border border-border-subtle hover:border-matcha transition-colors group"
        title="点击上传头像"
      >
        {draft.avatarUrl ? (
          <img src={draft.avatarUrl} alt="预览" className="w-full h-full object-cover" />
        ) : (
          <User className="w-6 h-6 text-matcha" />
        )}
        <span className="absolute inset-0 bg-forest/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Camera className="w-4 h-4" />
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleAvatar(e.target.files?.[0] ?? null)}
        />
      </button>
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <input
          autoFocus
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="讲师姓名"
          className="bg-canvas border border-border-subtle rounded-input px-3 py-1.5 text-body-md font-bold focus:outline-none focus:ring-2 focus:ring-matcha-container"
        />
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="头衔(如:计算机科学系资深讲师)"
          className="bg-canvas border border-border-subtle rounded-input px-3 py-1.5 text-body-sm focus:outline-none focus:ring-2 focus:ring-matcha-container"
        />
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        <button
          type="button"
          onClick={commit}
          className="p-2 text-matcha hover:bg-matcha-container/30 rounded-pill"
          aria-label="保存"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={cancel}
          className="p-2 text-mist hover:bg-surface rounded-pill"
          aria-label="取消"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
