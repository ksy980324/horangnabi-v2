import test from 'node:test';
import assert from 'node:assert/strict';
import { uid, parseDatabase, sampleDatabase } from '../src/data.ts';

test('LAN HTTP without randomUUID can create distinct trip and stop IDs and round-trip backups', () => {
  const descriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
  try {
    const ids = Array.from({ length: 1000 }, () => uid());
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const db = sampleDatabase();
    db.trips.push({ ...db.trips[0], id: ids[0], stops: [{ ...db.trips[0].stops[0], id: ids[1] }] });
    assert.deepEqual(parseDatabase(JSON.parse(JSON.stringify(db))), db);
  } finally {
    if (descriptor) Object.defineProperty(crypto, 'randomUUID', descriptor);
    else Reflect.deleteProperty(crypto, 'randomUUID');
  }
});

test('secure contexts keep native UUID generation', context => {
  const native = context.mock.method(crypto, 'randomUUID', () => '12345678-1234-4234-8234-123456789abc');
  assert.equal(uid(), '12345678-1234-4234-8234-123456789abc');
  assert.equal(native.mock.callCount(), 1);
});
