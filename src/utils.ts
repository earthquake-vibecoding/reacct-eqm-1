export function haversineDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * 일본 기상청(JMA) 공인 계측진도(Instrumental Intensity) -> 진도 계급(Shindo Scale) 변환 공식
 * 
 * JMA 공식 기준:
 * I < 0.5            : 0
 * 0.5 <= I < 1.5     : 1
 * 1.5 <= I < 2.5     : 2
 * 2.5 <= I < 3.5     : 3
 * 3.5 <= I < 4.5     : 4
 * 4.5 <= I < 5.0     : 5약 (5-)
 * 5.0 <= I < 5.5     : 5강 (5+)
 * 5.5 <= I < 6.0     : 6약 (6-)
 * 6.0 <= I < 6.5     : 6강 (6+)
 * 6.5 <= I           : 7
 */
export function getJindoString(jindo: number | null): string {
  if (jindo === null || isNaN(jindo)) return "-";
  if (jindo < 0.5) return "0";
  if (jindo < 1.5) return "1";
  if (jindo < 2.5) return "2";
  if (jindo < 3.5) return "3";
  if (jindo < 4.5) return "4";
  if (jindo < 5.0) return "5-";
  if (jindo < 5.5) return "5+";
  if (jindo < 6.0) return "6-";
  if (jindo < 6.5) return "6+";
  return "7";
}

/**
 * 사용자 친화적인 진도 계급 한국어/공식 표기 반환 (예: 震度0, 震度1, 5약, 5강 등)
 */
export function getJindoDetailedName(jindo: number | null): string {
  if (jindo === null || isNaN(jindo)) return "관측 없음";
  if (jindo < 0.5) return "진도 0";
  if (jindo < 1.5) return "진도 1";
  if (jindo < 2.5) return "진도 2";
  if (jindo < 3.5) return "진도 3";
  if (jindo < 4.5) return "진도 4";
  if (jindo < 5.0) return "진도 5약";
  if (jindo < 5.5) return "진도 5강";
  if (jindo < 6.0) return "진도 6약";
  if (jindo < 6.5) return "진도 6강";
  return "진도 7";
}

/**
 * 배경색 명도에 따라 가독성 높은 글자색(검정/흰색)을 반환한다.
 * WCAG 상대 휘도 기준. 진도 배지 등 밝은 배경 위 흰 글자 방지용.
 */
function relLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function getScaleTextColor(hex: string): string {
  return relLuminance(hex) > 0.35 ? '#000000' : '#ffffff';
}

/**
 * 라이트 모드(흰 지도/표면)에서 밝은 진도색(진도1 흰색 계열, 크림, 노랑)이
 * 배경과 동화되지 않도록 외곽선 색을 반환한다. 밝은 색 -> 회색, 나머지 -> 흰색.
 */
export function getScaleStrokeColor(hex: string): string {
  return relLuminance(hex) > 0.5 ? '#94a3b8' : '#ffffff';
}

/**
 * 두 hex 색을 선형 보간한다(t=0 -> a, t=1 -> b). 추정 진도 채움을 실측과
 * 색으로 구분할 때 진도색을 회색 톤으로 탈색하는 용도.
 */
export function mixColor(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const mix = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// 3-프레임 미디언 필터
export class NoiseFilterService {
  applyMedianFilter(stn: any, newJindo: number): number {
    if (!stn.rawJindoHistory) stn.rawJindoHistory = [];
    stn.rawJindoHistory.push(newJindo);
    if (stn.rawJindoHistory.length > 3) {
      stn.rawJindoHistory.shift();
    }
    
    if (stn.rawJindoHistory.length < 3) {
      return newJindo;
    }
    
    const sorted = [...stn.rawJindoHistory].sort((a, b) => a - b);
    return sorted[1]; // 중앙값
  }
}

const JST_OFFSET_MS = 9 * 3600_000;

/**
 * 임의 시각을 일본 표준시(JST, UTC+9)의 "HH:MM:SS" 문자열로 변환한다.
 * 방문자 기기 시간대와 무관하게 일관된 표기를 위해 사용.
 */
export function formatJSTClock(date: Date = new Date()): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(jst.getUTCHours())}:${p(jst.getUTCMinutes())}:${p(jst.getUTCSeconds())}`;
}

/**
 * 임의 시각을 일본 표준시(JST, UTC+9)의 "MM/DD HH:MM:SS" 문자열로 변환한다.
 * 감지 히스토리 등 날짜가 함께 필요한 곳에서 사용.
 */
export function formatJSTDateTime(date: Date = new Date()): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(jst.getUTCMonth() + 1)}/${p(jst.getUTCDate())} ${formatJSTClock(date)}`;
}
