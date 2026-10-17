import { DataSourceType } from '../types';
import { P2PEarthquakeEvent, formatScaleJMA } from '../P2PQuakeService';
import { getScaleStrokeColor } from '../utils';
import { findAreaFeature } from './geoMatch';

const P2P_LAYER_IDS = [
  'p2p-areas-fill', 'p2p-areas-line', 'p2p-points-layer',
  'p2p-hypocenter-glow', 'p2p-hypocenter-center',
];

export function applyDataSourceVisibility(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any, newSource: DataSourceType, kmoniGeojson: any, yahooGeojson: any, fetchRealTime: () => void
) {
  const isP2P = newSource === 'p2pquake';
  if (map.getLayer('intensity-points-layer')) {
    map.setLayoutProperty('intensity-points-layer', 'visibility', isP2P ? 'none' : 'visible');
  }
  if (map.getLayer('detected-grids-line')) {
    map.setLayoutProperty('detected-grids-line', 'visibility', 'visible');
  }
  for (const id of P2P_LAYER_IDS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', isP2P ? 'visible' : 'none');
  }

  if (!isP2P) {
    const activeGeojson = newSource === 'kmoni' ? kmoniGeojson : yahooGeojson;
    const source = map.getSource('intensity-points');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (source && activeGeojson) (source as any).setData(activeGeojson);
    const gridSource = map.getSource('detected-grids');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (gridSource) (gridSource as any).setData({ type: 'FeatureCollection', features: [] });
    fetchRealTime();
  }
}

export function updateP2PEventOnMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any, event: P2PEarthquakeEvent | null, japanGeojson: any, currentDataSource: DataSourceType
) {
  const pointsSource = map.getSource('p2p-points');
  const hypocenterSource = map.getSource('p2p-hypocenter');
  const areasSource = map.getSource('p2p-areas');
  const emptyFC = { type: 'FeatureCollection', features: [] };

  if (!event) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (pointsSource) (pointsSource as any).setData(emptyFC);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (hypocenterSource) (hypocenterSource as any).setData(emptyFC);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (areasSource) (areasSource as any).setData(emptyFC);
    return;
  }

  const pointFeatures = event.points.map((pt) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [pt.lon, pt.lat] },
    properties: { pref: pt.pref, name: pt.name, scale: pt.scale, scaleStr: pt.scaleStr, color: pt.color, stroke: getScaleStrokeColor(pt.color) }
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (pointsSource) (pointsSource as any).setData({ type: 'FeatureCollection', features: pointFeatures });

  if (event.hypocenter.latitude !== 0 && event.hypocenter.longitude !== 0) {
    const hypoFeature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [event.hypocenter.longitude, event.hypocenter.latitude] },
      properties: {
        name: event.hypocenter.name, time: event.time, depth: event.hypocenter.depth,
        magnitude: event.hypocenter.magnitude, maxScaleStr: event.maxScaleStr
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (hypocenterSource) (hypocenterSource as any).setData({ type: 'FeatureCollection', features: [hypoFeature] });
  } else if (hypocenterSource) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (hypocenterSource as any).setData(emptyFC);
  }

  if (areasSource && japanGeojson && Array.isArray(japanGeojson.features)) {
    const areaScaleMap = new Map<string, number>();

    for (const pt of event.points) {
      let aCode = pt.areaCode;
      if (!aCode) {
        const matchedFeature = findAreaFeature(pt.lon, pt.lat, pt.pref, pt.name, japanGeojson.features);
        if (matchedFeature?.properties?.code) {
          aCode = String(matchedFeature.properties.code);
          pt.areaCode = aCode;
          pt.areaName = matchedFeature.properties.name;
        }
      }
      if (aCode) {
        const cur = areaScaleMap.get(aCode) || 0;
        if (pt.scale > cur) areaScaleMap.set(aCode, pt.scale);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawAreas = (event.raw as any)?.areas;
    if (Array.isArray(rawAreas)) {
      for (const ar of rawAreas) {
        const matchedFeature = findAreaFeature(0, 0, ar.pref || '', ar.name || '', japanGeojson.features);
        if (matchedFeature?.properties?.code) {
          const code = String(matchedFeature.properties.code);
          const scale = typeof ar.scale === 'number' ? ar.scale : 0;
          const cur = areaScaleMap.get(code) || 0;
          if (scale > cur) areaScaleMap.set(code, scale);
        }
      }
    }

    const isEarthquakeTab = currentDataSource === 'p2pquake';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const areaFeatures = (japanGeojson.features as any[]).map((f) => {
      const code = String(f.properties?.code || '');
      const scale = areaScaleMap.get(code);
      if (scale && scale >= 10) {
        const scaleInfo = formatScaleJMA(scale);
        return {
          type: 'Feature', geometry: f.geometry,
          properties: {
            code: f.properties?.code, name: f.properties?.name, namekana: f.properties?.namekana,
            scale, scaleStr: scaleInfo.text, color: scaleInfo.color, stroke: getScaleStrokeColor(scaleInfo.color), opacity: isEarthquakeTab ? 0.85 : 0.75
          }
        };
      }
      return {
        type: 'Feature', geometry: f.geometry,
        properties: {
          code: f.properties?.code, name: f.properties?.name, namekana: f.properties?.namekana,
          scale: 0, scaleStr: '', color: 'transparent', stroke: '#ffffff', opacity: 0
        }
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (areasSource as any).setData({ type: 'FeatureCollection', features: areaFeatures });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function updateKMAEventOnMap(map: any, event: any | null) {
  const source = map.getSource('kma-hypocenter');
  if (!source) return;
  if (!event || !event.lat || !event.lon) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (source as any).setData({ type: 'FeatureCollection', features: [] });
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (source as any).setData({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature', geometry: { type: 'Point', coordinates: [event.lon, event.lat] },
      properties: { name: event.location, magnitude: event.magnitude, depth: event.depth, time: event.time }
    }]
  });
}
