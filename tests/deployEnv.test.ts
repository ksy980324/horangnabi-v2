import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/check-deploy-env.mjs', import.meta.url));
function check(key: string, mapId: string) {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, VITE_GOOGLE_MAPS_API_KEY: key, VITE_GOOGLE_MAP_ID: mapId } });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}
test('deployment refuses missing keys, placeholders and the demo map ID with actionable messages', () => {
  assert.match(check('', '').output, /GOOGLE_MAPS_API_KEY/);
  assert.equal(check('', '').status, 1);
  assert.equal(check('YOUR_BROWSER_API_KEY', 'own-map-id').status, 1);
  assert.equal(check('not-a-real-key', 'DEMO_MAP_ID').status, 1);
  assert.match(check('not-a-real-key', '').output, /GOOGLE_MAP_ID/);
});
test('deployment settings check does not reveal keys on success or failure', () => {
  const sentinel = 'test-only-key-do-not-print-123';
  const success = check(sentinel, 'test-map-id');
  assert.equal(success.status, 0);
  assert.equal(success.output.includes(sentinel), false);
  const failure = check(sentinel, 'DEMO_MAP_ID');
  assert.equal(failure.status, 1);
  assert.equal(failure.output.includes(sentinel), false);
});
