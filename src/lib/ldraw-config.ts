/** LDraw parts + sample model paths for the Three.js LDrawLoader pipeline. */

/** Official-ish parts tree (parts/, p/, models/). Hosted mirror — not in-repo (complete.zip is ~100MB+). */
export const LDRAW_PARTS_LIBRARY_PATH =
  'https://cdn.jsdelivr.net/gh/gkjohnson/ldraw-parts-library@master/complete/ldraw/';

/** Colour table (LDConfig-style). Served from our public/ so preload is same-origin. */
export const LDRAW_COLORS_URL = '/ldraw/colors/ldcfgalt.ldr';

export type LDrawSample = {
  id: string;
  label: string;
  /** Path under public/ — packed .mpd embeds geometry so no CDN parts fetch is required. */
  url: string;
};

/** Packed models from three.js examples (self-contained). */
export const LDRAW_SAMPLES: LDrawSample[] = [
  { id: 'car', label: 'Car', url: '/ldraw/samples/car.ldr_Packed.mpd' },
  { id: 'lighthouse', label: 'Lighthouse', url: '/ldraw/samples/30023-1-Lighthouse.ldr_Packed.mpd' },
  { id: 'xwing', label: 'X-Wing Mini', url: '/ldraw/samples/30051-1-X-wingFighter-Mini.mpd_Packed.mpd' },
  { id: 'lunar', label: 'Lunar MPV', url: '/ldraw/samples/1621-1-LunarMPVVehicle.mpd_Packed.mpd' },
  { id: 'minivehicles', label: 'Mini Vehicles', url: '/ldraw/samples/4838-1-MiniVehicles.mpd_Packed.mpd' },
];
