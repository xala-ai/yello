'use client';

import { Rocket } from 'lucide-react';

export function CrossScaleMixDialog({
  open,
  onCancel,
  onContinue,
}: {
  open: boolean;
  onCancel: () => void;
  onContinue: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cross-scale-title"
        className="w-full max-w-md rounded-2xl bg-white border border-yellow-200 shadow-2xl p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-yellow-100 text-yellow-800">
            <Rocket className="w-6 h-6" />
          </div>
          <div>
            <h2 id="cross-scale-title" className="text-lg font-black text-gray-900">
              Out of this world?
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              You selected both <span className="font-semibold">System LEGO</span> and{' '}
              <span className="font-semibold">Duplo</span>. Mixing scales is official LEGO fun —
              Duplo is 2× System, and only even-stud bricks clutch (2×2, 2×4…). Figures stay on
              their own scale. Builds get weird in the best way.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Matching will treat Duplo↔System <em>bricks</em> as cross-scale substitutes (with a
              rigidity hit). Want to continue?
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="px-4 py-2 rounded-lg bg-yellow-400 text-black text-sm font-black border-b-4 border-yellow-600 hover:bg-yellow-500 active:border-b-0 active:translate-y-0.5"
          >
            Continue — mix them
          </button>
        </div>
      </div>
    </div>
  );
}
