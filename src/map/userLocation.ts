import maplibregl from 'maplibre-gl';
import { P2PEarthquakeEvent, formatScaleJMA } from '../P2PQuakeService';
import { DataSourceType } from '../types';
import { getJindoString, getScaleTextColor, getScaleStrokeColor, mixColor } from '../utils';
import { getExactJindoColor } from '../colorMap';
import { EstimatePoint, feltRadiusKm, idwEstimate } from './intensityEstimate';

// 내 위치 마커 + 그 지점 추정 진도 칩.
// 실시간(kmoni)은 관측소 계측진도 IDW, 선택 이벤트(P2P/아카이브)는 관측점 진도 IDW.
// 추정값은 추정 채우기와 같은 톤으로 탈색해 실측 관측소 원과 색으로 구분한다.
const ESTIMATE_TONE = '#94a3b8';
const REALTIME_RADIUS_KM = 100;

interface UserLocationConfig {
  getLng: () => string;
  getEvent: () => P2PEarthquakeEvent | null;
  getSource: () => DataSourceType;
  onError: () => void;
}

let config: UserLocationConfig | null = null;
let coords: [number, number] | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let marker: any = null;
let chipEl: HTMLElement | null = null;

const CHIP_TIP: Record<string, string> = {
  ko: '내 위치 추정 진도',
  en: 'Estimated intensity at my location',
  ja: '現在地の推定震度',
};

function localizeScaleText(text: string, lng: string): string {
  if (lng.startsWith('en')) return text.replace('강', '+').replace('약', '-');
  if (lng.startsWith('ja')) return text.replace('강', '強').replace('약', '弱');
  return text;
}

export function configureUserLocation(cfg: UserLocationConfig) {
  config = cfg;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setUserLocationEnabled(map: any, enabled: boolean) {
  if (!enabled) {
    if (marker) { marker.remove(); marker = null; chipEl = null; }
    return;
  }
  // StrictMode 이중 마운트/HMR로 맵 인스턴스가 바뀌면 죽은 맵에 남은 마커를 재생성
  if (marker && marker.getMap?.() !== map) { marker.remove(); marker = null; chipEl = null; }
  if (marker) { refreshUserLocation(map); return; }
  if (coords) { ensureMarker(map); refreshUserLocation(map); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      coords = [pos.coords.longitude, pos.coords.latitude];
      ensureMarker(map);
      refreshUserLocation(map);
    },
    () => {
      console.warn('[UserLocation] geolocation denied or unavailable');
      config?.onError();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function ensureMarker(map: any) {
  if (!coords) return;
  if (marker) {
    if (marker.getMap?.() === map) { marker.setLngLat(coords); return; }
    marker.remove(); marker = null; chipEl = null;
  }
  const el = document.createElement('div');
  el.className = 'eqm-user-marker';
  el.innerHTML =
    '<div class="eqm-user-chip"></div><div class="eqm-user-dot"><div class="eqm-user-pulse"></div></div>';
  chipEl = el.querySelector('.eqm-user-chip');
  marker = new maplibregl.Marker({ element: el }).setLngLat(coords).addTo(map);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function refreshUserLocation(map: any, stationGeojson?: any) {
  if (!config || !coords || !marker) return;
  if (config.getSource() === 'p2pquake') {
    const ev = config.getEvent();
    if (!ev) { applyChip(null); return; }
    const pts: EstimatePoint[] = ev.points
      .filter((pt) => pt.scale > 0)
      .map((pt) => ({ lon: pt.lon, lat: pt.lat, scale: pt.scale }));
    const raw = idwEstimate(coords, pts, feltRadiusKm(ev.hypocenter.magnitude));
    if (raw === null) { applyChip(null); return; }
    const est = Math.min(70, Math.max(10, Math.round(raw / 10) * 10));
    const info = formatScaleJMA(est);
    applyChip(localizeScaleText(info.text, config.getLng()), mixColor(info.color, ESTIMATE_TONE, 0.5));
    return;
  }
  if (stationGeojson) { renderRealtimeChip(stationGeojson); return; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const src = map?.getSource?.('intensity-points');
  if (src && typeof (src as any).getData === 'function') {
    (src as any)
      .getData()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((gj: any) => renderRealtimeChip(gj))
      .catch(() => {});
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderRealtimeChip(geojson: any) {
  if (!config || !coords) return;
  const pts: EstimatePoint[] = [];
  for (const f of geojson?.features ?? []) {
    const pr = f.properties ?? {};
    const code = pr.intensityCode;
    if (typeof code !== 'number' || code < 0) continue;
    if (pr.color === 'transparent' || pr.color === 'rgba(0, 0, 0, 0)') continue;
    // kmoni 101단계 코드 -> 계측진도 역변환 (QuakeDetectService 인코딩과 동일)
    const jindo = (code - 100) / 2 - 3;
    const lon = f.geometry?.coordinates?.[0];
    const lat = f.geometry?.coordinates?.[1];
    if (typeof lon !== 'number' || typeof lat !== 'number') continue;
    pts.push({ lon, lat, scale: jindo });
  }
  const raw = idwEstimate(coords, pts, REALTIME_RADIUS_KM);
  if (raw === null) { applyChip(null); return; }
  applyChip(
    localizeScaleText(getJindoString(raw), config.getLng()),
    mixColor(getExactJindoColor(raw), ESTIMATE_TONE, 0.5)
  );
}

function applyChip(text: string | null, color?: string) {
  if (!chipEl) return;
  if (text === null || !color) {
    chipEl.style.display = 'none';
    return;
  }
  chipEl.style.display = '';
  chipEl.textContent = text;
  chipEl.style.background = color;
  chipEl.style.color = getScaleTextColor(color);
  chipEl.style.borderColor = getScaleStrokeColor(color);
  const lng = config?.getLng() ?? 'ko';
  const tip = CHIP_TIP[lng.startsWith('en') ? 'en' : lng.startsWith('ja') ? 'ja' : 'ko'];
  chipEl.title = tip ?? CHIP_TIP.ko;
}
