import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function setup(options: { waiting?: boolean; installed?: boolean; fail?: boolean; firstInstall?: boolean } = {}) {
  const listeners = new Map<string, (event?: unknown) => void>();
  let reloads = 0;
  const messages: unknown[] = [], registrations: unknown[] = [];
  const timeouts = new Map<number, () => void>();
  const intervals: (() => void)[] = [];
  let nextTimer = 1, now = 0, checks = 0;
  let postFails = false;
  const worker = { postMessage: (message: unknown) => { if (postFails) throw new Error('worker unavailable'); messages.push(message); } };
  const registration = {
    waiting: options.waiting ? worker : null,
    addEventListener: () => {},
    update: async () => { checks++; },
  };
  const document = { readyState: 'complete', visibilityState: 'visible', baseURI: 'https://example.test/horangnabi-v2/', addEventListener: (name: string, callback: () => void) => listeners.set('document:' + name, callback) };
  const window = {
    isSecureContext: true,
    matchMedia: () => ({ matches: !!options.installed, addEventListener: () => {} }),
    addEventListener: (name: string, callback: (event?: unknown) => void) => listeners.set(name, callback),
    location: { reload: () => { reloads++; } },
    setTimeout: (callback: () => void) => { const id = nextTimer++; timeouts.set(id, callback); return id; },
    clearTimeout: (id: number) => { timeouts.delete(id); },
    setInterval: (callback: () => void) => { intervals.push(callback); return intervals.length; },
  };
  const navigator = { onLine: true, serviceWorker: {
    controller: options.firstInstall ? null : {},
    register: async (url: URL) => { registrations.push(url.href); if (options.fail) throw new Error('unavailable'); return registration; },
    addEventListener: window.addEventListener,
  } };
  const source = readFileSync(new URL('../src/services/pwa.ts', import.meta.url), 'utf8')
    .replaceAll('import.meta.env.PROD', 'true').replaceAll('import.meta.env.BASE_URL', JSON.stringify('/horangnabi-v2/'));
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {} as {
    initializePwa: () => void;
    usePwa: () => { available: boolean; installed: boolean; canPrompt: boolean; updateReady: boolean; updateBlocked: boolean; online: boolean; updating: boolean; updateError: string; error: string };
    promptInstall: () => Promise<string>;
    applyPwaUpdate: () => void;
    blockPwaUpdates: () => () => void;
    isPwaUpdateRequired: (state: { available: boolean; updateReady: boolean; updateBlocked: boolean; online: boolean }) => boolean;
  };
  runInNewContext(compiled, {
    window, document, navigator, exports, URL, Date: class extends Date { static now() { return now; } },
    require: () => ({ useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() }),
  });
  return {
    api: exports, emit: (name: string, data?: unknown) => listeners.get(name)?.(data), messages, registrations,
    reloads: () => reloads, checks: () => checks, document, navigator, registration, worker,
    advance: (milliseconds: number) => { now += milliseconds; },
    interval: () => intervals.forEach(callback => callback()),
    expire: () => { const callbacks = [...timeouts.values()]; timeouts.clear(); callbacks.forEach(callback => callback()); },
    postFails: (value: boolean) => { postFails = value; },
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('PWA shares the existing worker URL and waits for explicit update before reload', async () => {
  const { api, emit, registrations, messages, reloads } = setup({ waiting: true });
  api.initializePwa(); api.initializePwa(); await settle();
  assert.deepEqual(registrations, ['https://example.test/horangnabi-v2/offline-worker.js']);
  assert.equal(api.usePwa().updateReady, true);
  emit('controllerchange'); assert.equal(reloads(), 0);
  api.applyPwaUpdate(); assert.equal(JSON.stringify(messages), '[{"type":"SKIP_WAITING"}]');
  emit('controllerchange'); assert.equal(reloads(), 1);
});
test('installation prompt is consumed once and installed apps hide installation entry', async () => {
  const { api, emit } = setup(); api.initializePwa(); await settle();
  assert.equal(await api.promptInstall(), 'unavailable');
  let prompted = 0, prevented = false;
  emit('beforeinstallprompt', {
    preventDefault: () => { prevented = true; }, prompt: async () => { prompted++; }, userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  assert.equal(prevented, true); assert.equal(api.usePwa().canPrompt, true);
  assert.equal(await api.promptInstall(), 'accepted'); assert.equal(await api.promptInstall(), 'unavailable'); assert.equal(prompted, 1);
  emit('appinstalled'); assert.equal(api.usePwa().installed, true); assert.equal(api.usePwa().canPrompt, false);
  const standalone = setup({ installed: true }); standalone.api.initializePwa(); assert.equal(standalone.api.usePwa().installed, true);
});
test('worker registration failure leaves the web usable and exposes installation guidance', async () => {
  const { api } = setup({ fail: true }); api.initializePwa(); await settle();
  assert.equal(api.usePwa().available, true); assert.match(api.usePwa().error, /인터넷/);
  assert.equal(await api.promptInstall(), 'unavailable');
});

test('mandatory update waits for all editors and saves, then blocks online use without an opt-out', async () => {
  const { api, emit } = setup({ waiting: true }); api.initializePwa(); await settle();
  assert.equal(api.isPwaUpdateRequired(api.usePwa()), true);
  const finishEditor = api.blockPwaUpdates(), finishSave = api.blockPwaUpdates();
  assert.equal(api.isPwaUpdateRequired(api.usePwa()), false);
  api.applyPwaUpdate(); assert.equal(api.usePwa().updating, false);
  finishEditor(); finishEditor(); // StrictMode/unmount cleanup must not release another operation.
  assert.equal(api.isPwaUpdateRequired(api.usePwa()), false);
  finishSave(); assert.equal(api.isPwaUpdateRequired(api.usePwa()), true);
  emit('offline'); assert.equal(api.isPwaUpdateRequired(api.usePwa()), false);
  emit('online'); assert.equal(api.isPwaUpdateRequired(api.usePwa()), true);
});

test('an activation in another tab requires an update after this tab finishes editing', async () => {
  const { api, emit, reloads } = setup(); api.initializePwa(); await settle();
  const finish = api.blockPwaUpdates();
  emit('controllerchange'); assert.equal(reloads(), 0); assert.equal(api.usePwa().updateReady, true);
  assert.equal(api.isPwaUpdateRequired(api.usePwa()), false);
  finish(); assert.equal(api.isPwaUpdateRequired(api.usePwa()), true);
  api.applyPwaUpdate(); assert.equal(reloads(), 1);
  const first = setup({ firstInstall: true }); first.api.initializePwa(); await settle();
  first.emit('controllerchange'); assert.equal(first.api.usePwa().updateReady, false);
});

test('failed or stalled application keeps the mandatory update available for retry', async () => {
  const harness = setup({ waiting: true }); const { api } = harness; api.initializePwa(); await settle();
  harness.postFails(true); api.applyPwaUpdate();
  assert.equal(api.usePwa().updating, false); assert.match(api.usePwa().updateError, /다시 시도/);
  harness.postFails(false); api.applyPwaUpdate(); api.applyPwaUpdate();
  assert.equal(harness.messages.length, 1); assert.equal(api.usePwa().updating, true);
  harness.expire(); assert.equal(api.usePwa().updating, false); assert.equal(api.isPwaUpdateRequired(api.usePwa()), true);
  api.applyPwaUpdate(); assert.equal(harness.messages.length, 2);
  harness.emit('controllerchange'); assert.equal(harness.reloads(), 1);
});

test('foreground, resume and reconnect check for updates without polling offline or hidden tabs', async () => {
  const harness = setup(); harness.api.initializePwa(); await settle();
  harness.advance(60_000); harness.interval(); await settle(); assert.equal(harness.checks(), 1);
  harness.emit('focus'); await settle(); assert.equal(harness.checks(), 1);
  harness.advance(60_000); harness.document.visibilityState = 'hidden'; harness.interval(); await settle(); assert.equal(harness.checks(), 1);
  harness.document.visibilityState = 'visible'; harness.emit('document:visibilitychange'); await settle(); assert.equal(harness.checks(), 2);
  harness.advance(60_000); harness.navigator.onLine = false; harness.interval(); await settle(); assert.equal(harness.checks(), 2);
  harness.navigator.onLine = true; harness.registration.waiting = harness.worker;
  harness.emit('online'); await settle(); assert.equal(harness.checks(), 3); assert.equal(harness.api.usePwa().updateReady, true);
});
