import fs from 'fs';
import path from 'path';
import { QuakeDetectService } from './src/QuakeDetectService';
import type { BufferedFrame, DetectedEventHistoryEntry, IntensityUpdatePayload, LpUpdatePayload, SsePayload, StationPointMeta, WolfxServerEEW } from './server/intensity-types';
import { INSET_PROJECTION, MAIN_PROJECTION, getIntensityFromRGB, getLpFromRGB, isInInsetRegion, jindoToStr, lpClsToStr, parseIntensityGif, parseLpGif, validateSpatialSupport } from './server/kmoni-pixel';
import { WebhookNotifier } from './server/webhook-notifier';
import { PushNotifier } from './server/push-notifier';
import { EventHistoryStore } from './server/history-store';
import { fetchKmoniGifWithDelay, fetchLmoniGifWithDelay, fetchWolfxActiveEEW, fetchYahooIntensitiesWithDelay } from './server/upstream-fetchers';

export type { StationPointMeta, IntensityUpdatePayload, LpUpdatePayload, SsePayload, DetectedEventHistoryEntry };
export {
  getLpFromRGB, lpClsToStr, jindoToStr, getIntensityFromRGB,
  MAIN_PROJECTION, INSET_PROJECTION, isInInsetRegion, validateSpatialSupport,
};

const MAX_EVENT_FRAMES = 300;
const RECENT_FRAME_RING = 15;

export class ServerIntensityAggregator {
  private stations: StationPointMeta[] = [];
  private latestKmoniPayload: IntensityUpdatePayload | null = null;
  private latestYahooPayload: IntensityUpdatePayload | null = null;
  private latestLpPayload: LpUpdatePayload | null = null;
  private sseClients: Set<(data: SsePayload) => void> = new Set();
  private timer: NodeJS.Timeout | null = null;
  private isDestroyed = false;

  private detectService: QuakeDetectService | null = null;
  private webhook = new WebhookNotifier();
  private push = new PushNotifier();
  private historyStore = new EventHistoryStore();
  private lastKmoniGif: Buffer | null = null;
  private lastEewGif: Buffer | null = null;
  private lastKmoniSuccessAt = 0;
  private lastKmoniDataTime = '';
  private kmoniConsecutiveFailures = 0;

  private eventFrameBuffer: BufferedFrame[] = [];
  private recentFrameRing: BufferedFrame[] = [];
  private isEventBuffering = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private lastActiveGridGeojson: any = null;
  private kmoniOptimalDelay = 2000;
  private lmoniOptimalDelay = 2000;
  private yahooOptimalDelay = 1000;
  private activeEew: WolfxServerEEW | null = null;
  private lastWolfxPollAt = 0;

  constructor() {
    this.loadStationList();
    this.startPollingLoop();
    this.detectService = new QuakeDetectService();
    this.detectService.initKmoniStations(this.stations);
  }

  public getHistory(): DetectedEventHistoryEntry[] { return this.historyStore.getHistory(); }
  public getPushNotifier(): PushNotifier { return this.push; }
  public getAnimationPath(id: number): string | null { return this.historyStore.getAnimationPath(id); }
  public getReplayPath(id: number): string | null { return this.historyStore.getReplayPath(id); }

  public getKmoniHealth() {
    const secondsSinceSuccess = this.lastKmoniSuccessAt ? Math.round((Date.now() - this.lastKmoniSuccessAt) / 1000) : null;
    return {
      ok: secondsSinceSuccess !== null && secondsSinceSuccess < 30,
      lastDataTime: this.lastKmoniDataTime || null,
      secondsSinceSuccess,
      consecutiveFailures: this.kmoniConsecutiveFailures,
    };
  }

  private loadStationList() {
    try {
      const p = [
        path.join(process.cwd(), 'dist', 'intensity-points-v1.json'),
        path.join(process.cwd(), 'public', 'intensity-points-v1.json'),
      ].find((c) => fs.existsSync(c));
      if (p) {
        const json = JSON.parse(fs.readFileSync(p, 'utf-8'));
        this.stations = Array.isArray(json) ? json : (json.items || []);
        console.log(`[ServerIntensityAggregator] 관측소 ${this.stations.length}개 로드 완료`);
      }
    } catch (e) { console.error('[ServerIntensityAggregator] 관측소 로드 실패:', e); }
  }

  public getLatestPayload(source: 'kmoni' | 'yahoo' = 'kmoni'): IntensityUpdatePayload | null {
    return source === 'kmoni' ? this.latestKmoniPayload : this.latestYahooPayload;
  }

  public subscribeSSE(listener: (data: SsePayload) => void): () => void {
    this.sseClients.add(listener);
    if (this.latestKmoniPayload) listener(this.latestKmoniPayload);
    if (this.latestYahooPayload) listener(this.latestYahooPayload);
    if (this.latestLpPayload) listener(this.latestLpPayload);
    return () => { this.sseClients.delete(listener); };
  }

  private triggerCurrentWebhook(source: string, isNewEvent: boolean) {
    const top = this.detectService?.getTopStations(1)?.[0] ?? null;
    const grid = this.detectService?.lastDetectedGeojson?.features ?? [];
    this.webhook.triggerWebhook(source, isNewEvent, top, this.lastKmoniGif, grid, this.activeEew, this.lastEewGif);
  }

