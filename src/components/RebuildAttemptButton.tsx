'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { attemptCandidateRebuildAction } from '@/app/actions';
import type { AIBuild } from '@/store/garage';
import { useGarageStore } from '@/store/garage';
import { aggregateInventory, slimInventoryForAI } from '@/lib/inventory';
import { InstructionViewer } from './InstructionViewer';

export function RebuildAttemptButton({
    setNum,
    setName,
    source,
    sourceUrl,
    className,
}: {
    setNum: string;
    setName: string;
    source: 'official' | 'rebrickable';
    sourceUrl?: string;
    className?: string;
}) {
    const age = useGarageStore((state) => state.age);
    const fidelityWeight = useGarageStore((state) => state.fidelityWeight);
    const selectedSetIds = useGarageStore((state) => state.selectedSetIds);
    const setInventories = useGarageStore((state) => state.setInventories);
    const [rebuild, setRebuild] = useState<AIBuild | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [viewerOpen, setViewerOpen] = useState(false);

    const attemptRebuild = async () => {
        if (rebuild) {
            setViewerOpen(true);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const garageInventory = slimInventoryForAI(aggregateInventory(
                selectedSetIds
                    .map((id) => setInventories[id])
                    .filter((inventory) => Array.isArray(inventory)),
            ));
            const result = await attemptCandidateRebuildAction(
                setNum,
                setName,
                source,
                fidelityWeight,
                age,
                garageInventory,
                sourceUrl,
            );
            setRebuild(result);
            setViewerOpen(true);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not generate an approximate rebuild.');
        } finally {
            setLoading(false);
        }
    };

    const steps = rebuild?.placed ?? rebuild?.steps.map((step) => ({
        partNum: step.partNum,
        colorId: step.colorId,
        colorName: step.colorName,
        x: step.x,
        y: step.y,
        z: step.z,
        rot: step.rotation,
        step: step.stepNum,
        description: step.description,
        loadBearing: !!step.loadBearing,
    }));

    return (
        <>
            <button
                type="button"
                onClick={attemptRebuild}
                disabled={loading}
                className={className}
            >
                {loading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Sparkles className="w-3.5 h-3.5" />}
                {rebuild ? 'Open original build' : 'Create inspired build'}
            </button>
            {error && (
                <p className="col-span-2 text-[11px] text-red-600" role="alert">{error}</p>
            )}
            {viewerOpen && rebuild && steps && (
                <InstructionViewer
                    name={rebuild.name}
                    steps={steps}
                    ldrawText={rebuild.ldrawText}
                    diagnostics={rebuild.diagnostics}
                    warnings={rebuild.warnings}
                    sources={rebuild.sources}
                    assemblySteps={rebuild.assemblySteps}
                    inspiration={rebuild.inspiration}
                    onClose={() => setViewerOpen(false)}
                />
            )}
        </>
    );
}
