'use client';

import { suspend } from 'suspend-react';
import { Group } from 'three';
import { LDrawLoader } from 'three/examples/jsm/loaders/LDrawLoader.js';
import { LDrawConditionalLineMaterial } from 'three/examples/jsm/materials/LDrawConditionalLineMaterial.js';
import { LDRAW_COLORS_URL, LDRAW_PARTS_LIBRARY_PATH } from '@/lib/ldraw-config';

async function loadLDrawModel(url: string): Promise<Group> {
  const loader = new LDrawLoader();
  loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
  loader.setPartsLibraryPath(LDRAW_PARTS_LIBRARY_PATH);
  loader.smoothNormals = true;
  try {
    await loader.preloadMaterials(LDRAW_COLORS_URL);
  } catch {
    // Colours still often embedded in packed models
  }
  try {
    return await loader.loadAsync(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      msg.includes('404') || msg.toLowerCase().includes('not found')
        ? `Part/file not found in the LDraw library (${url.split('/').pop()}).`
        : `LDraw load failed: ${msg}`,
    );
  }
}

/** Suspense-friendly LDraw load. Cache key includes URL (blob: or /public path). */
export function useLDraw(url: string): Group {
  return suspend(() => loadLDrawModel(url), ['ldraw', url]);
}
