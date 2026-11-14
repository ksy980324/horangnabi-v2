import { useEffect, useSyncExternalStore } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type PwaState = { available: boolean; installed: boolean; canPrompt: boolean; updateReady: boolean; updateBlocked: boolean; online: boolean; updating: boolean; updateError: string; error: string };
let state: PwaState = { available: false, installed: false, canPrompt: false, updateReady: false, updateBlocked: false, online: true, updating: false, updateError: '', error: '' };
let initialized = false;
let installEvent: InstallEvent | undefined;
let registration: ServiceWorkerRegistration | undefined;
let reloadRequested = false;
let updateTimer: number | undefined;
const updateBlockers = new Set<symbol>();
const subscribers = new Set<() => void>();
function publish(next: Partial<PwaState>) { state = { ...state, ...next }; subscribers.forEach(listener => listener()); }
export function usePwa() {
  return useSyncExternalStore(listener => { subscribers.add(listener); return () => { subscribers.delete(listener); }; }, () => state);
}
export function blockPwaUpdates() {
  const token = Symbol();
  updateBlockers.add(token); publish({ updateBlocked: true });
  return () => { updateBlockers.delete(token); publish({ updateBlocked: updateBlockers.size > 0 }); };
}
export function usePwaUpdateBlocker(blocked = true) {
  useEffect(() => { if (blocked) return blockPwaUpdates(); }, [blocked]);
}
export function isPwaUpdateRequired(snapshot: Pick<PwaState, 'available' | 'updateReady' | 'updateBlocked' | 'online'>) {
  return snapshot.available && snapshot.updateReady && !snapshot.updateBlocked && snapshot.online;
}
export function initializePwa() {
  if (initialized || !import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  initialized = true;
  const standalone = window.matchMedia('(display-mode: standalone)');
  const installed = () => standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  publish({ available: true, installed: installed(), online: navigator.onLine !== false });
  standalone.addEventListener('change', () => publish({ installed: installed() }));
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installEvent = event as InstallEvent; publish({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => { installEvent = undefined; publish({ installed: true, canPrompt: false }); });
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadRequested) {
      window.clearTimeout(updateTimer); reloadRequested = false; window.location.reload();
    } else if (hadController) {
      // Another tab applied the worker: this tab still needs a safe reload.
      publish({ updateReady: true });
    }
    hadController = true;
  });
  const register = async () => {
    try {
      registration = await navigator.serviceWorker.register(new URL('offline-worker.js', new URL(import.meta.env.BASE_URL, document.baseURI)), { updateViaCache: 'none' });
      const checkWaiting = () => { if (registration?.waiting) publish({ updateReady: true }); };
      checkWaiting();
      registration.addEventListener('updatefound', () => { registration?.installing?.addEventListener('statechange', checkWaiting); });
      let checkedAt = Date.now(), checking = false;
      const checkUpdate = async (force = false) => {
        if (document.visibilityState !== 'visible' || navigator.onLine === false || checking || (!force && Date.now() - checkedAt < 30_000)) return;
        checking = true; checkedAt = Date.now();
        try { await registration?.update(); checkWaiting(); }
        catch { /* Offline or server failure: keep the current app usable. */ }
        finally { checking = false; }
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void checkUpdate();
      });
      window.addEventListener('focus', () => void checkUpdate());
      window.addEventListener('online', () => { publish({ online: true }); void checkUpdate(true); });
      window.addEventListener('offline', () => publish({ online: false }));
      window.setInterval(() => void checkUpdate(), 60_000);
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
  if (state.updating || state.updateBlocked) return;
  if (!state.online) { publish({ updateError: '인터넷에 연결한 뒤 다시 시도해 주세요.' }); return; }
  const waiting = registration?.waiting;
  if (!waiting) {
    if (state.updateReady && navigator.serviceWorker.controller) window.location.reload();
    else if (state.updateReady) publish({ updateError: '새 버전을 확인하지 못했어요. 다시 시도해 주세요.' });
    return;
  }
  reloadRequested = true;
  publish({ updating: true, updateError: '' });
  try {
    waiting.postMessage({ type: 'SKIP_WAITING' });
    updateTimer = window.setTimeout(() => {
      reloadRequested = false;
      publish({ updating: false, updateError: '업데이트를 마치지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.' });
    }, 15_000);
  } catch {
    reloadRequested = false;
    publish({ updating: false, updateError: '업데이트를 시작하지 못했어요. 다시 시도해 주세요.' });
  }
}
