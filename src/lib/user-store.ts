import fs from 'fs';
import path from 'path';
import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import type { LegoSet } from '@/types/rebrickable';

export interface GarageSnapshot {
  sets?: LegoSet[];
  selectedSetIds?: string[];
  age?: number;
  fidelityWeight?: number;
}

export interface User {
  id: string;
  email?: string;
  passwordHash?: string;
  passphraseHash?: string;
  name?: string;
  role: 'adult' | 'child';
  age?: number;
  createdAt: string;
  garage?: GarageSnapshot;
}

const FIVE_LETTER_WORDS: string[] = [
  'apple', 'grape', 'brick', 'flame', 'ocean',
  'tiger', 'lemon', 'cloud', 'stone', 'river',
  'eagle', 'frost', 'maple', 'coral', 'storm',
  'pearl', 'cedar', 'bloom', 'crane', 'delta',
  'ember', 'flint', 'globe', 'haven', 'ivory',
  'jewel', 'knoll', 'lunar', 'marsh', 'noble',
  'olive', 'plume', 'quilt', 'robin', 'solar',
  'thorn', 'ultra', 'vivid', 'wheat', 'yacht',
];

function getDataDir(): string {
  const dir = process.env.NETLIFY
    ? path.join('/tmp', 'yellobricks-data')
    : path.join(process.cwd(), '.data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getUsersFilePath(): string {
  return path.join(getDataDir(), 'users.json');
}

function readUsers(): User[] {
  const fp = getUsersFilePath();
  if (!fs.existsSync(fp)) {
    fs.writeFileSync(fp, '[]', 'utf-8');
    return [];
  }
  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    return JSON.parse(raw) as User[];
  } catch {
    return [];
  }
}

function writeUsers(users: User[]): void {
  const fp = getUsersFilePath();
  fs.writeFileSync(fp, JSON.stringify(users, null, 2), 'utf-8');
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const users = readUsers();
  return users.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null;
}

export async function findUserByPassphraseHash(hash: string): Promise<User | null> {
  const users = readUsers();
  return users.find(u => u.passphraseHash === hash) || null;
}

export async function findUserById(id: string): Promise<User | null> {
  const users = readUsers();
  return users.find(u => u.id === id) || null;
}

export async function createUser(userData: Omit<User, 'id' | 'createdAt'>): Promise<User> {
  const users = readUsers();
  const user: User = {
    ...userData,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  return user;
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User | null> {
  const users = readUsers();
  const idx = users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  users[idx] = { ...users[idx], ...updates };
  writeUsers(users);
  return users[idx];
}

export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

export async function hashPassphrase(passphrase: string): Promise<string> {
  const normalized = passphrase.trim().toLowerCase();
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  return hash;
}

export function generateKidPassphrase(): { words: [string, string]; display: string } {
  const idx1 = Math.floor(Math.random() * FIVE_LETTER_WORDS.length);
  let idx2 = Math.floor(Math.random() * FIVE_LETTER_WORDS.length);
  while (idx2 === idx1) {
    idx2 = Math.floor(Math.random() * FIVE_LETTER_WORDS.length);
  }
  const w1 = FIVE_LETTER_WORDS[idx1];
  const w2 = FIVE_LETTER_WORDS[idx2];
  return {
    words: [w1, w2],
    display: `${w1}.${w2}`,
  };
}

export async function getUserGarage(userId: string): Promise<GarageSnapshot | null> {
  const user = await findUserById(userId);
  if (!user) return null;
  return user.garage || null;
}

export async function saveUserGarage(userId: string, garageJson: GarageSnapshot): Promise<boolean> {
  const result = await updateUser(userId, { garage: garageJson });
  return result !== null;
}
