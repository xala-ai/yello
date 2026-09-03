'use client';

import { useState } from 'react';
import type { BuildPlan } from '@/lib/planner';
import { InstructionViewer } from './InstructionViewer';

export function BrickGptGoldenGallery({ plans }: { plans: BuildPlan[] }) {
  const [selected, setSelected] = useState<BuildPlan | null>(null);

  return (
    <>
      <nav className="mb-6 flex flex-wrap gap-2 text-xs">
        {plans.map((plan) => (
          <a
            key={plan.id}
            href={`#golden-${plan.candidateRank}-${plan.seed}`}
            className="rounded-full border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50"
          >
            {plan.name}
          </a>
        ))}
      </nav>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <article
            id={`golden-${plan.candidateRank}-${plan.seed}`}
            key={plan.id}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <h2 className="font-bold text-gray-900">{plan.name}</h2>
            <p className="mt-1 text-xs text-gray-500">{plan.description}</p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <dt className="text-gray-500">Parts</dt>
              <dd className="text-right font-semibold">{plan.steps.length}</dd>
              <dt className="text-gray-500">Semantic</dt>
              <dd className="text-right font-semibold">
                {plan.diagnostics.semanticApproximation ?? 'n/a'}%
              </dd>
              <dt className="text-gray-500">Stability</dt>
              <dd className="text-right font-semibold">{plan.diagnostics.stability}%</dd>
              <dt className="text-gray-500">Prefix stability</dt>
              <dd className="text-right font-semibold">{plan.diagnostics.prefixStability}%</dd>
              <dt className="text-gray-500">Components</dt>
              <dd className="text-right font-semibold">{plan.diagnostics.components}</dd>
            </dl>
            <button
              type="button"
              onClick={() => setSelected(plan)}
              className="mt-4 w-full rounded-lg bg-yellow-400 px-3 py-2 text-sm font-bold text-black hover:bg-yellow-500"
            >
              Open instruction viewer
            </button>
          </article>
        ))}
      </div>
      {selected && (
        <InstructionViewer
          name={selected.name}
          steps={selected.steps}
          ldrawText={selected.ldrawText}
          diagnostics={selected.diagnostics}
          warnings={selected.warnings}
          sources={selected.sources}
          assemblySteps={selected.assemblySteps}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
