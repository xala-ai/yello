'use server';

import { LegoSet, InventoryPart, Moc } from '@/types/rebrickable';

const BASE_URL = 'https://rebrickable.com/api/v3';
const API_KEY = process.env.REBRICKABLE_API_KEY || process.env.NEXT_PUBLIC_REBRICKABLE_API_KEY;

// Note: Do not log secrets in server logs.

const headers = {
  'Authorization': `key ${API_KEY}`,
  'Accept': 'application/json',
};

export async function getSetAction(setNum: string): Promise<LegoSet> {
  if (!API_KEY) {
    throw new Error('API Key not configured');
  }

  const res = await fetch(`${BASE_URL}/lego/sets/${setNum}/`, { headers });

  if (!res.ok) {
    if (res.status === 404) {
        throw new Error(`Set ${setNum} not found. Check the set number.`);
    }
    if (res.status === 401) {
        console.error("API 401 Unauthorized - Check Key:", API_KEY);
        throw new Error('Invalid API Key. Please check your configuration.');
    }
    throw new Error(`Failed to fetch set ${setNum} (Status: ${res.status})`);
  }

  return res.json();
}

export async function getSetInventoryAction(setNum: string): Promise<InventoryPart[]> {
  if (!API_KEY) throw new Error('API Key not configured');

  let allParts: InventoryPart[] = [];
  let nextUrl = `${BASE_URL}/lego/sets/${setNum}/parts/?page_size=1000`;

  // Limit pages to prevent timeouts/abuse in this demo
  let pageCount = 0;
  const MAX_PAGES = 5;

  while (nextUrl && pageCount < MAX_PAGES) {
    const res = await fetch(nextUrl, { headers });
    if (!res.ok) throw new Error(`Failed to fetch inventory for ${setNum}`);
    const data = await res.json();
    allParts = [...allParts, ...data.results];
    nextUrl = data.next;
    pageCount++;
  }

  return allParts;
}

export async function getMocsForSetAction(setNum: string): Promise<Moc[]> {
    if (!API_KEY) throw new Error('API Key not configured');

    const res = await fetch(`${BASE_URL}/lego/sets/${setNum}/alternates/`, { headers });
    if (!res.ok) throw new Error(`Failed to fetch MOCs for ${setNum}`);
    const data = await res.json();
    return data.results;
}

export async function findSmartCandidatesAction(themeIds: number[], minParts: number, maxParts: number, searchQuery?: string): Promise<Moc[]> {
    if (!API_KEY) throw new Error('API Key not configured');

    let candidates: Moc[] = [];

    // IMPORTANT: Rebrickable's public API key access does NOT expose /lego/mocs endpoints (404),
    // and /lego/mocs/{MOC}/parts is 403 without additional privileges.
    // This function is kept for compatibility but will currently return [].
    // Smart Mix should use official set candidates instead (see findCandidateSetsAction).
    return [];
}

export async function getMocInventoryAction(setNum: string): Promise<InventoryPart[]> {
    if (!API_KEY) throw new Error('API Key not configured');

    let allParts: InventoryPart[] = [];
    let nextUrl = `${BASE_URL}/lego/mocs/${setNum}/parts/?page_size=1000`;

    let pageCount = 0;
    const MAX_PAGES = 5;

    while (nextUrl && pageCount < MAX_PAGES) {
        const res = await fetch(nextUrl, { headers });
        if (!res.ok) {
            console.error(`Failed to fetch inventory for MOC ${setNum}: ${res.statusText}`);
            return [];
        }
        const data = await res.json();
        allParts = [...allParts, ...data.results];
        nextUrl = data.next;
        pageCount++;
    }

    return allParts;
}

export async function getMocDetailsAction(setNum: string) {
    if (!API_KEY) throw new Error('API Key not configured');

    // Fetch full MOC details which might include instruction URLs
    const res = await fetch(`${BASE_URL}/lego/mocs/${setNum}/`, { headers });
    if (!res.ok) return null;
    return res.json();
}

export async function findCandidateSetsAction(
  themeIds: number[],
  minParts: number,
  maxParts: number,
  searchQuery?: string
): Promise<LegoSet[]> {
  if (!API_KEY) throw new Error('API Key not configured');

  const topThemes = themeIds.slice(0, 3);
  let results: LegoSet[] = [];

  // If the user typed something ("horse", "forklift"), we do a global set search first.
  if (searchQuery) {
    const url = `${BASE_URL}/lego/sets/?search=${encodeURIComponent(searchQuery)}&min_parts=${minParts}&max_parts=${maxParts}&page_size=20&ordering=-num_parts`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results;
  }

  for (const themeId of topThemes) {
    const url = `${BASE_URL}/lego/sets/?theme_id=${themeId}&min_parts=${minParts}&max_parts=${maxParts}&page_size=20&ordering=-num_parts`;
    const res = await fetch(url, { headers });
    if (!res.ok) continue;
    const data = await res.json();
    results = [...results, ...data.results];
  }

  // Deduplicate
  return Array.from(new Map(results.map((s) => [s.set_num, s])).values());
}
