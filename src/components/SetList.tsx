'use client';

import { useGarageStore } from '@/store/garage';
import { Trash2, ExternalLink, CheckCircle, Circle, Brain, Zap, Settings } from 'lucide-react';
import Image from 'next/image';
import clsx from 'clsx';
import { getBrain } from '@/lib/brain-logic';
import { useEffect, useState } from 'react';

export function SetList() {
  const { sets, removeSet, selectedSetIds, toggleSetSelection } = useGarageStore();
  // Force re-render to show brain updates if needed, though store updates usually trigger it.
  // We access the global brain directly for MVP.
  const brain = getBrain();

  if (sets.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">Your garage is empty.</p>
        <p className="text-sm">Add some sets to start building!</p>
      </div>
    );
  }

  return (
    <div className="w-full mt-8">
        <div className="flex items-center justify-between mb-4 px-1">
             <h2 className="text-lg font-bold text-gray-700">Your Sets ({sets.length})</h2>
             <span className="text-sm text-gray-500">
                 {selectedSetIds.length} selected for mixing
             </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {sets.map((set) => {
            const isSelected = selectedSetIds.includes(set.set_num);
            const dna = brain.set_dna[set.set_num];

            return (
                <div
                    key={set.set_num}
                    className={clsx(
                        "rounded-xl shadow-sm border overflow-hidden transition-all group relative cursor-pointer flex flex-col",
                        isSelected ? "border-blue-500 ring-2 ring-blue-100" : "border-gray-100 hover:shadow-md"
                    )}
                    onClick={() => toggleSetSelection(set.set_num)}
                >
                <div className="relative h-48 w-full bg-gray-50 p-4 flex items-center justify-center">
                    {/* Selection Indicator */}
                    <div className="absolute top-2 left-2 z-10 text-blue-600 bg-white rounded-full p-1 shadow-sm">
                        {isSelected ? <CheckCircle className="w-5 h-5 fill-blue-50" /> : <Circle className="w-5 h-5 text-gray-300" />}
                    </div>

                    <div className="relative w-full h-full">
                        <Image
                        src={set.set_img_url}
                        alt={set.name}
                        fill
                        className={clsx("object-contain transition-opacity", !isSelected && "opacity-60 grayscale")}
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        />
                    </div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            removeSet(set.set_num);
                        }}
                        className="absolute top-2 right-2 p-2 bg-white/80 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-colors opacity-0 group-hover:opacity-100 z-10"
                        title="Remove Set"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>

                <div className={clsx("p-4 bg-white flex-1 flex flex-col", !isSelected && "bg-gray-50")}>
                    <div className="flex justify-between items-start gap-2 mb-3">
                        <div>
                            <h3 className={clsx("font-bold line-clamp-1", isSelected ? "text-gray-900" : "text-gray-500")} title={set.name}>{set.name}</h3>
                            <p className="text-sm text-gray-500">{set.set_num} • {set.year} • {set.num_parts} parts</p>
                        </div>
                        <a
                            href={set.set_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-yellow-500"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    </div>

                    {/* Brain DNA Tags */}
                    {dna && (
                        <div className="mt-auto pt-3 border-t border-gray-100">
                            <div className="flex items-center gap-1 text-xs text-yellow-700 font-black mb-2">
                                <Brain className="w-3 h-3" />
                                <span>Brain Analysis</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {dna.tags.map(tag => (
                                    <span key={tag} className="px-2 py-0.5 bg-yellow-50 text-yellow-800 rounded-full text-[10px] font-semibold capitalize border border-yellow-200">
                                        {tag.replace('_', ' ')}
                                    </span>
                                ))}
                                {dna.mechanism_score > 50 && (
                                    <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full text-[10px] font-medium flex items-center gap-1">
                                        <Settings className="w-3 h-3" />
                                        High Mech
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                </div>
            );
        })}
        </div>
    </div>
  );
}
