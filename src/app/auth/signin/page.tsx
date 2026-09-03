'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { registerEmailAction, registerKidAction } from '@/app/actions/auth';

export default function SignInPage() {
  const [mode, setMode] = useState<'signin' | 'register' | 'kid'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [kidReveal, setKidReveal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onEmailSignIn = async () => {
    setBusy(true); setError(null);
    const res = await signIn('email-password', { email, password, redirect: false });
    setBusy(false);
    if (res?.error) setError('Invalid email or password');
    else window.location.href = '/';
  };

  const onRegister = async () => {
    setBusy(true); setError(null);
    try {
      await registerEmailAction(email, password, name || undefined);
      await signIn('email-password', { email, password, redirect: false });
      window.location.href = '/';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Register failed');
    } finally { setBusy(false); }
  };

  const onKidCreate = async () => {
    setBusy(true); setError(null);
    try {
      const r = await registerKidAction(name || 'Kid Builder');
      setKidReveal(r.passphrase);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create kid login');
    } finally { setBusy(false); }
  };

  const onKidSignIn = async () => {
    setBusy(true); setError(null);
    const res = await signIn('kid-passphrase', { passphrase, redirect: false });
    setBusy(false);
    if (res?.error) setError('Passphrase not found');
    else window.location.href = '/';
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-gray-100 rounded-2xl p-6 space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-black">Yello<span className="text-yellow-500">Bricks</span> login</h1>
          <p className="text-sm text-gray-500 mt-1">Save your garage across devices</p>
        </div>

        <div className="flex gap-2 text-sm">
          {(['signin', 'register', 'kid'] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(null); }}
              className={`flex-1 py-2 rounded-lg font-medium ${mode === m ? 'bg-yellow-400 text-black' : 'bg-gray-100 text-gray-900'}`}>
              {m === 'signin' ? 'Sign in' : m === 'register' ? 'Register' : 'Kids'}
            </button>
          ))}
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

        {mode !== 'kid' && (
          <div className="space-y-3">
            {mode === 'register' && (
              <input className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="Name"
                value={name} onChange={(e) => setName(e.target.value)} />
            )}
            <input className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" type="email" placeholder="Email"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" type="password" placeholder="Password (8+)"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <button disabled={busy} onClick={mode === 'signin' ? onEmailSignIn : onRegister}
              className="w-full py-2.5 bg-black text-white font-bold rounded-lg disabled:opacity-50">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
            <button disabled={busy} onClick={() => signIn('google', { callbackUrl: '/' })}
              className="w-full py-2.5 border border-gray-300 bg-white text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-50">
              Continue with Google
            </button>
          </div>
        )}

        {mode === 'kid' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Kids use a 2-word passphrase (at least 4 letters each), e.g. <code>tiger.grape</code> — no password.
            </p>
            <input className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="Display name"
              value={name} onChange={(e) => setName(e.target.value)} />
            <button disabled={busy} onClick={onKidCreate}
              className="w-full py-2.5 bg-yellow-400 text-black font-bold rounded-lg">
              Create kid login
            </button>
            {kidReveal && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-gray-900">
                Write this down — shown once:
                <div className="font-black text-lg tracking-wide mt-1">{kidReveal}</div>
              </div>
            )}
            <hr />
            <input className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="word.word"
              value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
            <button disabled={busy} onClick={onKidSignIn}
              className="w-full py-2.5 bg-black text-white font-bold rounded-lg">
              Sign in with passphrase
            </button>
          </div>
        )}

        <Link href="/" className="block text-center text-sm text-gray-700 hover:text-gray-900 font-medium">← Back</Link>
      </div>
    </main>
  );
}
