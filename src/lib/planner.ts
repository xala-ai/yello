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
  fidelityScore: number;
  rigidityScore: number;
  compositeScore: number;
  warnings: string[];
}

interface InventoryItem {
  partNum: string;
  name: string;
  colorId: number;
  colorName: string;
  qty: number;
}

type SizeCategory = 'large_plate' | 'medium_plate' | 'small_plate' | 'large_brick' | 'medium_brick' | 'small_brick' | 'slope' | 'tile' | 'detail';

function classifyPart(partNum: string, name: string): { category: SizeCategory; studsX: number; studsY: number; heightUnits: number } {
  const n = name.toLowerCase();
  const pn = partNum.toLowerCase();

  if (n.includes('baseplate') || pn === '3811' || pn === '10701') {
    return { category: 'large_plate', studsX: 16, studsY: 16, heightUnits: 1 };
  }
  if (n.includes('plate') && (n.includes('8 x') || n.includes('6 x'))) {
    const m = n.match(/(\d+)\s*x\s*(\d+)/);
    const sx = m ? parseInt(m[1]) : 6;
    const sy = m ? parseInt(m[2]) : 4;
    return { category: sx >= 6 ? 'large_plate' : 'medium_plate', studsX: sx, studsY: sy, heightUnits: 1 };
  }
  if (n.includes('plate')) {
    const m = n.match(/(\d+)\s*x\s*(\d+)/);
    const sx = m ? parseInt(m[1]) : 2;
    const sy = m ? parseInt(m[2]) : 2;
    if (sx >= 4 || sy >= 4) return { category: 'medium_plate', studsX: sx, studsY: sy, heightUnits: 1 };
    return { category: 'small_plate', studsX: sx, studsY: sy, heightUnits: 1 };
  }
  if (n.includes('slope') || n.includes('wedge')) {
    const m = n.match(/(\d+)\s*x\s*(\d+)/);
    return { category: 'slope', studsX: m ? parseInt(m[1]) : 2, studsY: m ? parseInt(m[2]) : 1, heightUnits: 3 };
  }
  if (n.includes('tile')) {
    const m = n.match(/(\d+)\s*x\s*(\d+)/);
    return { category: 'tile', studsX: m ? parseInt(m[1]) : 1, studsY: m ? parseInt(m[2]) : 1, heightUnits: 1 };
  }
  if (n.includes('brick')) {
    const m = n.match(/(\d+)\s*x\s*(\d+)/);
    const sx = m ? parseInt(m[1]) : 2;
    const sy = m ? parseInt(m[2]) : 2;
    if (sx >= 4 || sy >= 4) return { category: 'large_brick', studsX: sx, studsY: sy, heightUnits: 3 };
    if (sx >= 2 && sy >= 2) return { category: 'medium_brick', studsX: sx, studsY: sy, heightUnits: 3 };
    return { category: 'small_brick', studsX: sx, studsY: sy, heightUnits: 3 };
  }
  return { category: 'detail', studsX: 1, studsY: 1, heightUnits: 1 };
}

const LAYER_ORDER: SizeCategory[] = ['large_plate', 'medium_plate', 'large_brick', 'medium_brick', 'small_plate', 'small_brick', 'slope', 'tile', 'detail'];

