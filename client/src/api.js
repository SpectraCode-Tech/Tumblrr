export const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
export const tok = { get: () => localStorage.getItem('t'), set: t => localStorage.setItem('t', t), clear: () => localStorage.removeItem('t') };
export async function api(path, { method = 'GET', body } = {}) {
  const form = body instanceof FormData;
  const r = await fetch(API + path, { method, body: form || !body ? body : JSON.stringify(body),
    headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), Authorization: 'Bearer ' + tok.get() } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}

export const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export async function enablePush() {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked in your browser settings');
  const { publicKey } = await api('/api/push/key');
  if (!publicKey) throw new Error('Notifications are not set up on the server yet');
  const reg = await navigator.serviceWorker.ready;
  const b64 = publicKey.replace(/-/g, '+').replace(/_/g, '/'), raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, c => c.charCodeAt(0)) });
  await api('/api/push/subscribe', { method: 'POST', body: sub.toJSON() });
}

// On-device translation using the browser's built-in Translator API (recent Chrome); throws where unsupported.
export async function translateText(text) {
  const target = (navigator.language || 'en').split('-')[0];
  if (!('Translator' in self) || !('LanguageDetector' in self)) throw new Error('unsupported');
  const [top] = await (await LanguageDetector.create()).detect(text), source = top?.detectedLanguage;
  if (!source || source === target) return 'Already in your language';
  return (await (await Translator.create({ sourceLanguage: source, targetLanguage: target })).translate(text));
}
