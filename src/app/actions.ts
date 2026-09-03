'use server';

import { LegoSet, InventoryPart, Moc } from '@/types/rebrickable';
import type { AIBuild } from '@/store/garage';
import { planBuildFromInventory } from '@/lib/planner';
import type { SlimInventoryItem } from '@/lib/inventory';

const BASE_URL = 'https://rebrickable.com/api/v3';
const API_KEY  = process.env.REBRICKABLE_API_KEY;

const rbHeaders = {
    'Authorization': `key ${API_KEY}`,
    'Accept': 'application/json',
};

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

/** Rebrickable fetch with 429 backoff. Never throws on rate-limit forever — returns null. */
async function rbFetch(url: string, attempts = 4): Promise<Response | null> {
    if (!API_KEY) throw new Error('API Key not configured');
    let last: Response | null = null;
    for (let i = 0; i < attempts; i++) {
        const res = await fetch(url, { headers: rbHeaders });
        last = res;
        if (res.status !== 429 && res.status !== 503) return res;
        const retryAfter = Number(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 400 * Math.pow(2, i);
        await sleep(waitMs);
    }
    return last;
}

// ---------------------------------------------------------------------------
// Rebrickable – Set metadata
// ---------------------------------------------------------------------------
export async function getSetAction(setNum: string): Promise<LegoSet> {
    if (!API_KEY) throw new Error('API Key not configured');
    const res = await rbFetch(`${BASE_URL}/lego/sets/${setNum}/`);
    if (!res || !res.ok) {
        if (res?.status === 404) throw new Error(`Set ${setNum} not found.`);
        if (res?.status === 401) throw new Error('Invalid Rebrickable API Key.');
        if (res?.status === 429) throw new Error('Rebrickable is rate-limiting us — wait a few seconds and try again.');
        throw new Error(`Failed to fetch set ${setNum} (HTTP ${res?.status ?? 'network'})`);
    }
    return res.json();
}

// ---------------------------------------------------------------------------
// Rebrickable – Inventory
// ---------------------------------------------------------------------------
export async function getSetInventoryAction(setNum: string): Promise<InventoryPart[]> {
    if (!API_KEY) throw new Error('API Key not configured');

    let parts: InventoryPart[] = [];
    let nextUrl: string | null = `${BASE_URL}/lego/sets/${setNum}/parts/?page_size=1000`;
    let page = 0;

    while (nextUrl && page < 5) {
        const res = await rbFetch(nextUrl);
        if (!res || !res.ok) {
            // Soft-fail for Smart Mix / bulk paths — empty inventory skips the candidate
            if (page === 0) return [];
            break;
        }
        const data: { results: InventoryPart[]; next: string | null } = await res.json();
        parts    = [...parts, ...data.results];
        nextUrl  = data.next ?? null;
        page++;
        if (nextUrl) await sleep(120);
    }
    return parts;
}

// ---------------------------------------------------------------------------
// Rebrickable – Standard MOC alternates (for "Standard" tab)
// ---------------------------------------------------------------------------
export async function getMocsForSetAction(setNum: string): Promise<Moc[]> {
    if (!API_KEY) throw new Error('API Key not configured');
    const res = await rbFetch(`${BASE_URL}/lego/sets/${setNum}/alternates/`);
    if (!res || !res.ok) return [];
    const data = await res.json();
    return data.results ?? [];
}

// ---------------------------------------------------------------------------
// Rebrickable – Candidate official sets for Smart Mix
// Prefer mid/small part counts (buildable) over largest sets (high % new).
// ---------------------------------------------------------------------------
export async function findCandidateSetsAction(
    themeIds:    number[],
    minParts:    number,
    maxParts:    number,
    searchQuery?: string,
): Promise<LegoSet[]> {
    if (!API_KEY) throw new Error('API Key not configured');

    const byNum = new Map<string, LegoSet>();

    const pull = async (params: string) => {
        const res = await rbFetch(`${BASE_URL}/lego/sets/?${params}`);
        if (!res || !res.ok) return;
        const data = await res.json();
        for (const s of data.results ?? []) byNum.set(s.set_num, s);
    };

    if (searchQuery) {
        const q = encodeURIComponent(searchQuery);
        // Ascending part count = more likely buildable from a garage
        await pull(`search=${q}&min_parts=${minParts}&max_parts=${maxParts}&page_size=40&ordering=num_parts`);
        await sleep(120);
        // Also a page of larger / popular hits for coverage of the topic
        await pull(`search=${q}&min_parts=${minParts}&page_size=20&ordering=-num_parts`);
        return Array.from(byNum.values());
    }

    for (const themeId of themeIds.slice(0, 3)) {
        await pull(`theme_id=${themeId}&min_parts=${minParts}&max_parts=${maxParts}&page_size=30&ordering=num_parts`);
        await sleep(150);
    }
    return Array.from(byNum.values());
}

export type MocCandidate = Moc & { parent_set_num: string };

/**
 * Community builds via the only MOC API still available: set alternates.
 * MOC inventories are not exposed (403), so callers score against the parent set's parts.
 * Seeds: owned garage sets + optional official sets related to a search (e.g. "forklift").
 */
export async function findRebrickableMocCandidatesAction(
    ownedSetNums: string[],
    searchQuery?: string,
    relatedOfficialSets?: LegoSet[],
): Promise<MocCandidate[]> {
    if (!API_KEY) throw new Error('API Key not configured');

    const q = (searchQuery ?? '').trim().toLowerCase();
    const seedSets = new Map<string, { priority: number }>();

    // Owned sets first — their alternates are the most buildable
    for (const num of ownedSetNums.slice(0, 12)) {
        seedSets.set(num, { priority: 0 });
    }
    // Official search hits seed community alts for the topic (forklift → Mini Forklift alts, etc.)
    for (const s of (relatedOfficialSets ?? []).slice(0, 10)) {
        if (!seedSets.has(s.set_num)) seedSets.set(s.set_num, { priority: 1 });
    }

    const byMoc = new Map<string, { moc: MocCandidate; priority: number }>();
    const seeds = [...seedSets.entries()].sort((a, b) => a[1].priority - b[1].priority);

    for (const [setNum, meta] of seeds) {
        const pageSize = meta.priority === 0 ? 40 : 25;
        const res = await rbFetch(
            `${BASE_URL}/lego/sets/${encodeURIComponent(setNum)}/alternates/?page_size=${pageSize}`,
        );
        if (!res || !res.ok) {
            await sleep(120);
            continue;
        }
        const data = await res.json();
        for (const m of data.results ?? []) {
            if (!m?.set_num) continue;
            if (q) {
                const hay = `${m.name ?? ''} ${m.designer_name ?? ''}`.toLowerCase();
                const words = q.split(/\s+/).filter((w) => w.length >= 3);
                // Owned-set alts always keep; related-set alts must match query
                if (meta.priority > 0 && words.length > 0 && !words.every((w) => hay.includes(w))) {
                    continue;
                }
            }
            const prev = byMoc.get(m.set_num);
            if (!prev || meta.priority < prev.priority) {
                byMoc.set(m.set_num, {
                    moc: { ...m, parent_set_num: setNum },
                    priority: meta.priority,
                });
            }
        }
        await sleep(150);
    }

    return [...byMoc.values()]
        .map((e) => e.moc)
        .sort((a, b) => (a.num_parts ?? 99999) - (b.num_parts ?? 99999));
}

// ---------------------------------------------------------------------------
// AI Build Generation via OpenRouter
// ---------------------------------------------------------------------------

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_KEY  = process.env.OPENROUTER_API_KEY;
const AI_MODEL = process.env.AI_BUILD_MODEL ?? 'anthropic/claude-opus-4.6';

/**
 * Hybrid AI build: local inventory-constrained planner (rigidity-aware),
 * then optional Opus enrichment for naming / narrative when OpenRouter is set.
 * Accepts a slim inventory summary (not full Rebrickable part objects).
 */
export async function generateAIBuildAction(
    inventory: SlimInventoryItem[],
    prompt: string,
    fidelityWeight: number,
    age: number,
): Promise<AIBuild> {
    if (!inventory?.length) throw new Error('No parts in selected sets');

    const plan = await planBuildFromInventory(inventory, prompt, fidelityWeight, age);

    let name = plan.name;
    let description = plan.description;

    if (OPENROUTER_KEY) {
        try {
            const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${OPENROUTER_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://yellobricks.xala.ai',
                    'X-Title': 'YelloBricks',
                },
                body: JSON.stringify({
                    model: AI_MODEL,
                    temperature: 0.4,
                    max_tokens: 400,
                    response_format: { type: 'json_object' },
                    messages: [
                        {
                            role: 'user',
                            content: `Name this LEGO build for intent "${prompt}". Age=${age}, fidelityWeight=${fidelityWeight}.
Steps (${plan.steps.length}): ${plan.steps.slice(0, 12).map((s) => s.description).join('; ')}.
Return JSON: {"name":"...","description":"1-2 sentences"}`,
                        },
                    ],
                }),
            });
            if (res.ok) {
                const json = await res.json();
                let content = json.choices?.[0]?.message?.content || '';
                content = content.replace(/^```json\n?|\n?```$/g, '').trim();
                const parsed = JSON.parse(content);
                if (parsed.name) name = parsed.name;
                if (parsed.description) description = parsed.description;
            }
        } catch {
            // keep heuristic name/description
        }
    }

    return {
        id: crypto.randomUUID(),
        name,
        description,
        ldrawText: plan.ldrawText,
        steps: plan.steps.map((s) => ({
            stepNum: s.step,
            partNum: s.partNum,
            colorId: s.colorId,
            colorName: s.colorName,
            x: s.x,
            y: s.y,
            z: s.z,
            rotation: s.rot,
            description: s.description,
            loadBearing: s.loadBearing,
        })),
        placed: plan.steps,
        totalParts: plan.steps.length,
        estimatedFidelityScore: plan.fidelityScore,
        estimatedRigidityScore: plan.rigidityScore,
        compositeScore: plan.compositeScore,
        warnings: plan.warnings,
        generatedAt: new Date().toISOString(),
    };
}

// ---------------------------------------------------------------------------
// Legacy stubs
// ---------------------------------------------------------------------------
export async function findSmartCandidatesAction(): Promise<Moc[]> { return []; }
export async function getMocInventoryAction(setNum: string): Promise<InventoryPart[]> {
    if (!API_KEY) throw new Error('API Key not configured');
    let parts: InventoryPart[] = [];
    let nextUrl: string | null = `${BASE_URL}/lego/mocs/${setNum}/parts/?page_size=1000`;
    let page = 0;
    while (nextUrl && page < 5) {
        const res = await rbFetch(nextUrl);
        if (!res || !res.ok) return [];
        const data: { results: InventoryPart[]; next: string | null } = await res.json();
        parts   = [...parts, ...data.results];
        nextUrl = data.next ?? null;
        page++;
    }
    return parts;
}
