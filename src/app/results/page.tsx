'use client';

import { useEffect, useState } from 'react';
import { useGarageStore } from '@/store/garage';
import { MocCard } from '@/components/MocCard';
import { SmartMocCard } from '@/components/SmartMocCard';
import { SmartSetCard } from '@/components/SmartSetCard';
import Link from 'next/link';
import { ArrowLeft, Loader2, RefreshCw, Sparkles, Layers, Filter, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

import { SuggestionBar } from '@/components/SuggestionBar';
import { ModelViewerZone } from '@/components/ModelViewerZone';

export default function ResultsPage() {
  const { sets, mocs, smartMatches, findBuilds, findSmartBuilds, isLoading, error } = useGarageStore();
  const [activeTab, setActiveTab] = useState<'strict' | 'smart'>('strict');
  const [isHydrated, setIsHydrated] = useState(false);

  // Filters
  const [minMatch, setMinMatch] = useState(0); // DEBUG: Show everything
  const [freeOnly, setFreeOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'percentage' | 'parts'>('percentage');

  useEffect(() => {
    useGarageStore.persist.rehydrate();
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (isHydrated && sets.length > 0 && mocs.length === 0) {
        findBuilds();
    }
  }, [isHydrated, sets.length, mocs.length, findBuilds]);

  const handleRefresh = () => {
      if (activeTab === 'strict') findBuilds();
      else findSmartBuilds();
  };

  const handleSuggestionSearch = (query: string) => {
      setActiveTab('smart'); // Switch to smart tab
      findSmartBuilds(query); // Trigger search
  };

  // Sort and Filter Logic
  const filteredSmartMatches = smartMatches
    .filter(m => (m.matchResult?.percentage || 0) >= minMatch)
    .filter(m => freeOnly ? !m.is_premium : true)
    .sort((a, b) => {
        if (sortBy === 'percentage') {
            return (b.matchResult?.percentage || 0) - (a.matchResult?.percentage || 0);
        } else {
            return b.num_parts - a.num_parts;
        }
    });

  const sortedMocs = [...mocs]
    .filter(m => freeOnly ? !m.is_premium : true)
    .sort((a, b) => b.num_parts - a.num_parts);

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
                <h1 className="text-3xl font-bold text-gray-900">
                    Possible Builds
                </h1>
                <p className="text-gray-600">
                    Found {activeTab === 'strict' ? mocs.length : filteredSmartMatches.length} builds from your collection.
                </p>
            </div>

            <div className="flex gap-2">
                 <button
                    onClick={() => handleRefresh()}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 font-medium transition-colors"
                >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Refresh
                </button>
            </div>
        </div>

        {/* 3D Viewer Drop Zone */}
        <div className="mb-8">
            <ModelViewerZone />
        </div>

        {/* Tabs & Filters */}
        <div className="mb-6">
             <SuggestionBar onSearch={handleSuggestionSearch} isLoading={isLoading} />
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center border-b border-gray-200 mb-8">
            <div className="flex gap-4">
                <button
                    onClick={() => setActiveTab('strict')}
                    className={clsx(
                        "pb-4 px-2 flex items-center gap-2 font-medium transition-colors relative",
                        activeTab === 'strict' ? "text-blue-600" : "text-gray-500 hover:text-gray-700"
                    )}
                >
                    <Layers className="w-4 h-4" />
                    Standard Alternates
                    {activeTab === 'strict' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600" />
                    )}
                </button>
                <button
                    onClick={() => {
                        setActiveTab('smart');
                        if (smartMatches.length === 0) findSmartBuilds();
                    }}
                    className={clsx(
                        "pb-4 px-2 flex items-center gap-2 font-medium transition-colors relative",
                        activeTab === 'smart' ? "text-yellow-600" : "text-gray-500 hover:text-gray-700"
                    )}
                >
                    <Sparkles className="w-4 h-4" />
                    Smart Mix (Beta)
                    {activeTab === 'smart' && (
                        <div className="absolute bottom-0 left-0 w-full h-0.5 bg-yellow-500" />
                    )}
                </button>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-wrap items-center gap-4 pb-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer bg-white border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50 select-none">
                    <input
                        type="checkbox"
                        checked={freeOnly}
                        onChange={(e) => setFreeOnly(e.target.checked)}
                        className="w-4 h-4 text-yellow-500 rounded focus:ring-yellow-400"
                    />
                    <span className="text-gray-700 font-medium">Free Only</span>
                </label>

                {activeTab === 'smart' && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">Min Match:</span>
                        <select
                            value={minMatch}
                            onChange={(e) => setMinMatch(Number(e.target.value))}
                            className="bg-white border border-gray-200 rounded-md px-2 py-1 text-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                        >
                            <option value={90}>90%+</option>
                            <option value={80}>80%+</option>
                            <option value={50}>50%+</option>
                            <option value={30}>30%+</option>
                            <option value={10}>10%+</option>
                        </select>
                    </div>
                )}

                <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">Sort by:</span>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="bg-white border border-gray-200 rounded-md px-2 py-1 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="percentage">Best Match</option>
                        <option value="parts">Part Count (High-Low)</option>
                    </select>
                </div>
            </div>
        </div>

        {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
                {error}
            </div>
        )}

        {/* Content */}
        {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24">
                <Loader2 className="w-12 h-12 animate-spin text-yellow-500 mb-4" />
                <p className="text-gray-500">
                    {activeTab === 'smart'
                        ? "Crunching the numbers on thousands of parts..."
                        : "Searching the Lego archives..."}
                </p>
            </div>
        ) : (
            <>
                {activeTab === 'strict' && (
                    sortedMocs.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {sortedMocs.map((moc) => (
                                <MocCard key={moc.set_num} moc={moc} />
                            ))}
                        </div>
                    ) : (
                        <EmptyState />
                    )
                )}

                {activeTab === 'smart' && (
                    filteredSmartMatches.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredSmartMatches.map((moc) => (
                                <SmartSetCard key={moc.set_num} set={moc as any} />
                            ))}
                        </div>
                    ) : (
                         <div className="text-center py-24 bg-white rounded-xl border border-gray-100">
                            <Sparkles className="w-12 h-12 text-yellow-200 mx-auto mb-4" />
                            <p className="text-xl text-gray-400">No matches found with current filters.</p>
                            <p className="text-gray-500 mt-2 mb-6">
                                Try lowering the match percentage or adding more sets.
                            </p>
                             <button
                                onClick={() => findSmartBuilds()}
                                className="px-6 py-2 bg-yellow-400 text-black font-black rounded-full hover:bg-yellow-500 transition-colors border-b-4 border-yellow-600 active:border-b-0 active:translate-y-1"
                            >
                                Generate Ideas
                            </button>
                        </div>
                    )
                )}
            </>
        )}
      </div>
    </main>
  );
}

function EmptyState() {
    return (
        <div className="text-center py-24 bg-white rounded-xl border border-gray-100">
            <p className="text-xl text-gray-400">No builds found.</p>
            <p className="text-gray-500 mt-2">Try adding more sets to your garage!</p>
        </div>
    )
}
