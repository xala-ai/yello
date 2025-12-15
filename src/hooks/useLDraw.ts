// LDrawLoader is included in three/examples/jsm/loaders/LDrawLoader
// We need to wrap it for use in React Three Fiber if not available in drei
// Actually, drei has 'useLoader' which works with standard Three loaders.

import { useLoader } from '@react-three/fiber';
import { LDrawLoader } from 'three/examples/jsm/loaders/LDrawLoader.js';
import { Group } from 'three';

export function useLDraw(url: string) {
  // LDrawLoader requires a path to the parts library.
  // We will point it to a CDN for standard parts.

  const object = useLoader(LDrawLoader, url, (loader) => {
    // Configure the loader to fetch parts from official LDraw library mirror
    // Or use a public CDN that hosts the ldraw parts folder structure.
    // 'https://cdn.jsdelivr.net/gh/scarthgap/LDraw-Parts-Library@master/' is a common hack,
    // but for production we should host our own or use a reliable service.
    // For this MVP, let's assume the user might provide a full file or we use a demo path.

    // Important: LDrawLoader needs to know where to find sub-parts.
    // We will set a standard path.
    (loader as LDrawLoader).setPath('https://cdn.jsdelivr.net/gh/goplayout/gpl-library/ldraw/');
  });

  return object as Group;
}
