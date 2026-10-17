// JMA 진도 데이터베이스 아카이브(1919년~) 검색 클라이언트
// 서버 프록시(/api/jma/*)를 경유하며, 결과를 P2PEarthquakeEvent 모델로 변환해
// 기존 지도 렌더링/카드 UI를 그대로 재사용한다.
import {
  P2PEarthquakeEvent,
  P2PObservationPoint,
  formatScaleJMA,
} from './P2PQuakeService';
import i18n from './i18n';

export interface JmaHistoryItem {
  id: string;
  time: string;
  name: string;
  lat: number;
  lon: number;
  depth: number;
  magnitude: number;
  maxScale: number;
  // 목록용 쓰나미 매칭 (기간 24개월 초과 시 null)
  tsunami: { hasTsunami: boolean; maxWaterHeight: number } | null;
}

export async function searchJmaHistory(
  from: string,
  to: string,
  minInt: string
): Promise<JmaHistoryItem[]> {
  const q = new URLSearchParams({ from, to, minInt });
  const resp = await fetch(`/api/jma/history?${q.toString()}`);
  if (!resp.ok) throw new Error('archive search failed');
  const data = await resp.json();
  return Array.isArray(data.items) ? data.items : [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tsunamiText(tsunami: any): string {
  // getTsunamiText 키워드('걱정','조사','경보','Warning' 등)에 걸리지 않는 문구로
  // 만들어 카드 배너에 그대로 표시된다.
  const lng = i18n.language?.startsWith('en') ? 'en' : i18n.language?.startsWith('ja') ? 'ja' : 'ko';
  if (tsunami?.hasTsunami) {
    const h = Number(tsunami.maxWaterHeight);
    if (h > 0) {
      return lng === 'en' ? `Tsunami recorded (NOAA max runup ${h}m)`
        : lng === 'ja' ? `津波の発生記録あり (NOAA 最大遡上${h}m)`
        : `쓰나미 발생 기록 있음 (NOAA 최대 월고 ${h}m)`;
    }
    return lng === 'en' ? 'Tsunami recorded (NOAA)'
      : lng === 'ja' ? '津波の発生記録あり (NOAA)'
      : '쓰나미 발생 기록 있음 (NOAA 기록)';
  }
  if (tsunami === null || tsunami === undefined) {
    return lng === 'en' ? 'Tsunami lookup failed'
      : lng === 'ja' ? '津波記録の取得に失敗'
      : '쓰나미 기록 조회 실패';
  }
  return lng === 'en' ? 'No tsunami record (NOAA)'
    : lng === 'ja' ? '津波の記録なし (NOAA)'
    : '쓰나미 기록 없음 (NOAA)';
}

export async function fetchJmaHistoryEvent(id: string): Promise<P2PEarthquakeEvent> {
  const resp = await fetch(`/api/jma/event?id=${encodeURIComponent(id)}`);
  if (!resp.ok) throw new Error('archive event fetch failed');
  const ev = await resp.json();

  const scaleInfo = formatScaleJMA(Number(ev.maxScale) || 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const points: P2PObservationPoint[] = (ev.points ?? []).map((p: any) => {
    const si = formatScaleJMA(Number(p.scale) || 0);
    return {
      pref: String(p.pref ?? ''),
      name: String(p.name ?? ''),
      scale: Number(p.scale) || 0,
      scaleStr: si.text,
      color: si.color,
      lat: Number(p.lat) || 0,
      lon: Number(p.lon) || 0,
    };
  });

  return {
    id: `jma_${ev.id}`,
    eventId: String(ev.id),
    time: String(ev.time ?? ''),
    issueType: 'JmaArchive',
    hypocenter: {
      name: String(ev.name ?? ''),
      latitude: Number(ev.lat) || 0,
      longitude: Number(ev.lon) || 0,
      depth: Number(ev.depth) || 0,
      magnitude: Number(ev.magnitude) || 0,
    },
    maxScale: Number(ev.maxScale) || 0,
    maxScaleStr: scaleInfo.text,
    maxScaleColor: scaleInfo.color,
    tsunami: tsunamiText(ev.tsunami),
    points,
  };
}
