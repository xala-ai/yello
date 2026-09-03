'use server';

import { LegoSet, InventoryPart, Moc } from '@/types/rebrickable';
import type { AIBuild } from '@/store/garage';
import {
    planBuildCandidatesFromInventory,
    type BuildPlan,
} from '@/lib/planner';
import {
    createFallbackBuildBrief,
    parseBuildBrief,
    validateBuildBrief,
} from '@/lib/brickgpt/brief';
import type { BuildBrief } from '@/lib/brickgpt/types';
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
const SEARCH_FILTER_MODEL = process.env.SEARCH_FILTER_MODEL ?? 'openai/gpt-4o-mini';
const AI_TIMEOUT_MS = 10_000;

export interface SemanticFilterCandidate {
    id: string;
    name: string;
    source: 'official' | 'rebrickable';
}

const SEARCH_SYNONYM_GROUPS = [
    ['plane', 'airplane', 'aeroplane', 'aircraft', 'jet', 'glider', 'helicopter', 'seaplane'],
    ['car', 'automobile', 'vehicle', 'racer', 'racecar', 'roadster'],
    ['truck', 'lorry', 'pickup', 'hauler', 'vehicle'],
    ['boat', 'ship', 'vessel', 'yacht', 'sailboat'],
    ['spaceship', 'spacecraft', 'rocket', 'shuttle', 'starfighter'],
    ['castle', 'fortress', 'citadel', 'keep', 'tower'],
    ['house', 'home', 'building', 'cabin', 'cottage'],
    ['forklift', 'fork lift', 'loader', 'warehouse vehicle'],
] as const;

function normalizedSearchTerms(value: string): Set<string> {
    const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const terms = new Set(normalized.split(/\s+/).filter((term) => term.length >= 2));
    for (const group of SEARCH_SYNONYM_GROUPS) {
        if (group.some((term) => normalized.includes(term))) {
            for (const term of group) terms.add(term);
        }
    }
    return terms;
}

function lexicalSemanticFilter(
    query: string,
    candidates: SemanticFilterCandidate[],
): string[] {
    const wanted = normalizedSearchTerms(query);
    return candidates
        .filter((candidate) => {
            const candidateTerms = normalizedSearchTerms(candidate.name);
            return [...wanted].some((term) =>
                candidate.name.toLowerCase().includes(term) || candidateTerms.has(term),
            );
        })
        .map((candidate) => candidate.id);
}

/**
 * Uses one small OpenRouter classification call to remove off-topic set/MOC
 * names. Candidate IDs are opaque and validated locally before use.
 */
export async function filterBuildCandidatesAction(
    query: string,
    candidates: SemanticFilterCandidate[],
): Promise<string[]> {
    const trimmed = query.trim();
    const batch = candidates
        .filter((candidate) => candidate.id && candidate.name)
        .slice(0, 80);
    if (!trimmed || batch.length === 0) return batch.map((candidate) => candidate.id);

    const fallback = lexicalSemanticFilter(trimmed, batch);
    if (!OPENROUTER_KEY) return fallback;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7_000);
    try {
        const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${OPENROUTER_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://yellobricks.xala.ai',
                'X-Title': 'YelloBricks',
            },
            body: JSON.stringify({
                model: SEARCH_FILTER_MODEL,
                temperature: 0,
                max_tokens: 900,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content:
                            'Classify LEGO set and MOC names for semantic search. ' +
                            'Keep direct matches and close forms of the requested object (for example plane includes airplane, jet, glider and helicopter), ' +
                            'but reject names that merely share a vague theme or designer. Return only JSON {"matches":[{"id":"opaque id","relevance":0.0}]}. ' +
                            'Only use supplied IDs and keep items with relevance at least 0.58.',
                    },
                    {
                        role: 'user',
                        content: JSON.stringify({ query: trimmed.slice(0, 120), candidates: batch }),
                    },
                ],
            }),
        });
        if (!res.ok) return fallback;
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content;
        const parsed = typeof content === 'string' ? JSON.parse(content) : content;
        const allowed = new Set(batch.map((candidate) => candidate.id));
        if (!Array.isArray(parsed?.matches)) return fallback;
        const rawMatches: unknown[] = parsed.matches;
        const matches = rawMatches.filter(
            (match: unknown): match is { id: string; relevance: number } =>
                typeof match === 'object' && match !== null &&
                typeof (match as { id?: unknown }).id === 'string' &&
                typeof (match as { relevance?: unknown }).relevance === 'number' &&
                (match as { relevance: number }).relevance >= 0.58,
        );
        const llmMatches = [...new Set<string>(
            matches.map((match) => match.id).filter((id) => allowed.has(id)),
        )];
        // Reject an obviously permissive classification. This catches models
        // that treat a shared LEGO/vehicle theme as relevant to every item.
        if (
            llmMatches.length > Math.max(5, batch.length * 0.6) &&
            fallback.length < batch.length * 0.3
        ) {
            return fallback;
        }
        return llmMatches;
    } catch {
        return fallback;
    } finally {
        clearTimeout(timeout);
    }
}

