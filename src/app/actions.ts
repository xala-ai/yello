'use server';

import { LegoSet, InventoryPart, Moc } from '@/types/rebrickable';
import type { AIBuild } from '@/store/garage';

const BASE_URL = 'https://rebrickable.com/api/v3';
const API_KEY  = process.env.REBRICKABLE_API_KEY || process.env.NEXT_PUBLIC_REBRICKABLE_API_KEY;

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
        const res = await fetch(nextUrl, { headers: rbHeaders });
        if (!res.ok) throw new Error(`Failed to fetch inventory for ${setNum}`);
        const data = await res.json();
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
const AI_MODEL        = process.env.AI_BUILD_MODEL ?? 'google/gemini-2.5-flash';

/**
 * Summarise the master bin into a compact JSON the LLM can reason over.
 * We only send the top-N most common parts to keep the prompt manageable.
 */
function buildInventorySummary(masterBin: InventoryPart[], topN = 80): object[] {
    return masterBin
        .filter((p) => !p.is_spare)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, topN)
        .map((p) => ({
            part: p.part.part_num,
            name: p.part.name,
            color: p.color.name,
            qty:  p.quantity,
        }));
}

/**
 * Generate a novel LEGO build plan using an LLM via OpenRouter.
 *
 * The prompt asks the model to return a structured JSON build plan that
 * YelloBricks can render step-by-step.  The fidelityWeight and age are used
 * to set the model's optimisation target.
 */
export async function generateAIBuildAction(
    masterBin:     InventoryPart[],
    prompt:        string,
    fidelityWeight: number,
    age:           number,
): Promise<AIBuild> {
    if (!OPENROUTER_KEY) throw new Error('OpenRouter API key not configured (OPENROUTER_API_KEY)');

    const inventory = buildInventorySummary(masterBin);
    const rigidityLevel = fidelityWeight < 0.4 ? 'high (child-safe, structural priority)' : fidelityWeight < 0.7 ? 'medium' : 'low (aesthetic priority)';

    const systemPrompt = `You are a LEGO master builder AI. You design LEGO builds using ONLY the parts provided in the inventory, producing structured JSON build plans.

Rules:
- Use ONLY parts from the provided inventory. Never invent part numbers.
- Respect quantities — do not exceed what is available.
- Optimise for the requested fidelity/rigidity level.
- Keep builds interesting but achievable in 10-30 steps.
- Output ONLY valid JSON matching the schema below. No prose, no markdown fences.

Rigidity requirement: ${rigidityLevel}
Builder age: ${age}

Schema:
{
  "name": "string",
  "description": "string (1-2 sentences)",
  "estimatedFidelityScore": 0-100,
  "estimatedRigidityScore": 0-100,
  "steps": [
    {
      "stepNum": 1,
      "partNum": "3001",
      "colorId": 4,
      "colorName": "Red",
      "x": 0, "y": 0, "z": 0,
      "rotation": 0,
      "description": "Place 2×4 red brick as base"
    }
  ]
}`;

    const userPrompt = `Build idea: "${prompt}"

Available parts (top ${inventory.length} by quantity):
${JSON.stringify(inventory, null, 2)}`;

    const body = JSON.stringify({
        model: AI_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt   },
        ],
        temperature: 0.6,
        max_tokens:  4000,
        response_format: { type: 'json_object' },
    });

    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method:  'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_KEY}`,
            'Content-Type':  'application/json',
            'HTTP-Referer':  'https://yellobricks.xala.ai',
            'X-Title':       'YelloBricks',
        },
        body,
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`AI generation failed (HTTP ${res.status}): ${errText.slice(0, 200)}`);
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from AI model');

    let parsed: Omit<AIBuild, 'id' | 'totalParts' | 'generatedAt'>;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error('AI returned invalid JSON — try rephrasing your prompt.');
    }

    if (!parsed.steps?.length) throw new Error('AI returned no build steps — try a more specific prompt.');

    return {
        id:                    crypto.randomUUID(),
        name:                  parsed.name                  ?? prompt,
        description:           parsed.description           ?? '',
        steps:                 parsed.steps,
        totalParts:            parsed.steps.length,
        estimatedFidelityScore: parsed.estimatedFidelityScore ?? 0,
        estimatedRigidityScore: parsed.estimatedRigidityScore ?? 0,
        generatedAt:           new Date().toISOString(),
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
        const res = await fetch(nextUrl, { headers: rbHeaders });
        if (!res.ok) return [];
        const data = await res.json();
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
