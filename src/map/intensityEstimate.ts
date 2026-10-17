// 실측 관측점이 없는 구역의 진도를 IDW(거리 역가중)로 추정한다.
// JMA 아카이브처럼 관측점이 성긴 자료용이며, 결과는 반드시 '추정'으로 실측과 구분해 표시해야 한다.

export interface EstimatePoint {
  lon: number;
  lat: number;
  scale: number;
}

function ringCenter(ring: number[][]): [number, number] | null {
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const c of ring) {
    sx += c[0];
    sy += c[1];
  }
  return [sx / ring.length, sy / ring.length];
}

// 구역 대표점: 외곽 ring 정점 평균. MultiPolygon은 정점이 가장 많은(가장 큰) 폴리곤 사용
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function featureCenter(f: any): [number, number] | null {
  const g = f?.geometry;
  if (g?.type === 'Polygon') return ringCenter(g.coordinates?.[0]);
  if (g?.type === 'MultiPolygon') {
    let best: [number, number] | null = null;
    let bestLen = 0;
    for (const poly of g.coordinates ?? []) {
      const ring = poly?.[0];
      if (Array.isArray(ring) && ring.length > bestLen) {
        bestLen = ring.length;
        best = ringCenter(ring);
      }
    }
    return best;
  }
  return null;
}

function distKm(a: [number, number], b: [number, number]): number {
  const dx = (a[0] - b[0]) * 111.32 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dy = (a[1] - b[1]) * 110.57;
  return Math.hypot(dx, dy);
}

// 진도가 느껴질 대략적 반경(km). M이 클수록 넓고, M 미상이면 보수적으로 100km
export function feltRadiusKm(mag: number): number {
  if (!(mag > 0)) return 100;
  return Math.min(400, 30 * Math.pow(2, mag - 4));
}

// center 지점의 IDW 가중평균. 반경 밖이면 null. 스케일 도메인(10/20/...)과
// 계측진도 도메인(소수) 양쪽에서 재사용하는 공용 코어.
export function idwEstimate(center: [number, number], points: EstimatePoint[], radiusKm: number): number | null {
  let wSum = 0;
  let vSum = 0;
  for (const p of points) {
    const d = distKm(center, [p.lon, p.lat]);
    if (d > radiusKm) continue;
    const w = 1 / (Math.max(d, 1) * Math.max(d, 1));
    wSum += w;
    vSum += w * p.scale;
  }
  return wSum === 0 ? null : vSum / wSum;
}

// 구역 대표점 기준 IDW 추정값. 진도1 미만으로 떨어지면 0(미표시) 반환.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function estimateAreaScale(feature: any, points: EstimatePoint[], mag: number): number {
  const c = featureCenter(feature);
  if (!c) return 0;
  const raw = idwEstimate(c, points, feltRadiusKm(mag));
  if (raw === null) return 0;
  const snapped = Math.round(raw / 10) * 10;
  return snapped >= 10 ? Math.min(snapped, 70) : 0;
}
