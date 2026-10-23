import fs from 'fs';
import path from 'path';
import webpush from 'web-push';
import { TopStationItem } from '../src/QuakeDetectService';
import { translatePrefecture, translateRegionName } from '../src/translateUtils';
import { WolfxServerEEW } from './intensity-types';

type Lang = 'ko' | 'en' | 'ja';
interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  lang: Lang;
}

const SUBSCRIPTIONS_PATH = path.join(process.cwd(), 'data', 'push-subscriptions.json');

// 진도 표기 변환: 원본은 일본식(5弱). ko는 한글 변환, en은 부호 표기.
function formatScale(raw: string | undefined, lang: Lang): string {
  if (!raw) return '-';
  if (lang === 'ko') return raw.replace(/強/g, '강').replace(/弱/g, '약');
  if (lang === 'en') return raw.replace(/\+/g, '+').replace(/-/g, '-').replace(/強/g, '+').replace(/弱/g, '-');
  return raw;
}

interface PushText { title: string; body: string; }
function buildText(lang: Lang, topStation: TopStationItem | null, eew: WolfxServerEEW | null): PushText {
  const jindo = topStation ? formatScale(topStation.jindoStr, lang) : '-';
  const region = topStation
    ? `${translatePrefecture(topStation.region, lang)} ${translateRegionName(topStation.name, lang)}`
    : '';
  const eewPart = eew && !eew.isCancel
    ? ` · EEW M${eew.Magunitude ?? '-'} ${formatScale(eew.MaxIntensity, lang)}`
    : '';
  if (lang === 'ko') return { title: '지진 감지', body: `최대 진도 ${jindo}${region ? ` · ${region}` : ''}${eewPart}` };
  if (lang === 'en') return { title: 'Earthquake detected', body: `Max intensity ${jindo}${region ? ` · ${region}` : ''}${eewPart}` };
  return { title: '地震検知', body: `最大震度 ${jindo}${region ? ` · ${region}` : ''}${eewPart}` };
}

export class PushNotifier {
  private subscriptions: PushSubscriptionRecord[] = [];

  constructor() {
    this.loadSubscriptions();
  }

  public getVapidPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  private configureVapid(): boolean {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
    webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    return true;
  }

  private loadSubscriptions() {
    try {
      if (fs.existsSync(SUBSCRIPTIONS_PATH)) {
        const json = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_PATH, 'utf-8'));
        if (Array.isArray(json?.items)) {
          this.subscriptions = json.items.filter(
            (s: PushSubscriptionRecord) => s && typeof s.endpoint === 'string' && s.keys?.p256dh && s.keys?.auth
          );
        }
      }
      console.log(`[Push] 구독 ${this.subscriptions.length}개 로드 완료`);
    } catch (err) { console.error('[Push] 구독 로드 실패:', err); }
  }

  private persistSubscriptions() {
    try {
      fs.mkdirSync(path.dirname(SUBSCRIPTIONS_PATH), { recursive: true });
      fs.writeFileSync(SUBSCRIPTIONS_PATH, JSON.stringify({ items: this.subscriptions }));
    } catch (err) { console.error('[Push] 구독 저장 실패:', err); }
  }

  public subscribe(record: PushSubscriptionRecord): boolean {
    const existing = this.subscriptions.find((s) => s.endpoint === record.endpoint);
    if (existing) {
      existing.keys = record.keys;
      existing.lang = record.lang;
    } else {
      this.subscriptions.push(record);
    }
    this.persistSubscriptions();
    return true;
  }

  public unsubscribe(endpoint: string): void {
    this.subscriptions = this.subscriptions.filter((s) => s.endpoint !== endpoint);
    this.persistSubscriptions();
  }

  public async notifyNewEvent(topStation: TopStationItem | null, eew: WolfxServerEEW | null) {
    if (this.subscriptions.length === 0) return;
    if (!this.configureVapid()) {
      console.error('[Push] VAPID 키 미설정 — 발송 생략');
      return;
    }
    const results = await Promise.allSettled(this.subscriptions.map(async (sub) => {
      const text = buildText(sub.lang, topStation, eew);
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({ ...text, tag: 'eqm-detect', url: '/' }),
          { TTL: 120 }
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          this.unsubscribe(sub.endpoint);
          console.log(`[Push] 만료 구독 제거 (${sub.endpoint.slice(0, 48)}...)`);
        } else {
          throw err;
        }
      }
    }));
    const failed = results.filter((r) => r.status === 'rejected').length;
    console.log(`[Push] 감지 알림 발송 완료 (성공 ${results.length - failed}/${results.length})`);
  }
}
