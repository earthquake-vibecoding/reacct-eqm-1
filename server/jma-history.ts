// 일본 기상청(JMA) 진도 데이터베이스 검색 프록시 (1919년~현재)
// 원천: https://www.data.jma.go.jp/eqdb/data/shindo/ 내부 api/ (비공식 JSON API)
import express from 'express';

const SHINDO_API = 'https://www.data.jma.go.jp/eqdb/data/shindo/api/';

// 관측진도 코드: 1~4, A=5약, B=5강, C=6약, D=6강, 7=7 (JMA 계급 코드, "이상" 조건)
// 5/6 = 구계급(1996-10 이전) 자료. 약/강 구분이 없어 5강/6강으로 근사 표시
const CHAR_TO_SCALE: Record<string, number> = {
  '1': 10, '2': 20, '3': 30, '4': 40, '5': 50, '6': 60, A: 45, B: 50, C: 55, D: 60, 7: 70,
};

// int[] 관측점 code 앞 2자리 = JMA 지역 코드
const PREF_BY_CODE: Record<string, string> = {
  '10': '北海道', '20': '青森県', '21': '岩手県', '22': '宮城県', '23': '秋田県', '24': '山形県', '25': '福島県',
  '30': '茨城県', '31': '栃木県', '32': '群馬県', '33': '埼玉県', '34': '千葉県', '35': '東京都', '36': '神奈川県',
  '37': '新潟県', '38': '富山県', '39': '石川県', '40': '福井県', '41': '山梨県', '42': '長野県', '43': '岐阜県',
  '44': '静岡県', '45': '愛知県', '46': '三重県', '50': '滋賀県', '51': '京都府', '52': '大阪府', '53': '兵庫県',
  '54': '奈良県', '55': '和歌山県', '56': '鳥取県', '57': '島根県', '58': '岡山県', '59': '広島県', '60': '徳島県',
  '61': '香川県', '62': '愛媛県', '63': '高知県', '70': '山口県', '71': '福岡県', '72': '佐賀県', '73': '長崎県',
  '74': '熊本県', '75': '大分県', '76': '宮崎県', '77': '鹿児島県', '80': '沖縄県',
};

// TTL 캐시 (JMA 서버 부하 최소화)
const CACHE_TTL = 10 * 60_000;
const cache = new Map<string, { ts: number; data: unknown }>();

async function cached(key: string, fn: () => Promise<unknown>): Promise<unknown> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  const data = await fn();
  if (cache.size > 100) cache.clear();
  cache.set(key, { ts: Date.now(), data });
  return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function postShindo(form: Record<string, string | string[]>): Promise<any> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(form)) {
    if (Array.isArray(v)) v.forEach((x) => fd.append(`${k}[]`, x));
    else fd.append(k, v);
  }
  const resp = await fetch(SHINDO_API, { method: 'POST', body: fd, cache: 'no-cache' });
  if (!resp.ok) throw new Error(`shindo api ${resp.status}`);
  return resp.json();
}

function maxIclsToScale(cls: unknown): number {
  const ch = String(cls ?? '').replace('bg-I', '');
  return CHAR_TO_SCALE[ch] ?? 0;
}

function parseNum(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : -1;
}

// NOAA NCEI WDS 역사 쓰나미 DB (1650년~현재). 진도 DB에는 쓰나미 정보가 없어
// 발생 시각(JST->UTC)/위치/규모 근접 매칭으로 쓰나미 발생 기록을 연동한다.
const NOAA_API = 'https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1/tsunamis/events';

interface TsunamiHit {
  hasTsunami: boolean;
  maxWaterHeight: number;
}

async function fetchNoaaMonth(ym: string): Promise<unknown[]> {
  const [y, m] = ym.split('-');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await cached(`n:${ym}`, async () => {
    const resp = await fetch(`${NOAA_API}?year=${y}&month=${m}`);
    if (!resp.ok) throw new Error(`noaa api ${resp.status}`);
    return resp.json();
  })) as any;
  return Array.isArray(data?.items) ? data.items : [];
}

// "YYYY/MM/DD HH:MM:SS"(JST) -> UTC ms. 파싱 실패 시 NaN.
function jstToUtcMs(ot: string): number {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/.exec(ot);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5]);
}

