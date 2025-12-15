'use client';

import { useEffect, useMemo, useState } from 'react';
import { Mail, ShieldCheck, X } from 'lucide-react';

const STORAGE_KEY = 'yellobricks_prebeta_ok';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function PreBetaGate() {
  const disabled = process.env.NEXT_PUBLIC_PREBETA_GATE_DISABLED === 'true';
  const [hydrated, setHydrated] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isUnlocked = useMemo(() => {
    if (disabled) return true;
    if (!hydrated) return false;
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }, [disabled, hydrated]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!disabled && !isUnlocked) {
      // lock scroll behind overlay
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      return () => {
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      };
    }
  }, [disabled, isUnlocked]);

  if (disabled || isUnlocked) return null;

  const onSubmit = async () => {
    setError(null);
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError('Please enter a valid email.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/prebeta-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Signup failed. Try again.');
      }

      try {
        localStorage.setItem(STORAGE_KEY, '1');
      } catch {}

      setSuccess(true);
      // give a small moment for the user to see success state
      setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signup failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-black/10 overflow-hidden">
        <div className="px-6 py-5 bg-yellow-400 border-b-4 border-yellow-600">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black tracking-widest text-black/80">PRE-BETA ACCESS</p>
              <h2 className="text-3xl font-black text-black leading-tight">
                Yello<span className="text-black/70">Bricks</span>
              </h2>
              <p className="text-sm text-black/70 mt-1">
                Join the tester list to unlock the app.
              </p>
            </div>
            {/* Intentionally non-dismissable. Keep the X as a visual affordance but disabled */}
            <button
              type="button"
              className="p-2 rounded-full bg-black/10 text-black/60 cursor-not-allowed"
              title="Signup required"
              aria-disabled="true"
              disabled
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-black text-yellow-300 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-gray-900">Pre-beta tester signup</p>
              <p className="text-sm text-gray-500">We will email you when we push new features.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none text-gray-900"
                disabled={submitting || success}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSubmit();
                }}
              />
            </div>

            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || success}
              className="px-6 py-3 rounded-xl bg-black text-yellow-300 font-black border-b-4 border-black/60 active:border-b-0 active:translate-y-1 disabled:opacity-60"
            >
              {success ? 'You are in' : submitting ? 'Sending...' : 'Unlock'}
            </button>
          </div>

          {error && (
            <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              {error}
            </div>
          )}

          <p className="mt-5 text-xs text-gray-500">
            By signing up you agree we can email you about YelloBricks pre-beta updates. No spam.
          </p>
        </div>
      </div>
    </div>
  );
}