const BUILD_BRIEF_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: [
        'category', 'scale', 'partBudget', 'proportions', 'symmetry',
        'requiredFeatures', 'palette', 'complexity', 'seed',
    ],
    properties: {
        category: {
            type: 'string',
            enum: [
                'vehicle', 'forklift', 'spacecraft', 'aircraft', 'building',
                'castle', 'tower', 'bridge', 'animal', 'furniture', 'sculpture',
            ],
        },
        scale: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'targetWidth', 'targetHeight', 'targetDepth'],
            properties: {
                name: { type: 'string', enum: ['micro', 'small', 'medium', 'large'] },
                targetWidth: { type: 'number', minimum: 1, maximum: 256 },
                targetHeight: { type: 'number', minimum: 1, maximum: 256 },
                targetDepth: { type: 'number', minimum: 1, maximum: 256 },
            },
        },
        partBudget: {
            type: 'object',
            additionalProperties: false,
            required: ['min', 'max'],
            properties: {
                min: { type: 'number', minimum: 0, maximum: 10000 },
                max: { type: 'number', minimum: 0, maximum: 10000 },
            },
        },
        proportions: {
            type: 'object',
            additionalProperties: false,
            required: ['width', 'height', 'depth'],
            properties: {
                width: { type: 'number', minimum: 0.01, maximum: 1 },
                height: { type: 'number', minimum: 0.01, maximum: 1 },
                depth: { type: 'number', minimum: 0.01, maximum: 1 },
            },
        },
        symmetry: {
            type: 'string',
            enum: ['none', 'bilateral', 'rotational', 'fourfold'],
        },
        requiredFeatures: {
            type: 'array',
            maxItems: 16,
            items: { type: 'string' },
        },
        palette: {
            type: 'object',
            additionalProperties: false,
            required: ['colors', 'allowTransparent'],
            properties: {
                colors: { type: 'array', maxItems: 12, items: { type: 'string' } },
                allowTransparent: { type: 'boolean' },
            },
        },
        complexity: {
            type: 'object',
            additionalProperties: false,
            required: ['level', 'detailBudget'],
            properties: {
                level: { type: 'string', enum: ['simple', 'moderate', 'detailed'] },
                detailBudget: { type: 'number', minimum: 0, maximum: 100 },
            },
        },
        seed: { type: 'integer', minimum: 0, maximum: 0xffffffff },
    },
} as const;

async function createSemanticBrief(prompt: string): Promise<{
    brief: BuildBrief;
    source: 'openrouter' | 'deterministic-fallback';
}> {
    const fallback = createFallbackBuildBrief(prompt);
    if (!OPENROUTER_KEY) return { brief: fallback, source: 'deterministic-fallback' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
        const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${OPENROUTER_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://yellobricks.xala.ai',
                'X-Title': 'YelloBricks',
            },
            body: JSON.stringify({
                model: AI_MODEL,
                temperature: 0,
                max_tokens: 700,
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'semantic_build_brief',
                        strict: true,
                        schema: BUILD_BRIEF_SCHEMA,
                    },
                },
                messages: [
                    {
                        role: 'system',
                        content:
                            'Convert the request into one semantic LEGO BuildBrief. ' +
                            'Return only the schema fields. Never produce brick placements, coordinates, layers, or instructions. ' +
                            'Keep proportions normalized and ensure partBudget.max is not below partBudget.min.',
                    },
                    { role: 'user', content: prompt.slice(0, 1000) },
                ],
            }),
        });
        if (!res.ok) return { brief: fallback, source: 'deterministic-fallback' };
        const json = await res.json();
        const content: unknown = json.choices?.[0]?.message?.content;
        let decoded: unknown = content;
        if (typeof content === 'string') {
            try {
                decoded = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/gi, ''));
            } catch {
                decoded = null;
            }
        }
        if (!validateBuildBrief(decoded)) {
            return { brief: fallback, source: 'deterministic-fallback' };
        }
        return { brief: parseBuildBrief(decoded, prompt), source: 'openrouter' };
    } catch {
        return { brief: fallback, source: 'deterministic-fallback' };
    } finally {
        clearTimeout(timeout);
    }
}

