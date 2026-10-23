import * as topojson from 'topojson-client';
import i18n from '../i18n';
import { HoverInfo } from '../types';
import { translateRegionName } from '../translateUtils';

export async function setupBaseAndEewLayers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  worldUrl: string,
  japanTopoUrl: string,
  onHover: (info: HoverInfo | null) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  try {
    const worldResp = await fetch(worldUrl);
    const worldData = await worldResp.json();
    if (worldData && Array.isArray(worldData.features)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      worldData.features = worldData.features.filter((f: any) => {
        const name = f.properties?.name || f.properties?.name_long;
        const iso = f.properties?.iso_a3 || f.properties?.adm0_a3;
        return name !== 'Japan' && iso !== 'JPN';
      });
    }
    map.addSource('world-geo', { type: 'geojson', data: worldData });
  } catch (err) {
    console.error('Failed to load world.json:', err);
    map.addSource('world-geo', { type: 'geojson', data: worldUrl });
  }

  map.addLayer({
    id: 'world-fill',
    type: 'fill',
    source: 'world-geo',
    paint: { 'fill-color': '#1e293b', 'fill-opacity': 0.7 }
  });

  map.addLayer({
    id: 'world-line',
    type: 'line',
    source: 'world-geo',
    paint: { 'line-color': '#334155', 'line-width': 0.8 }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let japanGeojson: any = null;
  try {
    const resp = await fetch(japanTopoUrl);
    const topoData = await resp.json();
    const objectKey = Object.keys(topoData.objects)[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geojson: any = topojson.feature(topoData, topoData.objects[objectKey]);
    japanGeojson = geojson;

    map.addSource('japan-geo', { type: 'geojson', data: geojson });

    map.addLayer({
      id: 'japan-fill',
      type: 'fill',
      source: 'japan-geo',
      paint: { 'fill-color': '#334155', 'fill-opacity': 1.0 }
    });

    map.addLayer({
      id: 'japan-line',
      type: 'line',
      source: 'japan-geo',
      paint: { 'line-color': '#0f172a', 'line-width': 0.8 }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on('mousemove', 'japan-fill', (e: any) => {
      if (e.features && e.features.length > 0) {
        const props = e.features[0].properties;
        if (props && props.name) {
          const currentLng = i18n.language;
          const transName = translateRegionName(props.name, currentLng);
          const codeLabel = currentLng.startsWith('en') ? 'Area Code' : currentLng.startsWith('ja') ? '区域コード' : '구역 코드';
          onHover({
            type: 'prefecture',
            title: transName !== props.name ? `${transName}` : props.name,
            subtitle: props.name !== transName ? `${props.name} | ${codeLabel}: ${props.code}` : `${codeLabel}: ${props.code}`,
            x: e.point?.x,
            y: e.point?.y
          });
        }
      }
    });

    map.on('mouseleave', 'japan-fill', () => {
      onHover(null);
    });
  } catch (err) {
    console.error('Failed to load japan topo data:', err);
  }

  map.addSource('eew-waves', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });

  map.addLayer({
    id: 'eew-waves-p-fill',
    type: 'fill',
    source: 'eew-waves',
    filter: ['==', ['get', 'waveType'], 'P'],
    paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.03 }
  });

  map.addLayer({
    id: 'eew-waves-p-line',
    type: 'line',
    source: 'eew-waves',
    filter: ['==', ['get', 'waveType'], 'P'],
    paint: { 'line-color': '#38bdf8', 'line-width': 1.5, 'line-opacity': 0.85 }
  });

  map.addLayer({
    id: 'eew-waves-s-fill',
    type: 'fill',
    source: 'eew-waves',
    filter: ['==', ['get', 'waveType'], 'S'],
    paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.1 }
  });

  map.addLayer({
    id: 'eew-waves-s-line',
    type: 'line',
    source: 'eew-waves',
    filter: ['==', ['get', 'waveType'], 'S'],
    paint: { 'line-color': '#ef4444', 'line-width': 2.0, 'line-opacity': 0.9 }
  });

  map.addSource('eew-epicenter', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });

  map.addLayer({
    id: 'eew-epicenter-glow',
    type: 'circle',
    source: 'eew-epicenter',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 9, 8, 14, 12, 18],
      'circle-color': '#ef4444',
      'circle-opacity': 0.35,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff'
    }
  });

  map.addLayer({
    id: 'eew-epicenter-center',
    type: 'circle',
    source: 'eew-epicenter',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3.5, 8, 5, 12, 7],
      'circle-color': '#ffffff',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ef4444'
    }
  });

  return japanGeojson;
}
