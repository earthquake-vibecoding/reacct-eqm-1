import { GifReader } from 'omggif';
import { INTENSITY_COLORS } from '../src/colorMap';
import { StationPointMeta } from './intensity-types';

const LP_SVA_ANCHORS: [number, number, number, number][] = [
  [1000, 173, 0, 0], [300, 204, 0, 0], [200, 235, 17, 0], [100, 255, 34, 0],
  [50, 255, 60, 0], [20, 255, 85, 0], [10, 255, 111, 0], [5, 255, 153, 0],
  [2, 255, 196, 0], [1, 255, 213, 0], [0.5, 255, 255, 0], [0.2, 255, 255, 0],
  [0.1, 255, 255, 0], [0.05, 214, 255, 10], [0.02, 153, 255, 20],
  [0.01, 51, 238, 82], [0.005, 20, 213, 102], [0.002, 0, 170, 153], [0.001, 0, 34, 184],
];

function rgbToHue(r: number, g: number, b: number): { hue: number; sat: number } {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (max === 0 || d === 0) return { hue: -1, sat: 0 };
  const sat = d / max;
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { hue, sat };
}

const LP_HUE_TABLE = LP_SVA_ANCHORS
  .map(([sva, r, g, b]) => ({ hue: rgbToHue(r, g, b).hue, logSva: Math.log10(sva) }))
  .filter((a) => a.hue >= 0)
  .sort((a, b) => b.hue - a.hue);

export function getLpFromRGB(r: number, g: number, b: number): { cls: number; sva: number } | null {
  const { hue, sat } = rgbToHue(r, g, b);
  if (hue < 0 || sat < 0.35) return null;
  const t = LP_HUE_TABLE;
  if (hue >= t[0].hue) return { cls: 0, sva: Math.pow(10, t[t.length - 1].logSva) };
  if (hue <= t[t.length - 1].hue) return { cls: 4, sva: 1000 };
  for (let i = 0; i < t.length - 1; i++) {
    const hi = t[i], lo = t[i + 1];
    if (hue <= hi.hue && hue >= lo.hue) {
      const f = (hi.hue - hue) / (hi.hue - lo.hue || 1);
      const sva = Math.pow(10, hi.logSva + f * (lo.logSva - hi.logSva));
      const cls = sva >= 99.5 ? 4 : sva >= 49.5 ? 3 : sva >= 14.8 ? 2 : sva >= 4.8 ? 1 : 0;
      return { cls, sva };
    }
  }
  return null;
}

export function lpClsToStr(cls: number): string {
  return String(cls);
}

export function jindoToStr(jindo: number): string {
  if (jindo < 0.5) return '0';
  if (jindo < 1.5) return '1';
  if (jindo < 2.5) return '2';
  if (jindo < 3.5) return '3';
  if (jindo < 4.5) return '4';
  if (jindo < 5.0) return '5약';
  if (jindo < 5.5) return '5강';
  if (jindo < 6.0) return '6약';
  if (jindo < 6.5) return '6강';
  return '7';
}

export function getIntensityFromRGB(r: number, g: number, b: number): number | null {
  if (r === 0 && g === 0 && b === 0) return null;
  if (Math.abs(r - g) < 4 && Math.abs(g - b) < 4 && Math.abs(r - b) < 4 && r < 60) return null;

  let minDiff = Infinity, closestIntensity = -3.0;
  for (const item of INTENSITY_COLORS) {
    const dr = item.R - r, dg = item.G - g, db = item.B - b;
    const distSq = dr * dr + dg * dg + db * db;
    if (distSq < minDiff) {
      minDiff = distSq;
      closestIntensity = item.Intensity;
    }
  }
  return minDiff < 4000 ? closestIntensity : null;
}

export const MAIN_PROJECTION = { lonPerPx: 0.0491300, lon0: 128.6268, latPerPx: -0.0407483, lat0: 46.2400 };
export const INSET_PROJECTION = { lonPerPx: 0.0491574, lon0: 122.5219, latPerPx: -0.0405859, lat0: 32.0293 };

export function isInInsetRegion(lon: number, lat: number): boolean {
  return lon < 130 && lat < 30.5;
}

export function validateSpatialSupport(rgba: Uint8Array, width: number, height: number, cx: number, cy: number): boolean {
  const ci = (cy * width + cx) * 4;
  const cr = rgba[ci], cg = rgba[ci + 1], cb = rgba[ci + 2];
  let support = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const px = cx + dx, py = cy + dy;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const idx = (py * width + px) * 4;
      if (rgba[idx + 3] === 0) continue;
      if (dx === 0 && dy === 0) { support++; continue; }
      const dr = rgba[idx] - cr, dg = rgba[idx + 1] - cg, db = rgba[idx + 2] - cb;
      if (dr * dr + dg * dg + db * db < 6000) support++;
    }
  }
  return support >= 3;
}

export function parseIntensityGif(gifBuffer: Buffer, stations: StationPointMeta[]): Record<string, number | null> {
  const reader = new GifReader(gifBuffer);
  const { width, height } = reader;
  const rgba = new Uint8Array(width * height * 4);
  reader.decodeAndBlitFrameRGBA(0, rgba);

  const intensities: Record<string, number | null> = {};
  for (const stn of stations) {
    if (!stn.Point || stn.IsSuspended) { intensities[stn.Code] = null; continue; }
    const { x, y } = stn.Point;
    if (x < 0 || x >= width || y < 0 || y >= height) { intensities[stn.Code] = null; continue; }
    const idx = (y * width + x) * 4;
    if (rgba[idx + 3] === 0) { intensities[stn.Code] = null; continue; }
    const jindo = getIntensityFromRGB(rgba[idx], rgba[idx + 1], rgba[idx + 2]);
    intensities[stn.Code] = jindo !== null && validateSpatialSupport(rgba, width, height, x, y) ? jindo : null;
  }
  return intensities;
}

export function parseLpGif(gifBuffer: Buffer, stations: StationPointMeta[]) {
  const reader = new GifReader(gifBuffer);
  const { width, height } = reader;
  const rgba = new Uint8Array(width * height * 4);
  reader.decodeAndBlitFrameRGBA(0, rgba);
  const lp: Record<string, number | null> = {};
  const lpColors: Record<string, string | null> = {};

  for (const stn of stations) {
    lp[stn.Code] = null;
    lpColors[stn.Code] = null;
    if (!stn.Point || stn.IsSuspended) continue;
    const { x, y } = stn.Point;
    if (x < 2 || x >= width - 2 || y < 2 || y >= height - 2) continue;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const idx = ((y + dy) * width + (x + dx)) * 4;
        if (rgba[idx + 3] === 0) continue;
        const hit = getLpFromRGB(rgba[idx], rgba[idx + 1], rgba[idx + 2]);
        if (!hit) continue;
        lp[stn.Code] = hit.cls;
        lpColors[stn.Code] = `rgb(${rgba[idx]}, ${rgba[idx + 1]}, ${rgba[idx + 2]})`;
        dy = 3;
        break;
      }
    }
  }
  return { lp, lpColors };
}
