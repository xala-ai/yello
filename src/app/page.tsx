'use client';

import { SetInput } from '@/components/SetInput';
import { SetList } from '@/components/SetList';
import { ImportZone } from '@/components/ImportZone';
import Link from 'next/link';
import { Hammer } from 'lucide-react';
import { useGarageStore } from '@/store/garage';
import { useEffect, useState } from 'react';

export default function Home() {
  // Hydration fix
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    useGarageStore.persist.rehydrate();
    setIsHydrated(true);
  }, []);

  if (!isHydrated) {
      return null; // or a loading spinner
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8 pb-24">
      <div className="max-w-6xl mx-auto flex flex-col items-center">
        <div className="text-center mb-12 space-y-4">
          <h1 className="text-5xl font-black text-gray-900 tracking-tight">
            Yello<span className="text-yellow-500">Bricks</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Enter your Lego sets below, and we&apos;ll show you what else you can build with your parts.
          </p>
        </div>

        <div className="w-full max-w-2xl flex flex-col sm:flex-row gap-4 items-stretch">
            <div className="flex-1">
                <SetInput />
            </div>
            <div className="sm:w-48">
                <ImportZone />
            </div>
        </div>

        <SetList />

        {/* Floating Action Button for Results */}
        <div className="fixed bottom-8 right-8">
            <Link
                href="/results"
                className="flex items-center gap-2 px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full shadow-lg transition-transform hover:scale-105"
            >
                <Hammer className="w-5 h-5" />
                Find Builds
            </Link>
        </div>
      </div>
    </main>
  );
}
