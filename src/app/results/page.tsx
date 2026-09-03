'use client';

import { useEffect, useState } from 'react';
import { useGarageStore } from '@/store/garage';
import { MocCard } from '@/components/MocCard';
import { SmartSetCard } from '@/components/SmartSetCard';
import Link from 'next/link';
import {
    ArrowLeft, Loader2, RefreshCw, Sparkles, Layers, Shield, Eye,
    Bot, Zap, User, ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import { SuggestionBar } from '@/components/SuggestionBar';
import { ModelViewerZone } from '@/components/ModelViewerZone';
import { InstructionViewer } from '@/components/InstructionViewer';
import { CrossScaleMixDialog } from '@/components/CrossScaleMixDialog';
import { selectionHasMixedScales } from '@/lib/duplo';
import { useRouter } from 'next/navigation';
import { AGE_BANDS, ageBandIndex, usesAdvancedScoreLabels } from '@/types/rebrickable';

const CROSS_SCALE_ACK_KEY = 'yellobricks-cross-scale-ack';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SliderRow({
    label, min, max, value, step = 1, format, onChange, icon,
}: {
    label: string; min: number; max: number; value: number; step?: number;
    format?: (v: number) => string; onChange: (v: number) => void; icon: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1 text-gray-500 w-28 shrink-0">{icon}{label}</span>
            <input
                type="range" min={min} max={max} step={step} value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="flex-1 accent-yellow-500 h-1.5"
            />
            <span className="w-14 text-right font-semibold text-gray-700 shrink-0">
                {format ? format(value) : value}
            </span>
        </div>
    );
}

function AIBuildCard({ build, advancedLabels }: { build: import('@/store/garage').AIBuild; advancedLabels: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const [viewer, setViewer] = useState(false);
    const placed = build.placed ?? build.steps.map((s) => ({
        partNum: s.partNum, colorId: s.colorId, colorName: s.colorName,
        x: s.x, y: s.y, z: s.z, rot: s.rotation, step: s.stepNum,
        description: s.description, loadBearing: !!s.loadBearing,
    }));
    const layerCount = Math.max(1, ...build.steps.map((step) => step.stepNum));
    const groupedSteps = Array.from({ length: layerCount }, (_, index) => {
        const stepNum = index + 1;
        const parts = build.steps.filter((step) => step.stepNum === stepNum);
        return { stepNum, parts };
    });
    const fidelityLabel = advancedLabels ? 'Fidelity' : 'Looks right';
    const rigidityLabel = advancedLabels ? 'Rigidity' : 'Holds together';
    return (
        <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h3 className="font-bold text-gray-900">{build.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{build.description}</p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded font-semibold">AI</span>
                    {build.candidateRank !== undefined && (
                        <span className="text-[10px] text-gray-400">Candidate #{build.candidateRank}</span>
                    )}
                    <span className="text-xs text-gray-400">{build.totalParts} bricks · {layerCount} steps</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 rounded p-2 text-center">
                    <Eye className="w-4 h-4 mx-auto text-blue-500 mb-0.5" />
                    <div className="font-bold">{build.estimatedFidelityScore}</div>
                    <div className="text-gray-500">{fidelityLabel}</div>
                </div>
                <div className="bg-gray-50 rounded p-2 text-center">
                    <Shield className="w-4 h-4 mx-auto text-green-500 mb-0.5" />
                    <div className="font-bold">{build.estimatedRigidityScore}</div>
                    <div className="text-gray-500">{rigidityLabel}</div>
                </div>
            </div>

            {build.diagnostics && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-gray-100 bg-gray-50 p-2 text-[11px]">
                    <span className="text-gray-500">Semantic approximation</span>
                    <span className="text-right font-semibold">
                        {build.diagnostics.semanticApproximation === null
                            ? 'n/a'
                            : `${build.diagnostics.semanticApproximation}%`}
                    </span>
                    <span className="text-gray-500">Stability</span>
                    <span className="text-right font-semibold">{build.diagnostics.stability}%</span>
                    <span className="text-gray-500">Prefix stability</span>
                    <span className="text-right font-semibold">{build.diagnostics.prefixStability}%</span>
                    <span className="text-gray-500">Inventory used</span>
                    <span className="text-right font-semibold">{build.diagnostics.inventoryUse}%</span>
                </div>
            )}

            {build.warnings && build.warnings.length > 0 && (
                <div className="rounded-lg bg-orange-50 px-2.5 py-2 text-[11px] text-orange-800">
                    {build.warnings.map((warning) => <p key={warning}>• {warning}</p>)}
                </div>
            )}

            <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-blue-600 flex items-center gap-1 hover:underline"
            >
                <ChevronRight className={clsx('w-3 h-3 transition-transform', expanded && 'rotate-90')} />
                {expanded ? 'Hide' : 'Show'} build steps ({layerCount})
            </button>

            {expanded && (
                <ol className="text-xs space-y-1 max-h-60 overflow-y-auto border border-gray-100 rounded p-2 bg-gray-50">
                    {groupedSteps.map(({ stepNum, parts }) => (
                        <li key={stepNum} className="flex gap-2 py-0.5 border-b border-gray-100 last:border-0">
                            <span className="text-gray-400 w-5 shrink-0 text-right">{stepNum}.</span>
                            <span className="flex-1">
                                {build.assemblySteps?.find((step) => step.number === stepNum)?.title
                                    ?? parts[0]?.description
                                    ?? 'Add next layer'}
                            </span>
                            <span className="text-gray-400 shrink-0">{parts.length} bricks</span>
                        </li>
                    ))}
                </ol>
            )}

            <button onClick={() => setViewer(true)}
                className="w-full py-2 bg-yellow-400 text-black font-bold rounded-lg text-sm">
                Open instruction viewer
            </button>
            {build.sources && build.sources.length > 0 && (
                <p className="text-[10px] text-gray-500">
                    Semantic references: {build.sources.map((source) =>
                        `${source.id} (${source.license.id})`,
                    ).join(', ')}
                </p>
            )}
            <p className="text-[10px] text-gray-400">
                Brief: {build.briefSource === 'openrouter'
                    ? 'schema-validated AI interpretation'
                    : build.briefSource === 'deterministic-fallback'
                        ? 'deterministic interpretation'
                        : 'legacy build (interpretation source unavailable)'}
            </p>
            <p className="text-[10px] text-gray-300">Generated {new Date(build.generatedAt).toLocaleString()}</p>
            {viewer && (
                <InstructionViewer
                    name={build.name}
                    steps={placed}
                    ldrawText={build.ldrawText}
                    diagnostics={build.diagnostics}
                    warnings={build.warnings}
                    sources={build.sources}
                    assemblySteps={build.assemblySteps}
                    inspiration={build.inspiration}
                    onClose={() => setViewer(false)}
                />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ResultsPage() {
    const {
        sets, mocs, smartMatches, aiBuilds, aiPrompt, crossMixes,
        age, fidelityWeight, selectedSetIds, setInventories, matchRules, smartSources,
        findBuilds, findSmartBuilds, generateAIBuilds, findCrossMixes,
        setAIMode, setAIPrompt, setAge, setFidelityWeight, setMatchRules, setSmartSources,
        isLoading, isAILoading, aiGenerationPhase, error,
    } = useGarageStore();

    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'strict' | 'smart' | 'ai' | 'cross'>('strict');
    const [isHydrated, setIsHydrated] = useState(false);
    const [minMatch, setMinMatch] = useState(30);
    const [sortBy, setSortBy] = useState<'composite' | 'percentage' | 'parts' | 'novelty'>('composite');
    const [crossScaleGate, setCrossScaleGate] = useState(false);
    const [crossScaleOk, setCrossScaleOk] = useState(false);
    const [smartQuery, setSmartQuery] = useState<string | undefined>();

    useEffect(() => {
        void Promise.resolve(useGarageStore.persist.rehydrate()).then(() => setIsHydrated(true));
    }, []);

    useEffect(() => {
        if (!isHydrated) return;
        const mixed = selectionHasMixedScales(sets, selectedSetIds, setInventories);
        if (mixed && sessionStorage.getItem(CROSS_SCALE_ACK_KEY) !== '1') {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCrossScaleGate(true);
            setCrossScaleOk(false);
            return;
        }
        setCrossScaleOk(true);
    }, [isHydrated, sets, selectedSetIds, setInventories]);

    useEffect(() => {
        if (isHydrated && crossScaleOk && sets.length > 0 && mocs.length === 0) findBuilds();
    }, [isHydrated, crossScaleOk, sets.length, mocs.length, findBuilds]);

    const handleRefresh = () => {
        if (activeTab === 'strict') findBuilds(smartQuery);
        else if (activeTab === 'smart') findSmartBuilds(smartQuery);
    };

    const handleSuggestionSearch = (query: string) => {
        setSmartQuery(query);
        if (activeTab === 'smart') {
            findSmartBuilds(query);
        } else {
            setActiveTab('strict');
            findBuilds(query);
        }
    };

    const filteredSmartMatches = smartMatches
        .filter((m) => {
            if ((m.matchResult?.compositeScore ?? 0) < minMatch) return false;
            if (m.source === 'official' && smartSources?.official === false) return false;
            if (m.source === 'rebrickable' && smartSources?.rebrickable === false) return false;
            return true;
        })
        .sort((a, b) => {
            if (sortBy === 'composite')   return (b.matchResult?.compositeScore  ?? 0) - (a.matchResult?.compositeScore  ?? 0);
            if (sortBy === 'percentage')  return (b.matchResult?.percentage      ?? 0) - (a.matchResult?.percentage      ?? 0);
            if (sortBy === 'novelty') {
                const nb = (b.noveltyScore ?? 0) * 0.6 + (b.matchResult?.compositeScore ?? 0) * 0.4;
                const na = (a.noveltyScore ?? 0) * 0.6 + (a.matchResult?.compositeScore ?? 0) * 0.4;
                return nb - na;
            }
            return b.num_parts - a.num_parts;
        });

    if (!isHydrated) return null;

    const advancedLabels = usesAdvancedScoreLabels(age);

    return (
        <main className="min-h-screen bg-gray-50 p-8">
            <CrossScaleMixDialog
                open={crossScaleGate}
                onCancel={() => router.push('/')}
                onContinue={() => {
                    sessionStorage.setItem(CROSS_SCALE_ACK_KEY, '1');
                    setCrossScaleGate(false);
                    setCrossScaleOk(true);
                }}
            />
            <div className="max-w-7xl mx-auto">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <Link href="/" className="inline-flex items-center text-gray-500 hover:text-gray-900 mb-2">
                            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Garage
                        </Link>
                        <h1 className="text-3xl font-bold text-gray-900">Possible Builds</h1>
                        <p className="text-gray-600 mt-1">
                            {activeTab === 'ai'
                                ? `${aiBuilds.length} AI-generated build${aiBuilds.length !== 1 ? 's' : ''}`
                                : `${activeTab === 'strict' ? mocs.length : filteredSmartMatches.length} builds from your collection.`}
                        </p>
                    </div>
                    {activeTab !== 'ai' && (
                        <button onClick={handleRefresh} disabled={isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 font-medium">
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Refresh
                        </button>
                    )}
                </div>

                {/* Age + fidelity/rigidity controls */}
                <div className="bg-white border border-gray-100 rounded-xl p-4 mb-6 space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Builder profile</p>
                    <div className="space-y-2">
                        <div className="flex items-center gap-3 text-sm">
                            <span className="flex items-center gap-1 text-gray-500 w-28 shrink-0">
                                <User className="w-3.5 h-3.5" />Age
                            </span>
                            <input
                                type="range"
                                min={0}
                                max={AGE_BANDS.length - 1}
                                step={1}
                                value={ageBandIndex(age)}
                                onChange={(e) => setAge(AGE_BANDS[Number(e.target.value)].age)}
                                className="flex-1 accent-yellow-500 h-1.5"
                            />
                            <span className="w-14 text-right font-semibold text-gray-700 shrink-0">
                                {AGE_BANDS[ageBandIndex(age)].label}
                            </span>
                        </div>
                        <div className="flex justify-between text-[10px] text-gray-400 pl-28 pr-14">
                            {AGE_BANDS.map((b) => (
                                <button
                                    key={b.id}
                                    type="button"
                                    onClick={() => setAge(b.age)}
                                    className={ageBandIndex(age) === AGE_BANDS.findIndex((x) => x.id === b.id)
                                        ? 'text-yellow-700 font-bold'
                                        : 'hover:text-gray-600'}
                                >
                                    {b.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <SliderRow
                        label={advancedLabels ? 'Fidelity' : 'Looks'}
                        min={0} max={1} step={0.05} value={fidelityWeight}
                        icon={<Eye className="w-3.5 h-3.5" />}
                        onChange={setFidelityWeight}
                        format={(v) => {
                            if (advancedLabels) {
                                return v < 0.35 ? 'Rigidity' : v < 0.65 ? 'Balanced' : 'Fidelity';
                            }
                            return v < 0.35 ? 'Sturdy' : v < 0.65 ? 'Balanced' : 'Looks right';
                        }}
                    />
                    <p className="text-[11px] text-gray-400">
                        {advancedLabels
                            ? (fidelityWeight < 0.35
                                ? 'Rigidity prioritised — favour substitutions that stay structurally sound.'
                                : fidelityWeight < 0.65
                                    ? 'Balanced fidelity and rigidity.'
                                    : 'Fidelity prioritised — favour looks even if some swaps are less rigid.')
                            : (fidelityWeight < 0.35
                                ? 'Prefer sturdy builds that won’t wobble — great for younger builders.'
                                : fidelityWeight < 0.65
                                    ? 'Balanced: looks decent and holds together.'
                                    : 'Prefer builds that look just like the picture (may use wobblier swaps).')}
                    </p>
                </div>

                {/* 3D Drop Zone */}
                <div className="mb-6"><ModelViewerZone /></div>

                {/* Suggestion bar */}
                <div className="mb-6">
                    <SuggestionBar onSearch={handleSuggestionSearch} isLoading={isLoading} />
                </div>

                {/* Tab bar */}
                <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center border-b border-gray-200 mb-6">
                    <div className="flex gap-4">
                        {([
                            { id: 'strict', label: 'Standard Alternates', icon: <Layers className="w-4 h-4" /> },
                            { id: 'smart',  label: 'Smart Mix',           icon: <Sparkles className="w-4 h-4" /> },
                            { id: 'cross',  label: 'Cross Mix',           icon: <Layers className="w-4 h-4" /> },
                            { id: 'ai',     label: 'AI Builds',           icon: <Bot className="w-4 h-4" /> },
                        ] as const).map(({ id, label, icon }) => (
                            <button key={id}
                                onClick={() => {
                                    setActiveTab(id);
                                    if (id === 'strict') findBuilds(smartQuery);
                                    if (id === 'smart') findSmartBuilds(smartQuery);
                                    if (id === 'cross') findCrossMixes();
                                    if (id === 'ai') setAIMode(true);
                                    else setAIMode(false);
                                }}
                                className={clsx(
                                    'pb-4 px-2 flex items-center gap-2 font-medium transition-colors relative text-sm',
                                    activeTab === id ? 'text-yellow-600' : 'text-gray-500 hover:text-gray-700'
                                )}
                            >
                                {icon}{label}
                                {activeTab === id && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-yellow-500" />}
                            </button>
                        ))}
                    </div>

                    {/* Filters (Smart Mix only) */}
                    {activeTab === 'smart' && (
                        <div className="flex flex-col items-stretch sm:items-end gap-2 pb-3 text-sm w-full sm:w-auto">
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSmartSources({ official: !smartSources.official });
                                        findSmartBuilds(smartQuery);
                                    }}
                                    className={clsx(
                                        'text-xs px-2.5 py-1.5 rounded-md border font-medium transition-colors',
                                        smartSources.official
                                            ? 'bg-yellow-400 border-yellow-500 text-black'
                                            : 'bg-white border-gray-300 text-gray-800 hover:bg-gray-50',
                                    )}
                                >
                                    Official LEGO
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSmartSources({ rebrickable: !smartSources.rebrickable });
                                        findSmartBuilds(smartQuery);
                                    }}
                                    className={clsx(
                                        'text-xs px-2.5 py-1.5 rounded-md border font-medium transition-colors',
                                        smartSources.rebrickable
                                            ? 'bg-yellow-400 border-yellow-500 text-black'
                                            : 'bg-white border-gray-300 text-gray-800 hover:bg-gray-50',
                                    )}
                                >
                                    Rebrickable MOCs
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-700">
                                <label className="inline-flex items-center gap-1.5 cursor-default opacity-80" title="Always on">
                                    <input type="checkbox" checked readOnly className="accent-yellow-500" />
                                    Match bricks exactly
                                </label>
                                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="accent-yellow-500"
                                        checked={matchRules.ignoreColor}
                                        onChange={(e) => {
                                            setMatchRules({ ignoreColor: e.target.checked });
                                            findSmartBuilds(smartQuery);
                                        }}
                                    />
                                    Same shape, ignore colour
                                </label>
                                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="accent-yellow-500"
                                        checked={matchRules.allowSubstitution}
                                        onChange={(e) => {
                                            setMatchRules({ allowSubstitution: e.target.checked });
                                            findSmartBuilds(smartQuery);
                                        }}
                                    />
                                    Allow brick swaps (2×6 = two 2×3s)
                                </label>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-gray-700">Min score:</span>
                                    <select value={minMatch} onChange={(e) => setMinMatch(Number(e.target.value))}
                                        className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-900">
                                        {[0, 30, 50, 70, 90].map((v) => (
                                            <option key={v} value={v}>{v}+</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-gray-700">Sort:</span>
                                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                                        className="bg-white border border-gray-300 rounded px-2 py-1 text-gray-900">
                                        <option value="composite">Best overall</option>
                                        <option value="percentage">Coverage %</option>
                                        <option value="parts">Part count</option>
                                        <option value="novelty">Best to buy (novelty)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <p className="text-sm text-gray-600 mb-6 -mt-2 max-w-3xl">
                    {activeTab === 'strict' && (
                        <>Community <span className="font-semibold text-gray-800">alternate builds</span> for your selected sets on Rebrickable. {smartQuery && <>Showing only designs semantically related to “{smartQuery}”.</>}</>
                    )}
                    {activeTab === 'smart' && (
                        <>Search <span className="font-semibold text-gray-800">Official LEGO</span> sets and/or <span className="font-semibold text-gray-800">Rebrickable</span> community alternates. The same semantic filter {smartQuery ? <>for “{smartQuery}”</> : null} is applied to both sources before brick matching.</>
                    )}
                    {activeTab === 'cross' && (
                        <>Useful combos of <span className="font-semibold text-gray-800">2–3 sets you already own</span> — which piles to dump together for the strongest mixed bin, then run Smart Mix on that combo.</>
                    )}
                    {activeTab === 'ai' && (
                        <>Describe a build; we plan a <span className="font-semibold text-gray-800">new model from only your garage bricks</span>, with step instructions and a 3D viewer — not a Rebrickable link-out.</>
                    )}
                </p>

                {error && <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 text-sm">{error}</div>}

                {/* ── Standard alternates ── */}
                {activeTab === 'strict' && (
                    isLoading
                        ? <Spinner text="Searching the Lego archives…" />
                        : mocs.length > 0
                            ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {mocs.map((m) => <MocCard key={m.set_num} moc={m} />)}
                              </div>
                            : <EmptyState label="No alternates found." hint="Try adding more sets to your garage." />
                )}

                {/* ── Smart Mix ── */}
                {activeTab === 'smart' && (
                    isLoading
                        ? <Spinner text="Matching your bricks…" />
                        : filteredSmartMatches.length > 0
                            ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {filteredSmartMatches.map((m) => <SmartSetCard key={`${m.source ?? 'x'}-${m.set_num}`} set={m} />)}
                              </div>
                            : <EmptyState
                                label="No matches at current score threshold."
                                hint="Lower the minimum score or add more sets."
                                action={{ label: 'Refresh Smart Mix', onClick: () => findSmartBuilds(smartQuery) }}
                              />
                )}

                {/* ── Cross Mix ── */}
                {activeTab === 'cross' && (
                    <div className="space-y-4">
                        <button onClick={findCrossMixes}
                            className="px-4 py-2 bg-yellow-400 text-black font-bold rounded-lg text-sm">
                            Recompute cross-mixes
                        </button>
                        {crossMixes.length === 0 ? (
                            <EmptyState label="No cross-mixes yet." hint="Select 2+ sets in the garage, then recompute." />
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {crossMixes.map((c) => (
                                    <div key={c.comboSetNums.join('+')} className="bg-white border border-gray-100 rounded-xl p-4">
                                        <h3 className="font-bold text-sm text-gray-900">{c.label}</h3>
                                        <p className="text-xs text-gray-500 mt-1">{c.masterPartCount} parts in combined bin</p>
                                        <p className="text-xs text-gray-400 mt-1">Sets: {c.comboSetNums.join(', ')}</p>
                                        <button
                                            className="mt-3 text-xs font-semibold text-yellow-700 hover:underline"
                                            onClick={() => {
                                                setActiveTab('smart');
                                                findSmartBuilds(smartQuery);
                                            }}
                                        >
                                            Run Smart Mix on this combo →
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── AI Builds ── */}
                {activeTab === 'ai' && (
                    <div className="space-y-6">
                        {/* AI prompt */}
                        <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-3">
                            <p className="text-sm font-semibold text-gray-700">Describe what you want to build</p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="e.g. a red racing car, a small castle, a helicopter…"
                                    value={aiPrompt}
                                    onChange={(e) => setAIPrompt(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !isAILoading) generateAIBuilds(); }}
                                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                />
                                <button
                                    onClick={generateAIBuilds}
                                    disabled={isAILoading || !aiPrompt.trim()}
                                    className="px-5 py-2 bg-yellow-400 text-black font-black rounded-lg border-b-4 border-yellow-600 hover:bg-yellow-500 active:border-b-0 active:translate-y-0.5 disabled:opacity-50 flex items-center gap-2 text-sm"
                                >
                                    {isAILoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                    Generate
                                </button>
                            </div>
                            <p className="text-xs text-gray-400">
                                One semantic brief is interpreted, then up to three original candidates are
                                planned locally using only your garage inventory.
                            </p>
                        </div>

                        {isAILoading && (
                            <Spinner text={{
                                'preparing-inventory': 'Preparing selected garage inventory…',
                                'interpreting-and-planning': 'Interpreting the request and planning local candidates…',
                                'saving-candidates': 'Saving generated candidates…',
                                idle: 'Starting generation…',
                            }[aiGenerationPhase]} />
                        )}

                        {!isAILoading && aiBuilds.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                {aiBuilds.map((b) => <AIBuildCard key={b.id} build={b} advancedLabels={advancedLabels} />)}
                            </div>
                        )}

                        {!isAILoading && aiBuilds.length === 0 && (
                            <EmptyState label="No AI builds yet." hint="Type a description above and hit Generate." />
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}

// ---------------------------------------------------------------------------
// Utility components
// ---------------------------------------------------------------------------
function Spinner({ text }: { text: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="w-12 h-12 animate-spin text-yellow-500 mb-4" />
            <p className="text-gray-500">{text}</p>
        </div>
    );
}

function EmptyState({ label, hint, action }: { label: string; hint?: string; action?: { label: string; onClick: () => void } }) {
    return (
        <div className="text-center py-24 bg-white rounded-xl border border-gray-100">
            <p className="text-xl text-gray-400">{label}</p>
            {hint && <p className="text-gray-500 mt-2 mb-6">{hint}</p>}
            {action && (
                <button onClick={action.onClick}
                    className="px-6 py-2 bg-yellow-400 text-black font-black rounded-full hover:bg-yellow-500 transition-colors border-b-4 border-yellow-600 active:border-b-0">
                    {action.label}
                </button>
            )}
        </div>
    );
}
