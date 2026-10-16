import i18n from '../i18n';
import { QuakeDetectService } from '../QuakeDetectService';
import { DataSourceType, HoverInfo, StationPointMeta } from '../types';
import { translateRegionName } from '../translateUtils';

export async function loadAndSetupStationLayers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  intensityPointsUrl: string,
  kmoniQuakeService: QuakeDetectService,
  yahooQuakeService: QuakeDetectService,
  getCurrentSource: () => DataSourceType,
  onHover: (info: HoverInfo | null) => void
) {
  let stationMetas: StationPointMeta[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let yahooPointsItems: any[] = [];

  try {
    const metaResp = await fetch('/intensity-points-v1.json');
    if (metaResp.ok) stationMetas = await metaResp.json();
  } catch (e) { console.warn('Failed to load station metadata:', e); }

  /* [미사용] Yahoo! SiteList 초기화 비활성화
  try {
    const yahooResp = await fetch(intensityPointsUrl);
    if (yahooResp.ok) {
      const yahooData = await yahooResp.json();
      if (yahooData && Array.isArray(yahooData.items)) yahooPointsItems = yahooData.items;
    }
  } catch (e) { console.warn('Failed to load Yahoo SiteList:', e); }

  const yahooMetaMap: Record<number, { name: string; region: string }> = {};
  if (yahooPointsItems.length > 0 && stationMetas.length > 0) {
    yahooPointsItems.forEach((item, i) => {
      const lat = item[0], lon = item[1];
      let closest: StationPointMeta | null = null, minDist = Infinity;
      for (const m of stationMetas) {
        const d = Math.hypot(m.Location.latitude - lat, m.Location.longitude - lon);
        if (d < minDist) { minDist = d; closest = m; }
      }
      yahooMetaMap[i] = { name: closest ? closest.Name : `관측소 ${i}`, region: closest ? closest.Region : '' };
    });
  }
  */

  const kmoniInitialGeojson = stationMetas.length > 0 ? kmoniQuakeService.initKmoniStations(stationMetas) : null;
  // if (yahooPointsItems.length > 0) yahooQuakeService.initStations(yahooPointsItems, yahooMetaMap);

  const initialGeojson = kmoniInitialGeojson || yahooQuakeService.geojson || { type: 'FeatureCollection', features: [] };

  map.addSource('intensity-points', { type: 'geojson', data: initialGeojson });
  map.addSource('detected-grids', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

  map.addLayer({
    id: 'detected-grids-fill', type: 'fill', source: 'detected-grids',
    paint: { 'fill-color': 'transparent', 'fill-opacity': 0 }
  });
  map.addLayer({
    id: 'detected-grids-line', type: 'line', source: 'detected-grids',
    paint: { 'line-color': ['coalesce', ['get', 'color'], '#ef4444'], 'line-width': 2.0, 'line-opacity': 0.9 }
  });
  map.addLayer({
    id: 'intensity-points-layer', type: 'circle', source: 'intensity-points',
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        4, ['case', ['<', ['get', 'intensityCode'], 0], 0, ['==', ['get', 'color'], 'transparent'], 0, ['boolean', ['get', 'detected'], false], 4.8, 1.8],
        8, ['case', ['<', ['get', 'intensityCode'], 0], 0, ['==', ['get', 'color'], 'transparent'], 0, ['boolean', ['get', 'detected'], false], 6.8, 3.0]
      ],
      'circle-color': ['get', 'color'],
      'circle-opacity': [
        'case',
        ['<', ['get', 'intensityCode'], 0], 0,
        ['==', ['get', 'color'], 'transparent'], 0,
        ['==', ['get', 'color'], 'rgba(0, 0, 0, 0)'], 0,
        ['boolean', ['get', 'detected'], false], 1.0, 0.3
      ],
      'circle-stroke-width': [
        'case',
        ['<', ['get', 'intensityCode'], 0], 0,
        ['==', ['get', 'color'], 'transparent'], 0,
        ['==', ['get', 'color'], 'rgba(0, 0, 0, 0)'], 0,
        ['boolean', ['get', 'detected'], false], 1.5, 0
      ],
      'circle-stroke-color': [
        'case',
        ['<', ['get', 'intensityCode'], 0], 'rgba(0, 0, 0, 0)',
        ['==', ['get', 'color'], 'transparent'], 'rgba(0, 0, 0, 0)',
        ['==', ['get', 'color'], 'rgba(0, 0, 0, 0)'], 'rgba(0, 0, 0, 0)',
        'rgba(255, 255, 255, 0.5)'
      ]
    }
  });

  map.addSource('lp-points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'lp-points-layer', type: 'circle', source: 'lp-points',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 7, 8, 11],
      'circle-color': ['get', 'color'], 'circle-opacity': 0.5,
      'circle-stroke-width': 1.5, 'circle-stroke-color': ['get', 'color'], 'circle-stroke-opacity': 0.9
    }
  }, 'intensity-points-layer');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map.on('mousemove', 'intensity-points-layer', (e: any) => {
    const props = e.features?.[0]?.properties;
    if (!props || props.intensityCode < 0 || props.color === 'transparent' || props.color === 'rgba(0, 0, 0, 0)') {
      map.getCanvas().style.cursor = '';
      onHover(null);
      return;
    }
    map.getCanvas().style.cursor = 'pointer';
    const currentLng = i18n.language;
    const status = props.detected
      ? (currentLng.startsWith('en') ? 'Shaking Detected' : currentLng.startsWith('ja') ? '揺れ検知中' : '지진동 감지중')
      : (currentLng.startsWith('en') ? 'Normal (Minor)' : currentLng.startsWith('ja') ? '平常時 (微震)' : '평시 (미감지)');
    const sourceLabel = getCurrentSource() === 'kmoni'
      ? (currentLng.startsWith('en') ? 'NIED' : currentLng.startsWith('ja') ? 'NIED 強震' : 'NIED 강진모니터')
      : (currentLng.startsWith('en') ? 'Yahoo!' : currentLng.startsWith('ja') ? 'Yahoo! 地震' : 'Yahoo! 지진');
    const transName = translateRegionName(props.name || '', currentLng);
    const stnLabel = currentLng.startsWith('en') ? 'Station' : currentLng.startsWith('ja') ? '観測点' : '관측소';

    onHover({
      type: 'station',
      title: transName !== props.name ? `${transName}` : props.name,
      subtitle: `${stnLabel}: ${props.name} (Code: ${props.code}) / ${status} [${sourceLabel}]`,
      x: e.point?.x, y: e.point?.y, scaleColor: props.color
    });
  });

  map.on('mouseleave', 'intensity-points-layer', () => {
    map.getCanvas().style.cursor = '';
    onHover(null);
  });
}

export function updateLpPointsOnMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  kmoniQuakeService: QuakeDetectService,
  lp: Record<string, number | null>,
  lpColors: Record<string, string | null>
) {
  const src = map.getSource('lp-points');
  if (!src) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const features: any[] = [];
  let maxCls = 0;
  for (const f of kmoniQuakeService.geojson?.features ?? []) {
    const code = f.properties?.code;
    if (code == null) continue;
    const cls = lp[code];
    if (cls != null && cls >= 1) {
      if (cls > maxCls) maxCls = cls;
      features.push({ type: 'Feature', geometry: f.geometry, properties: { code, color: lpColors[code] ?? '#ff9900' } });
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (src as any).setData({ type: 'FeatureCollection', features });
  window.dispatchEvent(new CustomEvent('eqm-lp-max', { detail: { maxCls, count: features.length, ts: Date.now() } }));
}