// 단일 후보군(items) 안에서 JMA 이벤트에 최근접한 쓰나미 기록 매칭
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findTsunamiMatch(jstMs: number, lat: number, lon: number, mag: number, items: any[]): TsunamiHit | null {
  if (!Number.isFinite(jstMs)) return null;
  // 규모 미상이면 규모 게이트를 쓸 수 없어 근처 대지진 기록이 오탐으로 붙는다 -> 매칭 생략
  if (!(mag > 0)) return null;
  let best: { score: number; height: number } | null = null;
  for (const it of items) {
    const evDate = new Date(Date.UTC(it.year, (it.month ?? 1) - 1, it.day ?? 1, it.hour ?? 0, it.minute ?? 0));
    if (Math.abs(evDate.getTime() - jstMs) > 2 * 86_400_000) continue;
    const dLat = Math.abs((it.latitude ?? 999) - lat);
    const dLon = Math.abs((it.longitude ?? 999) - lon);
    if (dLat > 2 || dLon > 2) continue;
    // 규모 차이가 크면 다른 지진의 쓰나미 기록이 붙는 오탐 -> 제외
    if (mag > 0 && it.eqMagnitude != null && Math.abs(it.eqMagnitude - mag) > 0.7) continue;
    const magDiff = (it.eqMagnitude != null && mag > 0) ? Math.abs(it.eqMagnitude - mag) : 0;
    const score = dLat + dLon + magDiff;
    if (!best || score < best.score) best = { score, height: Number(it.maxWaterHeight) || 0 };
  }
  if (!best) return { hasTsunami: false, maxWaterHeight: 0 };
  return { hasTsunami: true, maxWaterHeight: best.height };
}

async function lookupTsunami(ot: string, lat: number, lon: number, mag: number): Promise<TsunamiHit | null> {
  const jstMs = jstToUtcMs(ot);
  if (!Number.isFinite(jstMs)) return null;
  // 달 경계를 고려해 전후 달까지 조회
  const utc = new Date(jstMs);
  const yms = new Set<string>();
  for (const off of [-1, 0, 1]) {
    const t = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth() + off, 1));
    yms.add(`${t.getUTCFullYear()}-${t.getUTCMonth() + 1}`);
  }
  const months = await Promise.all([...yms].map(fetchNoaaMonth));
  return findTsunamiMatch(jstMs, lat, lon, mag, months.flat());
}

function fmtDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function searchForm(from: string, to: string) {
  return {
    mode: 'search',
    dateTimeF: [from, '00:00'],
    dateTimeT: [to, '23:59'],
    mag: ['0.0', '9.9'],
    dep: ['000', '999'],
    epi: [], pref: [], city: [], station: [],
    obsInt: '1',
    maxInt: '1',
    additionalC: 'false',
    Sort: 'S0',
    Comp: 'C0',
    seisCount: 'false',
    observed: 'false',
  };
}

