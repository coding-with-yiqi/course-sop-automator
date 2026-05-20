import clsx from 'clsx';
import { Check, Plus } from 'lucide-react';
import type { SOPStep } from '@sop/shared';

interface StepsTimelineProps {
  steps: SOPStep[];
  selectedStepNumber: number | null;
  onSelect: (stepNumber: number) => void;
  onInsertAfter: (afterStepNumber: number) => void;
  isInserting?: boolean;
}

export function StepsTimeline({
  steps,
  selectedStepNumber,
  onSelect,
  onInsertAfter,
  isInserting = false,
}: StepsTimelineProps) {
  return (
    <div className="bg-surface-lowest border border-border-subtle rounded-card p-4 sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
      <h3 className="text-title-sm font-bold text-forest mb-4 border-b border-border-subtle pb-2 sticky top-0 bg-surface-lowest -mx-4 px-4 -mt-4 pt-4 z-10">
        步骤总览
      </h3>
      <div className="flex flex-col gap-1 relative">
        <div className="absolute left-4 top-4 bottom-4 w-px bg-border-subtle z-0" aria-hidden="true" />
        <InsertGap
          label="在最前面插入"
          disabled={isInserting}
          onClick={() => onInsertAfter(0)}
        />
        {steps.map((step, idx) => (
          <div key={step.stepNumber} className="flex flex-col gap-1">
            <StepNode
              step={step}
              position={
                idx === (selectedStepNumber ?? 0) - 1
                  ? 'active'
                  : idx < (selectedStepNumber ?? 0) - 1
                    ? 'completed'
                    : 'pending'
              }
              isSelected={selectedStepNumber === step.stepNumber}
              onClick={() => onSelect(step.stepNumber)}
            />
            <InsertGap
              disabled={isInserting}
              onClick={() => onInsertAfter(step.stepNumber)}
              label={idx === steps.length - 1 ? '在末尾追加' : '在此处插入'}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function InsertGap({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={clsx(
        'group/gap relative z-10 h-3 flex items-center justify-center',
        'opacity-30 hover:opacity-100 focus:opacity-100 transition-opacity',
        'disabled:opacity-20 disabled:cursor-not-allowed',
      )}
    >
      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-pill border border-dashed border-matcha-container text-matcha bg-surface-lowest text-[10px] font-bold whitespace-nowrap shadow-sm">
        <Plus className="w-3 h-3" />
        {label}
      </span>
    </button>
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
