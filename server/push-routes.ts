import express, { Express } from 'express';
import { PushNotifier } from './push-notifier';

// 감지 Web Push 구독 관리 라우트. 구독 저장소는 PushNotifier가 소유.
export function registerPushRoutes(app: Express, push: PushNotifier) {
  app.get('/api/push/key', (_req, res) => {
    const publicKey = push.getVapidPublicKey();
    if (!publicKey) return res.status(503).json({ error: 'Push not configured' });
    res.json({ publicKey });
  });

  app.post('/api/push/subscribe', express.json(), (req, res) => {
    const { endpoint, keys, lang } = req.body ?? {};
    if (typeof endpoint !== 'string' || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    const safeLang = lang === 'en' || lang === 'ja' ? lang : 'ko';
    push.subscribe({ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, lang: safeLang });
    res.json({ ok: true });
  });

  app.post('/api/push/unsubscribe', express.json(), (req, res) => {
    const { endpoint } = req.body ?? {};
    if (typeof endpoint !== 'string') return res.status(400).json({ error: 'Invalid endpoint' });
    push.unsubscribe(endpoint);
    res.json({ ok: true });
  });
}