// JMA api는 검색 결과를 최대 1000건으로 자른다. 컷에 걸리면 기간을 반갈죽 재귀 조회해
// 전체를 모은다. (3.11 같은 대지진일이 1000건 컷 뒤로 밀리는 문제 방지)
// DB 미반영 기간이 종료일에 걸리면 res가 배열 대신 안내 문자열로 온다
// ("...には YYYY-MM-DD より後のデータはありません") -> cutoff로 추출해 전달.
interface ShindoSearch {
  items: any[];
  cutoff: string | null;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function searchShindoRange(from: string, to: string, depth = 0): Promise<ShindoSearch> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (await postShindo(searchForm(from, to))) as any;
  if (typeof raw?.res === 'string') {
    return { items: [], cutoff: /(\d{4}-\d{2}-\d{2})/.exec(raw.res)?.[1] ?? null };
  }
  const items = Array.isArray(raw?.res) ? raw.res : [];
  if (items.length < 1000 || depth >= 8) return { items, cutoff: null };
  const fMs = Date.parse(`${from}T00:00:00Z`);
  const tMs = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fMs) || !Number.isFinite(tMs) || tMs < fMs) return { items, cutoff: null };
  const days = (tMs - fMs) / 86_400_000 + 1;
  const half = Math.floor(days / 2);
  if (half < 1) return { items, cutoff: null }; // 하루 단위인데도 1000건이면 여기까지
  const splitStart = fMs + half * 86_400_000;
  const [older, newer] = await Promise.all([
    searchShindoRange(from, fmtDay(splitStart - 86_400_000), depth + 1),
    searchShindoRange(fmtDay(splitStart), to, depth + 1),
  ]);
  return { items: [...older.items, ...newer.items], cutoff: older.cutoff ?? newer.cutoff };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerJmaHistoryRoutes(app: express.Express) {
  // 기간별 지진 목록 검색 (최대진도 기준 필터)
  app.get('/api/jma/history', async (req, res) => {
    const from = String(req.query.from ?? '').trim();
    const to = String(req.query.to ?? '').trim();
    const minInt = String(req.query.minInt ?? 'A').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({ error: 'Invalid date range' });
    }
    if (!(minInt in CHAR_TO_SCALE)) {
      return res.status(400).json({ error: 'Invalid minInt' });
    }
    try {
      const data = (await cached(`h:${from}:${to}:${minInt}`, async () => {
        const { items: merged, cutoff } = await searchShindoRange(from, to);
        // 부분 조회 병합이라 정렬 깨짐 -> 시각 내림차순 복구 + 중복 제거
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const seen = new Set<string>();
        return {
          cutoff,
          items: (merged as any[])
            .filter((it) => {
              const id = String(it?.id ?? '');
              if (!id || seen.has(id)) return false;
              seen.add(id);
              return true;
            })
            .sort((a, b) => (String(b.ot ?? '') > String(a.ot ?? '') ? 1 : -1)),
        };
      })) as { items: any[]; cutoff: string | null };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const merged = data.items;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items = merged.map((it: any) => ({
        id: String(it.id),
        time: String(it.ot ?? ''),
        name: String(it.name ?? ''),
        lat: parseFloat(String(it.lat)) || 0,
        lon: parseFloat(String(it.lon)) || 0,
        depth: parseNum(it.dep),
        magnitude: parseNum(it.mag),
        maxScale: maxIclsToScale(it.maxIcls),
      }));
      // JMA api는 진도 하한(obsInt)으로 목록을 걸러주지 않으므로 직접 필터.
      // maxScale 0 = 최대진도 미상(구계급 등) -> 중요 지진 누락 방지 위해 항상 포함.
      const minScale = CHAR_TO_SCALE[minInt] ?? 0;
      const filtered = minScale > 0 ? items.filter((it) => it.maxScale >= minScale || it.maxScale === 0) : items;

      // 목록 쓰나미 표시: 검색 기간 24개월 이하일 때만 NOAA 월 단위 일괄 매칭.
      // 기간이 너무 길면 조회 비용 때문에 생략(null) — 상세 조회에서 개별 매칭 가능.
      let noaaItems: unknown[] | null = null;
      try {
        const [fy, fm] = from.split('-').map(Number);
        const [ty, tm] = to.split('-').map(Number);
        const monthCount = (ty - fy) * 12 + (tm - fm) + 1;
        if (monthCount >= 1 && monthCount <= 24) {
          const yms: string[] = [];
          for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m += 1) {
            if (m > 12) { y += 1; m = 1; }
            yms.push(`${y}-${String(m).padStart(2, '0')}`);
          }
          noaaItems = (await Promise.all(yms.map(fetchNoaaMonth))).flat();
        }
      } catch {
        noaaItems = null;
      }
      const annotated = filtered.map((it) => ({
        ...it,
        tsunami: noaaItems ? findTsunamiMatch(jstToUtcMs(it.time), it.lat, it.lon, it.magnitude, noaaItems) : null,
      }));

      res.json({ items: annotated, cutoff: data.cutoff });
    } catch {
      res.status(502).json({ error: 'JMA shindo api request failed' });
    }
  });

  // 개별 지진 상세 (진원지 + 관측점별 진도)
  app.get('/api/jma/event', async (req, res) => {
    const id = String(req.query.id ?? '').trim();
    if (!/^\d{12,14}$/.test(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await cached(`e:${id}`, () => postShindo({ mode: 'event', id }))) as any;
      const hyp = data?.res?.hyp?.[0];
      const intList = data?.res?.int;
      if (!hyp || !Array.isArray(intList)) {
        return res.status(404).json({ error: 'Event not found' });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const points = intList.map((p: any) => {
        const code = String(p.code ?? '');
        return {
          pref: PREF_BY_CODE[code.slice(0, 2)] ?? '',
          name: String(p.name ?? '').replace(/＊$/, ''),
          scale: CHAR_TO_SCALE[String(p.char ?? '')] ?? 0,
          lat: parseFloat(String(p.lat)) || 0,
          lon: parseFloat(String(p.lon)) || 0,
        };
      }).filter((p) => p.scale > 0 && p.lat !== 0 && p.lon !== 0);
      points.sort((a, b) => b.scale - a.scale);
      // 구계급(1949년 이전) 자료는 maxIcls가 없어 0으로 온다 -> 관측점 최대 진도로 보정
      const maxScale = maxIclsToScale(hyp.maxIcls) || (points.length ? points[0].scale : 0);
      // 쓰나미 발생 기록 연동 (NOAA NCEI). 실패 시 null -> 클라이언트가 "기록 없음" 표시
      const tsunami = await lookupTsunami(String(hyp.ot ?? ''), parseFloat(String(hyp.lat)) || 0, parseFloat(String(hyp.lon)) || 0, parseNum(hyp.mag)).catch(() => null);
      res.json({
        id: String(hyp.id),
        time: String(hyp.ot ?? ''),
        name: String(hyp.name ?? ''),
        lat: parseFloat(String(hyp.lat)) || 0,
        lon: parseFloat(String(hyp.lon)) || 0,
        depth: parseNum(hyp.dep),
        magnitude: parseNum(hyp.mag),
        maxScale,
        points,
        tsunami,
      });
    } catch {
      res.status(502).json({ error: 'JMA shindo api request failed' });
    }
  });
}
