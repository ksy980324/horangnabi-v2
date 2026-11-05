import test from 'node:test';
import assert from 'node:assert/strict';
import { GOOGLE_MAP_ERROR, loadGoogleMaps } from '../src/services/googleMaps.ts';

test('Google SDK loads once with Korean settings and retains authentication failures', async () => {
  await assert.rejects(loadGoogleMaps(''), /키/);
  const events = new EventTarget();
  const host = {
    setTimeout,
    dispatchEvent: events.dispatchEvent.bind(events),
    google: undefined as unknown,
    horangnabiMapsReady: undefined as (() => void) | undefined,
    gm_authFailure: undefined as (() => void) | undefined,
  };
  const scripts: { src?: string }[] = [];
  const maps = { Map: class {}, marker: { AdvancedMarkerElement: class {} } };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: host });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({}),
    head: { append: (script: { src: string }) => {
      scripts.push(script);
      queueMicrotask(() => { host.google = { maps }; host.horangnabiMapsReady?.(); });
    } },
  } });
  try {
    const first = loadGoogleMaps('test-key'), second = loadGoogleMaps('test-key');
    assert.equal(first, second);
    assert.equal(await first, maps);
    assert.equal(loadGoogleMaps('test-key'), first);
    assert.equal(scripts.length, 1);
    const url = new URL(scripts[0].src!);
    assert.equal(url.origin, 'https://maps.googleapis.com');
    assert.equal(url.searchParams.get('language'), 'ko');
    assert.equal(url.searchParams.get('region'), 'KR');
    assert.equal(url.searchParams.get('libraries'), 'marker');
    let failures = 0;
    events.addEventListener(GOOGLE_MAP_ERROR, () => failures++);
    host.gm_authFailure?.();
    assert.equal(failures, 1);
    await assert.rejects(loadGoogleMaps('test-key'), /허용 주소/);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');
  }
});
