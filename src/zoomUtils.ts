import type { P2PEarthquakeEvent } from './P2PQuakeService';

/**
 * 일본 열도 전역이 화면 종횡비에 맞춰 최적으로 프레이밍되도록 바운드 기반 줌을 지원합니다.
 */
export const JAPAN_BOUNDS: [[number, number], [number, number]] = [
  [127.5, 29.5], // Southwest (큐슈 남부 및 한반도 연안)
  [147.0, 46.0]  // Northeast (홋카이도 동북단)
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fitJapanBounds(
  map: any,
  animate = true,
  customPadding?: { top: number; bottom: number; left: number; right: number }
) {
  if (!map) return;
  map.fitBounds(JAPAN_BOUNDS, {
    padding: customPadding || { top: 35, bottom: 35, left: 35, right: 35 },
    duration: animate ? 800 : 0,
    essential: true
  });
}

/**
 * 진앙지(hypocenter)와 진도 관측점(points)이 모두 한 화면에 들어오도록 카메라 바운드를 맞춥니다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fitP2PEventBounds(
  map: any,
  event: P2PEarthquakeEvent | null | undefined,
  isMobile = false
) {
  if (!map || !event) return;

  const coords: [number, number][] = [];
  if (event.hypocenter.latitude !== 0 && event.hypocenter.longitude !== 0) {
    coords.push([event.hypocenter.longitude, event.hypocenter.latitude]);
  }
  for (const pt of event.points) {
    if (pt.lat !== 0 && pt.lon !== 0) {
      coords.push([pt.lon, pt.lat]);
    }
  }

  if (coords.length === 0) return;
  if (coords.length === 1) {
    map.flyTo({
      center: coords[0],
      zoom: 6.8,
      speed: 1.3,
      essential: true
    });
    return;
  }

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const padding = isMobile
    ? { top: 100, bottom: 220, left: 40, right: 40 }
    : { top: 90, bottom: 90, left: 380, right: 90 };

  map.fitBounds(
    [
      [minLon, minLat],
      [maxLon, maxLat]
    ],
    {
      padding,
      maxZoom: 7.2,
      duration: 1100,
      essential: true
    }
  );
}

export function calculateBaseZoom(): number {
  return 5.1;
}