function toAIBuild(
    plan: BuildPlan,
    briefSource: 'openrouter' | 'deterministic-fallback',
    inspiration?: AIBuild['inspiration'],
): AIBuild {
    return {
        id: plan.id,
        name: inspiration ? `Original ${inspiration.name}-inspired build` : plan.name,
        description: inspiration
            ? `An original semantic approximation inspired by “${inspiration.name}”, planned only from your selected garage stock.`
            : plan.description,
        ldrawText: plan.ldrawText,
        steps: plan.steps.map((step) => ({
            stepNum: step.step,
            partNum: step.partNum,
            colorId: step.colorId,
            colorName: step.colorName,
            x: step.x,
            y: step.y,
            z: step.z,
            rotation: step.rot,
            description: step.description,
            loadBearing: step.loadBearing,
        })),
        placed: plan.steps,
        totalParts: plan.steps.length,
        estimatedFidelityScore: plan.fidelityScore,
        estimatedRigidityScore: plan.rigidityScore,
        compositeScore: plan.compositeScore,
        warnings: plan.warnings,
        diagnostics: plan.diagnostics,
        sources: plan.sources,
        assemblySteps: plan.assemblySteps,
        dependencyDag: plan.dependencyDag,
        candidateRank: plan.candidateRank,
        candidateSeed: plan.seed,
        briefSource,
        inspiration,
        generatedAt: new Date().toISOString(),
    };
}

/**
 * Produces up to three local inventory-constrained candidates after one
 * schema-validated semantic interpretation call.
 */
export async function generateAIBuildCandidatesAction(
    inventory: SlimInventoryItem[],
    prompt: string,
    fidelityWeight: number,
    age: number,
    interpret = true,
    inspiration?: AIBuild['inspiration'],
): Promise<AIBuild[]> {
    if (!inventory?.length) throw new Error('No parts in selected sets');
    const semantic = interpret
        ? await createSemanticBrief(prompt)
        : { brief: createFallbackBuildBrief(prompt), source: 'deterministic-fallback' as const };
    const plans = await planBuildCandidatesFromInventory(
        inventory,
        prompt,
        fidelityWeight,
        age,
        semantic.brief,
    );
    return plans.slice(0, 3).map((plan) => toAIBuild(plan, semantic.source, inspiration));
}

/** Preserves the original API by returning the highest-ranked candidate. */
export async function generateAIBuildAction(
    inventory: SlimInventoryItem[],
    prompt: string,
    fidelityWeight: number,
    age: number,
    enrich = true,
): Promise<AIBuild> {
    const candidates = await generateAIBuildCandidatesAction(
        inventory,
        prompt,
        fidelityWeight,
        age,
        enrich,
    );
    return candidates[0];
}

/**
 * Generate an original, name-inspired assembly from selected garage stock.
 * The target inventory and source instructions are never fetched here.
 */
export async function attemptCandidateRebuildAction(
    setNum: string,
    setName: string,
    source: 'official' | 'rebrickable',
    fidelityWeight: number,
    age: number,
    garageInventory: SlimInventoryItem[],
    sourceUrl?: string,
): Promise<AIBuild> {
    if (!garageInventory?.length) {
        throw new Error('No selected garage inventory is available for an original rebuild attempt.');
    }
    const [build] = await generateAIBuildCandidatesAction(
        garageInventory,
        `an original ${setName}-inspired ${source === 'rebrickable' ? 'community MOC' : 'set'} approximation`,
        fidelityWeight,
        age,
        false,
        {
            kind: source === 'rebrickable' ? 'community-moc' : 'official-set',
            id: setNum,
            name: setName,
            url: sourceUrl,
            limitation: source === 'rebrickable'
                ? 'The MOC inventory and designer instructions are restricted; they were not fetched or reproduced.'
                : 'The set name is target inspiration; the selected garage inventory is the only build stock.',
        },
    );
    return build;
}

// ---------------------------------------------------------------------------
// Legacy stubs
// ---------------------------------------------------------------------------
export async function findSmartCandidatesAction(): Promise<Moc[]> { return []; }
export async function getMocInventoryAction(setNum: string): Promise<InventoryPart[]> {
    void setNum;
    // Rebrickable restricts MOC inventories. Do not probe or imply availability.
    return [];
}
