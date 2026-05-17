import { PIPELINE_STAGES, PIPELINE_STAGE_META } from '@sop/shared';
import type { StageEvent, StageKey } from '@sop/shared';
import { StageCard } from './StageCard.tsx';

interface StageListProps {
  stages: Record<StageKey, StageEvent>;
  fileName?: string | null;
}

export function StageList({ stages, fileName }: StageListProps) {
  return (
    <div className="flex flex-col gap-4 relative">
      <div className="absolute left-[23px] top-6 bottom-6 w-0.5 bg-border-subtle z-0" aria-hidden="true" />
      {PIPELINE_STAGES.map((stageKey) => (
        <StageCard
          key={stageKey}
          meta={PIPELINE_STAGE_META[stageKey]}
          event={stages[stageKey]}
          fileName={stageKey === 'ingest' ? fileName : null}
        />
      ))}
    </div>
  );
}
