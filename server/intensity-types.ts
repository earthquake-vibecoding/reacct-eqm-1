export interface StationPointMeta {
  Type?: number;
  Code: string;
  Name: string;
  Region: string;
  IsSuspended?: boolean;
  Location: { latitude: number; longitude: number };
  OldLocation?: { latitude: number; longitude: number };
  Point: { x: number; y: number } | null;
  ClassificationId?: number | null;
  PrefectureClassificationId?: number | null;
}

export interface IntensityUpdatePayload {
  timestamp: number;
  source: 'kmoni' | 'yahoo';
  dataTime: string;
  intensities: Record<string, number | null>;
}

/** 장주기 지진동(lmoni abrspmx) 페이로드. lp는 계급 0~4, null=데이터 없음. lpColors는 지도 점 표시색 */
export interface LpUpdatePayload {
  timestamp: number;
  source: 'lmoni';
  dataTime: string;
  lp: Record<string, number | null>;
  lpColors: Record<string, string | null>;
}

/** SSE로 내보내는 페이로드 (진도 또는 장주기) */
export type SsePayload = IntensityUpdatePayload | LpUpdatePayload;

/** 감지 이벤트 히스토리 항목 (data/history.json에 저장, GET /api/history로 제공) */
export interface DetectedEventHistoryEntry {
  id: number;
  startTs: number;
  endTs: number;
  durationSec: number;
  maxJindo: number | null;
  maxJindoStr: string;
  region: string | null;
  stationName: string | null;
  center: [number, number] | null;
  frameCount: number;
  animation: string | null;
  replay?: boolean;
}

export interface BufferedFrame {
  timeStr: string;
  gif: Buffer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  grid: any;
}
