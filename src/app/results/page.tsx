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

function AIBuildCard({ build }: { build: import('@/store/garage').AIBuild }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h3 className="font-bold text-gray-900">{build.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{build.description}</p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded font-semibold">AI</span>
                    <span className="text-xs text-gray-400">{build.totalParts} steps</span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 rounded p-2 text-center">
                    <Eye className="w-4 h-4 mx-auto text-blue-500 mb-0.5" />
                    <div className="font-bold">{build.estimatedFidelityScore}</div>
                    <div className="text-gray-500">Fidelity</div>
                </div>
                <div className="bg-gray-50 rounded p-2 text-center">
                    <Shield className="w-4 h-4 mx-auto text-green-500 mb-0.5" />
                    <div className="font-bold">{build.estimatedRigidityScore}</div>
                    <div className="text-gray-500">Rigidity</div>
                </div>
            </div>

            <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-blue-600 flex items-center gap-1 hover:underline"
            >
                <ChevronRight className={clsx('w-3 h-3 transition-transform', expanded && 'rotate-90')} />
                {expanded ? 'Hide' : 'Show'} build steps ({build.steps.length})
            </button>

            {expanded && (
                <ol className="text-xs space-y-1 max-h-60 overflow-y-auto border border-gray-100 rounded p-2 bg-gray-50">
                    {build.steps.map((step) => (
                        <li key={step.stepNum} className="flex gap-2 py-0.5 border-b border-gray-100 last:border-0">
                            <span className="text-gray-400 w-5 shrink-0 text-right">{step.stepNum}.</span>
                            <span className="flex-1">{step.description}</span>
                            <span className="text-gray-400 shrink-0">{step.colorName}</span>
                        </li>
                    ))}
                </ol>
            )}

            <p className="text-[10px] text-gray-300">Generated {new Date(build.generatedAt).toLocaleString()}</p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ResultsPage() {
    const {
        sets, mocs, smartMatches, aiBuilds, aiMode, aiPrompt,
        age, fidelityWeight,
        findBuilds, findSmartBuilds, generateAIBuilds,
        setAIMode, setAIPrompt, setAge, setFidelityWeight,
        isLoading, isAILoading, error,
    } = useGarageStore();

    const [activeTab, setActiveTab] = useState<'strict' | 'smart' | 'ai'>('strict');
    const [isHydrated, setIsHydrated] = useState(false);
    const [minMatch, setMinMatch] = useState(0);
    const [sortBy, setSortBy] = useState<'composite' | 'percentage' | 'parts'>('composite');

    useEffect(() => { useGarageStore.persist.rehydrate(); setIsHydrated(true); }, []);

    useEffect(() => {
        if (isHydrated && sets.length > 0 && mocs.length === 0) findBuilds();
    }, [isHydrated, sets.length, mocs.length, findBuilds]);

    const handleRefresh = () => {
        if (activeTab === 'strict') findBuilds();
        else if (activeTab === 'smart') findSmartBuilds();
    };

    const handleSuggestionSearch = (query: string) => {
        setActiveTab('smart');
        findSmartBuilds(query);
    };

    const filteredSmartMatches = smartMatches
        .filter((m) => (m.matchResult?.compositeScore ?? 0) >= minMatch)
        .sort((a, b) => {
            if (sortBy === 'composite')   return (b.matchResult?.compositeScore  ?? 0) - (a.matchResult?.compositeScore  ?? 0);
            if (sortBy === 'percentage')  return (b.matchResult?.percentage      ?? 0) - (a.matchResult?.percentage      ?? 0);
            return b.num_parts - a.num_parts;
        });

    if (!isHydrated) return null;

    return (
        <main className="min-h-screen bg-gray-50 p-8">
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
                    <SliderRow
                        label="Age"
                        min={3} max={80} value={age}
                        icon={<User className="w-3.5 h-3.5" />}
                        onChange={setAge}
                        format={(v) => `${v}y`}
                    />
                    <SliderRow
                        label="Fidelity"
                        min={0} max={1} step={0.05} value={fidelityWeight}
                        icon={<Eye className="w-3.5 h-3.5" />}
                        onChange={setFidelityWeight}
                        format={(v) => v < 0.35 ? 'Rigid' : v < 0.65 ? 'Balanced' : 'Fidelity'}
                    />
                    <p className="text-[11px] text-gray-400">
                        {fidelityWeight < 0.35 ? 'Structural rigidity prioritised — great for young builders.'
                         : fidelityWeight < 0.65 ? 'Balanced: looks decent and holds together.'
                         : 'High fidelity: maximise visual accuracy, some subs may be less rigid.'}
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
                            { id: 'ai',     label: 'AI Builds',           icon: <Bot className="w-4 h-4" /> },
                        ] as const).map(({ id, label, icon }) => (
                            <button key={id}
                                onClick={() => {
                                    setActiveTab(id);
                                    if (id === 'smart' && smartMatches.length === 0) findSmartBuilds();
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
                        <div className="flex flex-wrap items-center gap-3 pb-3 text-sm">
                            <div className="flex items-center gap-1.5">
                                <span className="text-gray-500">Min score:</span>
                                <select value={minMatch} onChange={(e) => setMinMatch(Number(e.target.value))}
                                    className="bg-white border border-gray-200 rounded px-2 py-1 text-gray-700">
                                    {[0, 30, 50, 70, 90].map((v) => (
                                        <option key={v} value={v}>{v}+</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-gray-500">Sort:</span>
                                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                                    className="bg-white border border-gray-200 rounded px-2 py-1 text-gray-700">
                                    <option value="composite">Best overall</option>
                                    <option value="percentage">Coverage %</option>
                                    <option value="parts">Part count</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>

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
                        ? <Spinner text="Crunching parts across all tiers…" />
                        : filteredSmartMatches.length > 0
                            ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {filteredSmartMatches.map((m) => <SmartSetCard key={m.set_num} set={m as any} />)}
                              </div>
                            : <EmptyState
                                label="No matches at current score threshold."
                                hint="Lower the minimum score or add more sets."
                                action={{ label: 'Generate Ideas', onClick: () => findSmartBuilds() }}
                              />
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
                                The AI will design a novel build using only the bricks in your garage,
                                respecting your fidelity / rigidity settings.
                            </p>
                        </div>

                        {isAILoading && <Spinner text="AI is designing your build…" />}

                        {!isAILoading && aiBuilds.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                {aiBuilds.map((b) => <AIBuildCard key={b.id} build={b} />)}
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
