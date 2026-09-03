import { emitLDraw } from './brickgpt/ldraw-emit';
import {
  sequenceInventoryBuild,
  type SequencerInventoryItem,
} from './brickgpt/sequencer';

export interface PlacedBrick {
  partNum: string;
  colorId: number;
  colorName: string;
  x: number;
  y: number;
  z: number;
  rot: number;
  step: number;
  description: string;
  loadBearing: boolean;
}

export interface BuildPlan {
  id: string;
  name: string;
  description: string;
  steps: PlacedBrick[];
  ldrawText: string;
  fidelityScore: number;
  rigidityScore: number;
  compositeScore: number;
  warnings: string[];
}

function simpleId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

function buildName(kind: string, intent: string): string {
  if (kind === 'house') return 'BrickGPT House';
  if (kind === 'vehicle') return 'BrickGPT Vehicle';
  if (kind === 'spacecraft') return 'BrickGPT Spacecraft';
  if (kind === 'tower') return 'BrickGPT Tower';
  if (kind === 'bridge') return 'BrickGPT Bridge';
  return intent.trim() ? `BrickGPT: ${intent.trim().slice(0, 40)}` : 'BrickGPT Sculpture';
}

/**
 * Serverless BrickGPT-lite planner.
 *
 * BrickGPT's learned weights cannot run in a Netlify function, so this ports
 * its constrained next-brick loop: limited vocabulary, stud-grid bounds,
 * collision rejection, connectivity checks, inventory depletion and LDraw
 * serialization.
 */
export async function planBuildFromInventory(
  inventorySummary: SequencerInventoryItem[],
  intent: string,
  fidelityWeight: number,
  age: number,
): Promise<BuildPlan> {
  const sequence = sequenceInventoryBuild(inventorySummary, intent, age);
  const name = buildName(sequence.intentKind, intent);
  const warnings: string[] = [];

  if (sequence.usableInventoryCount === 0) {
    warnings.push(
      'No standard BrickGPT bricks were found. This first version supports standard 1-wide and 2-wide bricks only.',
    );
  }
  if (sequence.placements.length === 0) {
    warnings.push('No connected, collision-free structure could be generated from the supported bricks.');
  } else if (sequence.placements.length < 5) {
    warnings.push('Only a small connected structure could be made from the supported bricks.');
  }
  const rejectedCount = Object.values(sequence.rejected).reduce((sum, count) => sum + count, 0);
  if (rejectedCount > 0) {
    warnings.push(`${rejectedCount} invalid next-brick candidates were rejected during planning.`);
  }

  const steps: PlacedBrick[] = sequence.placements.map((brick) => ({
    partNum: brick.partNum,
    colorId: brick.colorId,
    colorName: brick.colorName,
    x: brick.x,
    y: brick.y,
    z: brick.z,
    rot: brick.rotation,
    step: brick.step,
    description: brick.description,
    loadBearing: brick.loadBearing,
  }));

  const usedRatio =
    sequence.usableInventoryCount > 0
      ? sequence.placements.length / sequence.usableInventoryCount
      : 0;
  const supportRatio =
    sequence.placements.length > 0
      ? sequence.placements.reduce((sum, brick) => {
          const area = brick.width * brick.depth;
          return sum + Math.min(1, brick.supportStuds / Math.max(1, area));
        }, 0) / sequence.placements.length
      : 0;
  const fidelityScore = Math.round(Math.min(1, usedRatio * 1.8) * 100);
  const rigidityScore = Math.round(supportRatio * 100);
  const weight = Math.max(0, Math.min(1, fidelityWeight));
  const compositeScore = Math.round(fidelityScore * weight + rigidityScore * (1 - weight));
  const ldrawText = emitLDraw(sequence.placements, name);
  const layerCount = Math.max(0, ...steps.map((step) => step.step));

  return {
    id: simpleId(),
    name,
    description:
      `A ${sequence.intentKind} generated as ${sequence.placements.length} real LDraw bricks ` +
      `across ${layerCount} connected build steps from your garage inventory.`,
    steps,
    ldrawText,
    fidelityScore,
    rigidityScore,
    compositeScore,
    warnings,
  };
}
