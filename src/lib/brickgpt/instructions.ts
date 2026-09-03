import type { BrickPlacement } from './sequencer';

export interface AssemblyDependency {
  placementId: number;
  dependsOn: number[];
  supportStuds: number;
}

export interface AssemblyStep {
  number: number;
  title: string;
  kind: 'main-build' | 'subassembly';
  placementIds: number[];
  dependsOnSteps: number[];
}

export interface AssemblyInstructions {
  placements: BrickPlacement[];
  dependencies: AssemblyDependency[];
  steps: AssemblyStep[];
  warnings: string[];
}

function overlapLength(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function footprintContact(lower: BrickPlacement, upper: BrickPlacement): number {
  if (lower.z + lower.height !== upper.z) return 0;
  return overlapLength(lower.x, lower.x + lower.width, upper.x, upper.x + upper.width) *
    overlapLength(lower.y, lower.y + lower.depth, upper.y, upper.y + upper.depth);
}

/** Derives direct vertical support dependencies from finalized geometry. */
export function deriveSupportDependencyDag(
  placements: readonly BrickPlacement[],
): AssemblyDependency[] {
  return [...placements]
    .sort((a, b) => a.placementId - b.placementId)
    .map((placement) => {
      const supports = placements
        .map((candidate) => ({
          id: candidate.placementId,
          studs: footprintContact(candidate, placement),
        }))
        .filter(({ studs }) => studs > 0)
        .sort((a, b) => a.id - b.id);
      return {
        placementId: placement.placementId,
        dependsOn: supports.map(({ id }) => id),
        supportStuds: supports.reduce((sum, support) => sum + support.studs, 0),
      };
    });
}

function dependencyOrder(
  placements: readonly BrickPlacement[],
  dependencies: readonly AssemblyDependency[],
): { ordered: BrickPlacement[]; cyclic: boolean } {
  const byId = new Map(placements.map((placement) => [placement.placementId, placement]));
  const remaining = new Map(dependencies.map((dependency) => [
    dependency.placementId,
    new Set(dependency.dependsOn),
  ]));
  const ordered: BrickPlacement[] = [];
  const built = new Set<number>();

  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter(([, parents]) => [...parents].every((id) => built.has(id)))
      .map(([id]) => byId.get(id))
      .filter((placement): placement is BrickPlacement => placement !== undefined)
      .sort((a, b) =>
        a.z - b.z ||
        Number(b.loadBearing) - Number(a.loadBearing) ||
        b.width * b.depth - a.width * a.depth ||
        a.y - b.y ||
        a.x - b.x ||
        a.placementId - b.placementId
      );
    if (ready.length === 0) break;

    const connectedReady = ready.filter((placement) => {
      const parents = remaining.get(placement.placementId);
      return built.size === 0 || (parents !== undefined && [...parents].some((id) => built.has(id)));
    });
    const next = connectedReady[0] ?? ready[0];
    ordered.push(next);
    built.add(next.placementId);
    remaining.delete(next.placementId);
  }

  return { ordered, cyclic: remaining.size > 0 };
}

function connectedComponentCount(
  prefixIds: ReadonlySet<number>,
  dependencies: readonly AssemblyDependency[],
): number {
  if (prefixIds.size === 0) return 0;
  const adjacency = new Map<number, Set<number>>();
  for (const id of prefixIds) adjacency.set(id, new Set());
  for (const dependency of dependencies) {
    if (!prefixIds.has(dependency.placementId)) continue;
    for (const parent of dependency.dependsOn) {
      if (!prefixIds.has(parent)) continue;
      adjacency.get(dependency.placementId)?.add(parent);
      adjacency.get(parent)?.add(dependency.placementId);
    }
  }
  const seen = new Set<number>();
  let components = 0;
  for (const id of prefixIds) {
    if (seen.has(id)) continue;
    components++;
    const pending = [id];
    seen.add(id);
    while (pending.length > 0) {
      const current = pending.pop()!;
      for (const neighbour of adjacency.get(current) ?? []) {
        if (!seen.has(neighbour)) {
          seen.add(neighbour);
          pending.push(neighbour);
        }
      }
    }
  }
  return components;
}

