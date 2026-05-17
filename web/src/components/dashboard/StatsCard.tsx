import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  description: string;
  accentTop?: boolean;
}

export function StatsCard({ icon: Icon, label, value, description, accentTop = false }: StatsCardProps) {
  return (
    <div className="relative bg-surface-lowest rounded-xl p-6 border border-border-subtle shadow-card flex flex-col justify-between overflow-hidden">
      {accentTop && <div className="absolute top-0 left-0 w-full h-1 bg-matcha-container" aria-hidden="true" />}
      <div className="flex items-center gap-3 text-matcha mb-4">
        <span className="bg-surface-highest p-2 rounded-lg">
          <Icon className="w-5 h-5" />
        </span>
        <span className="text-title-sm font-bold">{label}</span>
      </div>
      <div className="font-display text-display-num-lg text-forest">{value}</div>
      <p className="text-body-sm text-mist mt-2 font-light">{description}</p>
    </div>
  );
}
