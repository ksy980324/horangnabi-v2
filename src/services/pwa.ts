import { useSyncExternalStore } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type PwaState = { available: boolean; installed: boolean; canPrompt: boolean; updateReady: boolean; error: string };
let state: PwaState = { available: false, installed: false, canPrompt: false, updateReady: false, error: '' };
let initialized = false;
let installEvent: InstallEvent | undefined;
let registration: ServiceWorkerRegistration | undefined;
let reloadRequested = false;
const subscribers = new Set<() => void>();
function publish(next: Partial<PwaState>) { state = { ...state, ...next }; subscribers.forEach(listener => listener()); }
export function usePwa() {
  return useSyncExternalStore(listener => { subscribers.add(listener); return () => { subscribers.delete(listener); }; }, () => state);
}
export function initializePwa() {
  if (initialized || !import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  initialized = true;
  const standalone = window.matchMedia('(display-mode: standalone)');
  const installed = () => standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  publish({ available: true, installed: installed() });
  standalone.addEventListener('change', () => publish({ installed: installed() }));
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installEvent = event as InstallEvent; publish({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => { installEvent = undefined; publish({ installed: true, canPrompt: false }); });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadRequested) window.location.reload();
  });
  const register = async () => {
    try {
      registration = await navigator.serviceWorker.register(new URL('offline-worker.js', new URL(import.meta.env.BASE_URL, document.baseURI)), { updateViaCache: 'none' });
      const checkWaiting = () => publish({ updateReady: !!registration?.waiting });
      checkWaiting();
      registration.addEventListener('updatefound', () => { registration?.installing?.addEventListener('statechange', checkWaiting); });
      let checkedAt = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - checkedAt > 60 * 60 * 1000) {
          checkedAt = Date.now(); void registration?.update().catch(() => {});
        }
      });
    } catch { publish({ error: '설치 준비를 마치지 못했어요. 인터넷에 연결한 뒤 다시 열어 주세요.' }); }
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = installEvent;
  if (!event) return 'unavailable';
  installEvent = undefined; publish({ canPrompt: false });
  await event.prompt(); return (await event.userChoice).outcome;
}
export function applyPwaUpdate() {
  const waiting = registration?.waiting;
  if (!waiting) { publish({ updateReady: false }); return; }
  reloadRequested = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}
