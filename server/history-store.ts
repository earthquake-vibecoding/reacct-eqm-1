import fs from 'fs';
import path from 'path';
import { TopStationItem } from '../src/QuakeDetectService';
import { BufferedFrame, DetectedEventHistoryEntry, StationPointMeta } from './intensity-types';
import { jindoToStr, parseIntensityGif } from './kmoni-pixel';

const MAX_HISTORY_ENTRIES = 100;

export class EventHistoryStore {
  private eventHistory: DetectedEventHistoryEntry[] = [];
  private historyDir = path.join(process.cwd(), 'data');
  private currentEventStart: number | null = null;
  private currentEventMaxJindo: number | null = null;
  private currentEventTopStation: { region: string; name: string } | null = null;
  private currentEventCenter: [number, number] | null = null;

  constructor() {
    this.loadHistory();
  }

  public loadHistory() {
    try {
      const p = path.join(this.historyDir, 'history.json');
      if (fs.existsSync(p)) {
        const json = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (Array.isArray(json?.items)) {
          this.eventHistory = json.items
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((e: any) => e && typeof e.id === 'number')
            .sort((a: DetectedEventHistoryEntry, b: DetectedEventHistoryEntry) => b.id - a.id)
            .slice(0, MAX_HISTORY_ENTRIES);
        }
      }
      console.log(`[History] 감지 이벤트 ${this.eventHistory.length}개 로드 완료`);
    } catch (err) {
      console.error('[History] 히스토리 로드 실패:', err);
    }
  }

  private persistHistory() {
    try {
      fs.mkdirSync(this.historyDir, { recursive: true });
      fs.writeFileSync(path.join(this.historyDir, 'history.json'), JSON.stringify({ items: this.eventHistory }));
    } catch (err) {
      console.error('[History] 히스토리 저장 실패:', err);
    }
  }

  public getHistory(): DetectedEventHistoryEntry[] {
    return this.eventHistory;
  }

  public getAnimationPath(id: number): string | null {
    const entry = this.eventHistory.find((e) => e.id === id);
    if (!entry?.animation) return null;
    const p = path.join(this.historyDir, 'events', entry.animation);
    return fs.existsSync(p) ? p : null;
  }

  public getReplayPath(id: number): string | null {
    const entry = this.eventHistory.find((e) => e.id === id);
    if (!entry?.replay) return null;
    const p = path.join(this.historyDir, 'events', `event-${id}.replay.json`);
    return fs.existsSync(p) ? p : null;
  }

  public beginEvent(center: [number, number] | null) {
    this.currentEventStart = Date.now();
    this.currentEventMaxJindo = null;
    this.currentEventTopStation = null;
    this.currentEventCenter = center ?? null;
  }

  public updateStats(top: TopStationItem | undefined) {
    if (top && top.jindo !== null && (this.currentEventMaxJindo === null || top.jindo > this.currentEventMaxJindo)) {
      this.currentEventMaxJindo = top.jindo;
      this.currentEventTopStation = { region: top.region, name: top.name };
    }
  }

  public recordEventHistory(
    anim: { buf: Buffer; mime: string; frameCount: number } | null,
    replayFrames: BufferedFrame[],
    stations: StationPointMeta[]
  ) {
    if (!anim && replayFrames.length === 0) return;
    const now = Date.now();
    const start = this.currentEventStart ?? now - (anim?.frameCount ?? replayFrames.length) * 1000;

    let animation: string | null = null;
    if (anim?.buf?.length) {
      try {
        fs.mkdirSync(path.join(this.historyDir, 'events'), { recursive: true });
        const ext = anim.mime === 'video/mp4' ? 'mp4' : 'gif';
        animation = `event-${start}.${ext}`;
        fs.writeFileSync(path.join(this.historyDir, 'events', animation), anim.buf);
      } catch (err) {
        console.error('[History] 애니메이션 저장 실패:', err);
      }
    }

    let replay = false;
    if (replayFrames.length > 0) {
      try {
        fs.mkdirSync(path.join(this.historyDir, 'events'), { recursive: true });
        const replayJson = {
          version: 1,
          intervalSec: 1,
          startTs: start,
          times: replayFrames.map((f) => f.timeStr),
          frames: replayFrames.map((f) => {
            const intensities = parseIntensityGif(f.gif, stations);
            const sparse: Record<string, number> = {};
            for (const [code, jindo] of Object.entries(intensities)) {
              if (jindo !== null) sparse[code] = jindo;
            }
            return { i: sparse, g: f.grid ?? null };
          }),
        };
        fs.writeFileSync(
          path.join(this.historyDir, 'events', `event-${start}.replay.json`),
          JSON.stringify(replayJson)
        );
        replay = true;
      } catch (err) {
        console.error('[History] 리플레이 데이터 저장 실패:', err);
      }
    }

    const entry: DetectedEventHistoryEntry = {
      id: start,
      startTs: start,
      endTs: now,
      durationSec: Math.max(1, Math.round((now - start) / 1000)),
      maxJindo: this.currentEventMaxJindo,
      maxJindoStr: this.currentEventMaxJindo !== null ? jindoToStr(this.currentEventMaxJindo) : '알 수 없음',
      region: this.currentEventTopStation?.region ?? null,
      stationName: this.currentEventTopStation?.name ?? null,
      center: this.currentEventCenter,
      frameCount: anim?.frameCount ?? replayFrames.length,
      animation,
      replay,
    };
    this.eventHistory.unshift(entry);
    if (this.eventHistory.length > MAX_HISTORY_ENTRIES) {
      this.eventHistory.length = MAX_HISTORY_ENTRIES;
    }
    this.persistHistory();
    console.log(`[History] 감지 이벤트 기록: ${new Date(start).toISOString()} 최대 ${entry.maxJindoStr} (${this.eventHistory.length}번째)`);

    this.currentEventStart = null;
    this.currentEventMaxJindo = null;
    this.currentEventTopStation = null;
    this.currentEventCenter = null;
  }
}
