'use client';

import { Search } from 'lucide-react';
import { useState } from 'react';

interface SuggestionBarProps {
    onSearch: (query: string) => void;
    isLoading: boolean;
}

export function SuggestionBar({ onSearch, isLoading }: SuggestionBarProps) {
    const [query, setQuery] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            onSearch(query);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto mb-8">
            <form onSubmit={handleSubmit} className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="I want to build a... (e.g. 'Forklift', 'Spaceship', 'Castle')"
                    className="block w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-full shadow-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none text-lg transition-shadow hover:shadow-md"
                    disabled={isLoading}
                />
                <button
                    type="submit"
                    disabled={isLoading || !query.trim()}
                    className="absolute right-2 top-2 bottom-2 px-6 bg-yellow-400 text-black font-black rounded-full hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-b-4 border-yellow-600 active:border-b-0 active:translate-y-1"
                >
                    Go
                </button>
            </form>
            <p className="text-center text-xs text-gray-400 mt-2">
                Powered by YelloBricks Brain™
            </p>
        </div>
    );
}
