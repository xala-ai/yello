'use server';

import { LegoSet, InventoryPart, Moc } from '@/types/rebrickable';
import type { AIBuild } from '@/store/garage';
import { planBuildFromInventory } from '@/lib/planner';

const BASE_URL = 'https://rebrickable.com/api/v3';
const API_KEY  = process.env.REBRICKABLE_API_KEY;

const rbHeaders = {
    'Authorization': `key ${API_KEY}`,
    'Accept': 'application/json',
};

// ---------------------------------------------------------------------------
// Rebrickable – Set metadata
// ---------------------------------------------------------------------------
export async function getSetAction(setNum: string): Promise<LegoSet> {
    if (!API_KEY) throw new Error('API Key not configured');
    const res = await fetch(`${BASE_URL}/lego/sets/${setNum}/`, { headers: rbHeaders });
    if (!res.ok) {
        if (res.status === 404) throw new Error(`Set ${setNum} not found.`);
        if (res.status === 401) throw new Error('Invalid Rebrickable API Key.');
        throw new Error(`Failed to fetch set ${setNum} (HTTP ${res.status})`);
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
        const res: Response = await fetch(nextUrl, { headers: rbHeaders });
        if (!res.ok) throw new Error(`Failed to fetch inventory for ${setNum}`);
        const data: { results: InventoryPart[]; next: string | null } = await res.json();
        parts    = [...parts, ...data.results];
        nextUrl  = data.next ?? null;
        page++;
    }
    return parts;
}

// ---------------------------------------------------------------------------
// Rebrickable – Standard MOC alternates (for "Standard" tab)
// ---------------------------------------------------------------------------
export async function getMocsForSetAction(setNum: string): Promise<Moc[]> {
    if (!API_KEY) throw new Error('API Key not configured');
    const res = await fetch(`${BASE_URL}/lego/sets/${setNum}/alternates/`, { headers: rbHeaders });
    if (!res.ok) throw new Error(`Failed to fetch alternates for ${setNum}`);
    const data = await res.json();
    return data.results;
}

// ---------------------------------------------------------------------------
// Rebrickable – Candidate official sets for Smart Mix
// ---------------------------------------------------------------------------
export async function findCandidateSetsAction(
    themeIds:    number[],
    minParts:    number,
    maxParts:    number,
    searchQuery?: string,
): Promise<LegoSet[]> {
    if (!API_KEY) throw new Error('API Key not configured');

    if (searchQuery) {
        const url = `${BASE_URL}/lego/sets/?search=${encodeURIComponent(searchQuery)}&min_parts=${minParts}&max_parts=${maxParts}&page_size=20&ordering=-num_parts`;
        const res = await fetch(url, { headers: rbHeaders });
        if (!res.ok) return [];
        const data = await res.json();
        return data.results;
    }

    const results: LegoSet[] = [];
    for (const themeId of themeIds.slice(0, 3)) {
        const url = `${BASE_URL}/lego/sets/?theme_id=${themeId}&min_parts=${minParts}&max_parts=${maxParts}&page_size=20&ordering=-num_parts`;
        const res = await fetch(url, { headers: rbHeaders });
        if (!res.ok) continue;
        const data = await res.json();
        results.push(...data.results);
    }
    return Array.from(new Map(results.map((s) => [s.set_num, s])).values());
}

// ---------------------------------------------------------------------------
// AI Build Generation via OpenRouter
// ---------------------------------------------------------------------------

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_KEY  = process.env.OPENROUTER_API_KEY;
const AI_MODEL = process.env.AI_BUILD_MODEL ?? 'anthropic/claude-opus-4.6';

function buildInventorySummary(masterBin: InventoryPart[], topN = 100) {
    return masterBin
        .filter((p) => !p.is_spare)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, topN)
        .map((p) => ({
            partNum: p.part.part_num,
            name: p.part.name,
            colorId: p.color.id,
            colorName: p.color.name,
            qty: p.quantity,
        }));
}

/**
 * Hybrid AI build: local inventory-constrained planner (rigidity-aware),
 * then optional Opus enrichment for naming / narrative when OpenRouter is set.
 */
export async function generateAIBuildAction(
    masterBin: InventoryPart[],
    prompt: string,
    fidelityWeight: number,
    age: number,
): Promise<AIBuild> {
    const inventory = buildInventorySummary(masterBin);
    if (inventory.length === 0) throw new Error('No parts in selected sets');

    const plan = await planBuildFromInventory(inventory, prompt, fidelityWeight, age);

    let name = plan.name;
    let description = plan.description;

    // Enrich with large model when available (does not invent parts — naming only)
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
// Legacy stubs – kept so unused imports don't break the build
// ---------------------------------------------------------------------------
export async function findSmartCandidatesAction(): Promise<Moc[]> { return []; }
export async function getMocInventoryAction(setNum: string): Promise<InventoryPart[]> {
    if (!API_KEY) throw new Error('API Key not configured');
    let parts: InventoryPart[] = [];
    let nextUrl: string | null = `${BASE_URL}/lego/mocs/${setNum}/parts/?page_size=1000`;
    let page = 0;
    while (nextUrl && page < 5) {
        const res: Response = await fetch(nextUrl, { headers: rbHeaders });
        if (!res.ok) return [];
        const data: { results: InventoryPart[]; next: string | null } = await res.json();
        parts   = [...parts, ...data.results];
        nextUrl = data.next ?? null;
        page++;
    }
    return parts;
}
export async function getMocDetailsAction(setNum: string) {
    if (!API_KEY) throw new Error('API Key not configured');
    const res = await fetch(`${BASE_URL}/lego/mocs/${setNum}/`, { headers: rbHeaders });
    if (!res.ok) return null;
    return res.json();
}