function centerOfMassSupported(
  prefix: readonly BrickPlacement[],
): boolean {
  if (prefix.length === 0) return true;
  const ground = prefix.filter((placement) => placement.z === 0);
  if (ground.length === 0) return false;
  let mass = 0;
  let xMoment = 0;
  let yMoment = 0;
  for (const placement of prefix) {
    const placementMass = placement.width * placement.depth * placement.height;
    mass += placementMass;
    xMoment += (placement.x + placement.width / 2) * placementMass;
    yMoment += (placement.y + placement.depth / 2) * placementMass;
  }
  const center = { x: xMoment / mass, y: yMoment / mass };
  const footprint = {
    minX: Math.min(...ground.map((placement) => placement.x)),
    maxX: Math.max(...ground.map((placement) => placement.x + placement.width)),
    minY: Math.min(...ground.map((placement) => placement.y)),
    maxY: Math.max(...ground.map((placement) => placement.y + placement.depth)),
  };
  return center.x >= footprint.minX &&
    center.x <= footprint.maxX &&
    center.y >= footprint.minY &&
    center.y <= footprint.maxY;
}

function stepTitle(placements: readonly BrickPlacement[], kind: AssemblyStep['kind']): string {
  const roles = new Set(placements.flatMap((placement) => placement.roles));
  if (kind === 'subassembly') return 'Build and attach the supporting subassembly';
  if (placements.every((placement) => placement.z === 0)) return 'Establish the connected base';
  if (roles.has('wheel') || roles.has('axle')) return 'Attach the running gear';
  if (roles.has('transparent')) return 'Add the windows and canopy';
  if (roles.has('slope')) return 'Shape the outer profile';
  if (roles.has('tile') || roles.has('detail')) return 'Finish the visible details';
  if (placements.some((placement) => placement.loadBearing)) return 'Reinforce the main structure';
  return 'Extend the connected structure';
}

/**
 * Produces stable instruction checkpoints. Detached roots are kept in the same
 * step as the first placement that joins them, so every completed step remains
 * one connected assembly even when the finalized support DAG branches.
 */
export function createAssemblyInstructions(
  placements: readonly BrickPlacement[],
): AssemblyInstructions {
  const dependencies = deriveSupportDependencyDag(placements);
  const { ordered, cyclic } = dependencyOrder(placements, dependencies);
  const warnings: string[] = [];
  if (cyclic) warnings.push('The support graph was cyclic; instruction ordering is incomplete.');

  const steps: AssemblyStep[] = [];
  const builtIds = new Set<number>();
  let group: BrickPlacement[] = [];
  let groupStartedDetached = false;

  const closeGroup = () => {
    if (group.length === 0) return;
    const number = steps.length + 1;
    const placementIds = group.map((placement) => placement.placementId);
    const priorStepByPlacement = new Map(
      steps.flatMap((step) => step.placementIds.map((id) => [id, step.number] as const)),
    );
    const dependsOnSteps = [...new Set(
      dependencies
        .filter((dependency) => placementIds.includes(dependency.placementId))
        .flatMap((dependency) => dependency.dependsOn)
        .map((id) => priorStepByPlacement.get(id))
        .filter((step): step is number => step !== undefined),
    )].sort((a, b) => a - b);
    const kind = groupStartedDetached ? 'subassembly' : 'main-build';
    steps.push({
      number,
      title: stepTitle(group, kind),
      kind,
      placementIds,
      dependsOnSteps,
    });
    group = [];
    groupStartedDetached = false;
  };

  for (const placement of ordered) {
    const wasConnected = connectedComponentCount(builtIds, dependencies) <= 1;
    builtIds.add(placement.placementId);
    group.push(placement);
    const components = connectedComponentCount(builtIds, dependencies);
    if (wasConnected && components > 1) groupStartedDetached = true;
    const prefix = ordered.filter((candidate) => builtIds.has(candidate.placementId));
    const stableCheckpoint = components <= 1 && centerOfMassSupported(prefix);
    const next = ordered[ordered.indexOf(placement) + 1];
    const roleChanges = next !== undefined &&
      !next.roles.some((role) => placement.roles.includes(role));
    if (stableCheckpoint && (group.length >= 4 || roleChanges || next === undefined)) closeGroup();
  }
  closeGroup();

  const stepByPlacement = new Map(
    steps.flatMap((step) => step.placementIds.map((id) => [id, step.number] as const)),
  );
  const titleByStep = new Map(steps.map((step) => [step.number, step.title]));
  const sequenced = ordered.map((placement) => {
    const step = stepByPlacement.get(placement.placementId) ?? 1;
    return {
      ...placement,
      step,
      description: `Step ${step}: ${titleByStep.get(step) ?? placement.description}`,
    };
  });

  if (steps.length > 0 && !centerOfMassSupported(sequenced)) {
    warnings.push('The completed model center of mass is outside its ground support footprint.');
  }
  return { placements: sequenced, dependencies, steps, warnings };
}
