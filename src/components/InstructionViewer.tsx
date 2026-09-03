'use client';

import { useMemo } from 'react';
import type {
  BuildQualityDiagnostics,
  BuildSourceAttribution,
  PlacedBrick,
} from '@/lib/planner';
import type { AssemblyStep } from '@/lib/brickgpt/instructions';
import type { AIBuild } from '@/store/garage';
import { LegoViewer } from './LegoViewer';

export function InstructionViewer({
  name,
  steps,
  ldrawText,
  diagnostics,
  warnings,
  sources,
  assemblySteps,
  inspiration,
  onClose,
}: {
  name: string;
  steps: PlacedBrick[];
  ldrawText: string;
  diagnostics?: BuildQualityDiagnostics;
  warnings?: string[];
  sources?: BuildSourceAttribution[];
  assemblySteps?: AssemblyStep[];
  inspiration?: AIBuild['inspiration'];
  onClose: () => void;
}) {
  const fileUrl = useMemo(
    () => `data:text/plain;charset=utf-8,${encodeURIComponent(ldrawText)}`,
    [ldrawText],
  );

  return (
    <LegoViewer
      fileUrl={fileUrl}
      title={name}
      instructionSteps={steps.map((step) => ({
        stepNum: step.step,
        partNum: step.partNum,
        colorName: step.colorName,
        description: step.description,
        title: assemblySteps?.find((item) => item.number === step.step)?.title,
      }))}
      diagnostics={diagnostics}
      warnings={warnings}
      sources={sources}
      assemblySteps={assemblySteps}
      inspiration={inspiration}
      onClose={onClose}
    />
  );
}
