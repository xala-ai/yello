'use client';

import Image from 'next/image';
import { ExternalLink, PieChart, AlertCircle, BookOpen, Sparkles, Shield, Eye, Layers } from 'lucide-react';
import { LegoSet } from '@/types/rebrickable';
import { TieredMatchResult } from '@/types/rebrickable';
import { useState } from 'react';

interface SmartSetCardProps {
    set: LegoSet & { matchResult?: TieredMatchResult; noveltyScore?: number };
}

// Tier pill colours
const TIER_COLOURS = {
    T1: 'bg-green-100 text-green-800',
    T2: 'bg-yellow-100 text-yellow-800',
    T3: 'bg-orange-100 text-orange-800',
};

function ScoreBar({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
    const pct = Math.max(0, Math.min(100, value));
    const barColor = pct >= 80 ? 'bg-green-400' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400';
    return (
        <div className="space-y-0.5">
            <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="flex items-center gap-1">{icon}{label}</span>
                <span className="font-bold text-gray-700">{pct}</span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export function SmartSetCard({ set }: SmartSetCardProps) {
    const [showMissing, setShowMissing] = useState(false);
    const mr = set.matchResult;
    const matchPct = mr?.percentage ?? 0;
    const composite = mr?.compositeScore ?? matchPct;

    let badgeColor = 'bg-red-100 text-red-700';
    if (composite >= 90) badgeColor = 'bg-green-100 text-green-700';
    else if (composite >= 70) badgeColor = 'bg-yellow-100 text-yellow-700';

    const legoInstrUrl = `https://www.lego.com/service/buildinginstructions/${set.set_num.split('-')[0]}`;

    // Tier breakdown
    const tiers = mr?.tiers;
    const t1 = tiers ? Math.round((tiers.exactCount / tiers.totalNeeded) * 100) : 0;
    const t2 = tiers ? Math.round((tiers.colorSwapCount / tiers.totalNeeded) * 100) : 0;
    const t3 = tiers ? Math.round((tiers.structuralSubCount / tiers.totalNeeded) * 100) : 0;

    return (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-all group flex flex-col h-full relative">
            {/* Composite score badge */}
            <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                <div className={`px-3 py-1 rounded-full text-xs font-black shadow-sm ${badgeColor}`}>
                    {composite} score
                </div>
                {set.noveltyScore !== undefined && set.noveltyScore > 30 && (
                    <div className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 shadow-sm flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> {set.noveltyScore}% new parts
                    </div>
                )}
            </div>

            <div className="relative aspect-video w-full bg-gray-50 overflow-hidden">
                <Image
                    src={set.set_img_url}
                    alt={set.name}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4 gap-2">
                    <a href={legoInstrUrl} target="_blank" rel="noopener noreferrer"
                        className="flex-1 bg-white/90 hover:bg-white text-gray-900 font-black text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-2">
                        <BookOpen className="w-4 h-4" /> Instructions
                    </a>
                    <a href={set.set_url} target="_blank" rel="noopener noreferrer"
                        className="bg-white/90 hover:bg-white text-gray-900 text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-2">
                        <ExternalLink className="w-4 h-4" />
                    </a>
                </div>
            </div>

            <div className="p-4 flex flex-col flex-1 gap-3">
                <h3 className="font-bold text-gray-900 line-clamp-2 text-sm" title={set.name}>{set.name}</h3>

                {/* Tier breakdown pills */}
                {tiers && tiers.totalNeeded > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {t1 > 0 && <span className={`px-2 py-0.5 rounded text-xs font-semibold ${TIER_COLOURS.T1}`}>T1 exact {t1}%</span>}
                        {t2 > 0 && <span className={`px-2 py-0.5 rounded text-xs font-semibold ${TIER_COLOURS.T2}`}>T2 color {t2}%</span>}
                        {t3 > 0 && <span className={`px-2 py-0.5 rounded text-xs font-semibold ${TIER_COLOURS.T3}`}>T3 sub {t3}%</span>}
                    </div>
                )}

                {/* Fidelity / rigidity score bars */}
                {mr && (
                    <div className="space-y-1.5">
                        <ScoreBar label="Fidelity"  value={mr.fidelityScore}  icon={<Eye className="w-3 h-3" />} />
                        <ScoreBar label="Rigidity"  value={mr.rigidityScore}  icon={<Shield className="w-3 h-3" />} />
                    </div>
                )}

                <div className="mt-auto space-y-2 text-xs text-gray-500">
                    <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4" />
                        <span>{mr?.totalPartsOwned ?? '?'} / {mr?.totalPartsNeeded ?? set.num_parts} parts ({matchPct}% coverage)</span>
                    </div>

                    {matchPct < 100 && mr && (
                        <button
                            onClick={() => setShowMissing(!showMissing)}
                            className="text-blue-600 text-xs font-medium flex items-center gap-1 hover:underline"
                        >
                            <AlertCircle className="w-3 h-3" />
                            {showMissing ? 'Hide' : 'Show'} missing ({mr.missing.length})
                            {mr.structuralSubs.length > 0 && ` + ${mr.structuralSubs.length} subs`}
                        </button>
                    )}

                    {showMissing && mr && (
                        <div className="mt-1 p-2 bg-gray-50 rounded text-xs max-h-40 overflow-y-auto border border-gray-100 space-y-2">
                            {mr.colorSwaps.length > 0 && (
                                <div>
                                    <p className="font-bold text-yellow-700 mb-1">Color swaps (T2)</p>
                                    {mr.colorSwaps.map((p, i) => (
                                        <div key={`swap-${i}`} className="flex justify-between py-0.5 border-b border-gray-100 last:border-0">
                                            <span className="truncate flex-1">{p.part.name}</span>
                                            <span className="font-bold ml-2">×{p.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {mr.structuralSubs.length > 0 && (
                                <div>
                                    <p className="font-bold text-orange-700 mb-1">Structural subs (T3)</p>
                                    {mr.structuralSubs.map((s, i) => (
                                        <div key={`sub-${i}`} className="py-0.5 border-b border-gray-100 last:border-0">
                                            <span className="truncate block">{s.required.part.name} ×{s.required.quantity}</span>
                                            <span className="text-gray-400 text-[10px]">rigidity penalty: {Math.round(s.rigidityPenalty * 100)}%</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {mr.missing.length > 0 && (
                                <div>
                                    <p className="font-bold text-red-700 mb-1">Truly missing</p>
                                    {mr.missing.map((p, i) => (
                                        <div key={`miss-${i}`} className="flex justify-between py-0.5 border-b border-gray-100 last:border-0">
                                            <span className="truncate flex-1">{p.part.name} ({p.color.name})</span>
                                            <span className="font-bold ml-2">×{p.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
