import i18n from '../i18n';
import { HoverInfo } from '../types';
import { formatObservationPointName, translateRegionName } from '../translateUtils';

function localizeScale(scaleStr: string, lng: string): string {
  if (lng.startsWith('en')) return scaleStr.replace('강', '+').replace('약', '-');
  if (lng.startsWith('ja')) return scaleStr.replace('강', '強').replace('약', '弱');
  return scaleStr;
}

// 추정 구역 라벨 이미지. 스타일에 glyphs가 없어 텍스트 심볼을 못 쓰므로
// canvas로 현지화 텍스트("추정"/"est."/"推定")를 그려 아이콘 이미지로 등록한다.
function lngKey(lng: string): 'ko' | 'en' | 'ja' {
  return lng.startsWith('en') ? 'en' : lng.startsWith('ja') ? 'ja' : 'ko';
}

const ESTIMATE_LABEL_TEXT: Record<'ko' | 'en' | 'ja', string> = { ko: '추정', en: 'est.', ja: '推定' };

function makeEstimatedImage(key: 'ko' | 'en' | 'ja'):
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = 2;
  const fontSize = 11;
  const font = `600 ${fontSize}px "Apple SD Gothic Neo", "Hiragino Sans", "Noto Sans KR", sans-serif`;
  ctx.font = font;
  const text = ESTIMATE_LABEL_TEXT[key];
  const w = Math.ceil(ctx.measureText(text).width) + 12;
  const h = fontSize + 9;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  const r = 4;
  ctx.beginPath();
  ctx.moveTo(1 + r, 1);
  ctx.arcTo(w - 1, 1, w - 1, h - 1, r);
  ctx.arcTo(w - 1, h - 1, 1, h - 1, r);
  ctx.arcTo(1, h - 1, 1, 1, r);
  ctx.arcTo(1, 1, w - 1, 1, r);
  ctx.closePath();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fill();
  // 범례의 점선 테두리 스와치와 동일한 어감
  ctx.setLineDash([2.5, 2]);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.8)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = font;
  ctx.fillStyle = '#e2e8f0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 0.5);
  // maplibre addImage 규격: width*height*4 == data.length. device 픽셀 크기와 raw RGBA 배열 필요
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: imgData.data };
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
    paint: { 'line-color': ['get', 'stroke'], 'line-width': 1.2, 'line-opacity': ['case', ['!=', ['get', 'color'], 'transparent'], 0.8, 0] }
  });

  // 추정(보간) 채움 구역 라벨. 겹침 허용 안 함 -> 조밀한 구역은 자동 생략
  const estKey = lngKey(i18n.language);
  for (const key of ['ko', 'en', 'ja'] as const) {
    const img = makeEstimatedImage(key);
    if (img && !map.hasImage(`est-${key}`)) map.addImage(`est-${key}`, img, { pixelRatio: 2 });
  }
  map.addLayer({
    id: 'p2p-estimated-label', type: 'symbol', source: 'p2p-areas', filter: ['has', 'estimated'],
    layout: {
      visibility: 'none', 'icon-allow-overlap': false, 'icon-image': `est-${estKey}`, 'icon-padding': 16,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 7, 1]
    },
    paint: { 'icon-opacity': 0.95 }
  });
  i18n.off('languageChanged');
  i18n.on('languageChanged', (lng: string) => {
    if (map.getLayer('p2p-estimated-label')) {
      map.setLayoutProperty('p2p-estimated-label', 'icon-image', `est-${lngKey(lng)}`);
    }
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
      'circle-color': ['get', 'color'], 'circle-opacity': 0.9, 'circle-stroke-width': 1.5, 'circle-stroke-color': ['get', 'stroke']
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
    const estLabel = lng.startsWith('en') ? 'Estimated Intensity' : lng.startsWith('ja') ? '推定震度' : '추정 진도';
    const codeLabel = lng.startsWith('en') ? 'Area Code' : lng.startsWith('ja') ? '区域コード' : '구역 코드';
    onHover({
      type: 'prefecture',
      title: transName !== props.name ? `${transName}` : props.name,
      subtitle: `${props.estimated ? estLabel : maxScaleLabel}: ${localizeScale(props.scaleStr, lng)} | ${codeLabel}: ${props.code}${props.name !== transName ? ` (${props.name})` : ''}`,
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
