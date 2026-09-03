'use server';

import { auth } from '@/lib/auth';
import {
  createUser,
  findUserByEmail,
  generateKidPassphrase,
  hashPassword,
  hashPassphrase,
  getUserGarage,
  saveUserGarage,
} from '@/lib/user-store';

export async function registerEmailAction(email: string, password: string, name?: string, age?: number) {
  if (!email || !password || password.length < 8) {
    throw new Error('Email and password (8+ chars) required');
  }
  if (await findUserByEmail(email)) throw new Error('Email already registered');
  const passwordHash = await hashPassword(password);
  const user = await createUser({
    email: email.toLowerCase(),
    passwordHash,
    name: name || email.split('@')[0],
    role: 'adult',
    age,
  });
  return { id: user.id, email: user.email };
}

export async function registerKidAction(name?: string, age?: number) {
  const { display } = generateKidPassphrase();
  const passphraseHash = await hashPassphrase(display);
  const user = await createUser({
    name: name || 'Kid Builder',
    passphraseHash,
    role: 'child',
    age: age ?? 7,
  });
  return { id: user.id, passphrase: display, name: user.name };
}

export async function syncGarageUpAction(garageJson: unknown) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) throw new Error('Not signed in');
  await saveUserGarage(userId, garageJson);
  return { ok: true };
}

export async function syncGarageDownAction() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  return getUserGarage(userId);
}
