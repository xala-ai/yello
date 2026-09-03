'use client';

import { SetInput } from '@/components/SetInput';
import { SetList } from '@/components/SetList';
import { ImportZone } from '@/components/ImportZone';
import { CrossScaleMixDialog } from '@/components/CrossScaleMixDialog';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Hammer, LogIn, CloudUpload, CloudDownload } from 'lucide-react';
import { useGarageStore } from '@/store/garage';
import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { selectionHasMixedScales } from '@/lib/duplo';

const CROSS_SCALE_ACK_KEY = 'yellobricks-cross-scale-ack';

export default function Home() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [showCrossScale, setShowCrossScale] = useState(false);
  const { data: session } = useSession();
  const router = useRouter();
  const syncGarageToCloud = useGarageStore((s) => s.syncGarageToCloud);
  const loadGarageFromCloud = useGarageStore((s) => s.loadGarageFromCloud);
  const sets = useGarageStore((s) => s.sets);
  const selectedSetIds = useGarageStore((s) => s.selectedSetIds);
  const setInventories = useGarageStore((s) => s.setInventories);

  useEffect(() => {
    void Promise.resolve(useGarageStore.persist.rehydrate()).then(() => setIsHydrated(true));
  }, []);

  const goResults = () => router.push('/results');

  const onFindBuilds = () => {
    const mixed = selectionHasMixedScales(sets, selectedSetIds, setInventories);
    if (mixed && sessionStorage.getItem(CROSS_SCALE_ACK_KEY) !== '1') {
      setShowCrossScale(true);
      return;
    }
    goResults();
  };

  if (!isHydrated) return null;

  return (
    <main className="min-h-screen bg-gray-50 p-8 pb-24">
      <CrossScaleMixDialog
        open={showCrossScale}
        onCancel={() => setShowCrossScale(false)}
        onContinue={() => {
          sessionStorage.setItem(CROSS_SCALE_ACK_KEY, '1');
          setShowCrossScale(false);
          goResults();
        }}
      />
      <div className="max-w-6xl mx-auto flex flex-col items-center">
        <div className="w-full flex justify-end gap-2 mb-4 text-sm">
          {session?.user ? (
            <>
              <span className="text-gray-800 self-center">
                {(session.user as { name?: string }).name || session.user.email}
              </span>
              <button
                onClick={() => loadGarageFromCloud()}
                className="px-3 py-1.5 border border-gray-300 bg-white text-gray-900 font-medium rounded-lg flex items-center gap-1 hover:bg-gray-50"
              >
                <CloudDownload className="w-4 h-4" /> Load
              </button>
              <button
                onClick={() => syncGarageToCloud()}
                className="px-3 py-1.5 border border-gray-300 bg-white text-gray-900 font-medium rounded-lg flex items-center gap-1 hover:bg-gray-50"
              >
                <CloudUpload className="w-4 h-4" /> Save
              </button>
              <button
                onClick={() => signOut()}
                className="px-3 py-1.5 border border-gray-300 bg-white text-gray-900 font-medium rounded-lg hover:bg-gray-50"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/auth/signin"
              className="px-3 py-1.5 bg-black text-white rounded-lg flex items-center gap-1"
            >
              <LogIn className="w-4 h-4" /> Sign in
            </Link>
          )}
        </div>

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

        <div className="fixed bottom-8 right-8">
          <button
            type="button"
            onClick={onFindBuilds}
            className="flex items-center gap-2 px-6 py-4 bg-yellow-400 hover:bg-yellow-500 text-black font-bold rounded-full shadow-lg transition-transform hover:scale-105 border-b-4 border-yellow-600"
          >
            <Hammer className="w-5 h-5" />
            Find Builds
          </button>
        </div>
      </div>
    </main>
  );
}