function simpleId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let r = '';
  for (let i = 0; i < 12; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

export async function planBuildFromInventory(
  inventorySummary: InventoryItem[],
  intent: string,
  fidelityWeight: number,
  age: number
): Promise<BuildPlan> {
  const warnings: string[] = [];
  const remaining = new Map<string, number>();
  const itemMap = new Map<string, InventoryItem>();

  for (const item of inventorySummary) {
    const key = `${item.partNum}__${item.colorId}`;
    remaining.set(key, (remaining.get(key) || 0) + item.qty);
    itemMap.set(key, item);
  }

  const classified = inventorySummary.map(item => ({
    ...item,
    key: `${item.partNum}__${item.colorId}`,
    ...classifyPart(item.partNum, item.name),
  }));

  classified.sort((a, b) => {
    const ai = LAYER_ORDER.indexOf(a.category);
    const bi = LAYER_ORDER.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    return (b.studsX * b.studsY) - (a.studsX * a.studsY);
  });

  const steps: PlacedBrick[] = [];
  let currentX = 0;
  let currentY = 0;
  let currentZ = 0;
  let stepNum = 1;
  let maxX = 0;
  let maxY = 0;

  const maxSteps = age < 6 ? 20 : age < 10 ? 40 : 80;
  const intentLower = intent.toLowerCase();
  const wantsHouse = intentLower.includes('house') || intentLower.includes('building');
  const wantsCar = intentLower.includes('car') || intentLower.includes('vehicle');
  const wantsTower = intentLower.includes('tower') || intentLower.includes('tall');
  const wantsWall = intentLower.includes('wall') || intentLower.includes('fort');

  let phase: 'foundation' | 'walls' | 'roof' | 'detail' = 'foundation';
  let foundationLayers = 0;
  const maxFoundation = 2;
  let wallLayers = 0;
  const maxWalls = wantsTower ? 8 : wantsHouse ? 4 : wantsWall ? 3 : 2;
  let rigidityPoints = 0;
  let fidelityPoints = 0;
  let totalPossibleRigidity = 0;
  let totalPossibleFidelity = 0;

  function consume(key: string): boolean {
    const r = remaining.get(key) || 0;
    if (r <= 0) return false;
    remaining.set(key, r - 1);
    return true;
  }

  function placePart(item: typeof classified[0], x: number, y: number, z: number, rot: number, desc: string, lb: boolean) {
    if (!consume(item.key)) return false;
    steps.push({
      partNum: item.partNum,
      colorId: item.colorId,
      colorName: item.colorName,
      x, y, z, rot,
      step: stepNum,
      description: desc,
      loadBearing: lb,
    });
    stepNum++;
    return true;
  }

  // Foundation phase: place largest plates/bricks at z=0,1
  for (const item of classified) {
    if (steps.length >= maxSteps) break;
    if (phase === 'foundation' && (item.category === 'large_plate' || item.category === 'medium_plate' || item.category === 'large_brick')) {
      const avail = remaining.get(item.key) || 0;
      for (let i = 0; i < avail && steps.length < maxSteps; i++) {
        const placed = placePart(item, currentX, currentY, currentZ, 0, `Foundation layer ${foundationLayers}: ${item.name}`, true);
        if (placed) {
          totalPossibleRigidity += 10;
          const overlap = currentX > 0 || currentY > 0;
          rigidityPoints += overlap ? 10 : 8;
          if (item.studsX * item.studsY >= 16) rigidityPoints += 2;
          maxX = Math.max(maxX, currentX + item.studsX);
          maxY = Math.max(maxY, currentY + item.studsY);
          currentX += item.studsX;
          if (currentX >= 16) {
            currentX = 0;
            currentY += item.studsY;
          }
        }
      }
    }
  }

  if (maxX === 0) maxX = 8;
  if (maxY === 0) maxY = 8;
  foundationLayers = 1;
  currentZ = 1;
  phase = 'walls';
  currentX = 0;
  currentY = 0;

  // Walls phase: bricks around perimeter or stacked
  const wallParts = classified.filter(c => c.category === 'medium_brick' || c.category === 'small_brick' || c.category === 'large_brick');
  const perimeterPositions: Array<{ x: number; y: number }> = [];

  if (wantsHouse || wantsWall || wantsTower) {
    for (let px = 0; px < maxX; px += 2) {
      perimeterPositions.push({ x: px, y: 0 });
      perimeterPositions.push({ x: px, y: Math.max(0, maxY - 2) });
    }
    for (let py = 2; py < maxY - 2; py += 2) {
      perimeterPositions.push({ x: 0, y: py });
      perimeterPositions.push({ x: Math.max(0, maxX - 2), y: py });
    }
  } else {
    for (let px = 0; px < maxX; px += 2) {
      for (let py = 0; py < maxY; py += 2) {
        perimeterPositions.push({ x: px, y: py });
      }
    }
  }

  for (let layer = 0; layer < maxWalls && steps.length < maxSteps; layer++) {
    let staggerOffset = layer % 2 === 1 ? 1 : 0;
    for (const pos of perimeterPositions) {
      if (steps.length >= maxSteps) break;
      for (const wp of wallParts) {
        const avail = remaining.get(wp.key) || 0;
        if (avail <= 0) continue;
        const px = pos.x + staggerOffset;
        const pz = currentZ + layer * 3;
        const isLowerLayer = layer <= 1;
        const lb = isLowerLayer;
        const placed = placePart(wp, px, pos.y, pz, 0, `Wall layer ${layer}: ${wp.name}`, lb);
        if (placed) {
          totalPossibleRigidity += 10;
          rigidityPoints += staggerOffset !== 0 ? 9 : 6;
          if (lb && wp.studsX >= 2 && wp.studsY >= 2) rigidityPoints += 2;
          wallLayers = layer + 1;
          break;
        }
      }
    }
  }

  const topZ = currentZ + wallLayers * 3;
  phase = 'roof';

  // Roof phase: slopes and plates on top
  const roofParts = classified.filter(c => c.category === 'slope' || c.category === 'large_plate' || c.category === 'medium_plate');
  let roofX = 0;
  for (const rp of roofParts) {
    if (steps.length >= maxSteps) break;
    const avail = remaining.get(rp.key) || 0;
    for (let i = 0; i < avail && steps.length < maxSteps && roofX < maxX; i++) {
      const rot = rp.category === 'slope' ? 0 : 0;
      const placed = placePart(rp, roofX, 0, topZ, rot, `Roof: ${rp.name}`, false);
      if (placed) {
        totalPossibleFidelity += 10;
        fidelityPoints += rp.category === 'slope' && (wantsHouse || wantsTower) ? 10 : 5;
        roofX += rp.studsX;
      }
    }
  }

  phase = 'detail';

  // Detail phase: tiles, small parts, decorations
  const detailParts = classified.filter(c => c.category === 'tile' || c.category === 'detail' || c.category === 'small_plate');
  let detailX = 0;
  let detailZ = 0;
  for (const dp of detailParts) {
    if (steps.length >= maxSteps) break;
    const avail = remaining.get(dp.key) || 0;
    for (let i = 0; i < Math.min(avail, 4) && steps.length < maxSteps; i++) {
      const placed = placePart(dp, detailX, 0, detailZ, 0, `Detail: ${dp.name}`, false);
      if (placed) {
        totalPossibleFidelity += 5;
        fidelityPoints += 3;
        detailX += dp.studsX;
        if (detailX >= maxX) {
          detailX = 0;
          detailZ += dp.heightUnits;
        }
      }
    }
  }

  // Scoring
  if (totalPossibleRigidity === 0) totalPossibleRigidity = 1;
  if (totalPossibleFidelity === 0) totalPossibleFidelity = 1;

  const rigidityScore = Math.min(1, rigidityPoints / totalPossibleRigidity);
  const rawFidelity = Math.min(1, fidelityPoints / totalPossibleFidelity);
  const fidelityScore = rawFidelity;
  const fw = Math.max(0, Math.min(1, fidelityWeight));
  const compositeScore = fw * fidelityScore + (1 - fw) * rigidityScore;

  // Warnings
  if (steps.length === 0) warnings.push('No parts could be placed. Check your inventory.');
  if (steps.length < 5) warnings.push('Very few parts placed. The build may be incomplete.');
  if (rigidityScore < 0.3) warnings.push('Low rigidity: the build may be fragile. Consider using larger bricks at the base.');
  const layer0LoadBearing = steps.filter(s => s.z <= 1 && s.loadBearing).length;
  if (layer0LoadBearing < 2 && steps.length > 5) warnings.push('Weak foundation: fewer than 2 load-bearing parts in the base layers.');
  if (wantsCar && !classified.some(c => c.name.toLowerCase().includes('wheel'))) {
    warnings.push('No wheel parts found in inventory for a vehicle build.');
  }

  let buildName = 'Custom Build';
  if (wantsHouse) buildName = 'Custom House';
  else if (wantsCar) buildName = 'Custom Vehicle';
  else if (wantsTower) buildName = 'Custom Tower';
  else if (wantsWall) buildName = 'Custom Wall/Fort';
  else if (intent.trim()) buildName = `Custom: ${intent.slice(0, 40)}`;

  return {
    id: simpleId(),
    name: buildName,
    description: `A ${buildName.toLowerCase()} built from ${steps.length} parts across ${stepNum - 1} steps. Intent: "${intent}". Age-appropriate for ${age}+.`,
    steps,
    fidelityScore: Math.round(fidelityScore * 100) / 100,
    rigidityScore: Math.round(rigidityScore * 100) / 100,
    compositeScore: Math.round(compositeScore * 100) / 100,
    warnings,
  };
}
