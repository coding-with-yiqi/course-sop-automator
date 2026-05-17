import clsx from 'clsx';
import { Check, Plus } from 'lucide-react';
import type { SOPStep } from '@sop/shared';

interface StepsTimelineProps {
  steps: SOPStep[];
  selectedStepNumber: number | null;
  onSelect: (stepNumber: number) => void;
}

export function StepsTimeline({ steps, selectedStepNumber, onSelect }: StepsTimelineProps) {
  return (
    <div className="bg-surface-lowest border border-border-subtle rounded-card p-4 sticky top-4">
      <h3 className="text-title-sm font-bold text-forest mb-4 border-b border-border-subtle pb-2">
        步骤总览
      </h3>
      <div className="flex flex-col gap-2 relative">
        <div className="absolute left-4 top-4 bottom-4 w-px bg-border-subtle z-0" aria-hidden="true" />
        {steps.map((step, idx) => (
          <StepNode
            key={step.stepNumber}
            step={step}
            position={idx === selectedStepNumber! - 1 ? 'active' : idx < (selectedStepNumber ?? 0) - 1 ? 'completed' : 'pending'}
            isSelected={selectedStepNumber === step.stepNumber}
            onClick={() => onSelect(step.stepNumber)}
          />
        ))}
      </div>
      <button
        type="button"
        className="w-full mt-4 py-2 border border-dashed border-border-subtle text-mist rounded-input flex items-center justify-center gap-2 hover:bg-surface-bright hover:text-matcha transition-colors text-sm"
        disabled
        title="即将上线"
      >
        <Plus className="w-4 h-4" />
        手动添加步骤
      </button>
    </div>
  );
}

function StepNode({
  step,
  isSelected,
  position,
  onClick,
}: {
  step: SOPStep;
  isSelected: boolean;
  position: 'completed' | 'active' | 'pending';
  onClick: () => void;
}) {
  // We re-derive visual state mainly from selection.
  // `position` (above/at/below selected) tints the dimming.
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'relative z-10 flex items-start gap-3 p-2 rounded-input cursor-pointer transition-colors text-left',
        isSelected
          ? 'bg-surface border border-surface-variant shadow-card'
          : 'hover:bg-surface-bright border border-transparent',
        !isSelected && position === 'completed' && 'opacity-60',
      )}
    >
      <span
        className={clsx(
          'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5',
          isSelected
            ? 'bg-matcha text-white border-2 border-surface-lowest shadow-sm'
            : position === 'completed'
              ? 'bg-surface-highest text-matcha border-2 border-surface-lowest'
              : 'bg-canvas border border-border-subtle text-mist',
        )}
      >
        {position === 'completed' && !isSelected ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          step.stepNumber
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={clsx('block font-bold text-sm', isSelected ? 'text-matcha' : 'text-on-surface')}>
          {step.title}
        </span>
        <span className="block text-body-sm text-mist line-clamp-1 font-light">
          {step.shortDescription}
        </span>
      </span>
    </button>
  );
}
