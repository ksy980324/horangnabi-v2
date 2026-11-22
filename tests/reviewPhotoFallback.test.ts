import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compressReviewPhoto } from '../src/services/reviewPhotos';

test('mobile blob failure falls back to local file reading, handles missing MIME and distinguishes HEIC and unreadable files', async () => {
  const properties = ['Image', 'FileReader', 'document'] as const;
  const saved = properties.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const revoked: string[] = [], sources: string[] = [];
  let readFails = false, decodeFails = false, reads = 0;
  class MockImage {
    naturalWidth = 100; naturalHeight = 100; onload?: () => void; onerror?: () => void;
    set src(value: string) { sources.push(value); queueMicrotask(() => value.startsWith('blob:') || decodeFails ? this.onerror?.() : this.onload?.()); }
  }
  class MockReader {
    result = 'data:image/jpeg;base64,/9j/AAAA'; onload?: () => void; onerror?: () => void; onabort?: () => void;
    readAsDataURL() { reads++; queueMicrotask(() => readFails ? this.onerror?.() : this.onload?.()); }
    abort() { this.onabort?.(); }
  }
  try {
    Object.defineProperty(globalThis, 'Image', { configurable: true, value: MockImage });
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: MockReader });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillStyle: '', fillRect() {}, drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,/9j/AAAA' }) } });
    URL.createObjectURL = () => 'blob:mobile-photo'; URL.revokeObjectURL = url => { revoked.push(url); };
    assert.equal(await compressReviewPhoto(new File(['jpeg'], 'camera.jpg')), 'data:image/jpeg;base64,/9j/AAAA');
    assert.equal(reads, 1); assert.ok(sources.some(source => source.startsWith('data:image/jpeg')));
    decodeFails = true;
    await assert.rejects(compressReviewPhoto(new File(['heic'], 'camera.heic', { type: 'image/heic' })), /HEIC\/HEIF/);
    readFails = true;
    await assert.rejects(compressReviewPhoto(new File(['jpeg'], 'camera.jpg', { type: 'image/jpeg' })), /기기에 저장/);
    assert.equal(revoked.length, 3);
  } finally {
    properties.forEach((key, index) => { const original = saved[index]; if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key); });
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  }
});