  private async pollWolfx() {
    const now = Date.now();
    if (now - this.lastWolfxPollAt < 2000) return;
    this.lastWolfxPollAt = now;

    const eew = await fetchWolfxActiveEEW();
    if (!eew) {
      this.activeEew = null;
      return;
    }

    const isChanged =
      !this.activeEew ||
      this.activeEew.EventID !== eew.EventID ||
      this.activeEew.Serial !== eew.Serial ||
      this.activeEew.isCancel !== eew.isCancel ||
      this.activeEew.isFinal !== eew.isFinal;

    this.activeEew = eew;
    if (isChanged && this.webhook.hasActiveMessage()) {
      await this.webhook.patchEewOnActiveWebhook(eew);
    }
  }

  private broadcast(payload: IntensityUpdatePayload) {
    if (payload.source === 'kmoni') this.latestKmoniPayload = payload;
    else this.latestYahooPayload = payload;
    for (const client of this.sseClients) { try { client(payload); } catch {} }

    if (!this.detectService || payload.source !== 'kmoni' || !payload.intensities) return;
    try {
      this.detectService.processKmoniParsedData(payload.intensities, {
        onDetectedUpdated: (grid) => { if (grid?.features?.length > 0) this.lastActiveGridGeojson = grid; },
        onNewEventDetected: (center: [number, number]) => {
          if (!this.isEventBuffering) {
            this.isEventBuffering = true;
            this.eventFrameBuffer = [];
            this.webhook.resetLastAlert();
            this.historyStore.beginEvent(center ?? null);
          }
          this.historyStore.updateStats(this.detectService?.getTopStations(1)?.[0]);
          this.triggerCurrentWebhook(payload.source, true);
          this.push.notifyNewEvent(this.detectService?.getTopStations(1)?.[0] ?? null, this.activeEew);
        },
        onSoundTriggered: () => {
          this.historyStore.updateStats(this.detectService?.getTopStations(1)?.[0]);
          this.triggerCurrentWebhook(payload.source, false);
        },
        onEventsFinished: () => {
          this.isEventBuffering = false;
          const first = this.eventFrameBuffer[0]?.timeStr;
          const preRoll = first ? this.recentFrameRing.filter((f) => f.timeStr < first) : [];
          const fullFrames = [...preRoll, ...this.eventFrameBuffer];
          this.eventFrameBuffer = [];
          const gridFeatures = this.lastActiveGridGeojson?.features ?? [];
          this.webhook.sendEventAnimationWebhook(fullFrames, gridFeatures, this.activeEew)
            .then((anim) => this.historyStore.recordEventHistory(anim, fullFrames, this.stations))
            .catch(() => this.historyStore.recordEventHistory(null, fullFrames, this.stations));
        },
      });
    } catch (err) { console.error('[Detect] 감지 파이프라인 예외:', err); }
  }

  private startPollingLoop() {
    let isRunning = false;
    const loop = async () => {
      if (this.isDestroyed || isRunning) return;
      isRunning = true;
      const startTime = Date.now();
      try { await Promise.allSettled([this.pollKmoni(), /* this.pollYahoo(), */ this.pollLmoni(), this.pollWolfx()]); }
      finally {
        isRunning = false;
        if (!this.isDestroyed) this.timer = setTimeout(loop, Math.max(50, 1000 - (Date.now() - startTime)));
      }
    };
    loop();
  }

  private async pollKmoni() {
    const res = await fetchKmoniGifWithDelay(this.kmoniOptimalDelay);
    if (!res) { this.kmoniConsecutiveFailures++; return; }
    const { buffer, eewBuffer, timeStr, delay } = res;
    this.lastKmoniGif = buffer;
    this.lastEewGif = eewBuffer;
    this.kmoniOptimalDelay = delay;
    this.lastKmoniSuccessAt = Date.now();
    this.lastKmoniDataTime = timeStr;
    this.kmoniConsecutiveFailures = 0;

    if (this.isEventBuffering) {
      const last = this.eventFrameBuffer[this.eventFrameBuffer.length - 1];
      if ((!last || last.timeStr !== timeStr) && this.eventFrameBuffer.length < MAX_EVENT_FRAMES) {
        this.eventFrameBuffer.push({ timeStr, gif: buffer, eewGif: eewBuffer, grid: this.lastActiveGridGeojson });
      }
    }
    const ringLast = this.recentFrameRing[this.recentFrameRing.length - 1];
    if (!ringLast || ringLast.timeStr !== timeStr) {
      this.recentFrameRing.push({ timeStr, gif: buffer, eewGif: eewBuffer, grid: this.lastActiveGridGeojson });
      if (this.recentFrameRing.length > RECENT_FRAME_RING) this.recentFrameRing.shift();
    }
    try { this.broadcast({ timestamp: Date.now(), source: 'kmoni', dataTime: timeStr, intensities: parseIntensityGif(buffer, this.stations) }); } catch {}
  }

  private async pollLmoni() {
    const res = await fetchLmoniGifWithDelay(this.lmoniOptimalDelay);
    if (!res) return;
    this.lmoniOptimalDelay = res.delay;
    try {
      const { lp, lpColors } = parseLpGif(res.buffer, this.stations);
      const payload: LpUpdatePayload = { timestamp: Date.now(), source: 'lmoni', dataTime: res.timeStr, lp, lpColors };
      this.latestLpPayload = payload;
      for (const client of this.sseClients) { try { client(payload); } catch {} }
    } catch {}
  }

  private async pollYahoo() {
    const res = await fetchYahooIntensitiesWithDelay(this.yahooOptimalDelay);
    if (!res) return;
    this.yahooOptimalDelay = res.delay;
    this.broadcast({ timestamp: Date.now(), source: 'yahoo', dataTime: res.dataTime, intensities: res.intensities });
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.sseClients.clear();
  }
}
