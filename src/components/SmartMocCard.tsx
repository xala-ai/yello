import { Moc } from '@/types/rebrickable';
import { ExternalLink, User, Calendar, PieChart, AlertCircle, Box, FileText } from 'lucide-react';
import Image from 'next/image';
import { MatchResult } from '@/lib/inventory';
import { useState } from 'react';
import { LegoViewer } from './LegoViewer';

interface SmartMocCardProps {
    moc: Moc & { matchResult?: MatchResult };
}

export function SmartMocCard({ moc }: SmartMocCardProps) {
    const [showMissing, setShowMissing] = useState(false);
    const [view3D, setView3D] = useState(false);
    // For MVP, we try to guess the official model file from OMR for official sets,
    // or use a proxy for MOCs if we had one.
    // Since we can't easily get MOC files without auth, we will only show "3D" button
    // if we implement a library or if the user drops a file.
    // BUT, user asked "YOU look up the build steps".
    // To act "smart", we can check if this set exists in our public LDraw library?
    // Unlikely for MOCs.

    const matchPct = moc.matchResult?.percentage || 0;

    let badgeColor = 'bg-red-100 text-red-700';
    if (matchPct >= 95) badgeColor = 'bg-green-100 text-green-700';
    else if (matchPct >= 80) badgeColor = 'bg-yellow-100 text-yellow-700';

    return (
        <>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-all group flex flex-col h-full relative">
            {/* Match Badge */}
            <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                <div className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${badgeColor}`}>
                    {matchPct}% Match
                </div>
            </div>

            <div className="relative aspect-video w-full bg-gray-50 overflow-hidden">
                <Image
                    src={moc.moc_img_url}
                    alt={moc.name}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4 gap-2">
                     <a
                        href={moc.moc_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 bg-white/90 hover:bg-white text-gray-900 font-bold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                        <FileText className="w-4 h-4" /> Instructions
                    </a>
                </div>
            </div>

            <div className="p-4 flex flex-col flex-1">
                <h3 className="font-bold text-gray-900 line-clamp-2 mb-2" title={moc.name}>{moc.name}</h3>

                <div className="mt-auto space-y-2 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span className="truncate">By {moc.designer_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <PieChart className="w-4 h-4" />
                        <span>{moc.matchResult?.totalPartsOwned} / {moc.matchResult?.totalPartsNeeded} parts</span>
                    </div>

                    {matchPct < 100 && (
                         <button
                            onClick={() => setShowMissing(!showMissing)}
                            className="text-blue-600 text-xs font-medium flex items-center gap-1 hover:underline mt-2"
                         >
                            <AlertCircle className="w-3 h-3" />
                            {showMissing ? 'Hide' : 'Show'} Missing Parts ({moc.matchResult?.missing.length})
                         </button>
                    )}

                    {showMissing && moc.matchResult && (
                        <div className="mt-2 p-2 bg-gray-50 rounded text-xs max-h-32 overflow-y-auto border border-gray-100">
                            {/* Show Color Swaps first (Positive) */}
                            {moc.matchResult.colorSwaps && moc.matchResult.colorSwaps.length > 0 && (
                                <div className="mb-2 pb-2 border-b border-gray-200">
                                    <p className="font-bold text-orange-600 mb-1">Color Swaps (Have Shape)</p>
                                    {moc.matchResult.colorSwaps.map((p, i) => (
                                        <div key={`swap-${i}`} className="flex justify-between py-1 border-b border-gray-100 last:border-0">
                                            <span className="truncate flex-1" title={p.part.name}>{p.part.name}</span>
                                            <span className="font-bold text-gray-700 ml-2">x{p.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {moc.matchResult.missing.length > 0 && (
                                <div>
                                    <p className="font-bold text-red-600 mb-1">Missing Parts</p>
                                    {moc.matchResult.missing.map((p, i) => (
                                        <div key={`miss-${i}`} className="flex justify-between py-1 border-b border-gray-100 last:border-0">
                                            <span className="truncate flex-1" title={p.part.name}>{p.part.name} ({p.color.name})</span>
                                            <span className="font-bold text-gray-700 ml-2">x{p.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>

        {view3D && (
            <LegoViewer
                fileUrl={`https://www.ldraw.org/library/omr/${moc.set_num}.mpd`} // Hypothetical OMR Link
                onClose={() => setView3D(false)}
            />
        )}
        </>
    );
}
