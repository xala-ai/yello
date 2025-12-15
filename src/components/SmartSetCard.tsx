'use client';

import Image from 'next/image';
import { ExternalLink, PieChart, AlertCircle, BookOpen } from 'lucide-react';
import { LegoSet, InventoryPart } from '@/types/rebrickable';
import { MatchResult } from '@/lib/inventory';
import { useState } from 'react';

interface SmartSetCardProps {
  set: LegoSet & { matchResult?: MatchResult };
}

export function SmartSetCard({ set }: SmartSetCardProps) {
  const [showMissing, setShowMissing] = useState(false);
  const matchPct = set.matchResult?.percentage || 0;

  let badgeColor = 'bg-red-100 text-red-700';
  if (matchPct >= 95) badgeColor = 'bg-green-100 text-green-700';
  else if (matchPct >= 80) badgeColor = 'bg-yellow-100 text-yellow-700';

  // LEGO instructions are typically available via https://www.lego.com/service/buildinginstructions/{setNumNoDash}
  const legoInstrUrl = `https://www.lego.com/service/buildinginstructions/${set.set_num.split('-')[0]}`;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-all group flex flex-col h-full relative">
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
        <div className={`px-3 py-1 rounded-full text-xs font-black shadow-sm ${badgeColor}`}>
          {matchPct}% Match
        </div>
      </div>

      <div className="relative aspect-video w-full bg-gray-50 overflow-hidden">
        <Image
          src={set.set_img_url}
          alt={set.name}
          fill
          className="object-cover transition-transform group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4 gap-2">
          <a
            href={legoInstrUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-white/90 hover:bg-white text-gray-900 font-black text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <BookOpen className="w-4 h-4" /> Instructions
          </a>
          <a
            href={set.set_url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white/90 hover:bg-white text-gray-900 font-black text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-bold text-gray-900 line-clamp-2 mb-2" title={set.name}>{set.name}</h3>

        <div className="mt-auto space-y-2 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4" />
            <span>{set.matchResult?.totalPartsOwned} / {set.matchResult?.totalPartsNeeded} parts</span>
          </div>

          {matchPct < 100 && (
            <button
              onClick={() => setShowMissing(!showMissing)}
              className="text-blue-600 text-xs font-medium flex items-center gap-1 hover:underline mt-2"
            >
              <AlertCircle className="w-3 h-3" />
              {showMissing ? 'Hide' : 'Show'} Missing Parts ({set.matchResult?.missing.length})
            </button>
          )}

          {showMissing && set.matchResult && (
            <div className="mt-2 p-2 bg-gray-50 rounded text-xs max-h-32 overflow-y-auto border border-gray-100">
              {set.matchResult.missing.map((p, i) => (
                <div key={i} className="flex justify-between py-1 border-b border-gray-100 last:border-0">
                  <span className="truncate flex-1" title={p.part.name}>{p.part.name} ({p.color.name})</span>
                  <span className="font-bold text-gray-700 ml-2">x{p.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


