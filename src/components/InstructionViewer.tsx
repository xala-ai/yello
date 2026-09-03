'use client';

import { useEffect, useState } from 'react';
import type { PlacedBrick } from '@/lib/planner';
import { LegoViewer } from './LegoViewer';

export function InstructionViewer({
  name,
  steps,
  ldrawText,
  onClose,
}: {
  name: string;
  steps: PlacedBrick[];
  ldrawText: string;
  onClose: () => void;
}) {
  const [fileUrl] = useState(() =>
    URL.createObjectURL(new Blob([ldrawText], { type: 'text/plain' })),
  );

  useEffect(() => {
    return () => URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);

  return (
    <LegoViewer
      fileUrl={fileUrl}
      title={name}
      instructionSteps={steps.map((step) => ({
        stepNum: step.step,
        partNum: step.partNum,
        colorName: step.colorName,
        description: step.description,
      }))}
      onClose={onClose}
    />
  );
}
