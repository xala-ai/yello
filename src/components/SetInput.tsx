'use client';

import { useState } from 'react';
import { useGarageStore } from '@/store/garage';
import { Plus, Loader2 } from 'lucide-react';

export function SetInput() {
  const [input, setInput] = useState('');
  const { addSet, isLoading, error } = useGarageStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Basic format cleanup (e.g. 42115-1 -> 42115-1, 42115 -> 42115-1)
    let setNum = input.trim();
    if (!setNum.includes('-')) {
        setNum += '-1';
    }

    await addSet(setNum);
    setInput('');
  };

  return (
    <div className="w-full max-w-md">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter Set # (e.g. 42115)"
          className="flex-1 px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none text-black placeholder-gray-400"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-2 bg-yellow-400 hover:bg-yellow-500 text-black font-bold rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 border-b-4 border-yellow-600 active:border-b-0 active:translate-y-1"
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          Add
        </button>
      </form>
      {error && (
        <p className="mt-2 text-red-500 text-sm">{error}</p>
      )}
    </div>
  );
}
