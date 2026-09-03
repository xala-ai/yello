import type {
  Axis,
  BuildBrief,
  OccupancyCell,
  RetrievedReference,
  SemanticCell,
  SemanticTarget,
} from './types';

export interface SemanticMotif {
  cells: SemanticCell[];
}

function key(cell: Pick<SemanticCell, 'x' | 'y' | 'z'>): string {
  return `${cell.x},${cell.y},${cell.z}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function normalizeCells(cells: SemanticCell[]): SemanticCell[] {
  const merged = new Map<string, SemanticCell>();
  for (const cell of cells) {
    const existing = merged.get(key(cell));
    if (existing) {
      existing.regions = unique([...existing.regions, ...cell.regions]);
      existing.features = unique([...existing.features, ...cell.features]);
      existing.sourceIds = unique([...existing.sourceIds, ...cell.sourceIds]);
    } else {
      merged.set(key(cell), {
        x: cell.x,
        y: cell.y,
        z: cell.z,
        regions: unique(cell.regions),
        features: unique(cell.features),
        sourceIds: unique(cell.sourceIds),
      });
    }
  }
  return [...merged.values()].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
}

export function occupancyToMotif(
  cells: readonly OccupancyCell[],
  region: string,
  features: string[] = [],
  sourceId = region,
): SemanticMotif {
  return {
    cells: cells.map(([x, y, z]) => ({
      x,
      y,
      z,
      regions: [region],
      features: [...features],
      sourceIds: [sourceId],
    })),
  };
}

/** Resamples occupied cells without introducing gaps and preserves labels. */
export function scaleMotif(
  motif: SemanticMotif,
  scale: number | { x: number; y: number; z: number },
): SemanticMotif {
  const factors = typeof scale === 'number' ? { x: scale, y: scale, z: scale } : scale;
  const sx = Number.isFinite(factors.x) && factors.x > 0 ? factors.x : 1;
  const sy = Number.isFinite(factors.y) && factors.y > 0 ? factors.y : 1;
  const sz = Number.isFinite(factors.z) && factors.z > 0 ? factors.z : 1;
  const cells: SemanticCell[] = [];
  for (const cell of motif.cells) {
    const x0 = Math.floor(cell.x * sx);
    const y0 = Math.floor(cell.y * sy);
    const z0 = Math.floor(cell.z * sz);
    const x1 = Math.max(x0 + 1, Math.ceil((cell.x + 1) * sx));
    const y1 = Math.max(y0 + 1, Math.ceil((cell.y + 1) * sy));
    const z1 = Math.max(z0 + 1, Math.ceil((cell.z + 1) * sz));
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        for (let z = z0; z < z1; z++) {
          cells.push({
            ...cell,
            x,
            y,
            z,
            regions: [...cell.regions],
            features: [...cell.features],
            sourceIds: [...cell.sourceIds],
          });
        }
      }
    }
  }
  return { cells: normalizeCells(cells) };
}

export function translateMotif(
  motif: SemanticMotif,
  offset: { x: number; y: number; z: number },
): SemanticMotif {
  return {
    cells: motif.cells.map((cell) => ({
      ...cell,
      x: cell.x + Math.round(offset.x),
      y: cell.y + Math.round(offset.y),
      z: cell.z + Math.round(offset.z),
      regions: [...cell.regions],
      features: [...cell.features],
      sourceIds: [...cell.sourceIds],
    })),
  };
}

export function mirrorMotif(motif: SemanticMotif, axis: Axis = 'x'): SemanticMotif {
  if (motif.cells.length === 0) return { cells: [] };
  const coordinates = motif.cells.map((cell) => cell[axis]);
  const min = Math.min(...coordinates);
  const max = Math.max(...coordinates);
  return {
    cells: motif.cells.map((cell) => ({
      ...cell,
      [axis]: min + max - cell[axis],
      regions: [...cell.regions],
      features: [...cell.features],
      sourceIds: [...cell.sourceIds],
    })),
  };
}

export function mergeMotifs(...motifs: SemanticMotif[]): SemanticMotif {
  return { cells: normalizeCells(motifs.flatMap((motif) => motif.cells)) };
}

function dimensions(cells: SemanticCell[]): SemanticTarget['dimensions'] {
  if (cells.length === 0) return { width: 0, height: 0, depth: 0 };
  return {
    width: Math.max(...cells.map((cell) => cell.x)) + 1,
    height: Math.max(...cells.map((cell) => cell.y)) + 1,
    depth: Math.max(...cells.map((cell) => cell.z)) + 1,
  };
}

function fitMotif(motif: SemanticMotif, brief: BuildBrief): SemanticMotif {
  const size = dimensions(motif.cells);
  if (size.width === 0) return motif;
  const factor = Math.min(
    brief.scale.targetWidth / size.width,
    brief.scale.targetHeight / size.height,
    brief.scale.targetDepth / size.depth,
  );
  return scaleMotif(motif, factor);
}

function fitReferenceMotif(motif: SemanticMotif, brief: BuildBrief): SemanticMotif {
  const size = dimensions(motif.cells);
  if (size.width === 0) return motif;
  const factor = Math.min(
    brief.scale.targetWidth / size.width,
    brief.scale.targetHeight / size.height,
    brief.scale.targetDepth / size.depth,
  ) * 0.6;
  const scaled = scaleMotif(motif, factor);
  const scaledSize = dimensions(scaled.cells);
  return translateMotif(scaled, {
    x: Math.max(0, Math.floor((brief.scale.targetWidth - scaledSize.width) / 2)),
    y: 0,
    z: Math.max(0, Math.floor((brief.scale.targetDepth - scaledSize.depth) / 2)),
  });
}

function addBox(
  cells: SemanticCell[],
  bounds: { x: number; y: number; z: number; width: number; height: number; depth: number },
  region: string,
  features: string[] = [],
): void {
  for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
    for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
      for (let z = bounds.z; z < bounds.z + bounds.depth; z++) {
        cells.push({ x, y, z, regions: [region], features, sourceIds: [`authored:${region}`] });
      }
    }
  }
}

function categoryMotif(brief: BuildBrief): SemanticMotif {
  const cells: SemanticCell[] = [];
  const box = (
    x: number, y: number, z: number, width: number, height: number, depth: number,
    region: string, features: string[] = [],
  ) => addBox(cells, { x, y, z, width, height, depth }, region, features);

  switch (brief.category) {
    case 'vehicle':
      box(1, 0, 2, 8, 1, 4, 'chassis', ['wheels', 'body']);
      box(3, 1, 2, 4, 2, 4, 'cab', ['cab', 'windows', 'sloped-profile']);
      box(1, 1, 3, 2, 1, 2, 'nose', ['nose', 'sloped-profile']);
      box(1, 1, 1, 2, 1, 1, 'wheel-front-left', ['wheels']);
      box(1, 1, 6, 2, 1, 1, 'wheel-front-right', ['wheels']);
      box(7, 1, 1, 2, 1, 1, 'wheel-rear-left', ['wheels']);
      box(7, 1, 6, 2, 1, 1, 'wheel-rear-right', ['wheels']);
      break;
    case 'forklift':
      box(1, 0, 2, 7, 1, 4, 'forklift-chassis', ['wheels', 'body']);
      box(2, 1, 2, 3, 2, 4, 'forklift-cab', ['cab', 'windows']);
      box(6, 1, 2, 1, 4, 4, 'mast', ['mast']);
      box(7, 1, 2, 3, 1, 1, 'fork-left', ['forks']);
      box(7, 1, 5, 3, 1, 1, 'fork-right', ['forks']);
      box(1, 1, 1, 2, 1, 1, 'forklift-wheel-left', ['wheels']);
      box(1, 1, 6, 2, 1, 1, 'forklift-wheel-right', ['wheels']);
      break;
    case 'spacecraft':
      box(3, 0, 1, 4, 1, 7, 'fuselage', ['body']);
      box(0, 1, 3, 10, 1, 3, 'wings', ['wings']);
      box(4, 1, 2, 2, 2, 4, 'cockpit', ['cab', 'cockpit', 'transparent-canopy']);
      box(3, 1, 7, 1, 1, 2, 'engine-left', ['engines']);
      box(6, 1, 7, 1, 1, 2, 'engine-right', ['engines']);
      box(4, 1, 0, 2, 1, 2, 'nose', ['nose', 'sloped-profile']);
      break;
    case 'aircraft':
      box(3, 0, 1, 4, 1, 6, 'aircraft-body', ['body']);
      box(1, 1, 2, 8, 1, 3, 'rotor-wing', ['wings']);
      box(4, 1, 1, 2, 2, 3, 'aircraft-cockpit', ['cab', 'cockpit', 'transparent-canopy']);
      box(4, 1, 6, 2, 1, 2, 'tail', ['tail']);
      box(2, 1, 3, 1, 1, 3, 'landing-left', ['supports']);
      box(7, 1, 3, 1, 1, 3, 'landing-right', ['supports']);
      break;
    case 'building':
      box(1, 0, 1, 8, 1, 7, 'foundation', ['walls']);
      box(1, 1, 1, 1, 3, 7, 'wall-left', ['walls', 'windows']);
      box(8, 1, 1, 1, 3, 7, 'wall-right', ['walls', 'windows']);
      box(2, 1, 1, 6, 3, 1, 'wall-front', ['walls', 'door', 'windows']);
      box(2, 1, 7, 6, 3, 1, 'wall-back', ['walls']);
      box(1, 4, 1, 8, 1, 7, 'roof', ['roof', 'sloped-profile']);
      break;
    case 'castle':
      box(1, 0, 1, 8, 1, 7, 'castle-base', ['walls']);
      box(1, 1, 1, 8, 2, 1, 'castle-front', ['battlements', 'entrance']);
      box(1, 1, 7, 8, 2, 1, 'castle-back', ['battlements']);
      box(1, 1, 2, 1, 2, 5, 'castle-left', ['walls']);
      box(8, 1, 2, 1, 2, 5, 'castle-right', ['walls']);
      box(1, 3, 1, 2, 2, 2, 'turret-a', ['turrets', 'battlements']);
      box(7, 3, 1, 2, 2, 2, 'turret-b', ['turrets', 'battlements']);
      box(4, 1, 1, 2, 2, 1, 'arched-entry', ['arch', 'door', 'entrance']);
      break;
    case 'tower':
      box(2, 0, 2, 6, 1, 5, 'tower-base', ['tall-profile']);
      box(3, 1, 2, 4, 3, 5, 'tower-shaft', ['tall-profile', 'transparent-canopy', 'windows']);
      box(3, 4, 2, 4, 2, 5, 'tower-upper', ['roof', 'roof-cap', 'tall-profile']);
      box(2, 6, 1, 6, 1, 7, 'tower-gallery', ['transparent-canopy', 'windows']);
      box(3, 7, 2, 4, 1, 5, 'tower-cap', ['roof-cap', 'roof']);
      break;
    case 'bridge':
      box(0, 0, 2, 3, 3, 4, 'pier-left', ['supports', 'pillars']);
      box(7, 0, 2, 3, 3, 4, 'pier-right', ['supports', 'pillars']);
      box(0, 3, 2, 10, 1, 4, 'span', ['supported-span']);
      box(3, 2, 2, 4, 1, 1, 'arch-front', ['opening', 'arch']);
      box(3, 2, 5, 4, 1, 1, 'arch-back', ['opening', 'arch']);
      break;
    case 'animal':
      box(2, 1, 2, 5, 2, 4, 'animal-body', ['body']);
      box(2, 1, 2, 2, 1, 4, 'head-neck', ['head', 'eyes']);
      box(0, 2, 2, 2, 2, 4, 'head', ['head', 'eyes']);
      box(7, 1, 3, 2, 1, 2, 'tail-root', ['tail']);
      box(8, 2, 3, 2, 1, 2, 'tail', ['tail']);
      box(2, 0, 2, 1, 1, 1, 'leg-a', ['legs']);
      box(2, 0, 5, 1, 1, 1, 'leg-b', ['legs']);
      box(7, 0, 2, 1, 1, 1, 'leg-c', ['legs']);
      box(7, 0, 5, 1, 1, 1, 'leg-d', ['legs']);
      break;
    case 'furniture':
      box(1, 0, 1, 1, 3, 1, 'chair-leg-a', ['supports']);
      box(6, 0, 1, 1, 3, 1, 'chair-leg-b', ['supports']);
      box(1, 0, 5, 1, 3, 1, 'chair-leg-c', ['supports']);
      box(6, 0, 5, 1, 3, 1, 'chair-leg-d', ['supports']);
      box(1, 3, 1, 6, 1, 5, 'seat', ['seat', 'usable-surface']);
      box(1, 4, 5, 6, 3, 1, 'backrest', ['backrest']);
      break;
    default:
      box(2, 0, 2, 6, 1, 5, 'sculpture-base', ['recognizable-silhouette']);
      box(3, 1, 3, 4, 2, 3, 'sculpture-body', ['recognizable-silhouette']);
      box(1, 3, 3, 8, 1, 3, 'sculpture-arms', ['recognizable-silhouette']);
      box(4, 4, 3, 2, 3, 3, 'sculpture-crown', ['recognizable-silhouette']);
  }
  return { cells: normalizeCells(cells) };
}

/** Adds vertical support columns to sparse normalized reference origins. */
function densifyReferenceMotif(motif: SemanticMotif): SemanticMotif {
  const cells: SemanticCell[] = [];
  for (const cell of motif.cells) {
    for (let y = 0; y <= cell.y; y++) {
      cells.push({
        ...cell,
        y,
        regions: [...cell.regions],
        features: [...cell.features],
        sourceIds: [...cell.sourceIds],
      });
    }
  }
  return { cells: normalizeCells(cells) };
}

/**
 * Overlays retrieved occupancy as labeled semantic regions. Required features
 * are attached to matching source regions; missing features are retained on a
 * deterministic top/edge anchor so later planning cannot silently lose them.
 */
export function composeSemanticTarget(
  brief: BuildBrief,
  references: readonly RetrievedReference[],
): SemanticTarget {
  const motifs = references.map(({ entry }) => densifyReferenceMotif(fitReferenceMotif(
    occupancyToMotif(
      entry.occupancy.cells,
      entry.id,
      entry.semantic.features,
      entry.id,
    ),
    brief,
  )));
  const merged = mergeMotifs(fitMotif(categoryMotif(brief), brief), ...motifs);

  if (brief.symmetry === 'bilateral' && merged.cells.length > 0) {
    merged.cells = mergeMotifs(merged, mirrorMotif(merged, 'x')).cells;
  }

  const present = new Set(merged.cells.flatMap((cell) => cell.features));
  const missing = brief.requiredFeatures.filter((feature) => !present.has(feature));
  if (merged.cells.length > 0) {
    const orderedAnchors = [...merged.cells].sort(
      (a, b) => b.y - a.y || a.x - b.x || a.z - b.z,
    );
    missing.forEach((feature, index) => {
      const anchor = orderedAnchors[index % orderedAnchors.length];
      anchor.features = unique([...anchor.features, feature]);
      anchor.regions = unique([...anchor.regions, `required:${feature}`]);
    });
  }

  const cells = normalizeCells(merged.cells);
  return {
    cells,
    dimensions: dimensions(cells),
    requiredFeatures: [...brief.requiredFeatures],
    sourceIds: unique(references.map(({ entry }) => entry.id)),
  };
}
