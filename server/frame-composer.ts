import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { GifReader, GifWriter } from 'omggif';
import { INSET_PROJECTION, MAIN_PROJECTION, isInInsetRegion } from './kmoni-pixel';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compositeFrame(gifBuffer: Buffer, gridFeatures: any[], eewGifBuffer?: Buffer | null): {
  width: number; height: number; indices: Uint8Array; palette: number[];
} | null {
  try {
    const reader = new GifReader(gifBuffer);
    const { width, height } = reader;
    const rgba = new Uint8Array(width * height * 4);
    reader.decodeAndBlitFrameRGBA(0, rgba);

    for (let p = 0; p < width * height; p++) {
      if (rgba[p * 4 + 3] === 0) {
        rgba[p * 4] = 13; rgba[p * 4 + 1] = 13; rgba[p * 4 + 2] = 18; rgba[p * 4 + 3] = 255;
      }
    }

    if (eewGifBuffer && eewGifBuffer.length > 0) {
      try {
        const eewReader = new GifReader(eewGifBuffer);
        if (eewReader.width === width && eewReader.height === height) {
          const eewRgba = new Uint8Array(width * height * 4);
          eewReader.decodeAndBlitFrameRGBA(0, eewRgba);
          for (let p = 0; p < width * height; p++) {
            const idx = p * 4;
            if (eewRgba[idx + 3] > 0) {
              rgba[idx] = eewRgba[idx];
              rgba[idx + 1] = eewRgba[idx + 1];
              rgba[idx + 2] = eewRgba[idx + 2];
              rgba[idx + 3] = 255;
            }
          }
        }
      } catch {}
    }

    if (gridFeatures.length > 0) {
      const lonToX = (lon: number, lat: number) => {
        const p = isInInsetRegion(lon, lat) ? INSET_PROJECTION : MAIN_PROJECTION;
        return Math.round((lon - p.lon0) / p.lonPerPx);
      };
      const latToY = (lon: number, lat: number) => {
        const p = isInInsetRegion(lon, lat) ? INSET_PROJECTION : MAIN_PROJECTION;
        return Math.round((lat - p.lat0) / p.latPerPx);
      };
      const plot = (px: number, py: number) => {
        for (let oy = 0; oy < 2; oy++) {
          for (let ox = 0; ox < 2; ox++) {
            const px2 = px + ox, py2 = py + oy;
            if (px2 < 0 || px2 >= width || py2 < 0 || py2 >= height) continue;
            const i = (py2 * width + px2) * 4;
            rgba[i] = 255; rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = 255;
          }
        }
      };
      const drawEdge = (lon1: number, lat1: number, lon2: number, lat2: number) => {
        const x1 = lonToX(lon1, lat1), y1 = latToY(lon1, lat1);
        const x2 = lonToX(lon2, lat2), y2 = latToY(lon2, lat2);
        const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
        for (let s = 0; s <= steps; s++) {
          plot(Math.round(x1 + (x2 - x1) * s / steps), Math.round(y1 + (y2 - y1) * s / steps));
        }
      };
      for (const f of gridFeatures) {
        const ring = f?.geometry?.coordinates?.[0];
        if (!Array.isArray(ring)) continue;
        for (let i = 0; i < ring.length - 1; i++) {
          drawEdge(ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
        }
      }
    }

    let shift = 0;
    let palette: number[] = [];
    let indices = new Uint8Array(width * height);
    for (;;) {
      const map = new Map<number, number>();
      indices = new Uint8Array(width * height);
      for (let p = 0; p < width * height; p++) {
        const key = ((rgba[p * 4] >> shift) << 16) | ((rgba[p * 4 + 1] >> shift) << 8) | (rgba[p * 4 + 2] >> shift);
        let idx = map.get(key);
        if (idx === undefined) { idx = map.size; map.set(key, idx); }
        indices[p] = idx;
      }
      if (map.size <= 256) { palette = [...map.keys()]; break; }
      shift++;
    }

    let palSize = 2;
    while (palSize < palette.length) palSize <<= 1;
    const pal = [...palette];
    while (pal.length < palSize) pal.push(0);
    return { width, height, indices, palette: pal };
  } catch (err) {
    console.error('[Webhook] 프레임 합성 실패:', err);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSingleMapGif(gifBuffer: Buffer | null, gridFeatures: any[], eewGifBuffer?: Buffer | null): Buffer | null {
  if (!gifBuffer) return null;
  const frame = compositeFrame(gifBuffer, gridFeatures, eewGifBuffer);
  if (!frame) return null;
  const outBuf = new Uint8Array(frame.width * frame.height + 768 + 4096);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writer = new GifWriter(outBuf as any, frame.width, frame.height, { palette: frame.palette } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  writer.addFrame(0, 0, frame.width, frame.height, frame.indices as any, { palette: frame.palette } as any);
  return Buffer.from(outBuf.subarray(0, writer.end()));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildEventAnimationGif(frames: { timeStr: string; gif: Buffer; eewGif?: Buffer | null }[], gridFeatures: any[]): Buffer | null {
  if (frames.length === 0) return null;
  try {
    const encoded: { indices: Uint8Array; palette: number[] }[] = [];
    let width = 0, height = 0;
    for (const { gif, eewGif } of frames) {
      const frame = compositeFrame(gif, gridFeatures, eewGif);
      if (!frame) continue;
      width = frame.width; height = frame.height;
      encoded.push({ indices: frame.indices, palette: frame.palette });
    }
    if (encoded.length === 0) return null;
    const outBuf = new Uint8Array(encoded.length * (width * height + 768) + 4096);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writer = new GifWriter(outBuf as any, width, height, { loop: 0 } as any);
    for (const f of encoded) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writer.addFrame(0, 0, width, height, f.indices as any, { palette: f.palette, delay: 100 } as any);
    }
    return Buffer.from(outBuf.subarray(0, writer.end()));
  } catch (err) {
    console.error('[Webhook] 감지 구간 애니메이션 생성 실패:', err);
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildEventAnimationMp4(frames: { timeStr: string; gif: Buffer; eewGif?: Buffer | null }[], gridFeatures: any[]): Promise<Buffer | null> {
  if (frames.length === 0) return null;
  const composited: { indices: Uint8Array; palette: number[] }[] = [];
  let width = 0, height = 0;
  for (const { gif, eewGif } of frames) {
    const frame = compositeFrame(gif, gridFeatures, eewGif);
    if (!frame) continue;
    width = frame.width; height = frame.height;
    composited.push(frame);
  }
  if (composited.length === 0) return null;

  const rgb = Buffer.alloc(width * height * 3);
  const tmpPath = path.join(os.tmpdir(), `eqm-event-${Date.now()}.mp4`);
  try {
    const inner = new Promise<Buffer | null>((resolve) => {
      const ff = spawn('ffmpeg', [
        '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${width}x${height}`, '-r', '1', '-i', 'pipe:0',
        '-vf', 'crop=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmpPath,
      ], { stdio: ['pipe', 'ignore', 'pipe'] });

      let stderr = '';
      ff.stderr.on('data', (d) => { stderr += d; if (stderr.length > 8000) stderr = stderr.slice(-4000); });
      ff.on('error', (err) => {
        console.warn('[Webhook] ffmpeg 실행 불가 (GIF로 폴백):', (err as NodeJS.ErrnoException).code ?? err);
        resolve(null);
      });

      let i = 0, failed = false;
      const writeNext = () => {
        if (failed) return;
        while (i < composited.length) {
          const f = composited[i++];
          for (let p = 0; p < width * height; p++) {
            const key = f.palette[f.indices[p]] | 0;
            rgb[p * 3] = (key >> 16) & 0xff; rgb[p * 3 + 1] = (key >> 8) & 0xff; rgb[p * 3 + 2] = key & 0xff;
          }
          if (!ff.stdin.write(rgb)) { ff.stdin.once('drain', writeNext); return; }
        }
        ff.stdin.end();
      };
      ff.stdin.on('error', () => { failed = true; });
      ff.on('close', (code) => {
        if (code === 0 && fs.existsSync(tmpPath)) {
          try { resolve(fs.readFileSync(tmpPath)); } catch { resolve(null); }
        } else {
          console.warn(`[Webhook] ffmpeg mp4 인코딩 실패 (code=${code}) GIF로 폴백:`, stderr.split('\n').slice(-3).join(' | '));
          resolve(null);
        }
      });
      writeNext();
    });
    return (await inner) as Buffer | null;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}
