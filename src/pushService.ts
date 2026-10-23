// 감지 알림 Web Push 구독 서비스 (audioService 싱글턴 패턴).
// 켬: 권한 요청 → SW 등록 대기 → pushManager.subscribe → 서버에 구독 등록.
// iOS는 설치된 PWA(16.4+)에서만 구독 가능 — 실패 시 조용히 false 복귀 (권한거부 되돌림 패턴).
const STORAGE_KEY = 'eqm-push-enabled';
const currentLang = (): 'ko' | 'en' | 'ja' => {
  try {
    const v = localStorage.getItem('app_language');
    if (v === 'en' || v === 'ja') return v;
  } catch {}
  return 'ko';
};

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

class PushService {
  public isEnabled: boolean = (() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true' && typeof Notification !== 'undefined' && Notification.permission === 'granted';
    } catch {
      return false;
    }
  })();

  private async getRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    return reg;
  }

  public async setEnabled(next: boolean): Promise<boolean> {
    const applied = next ? await this.subscribe() : await this.unsubscribe();
    try {
      localStorage.setItem(STORAGE_KEY, String(applied));
    } catch {}
    this.isEnabled = applied;
    return applied;
  }

  private async subscribe(): Promise<boolean> {
    if (typeof Notification === 'undefined') return false;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;
    try {
      const reg = await this.getRegistration();
      if (!reg) return false;
      const keyRes = await fetch('/api/push/key');
      if (!keyRes.ok) return false;
      const { publicKey } = await keyRes.json();
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ?? (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), lang: currentLang() }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async unsubscribe(): Promise<boolean> {
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null;
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
    } catch {}
    return false;
  }
}

export const pushService = new PushService();
