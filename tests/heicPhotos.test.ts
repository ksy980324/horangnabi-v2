import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { decodeHeicPhoto } from '../src/services/heicPhotos';
import { compressReviewPhoto } from '../src/services/reviewPhotos';

test('vendored HEIC codec decodes real HEVC rainbow pixels and rejects a damaged file', async () => {
  const fixture = Buffer.from(readFileSync(new URL('./fixtures/rainbow.heic.base64', import.meta.url), 'utf8'), 'base64');
  let receive: (data: { error: string; imageData?: { width: number; height: number; data: Uint8ClampedArray } }) => void;
  const scope = vm.createContext({
    console, setTimeout, clearTimeout, TextDecoder, TextEncoder,
    ImageData: class {
      data: Uint8ClampedArray;
      constructor(public width: number, public height: number) { this.data = new Uint8ClampedArray(width * height * 4); }
    },
    postMessage: (data: Parameters<typeof receive>[0]) => receive(data),
  });
  scope.self = scope;
  vm.runInContext(readFileSync(new URL('../src/vendor/heic.worker.js', import.meta.url), 'utf8'), scope);
  const decode = (buffer: Uint8Array) => new Promise<Parameters<typeof receive>[0]>(resolve => {
    receive = resolve;
    scope.inputBytes = Array.from(buffer);
    vm.runInContext("onmessage({ data: { id: 'test', buffer: Uint8Array.from(inputBytes).buffer } })", scope);
  });
  const decoded = await decode(fixture);
  assert.equal(decoded.error, '');
  assert.equal(decoded.imageData?.width, 451);
  assert.equal(decoded.imageData?.height, 461);
  const pixels = decoded.imageData!.data;
  assert.equal(pixels.length, 451 * 461 * 4);
  assert.equal(pixels[3], 255);
  assert.ok(new Set(pixels.filter((_, i) => i % 4 !== 3)).size > 50, 'decoded pixels contain the rainbow');
  assert.ok((await decode(new Uint8Array([1, 2, 3]))).error);
});

test('HEIC fallback compresses locally, keeps native decoding, enforces limits and releases resources', async () => {
  const keys = ['Image', 'Worker', 'document'] as const;
  const saved = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  let native = false, mode = 'success', workers = 0, terminated = 0, revoked = 0;
  const canvases: { width: number; height: number }[] = [];
  class MockImage {
    naturalWidth = 2000; naturalHeight = 1000;
    onload?: () => void; onerror?: () => void;
    set src(_value: string) { queueMicrotask(() => native ? this.onload?.() : this.onerror?.()); }
  }
  class MockWorker {
    onmessage?: (event: unknown) => void; onerror?: () => void; onmessageerror?: () => void;
    constructor() { workers++; }
    terminate() { terminated++; }
    postMessage(message: { buffer: ArrayBuffer }, transfer: ArrayBuffer[]) {
      assert.equal(message.buffer, transfer[0]);
      queueMicrotask(() => mode === 'error' ? this.onerror?.() : this.onmessage?.({ data: mode === 'damaged' ? { error: 'bad file' } : { imageData: { width: 2000, height: 1000 } } }));
    }
  }
  try {
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: MockImage });
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: MockWorker });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement() {
      const canvas = { width: 0, height: 0, getContext: () => ({ putImageData() {}, fillStyle: '', fillRect() {}, drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,/9j/AAAA' };
      canvases.push(canvas); return canvas;
    } } });
    URL.createObjectURL = () => 'blob:photo'; URL.revokeObjectURL = () => { revoked++; };
    for (const [name, type] of [['camera.HEIC', 'image/heic'], ['camera.heif', ''], ['camera.heic', 'application/octet-stream'], ['camera.heic', 'image/heic-sequence']]) {
      assert.equal(await compressReviewPhoto(new File(['heic'], name, { type })), 'data:image/jpeg;base64,/9j/AAAA');
    }
    assert.equal(workers, 4); assert.equal(terminated, 4); assert.equal(revoked, 4);
    assert.ok(canvases.every(canvas => canvas.width === 1 && canvas.height === 1));
    native = true;
    await compressReviewPhoto(new File(['heic'], 'camera.heic'));
    await compressReviewPhoto(new File(['jpg'], 'camera.jpg', { type: 'image/jpeg' }));
    assert.equal(workers, 4, 'native photos never start the HEIC decoder');
    native = false;
    mode = 'damaged';
    await assert.rejects(compressReviewPhoto(new File(['bad'], 'camera.heic')), /변환/);
    mode = 'error';
    await assert.rejects(decodeHeicPhoto(new File(['heic'], 'camera.heic')), /실행/);
    await assert.rejects(compressReviewPhoto(new File([], 'empty.heic')), /25MB/);
    await assert.rejects(compressReviewPhoto(new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'large.heic')), /25MB/);
    assert.equal(workers, 6); assert.equal(terminated, 6);
  } finally {
    keys.forEach((key, index) => { const value = saved[index]; if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key); });
    URL.createObjectURL = create; URL.revokeObjectURL = revoke;
  }
});

test('a stalled HEIC conversion terminates the worker and allows a retry', async context => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  let terminated = 0;
  class StalledWorker { postMessage() {} terminate() { terminated++; } }
  context.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: StalledWorker });
    const result = decodeHeicPhoto(new File(['heic'], 'camera.heic'));
    const check = assert.rejects(result, /시간이 초과/);
    context.mock.timers.tick(60000);
    await check;
    assert.equal(terminated, 1);
    const retry = assert.rejects(decodeHeicPhoto(new File(['heic'], 'camera.heic')), /시간이 초과/);
    context.mock.timers.tick(60000);
    await retry;
    assert.equal(terminated, 2);
  } finally {
    context.mock.timers.reset();
    if (saved) Object.defineProperty(globalThis, 'Worker', saved); else Reflect.deleteProperty(globalThis, 'Worker');
  }
});
