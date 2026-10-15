import i18n from '../i18n';
import { HoverInfo } from '../types';
import { formatObservationPointName, translateRegionName } from '../translateUtils';

function localizeScale(scaleStr: string, lng: string): string {
  if (lng.startsWith('en')) return scaleStr.replace('강', '+').replace('약', '-');
  if (lng.startsWith('ja')) return scaleStr.replace('강', '強').replace('약', '弱');
  return scaleStr;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setupP2PAndKmaLayers(map: any, onHover: (info: HoverInfo | null) => void) {
  map.addSource('p2p-hypocenter', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('kma-hypocenter', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('p2p-areas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('p2p-points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

  map.addLayer({
    id: 'p2p-areas-fill', type: 'fill', source: 'p2p-areas', layout: { visibility: 'none' },
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'] }
  });
  map.addLayer({
    id: 'p2p-areas-line', type: 'line', source: 'p2p-areas', layout: { visibility: 'none' },
    paint: { 'line-color': '#ffffff', 'line-width': 1.2, 'line-opacity': ['case', ['!=', ['get', 'color'], 'transparent'], 0.8, 0] }
  });
  map.addLayer({
    id: 'p2p-points-layer', type: 'circle', source: 'p2p-points', layout: { visibility: 'none' },
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        4, ['interpolate', ['linear'], ['get', 'scale'], 10, 4, 30, 6, 50, 8, 70, 11],
        7, ['interpolate', ['linear'], ['get', 'scale'], 10, 6, 30, 8, 50, 11, 70, 15],
        10, ['interpolate', ['linear'], ['get', 'scale'], 10, 8, 30, 12, 50, 16, 70, 22]
      ],
      'circle-color': ['get', 'color'], 'circle-opacity': 0.9, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff'
    }
  });
  map.addLayer({
    id: 'p2p-hypocenter-glow', type: 'circle', source: 'p2p-hypocenter',
    paint: { 'circle-radius': 16, 'circle-color': '#dc2626', 'circle-opacity': 0.35, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' }
  });
  map.addLayer({
    id: 'p2p-hypocenter-center', type: 'circle', source: 'p2p-hypocenter',
    paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#dc2626' }
  });
  map.addLayer({
    id: 'kma-hypocenter-glow', type: 'circle', source: 'kma-hypocenter',
    paint: { 'circle-radius': 24, 'circle-color': '#2563eb', 'circle-opacity': 0.35, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' }
  });
  map.addLayer({
    id: 'kma-hypocenter-center', type: 'circle', source: 'kma-hypocenter',
    paint: { 'circle-radius': 8, 'circle-color': '#ffffff', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#2563eb' }
  });

  const clearHover = () => { map.getCanvas().style.cursor = ''; onHover(null); };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map.on('mousemove', 'p2p-areas-fill', (e: any) => {
    const props = e.features?.[0]?.properties;
    if (!props || !props.scale || Number(props.scale) < 10 || props.color === 'transparent') { clearHover(); return; }
    map.getCanvas().style.cursor = 'pointer';
    const lng = i18n.language;
    const transName = translateRegionName(props.name, lng);
    const maxScaleLabel = lng.startsWith('en') ? 'Max Intensity' : lng.startsWith('ja') ? '最大震度' : '최대 관측 진도';
    const codeLabel = lng.startsWith('en') ? 'Area Code' : lng.startsWith('ja') ? '区域コード' : '구역 코드';
    onHover({
      type: 'prefecture',
      title: transName !== props.name ? `${transName}` : props.name,
      subtitle: `${maxScaleLabel}: ${localizeScale(props.scaleStr, lng)} | ${codeLabel}: ${props.code}${props.name !== transName ? ` (${props.name})` : ''}`,
      x: e.point?.x, y: e.point?.y, scaleColor: props.color
    });
  });
  map.on('mouseleave', 'p2p-areas-fill', clearHover);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map.on('mousemove', 'p2p-points-layer', (e: any) => {
    const props = e.features?.[0]?.properties;
    if (!props) return;
    map.getCanvas().style.cursor = 'pointer';
    const lng = i18n.language;
    const { fullTranslated } = formatObservationPointName(props.pref, props.name, lng);
    const obsScaleLabel = lng.startsWith('en') ? 'Observed Intensity' : lng.startsWith('ja') ? '観測震度' : '관측 진도';
    onHover({
      type: 'p2p_point',
      title: `${fullTranslated}`,
      subtitle: `${obsScaleLabel}: ${localizeScale(props.scaleStr, lng)}${props.name && lng !== 'ja' ? ` [${props.pref} ${props.name}]` : ''}`,
      x: e.point?.x, y: e.point?.y, scaleColor: props.color
    });
  });
  map.on('mouseleave', 'p2p-points-layer', clearHover);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map.on('mousemove', 'p2p-hypocenter-center', (e: any) => {
    const props = e.features?.[0]?.properties;
    if (!props) return;
    map.getCanvas().style.cursor = 'pointer';
    const lng = i18n.language;
    const transHypo = translateRegionName(props.name, lng);
    const tag = lng.startsWith('en') ? '[Epicenter]' : lng.startsWith('ja') ? '【震源地】' : '[진원지]';
    const timeLabel = lng.startsWith('en') ? 'Time' : lng.startsWith('ja') ? '発生' : '발생';
    const depthLabel = lng.startsWith('en') ? 'Depth' : lng.startsWith('ja') ? '深さ' : '깊이';
    const maxLabel = lng.startsWith('en') ? 'Max' : lng.startsWith('ja') ? '最大' : '최대진도';
    onHover({
      type: 'p2p_hypocenter',
      title: `${tag} ${transHypo}`,
      subtitle: `${timeLabel}: ${props.time} | M${props.magnitude} | ${depthLabel} ${props.depth}km | ${maxLabel}: ${localizeScale(props.maxScaleStr, lng)}${props.name !== transHypo ? ` (${props.name})` : ''}`,
      x: e.point?.x, y: e.point?.y
    });
  });
  map.on('mouseleave', 'p2p-hypocenter-center', clearHover);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map.on('mousemove', 'kma-hypocenter-center', (e: any) => {
    const props = e.features?.[0]?.properties;
    if (!props) return;
    map.getCanvas().style.cursor = 'pointer';
    const lng = i18n.language;
    const tag = lng.startsWith('en') ? '[KMA Epicenter]' : lng.startsWith('ja') ? '【韓国気象庁 震源地】' : '[기상청 진원지]';
    const timeLabel = lng.startsWith('en') ? 'Time' : lng.startsWith('ja') ? '発生' : '발생';
    const depthLabel = lng.startsWith('en') ? 'Depth' : lng.startsWith('ja') ? '深さ' : '깊이';
    onHover({
      type: 'p2p_hypocenter',
      title: `${tag} ${props.name}`,
      subtitle: `${timeLabel}: ${props.time} | M${props.magnitude}${props.depth ? ` | ${depthLabel} ${props.depth}km` : ''}`,
      x: e.point?.x, y: e.point?.y
    });
  });
  map.on('mouseleave', 'kma-hypocenter-center', clearHover);
}
