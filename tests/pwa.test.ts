import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function setup(options: { waiting?: boolean; installed?: boolean; fail?: boolean } = {}) {
  const listeners = new Map<string, (event?: unknown) => void>();
  let reloads = 0;
  const messages: unknown[] = [], registrations: unknown[] = [];
  const registration = {
    waiting: options.waiting ? { postMessage: (message: unknown) => messages.push(message) } : null,
    addEventListener: () => {},
  };
  const document = { readyState: 'complete', baseURI: 'https://example.test/horangnabi-v2/', addEventListener: () => {} };
  const window = {
    isSecureContext: true,
    matchMedia: () => ({ matches: !!options.installed, addEventListener: () => {} }),
    addEventListener: (name: string, callback: (event?: unknown) => void) => listeners.set(name, callback),
    location: { reload: () => { reloads++; } },
  };
  const navigator = { serviceWorker: {
    register: async (url: URL) => { registrations.push(url.href); if (options.fail) throw new Error('unavailable'); return registration; },
    addEventListener: window.addEventListener,
  } };
  const source = readFileSync(new URL('../src/services/pwa.ts', import.meta.url), 'utf8')
    .replaceAll('import.meta.env.PROD', 'true').replaceAll('import.meta.env.BASE_URL', JSON.stringify('/horangnabi-v2/'));
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {} as {
    initializePwa: () => void;
    usePwa: () => { available: boolean; installed: boolean; canPrompt: boolean; updateReady: boolean; error: string };
    promptInstall: () => Promise<string>;
    applyPwaUpdate: () => void;
  };
  runInNewContext(compiled, {
    window, document, navigator, exports, URL,
    require: () => ({ useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() }),
  });
  return { api: exports, emit: (name: string, data?: unknown) => listeners.get(name)?.(data), messages, registrations, reloads: () => reloads };
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
