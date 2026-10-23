// PWA 아이콘 생성기 — 의존성 없이 zlib stdlib로 PNG 직접 인코딩.
// 실행: node scripts/gen-icons.mts (또는 tsx). 산출물 public/icons/*.png
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');

type Seg = [x: number, y: number]; // 0..1 정규화 좌표 (y 0=상단)
// 진도 파형: 잔잔한 도입 → 대진폭 스파이크(빨강) → 감쇠. maskable은 80% 안전영역 스케일.
const WAVE: { pts: Seg[]; color: [number, number, number] }[] = [
  { pts: [[0.08,0.52],[0.14,0.48],[0.19,0.54],[0.24,0.49],[0.29,0.51]], color: [255,255,255] },
  { pts: [[0.29,0.51],[0.36,0.14],[0.43,0.82],[0.50,0.26],[0.56,0.66],[0.60,0.44]], color: [239,68,68] },
  { pts: [[0.60,0.44],[0.66,0.55],[0.72,0.47],[0.80,0.53],[0.92,0.50]], color: [255,255,255] },
];
const BG: [number, number, number] = [9, 13, 22]; // #090d16 (앱 다크 --bg-app)

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function render(size: number, scale = 1): Buffer {
  const px = Buffer.alloc(size * size * 3); // RGB
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * size + x) * 3;
    px[i] = r; px[i + 1] = g; px[i + 2] = b;
  };
  const hw = 0.024 * size * scale; // 선 두께 반폭
  const toPx = ([x, y]: Seg): Seg => [((x - 0.5) * scale + 0.5) * size, ((y - 0.5) * scale + 0.5) * size];
  const distSeg = (p: Seg, a: Seg, b: Seg) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    const ex = a[0] + t * dx - p[0], ey = a[1] + t * dy - p[1];
    return Math.hypot(ex, ey);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let [r, g, b] = BG;
      let bestA = 0, top: [number, number, number] | null = null;
      for (const { pts, color } of WAVE) {
        const P = pts.map(toPx);
        for (let s = 0; s < P.length - 1; s++) {
          const a = Math.max(0, Math.min(1, hw + 0.5 - distSeg([x + 0.5, y + 0.5], P[s], P[s + 1])));
          if (a > bestA) { bestA = a; top = color; }
        }
      }
      if (top && bestA > 0) {
        const a = bestA;
        r = Math.round(top[0] * a + r * (1 - a));
        g = Math.round(top[1] * a + g * (1 - a));
        b = Math.round(top[2] * a + b * (1 - a));
      }
      set(x, y, r, g, b);
    }
  }
  // PNG 조립: RGB8, 필터 0
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8bit, truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
const files: [name: string, size: number, scale: number][] = [
  ['icon-192.png', 192, 1], ['icon-512.png', 512, 1],
  ['icon-192-maskable.png', 192, 0.8], ['icon-512-maskable.png', 512, 0.8],
  ['apple-touch-icon.png', 180, 0.9],
];
for (const [name, size, scale] of files) {
  writeFileSync(resolve(OUT_DIR, name), render(size, scale));
  console.log(`ok ${name} ${size}x${size}`);
}
