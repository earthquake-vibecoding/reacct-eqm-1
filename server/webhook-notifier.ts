import { INTENSITY_COLORS } from '../src/colorMap';
import { TopStationItem } from '../src/QuakeDetectService';
import { BufferedFrame } from './intensity-types';
import { jindoToStr } from './kmoni-pixel';
import { buildEventAnimationGif, buildEventAnimationMp4, buildSingleMapGif } from './frame-composer';

export class WebhookNotifier {
  private webhookCooldown = 0;
  private lastAlertMessageId: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private lastAlertEmbed: any = null;
  private lastSentMapGif: Buffer | null = null;

  public resetLastAlert() {
    this.lastAlertMessageId = null;
    this.lastAlertEmbed = null;
    this.lastSentMapGif = null;
  }

  public async triggerWebhook(
    source: string,
    isNewEvent: boolean,
    topStation: TopStationItem | null,
    lastKmoniGif: Buffer | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gridFeatures: any[]
  ) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) return;

    const now = Date.now();
    if (now < this.webhookCooldown) return;
    this.webhookCooldown = now + 60000;

    const maxJindo = topStation ? topStation.jindo : null;
    let jindoStr = '알 수 없음';
    let r = 148, g = 163, b = 184;

    if (maxJindo !== null) {
      jindoStr = jindoToStr(maxJindo);
      let minDiff = Infinity;
      let closest = INTENSITY_COLORS[0];
      for (const item of INTENSITY_COLORS) {
        const diff = Math.abs(item.Intensity - maxJindo);
        if (diff < minDiff) {
          minDiff = diff;
          closest = item;
        }
      }
      r = closest.R;
      g = closest.G;
      b = closest.B;
    }

    const colorInt = (r << 16) | (g << 8) | b;
    const sourceStr = source === 'kmoni' ? '강진모니터(K-moni)' : 'Yahoo! 방재속보';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const embed: any = {
      title: isNewEvent ? '🚨 지진(흔들림) 감지 보고 🚨' : '🔔 흔들림 진도 업데이트 🔔',
      description: isNewEvent ? '새로운 흔들림이 감지되었습니다.' : '흔들림 진도가 업데이트 되었습니다.',
      color: colorInt,
      fields: [
        ...(topStation ? [{
          name: '감지 격자 관측소',
          value: `${topStation.region} ${topStation.name} ${topStation.jindoStr}`,
          inline: false
        }] : []),
        { name: '예상 최대 진도', value: `**${jindoStr}**`, inline: true },
        { name: '데이터 소스', value: sourceStr, inline: true }
      ],
      timestamp: new Date().toISOString()
    };

    const mapGif = buildSingleMapGif(lastKmoniGif, gridFeatures);
    if (mapGif) {
      embed.image = { url: 'attachment://map.gif' };
    }

    const payload = { embeds: [embed] };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      let res: Response;
      if (mapGif) {
        const form = new FormData();
        form.append('payload_json', JSON.stringify(payload));
        form.append('files[0]', new Blob([new Uint8Array(mapGif)], { type: 'image/gif' }), 'map.gif');
        res = await fetch(`${webhookUrl}?wait=true`, { method: 'POST', body: form, signal: controller.signal });
      } else {
        res = await fetch(`${webhookUrl}?wait=true`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
      }
      clearTimeout(timeout);

      if (!res.ok) {
        console.error(`[Webhook] 응답 오류: ${res.status} ${res.statusText}`);
      } else {
        console.log(`[Webhook] 알림 발송 완료 (최대 진도: ${jindoStr})`);
        try {
          const sent = await res.json();
          if (sent?.id) {
            this.lastAlertMessageId = sent.id;
            this.lastAlertEmbed = embed;
            this.lastSentMapGif = mapGif;
          }
        } catch {}
      }
    } catch (err) {
      console.error('[Webhook] 발송 실패:', err);
    }
  }

  public async sendEventAnimationWebhook(
    frames: BufferedFrame[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gridFeatures: any[]
  ): Promise<{ buf: Buffer; mime: string; frameCount: number } | null> {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl || frames.length === 0) return null;

    const animationMp4 = await buildEventAnimationMp4(frames, gridFeatures);
    const isMp4 = animationMp4 !== null;
    const animationBuf = animationMp4 ?? buildEventAnimationGif(frames, gridFeatures);
    if (!animationBuf) {
      console.warn(`[Webhook] 애니메이션 생성 실패로 발송 생략 (버퍼 ${frames.length}프레임)`);
      return null;
    }
    const animationFilename = isMp4 ? 'event.mp4' : 'event.gif';
    const animationMime = isMp4 ? 'video/mp4' : 'image/gif';

    const firstTime = frames[0].timeStr;
    const lastTime = frames[frames.length - 1].timeStr;
    const durationSec = frames.length;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reportEmbed: any = {
      title: '🎞️ 흔들림 감지 구간 리포트',
      description: '감지가 유지된 구간의 실시간 지도 애니메이션입니다.',
      color: 0xef4444,
      fields: [
        { name: '감지 구간', value: `${firstTime} ~ ${lastTime} (JST)`, inline: false },
        { name: '구간 길이', value: `약 ${durationSec}초`, inline: true }
      ],
      timestamp: new Date().toISOString()
    };
    if (!isMp4) reportEmbed.image = { url: 'attachment://event.gif' };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let res: Response;

      if (this.lastAlertMessageId && this.lastAlertEmbed && this.lastSentMapGif) {
        const patchPayload = {
          embeds: [this.lastAlertEmbed, reportEmbed],
          attachments: [
            { id: 0, filename: 'map.gif' },
            { id: 1, filename: animationFilename }
          ]
        };
        const form = new FormData();
        form.append('payload_json', JSON.stringify(patchPayload));
        form.append('files[0]', new Blob([new Uint8Array(this.lastSentMapGif)], { type: 'image/gif' }), 'map.gif');
        form.append('files[1]', new Blob([new Uint8Array(animationBuf)], { type: animationMime }), animationFilename);
        res = await fetch(`${webhookUrl}/messages/${this.lastAlertMessageId}`, {
          method: 'PATCH',
          body: form,
          signal: controller.signal
        });
      } else {
        const form = new FormData();
        form.append('payload_json', JSON.stringify({ embeds: [reportEmbed] }));
        form.append('files[0]', new Blob([new Uint8Array(animationBuf)], { type: animationMime }), animationFilename);
        res = await fetch(webhookUrl, { method: 'POST', body: form, signal: controller.signal });
      }
      clearTimeout(timeout);
      this.resetLastAlert();

      if (!res.ok) {
        console.error(`[Webhook] 애니메이션 발송 오류: ${res.status} ${res.statusText}`);
      } else {
        console.log(`[Webhook] 감지 구간 리포트 발송 완료 (${frames.length}프레임, ${isMp4 ? 'mp4' : 'gif'} ${(animationBuf.length / 1024).toFixed(0)}KB)`);
      }
    } catch (err) {
      console.error('[Webhook] 애니메이션 발송 실패:', err);
    }
    return { buf: animationBuf, mime: animationMime, frameCount: frames.length };
  }
}
