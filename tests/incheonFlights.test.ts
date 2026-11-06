import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flightDate, flightNumber } from '../src/services/flightLookup';
import { incheonDepartures } from '../workers/maps-link/incheonFlights';
import worker from '../workers/maps-link/index';

const row = { flightId: 'RS745', firstdate: '20261025', lastdate: '20270327', ynSat: 'Y', st: '0905', airport: '오사카 간사이', airportCode: 'KIX' };
const data = (items: Record<string, unknown>[]) => ({ response: { header: { resultCode: '00' }, body: { items } } });
const expected = { departure: '2026-11-21T09:05', departureAirport: '인천국제공항 (ICN)', arrivalAirport: '오사카 간사이 (KIX)' };

test('Incheon lookup matches flight number, schedule dates and weekdays', () => {
  assert.equal(flightNumber('rs 745'), 'RS745');
  assert.equal(flightDate('2026-02-30'), undefined);
  assert.deepEqual(incheonDepartures(data([row, row, { ...row, flightId: 'RS746' }]), 'RS745', '2026-11-21'), [expected]);
  assert.deepEqual(incheonDepartures(data([row]), 'RS745', '2026-11-22'), []);
  assert.deepEqual(incheonDepartures(data([row]), 'RS745', '2027-04-03'), []);
  assert.deepEqual(incheonDepartures(data([{ ...row, st: '2501' }]), 'RS745', '2026-11-21'), []);
  assert.throws(() => incheonDepartures({ response: { header: { resultCode: '30' } } }, 'RS745', '2026-11-21'));
});

test('the worker calls only the documented departure endpoint and keeps the service key out of its response', async context => {
  const fetch = context.mock.method(globalThis, 'fetch', async (input: URL) => {
    assert.equal(input.origin, 'https://apis.data.go.kr');
    assert.equal(input.pathname, '/B551177/statusOfSPaxFlt4TripPlatform/getSPaxFlt4TripPlatformDepartures');
    assert.equal(input.searchParams.get('flightId'), 'RS745');
    assert.equal(input.searchParams.get('serviceKey'), 'mock+key/');
    return Response.json(data([row]));
  });
  const request = new Request('https://example.workers.dev/flight?number=RS745&date=2026-11-21', { headers: { Origin: 'https://ksy980324.github.io' } });
  assert.equal((await worker.fetch(request)).status, 503);
  const response = await worker.fetch(request, { INCHEON_FLIGHT_SERVICE_KEY: 'mock+key/' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { flights: [expected] });
  assert.equal(fetch.mock.callCount(), 1);
});

test('the worker reports a gateway authentication error without exposing the upstream message', async context => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({
    OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: '20', errMsg: 'SERVICE_KEY_IS_NULL' } },
  }, { status: 401 }));
  const request = new Request('https://example.workers.dev/flight?number=RS471&date=2026-11-21', { headers: { Origin: 'https://ksy980324.github.io' } });
  const response = await worker.fetch(request, { INCHEON_FLIGHT_SERVICE_KEY: 'mock' });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { reason: 'authorization', providerCode: '20', providerStatus: 401 });
});

test('the worker distinguishes a network failure from an upstream HTTP error', async context => {
  const request = new Request('https://example.workers.dev/flight?number=RS471&date=2026-11-16', { headers: { Origin: 'https://ksy980324.github.io' } });
  const env = { INCHEON_FLIGHT_SERVICE_KEY: 'mock' };
  const fetch = context.mock.method(globalThis, 'fetch', async () => { throw new TypeError('transport error'); });
  assert.deepEqual(await (await worker.fetch(request, env)).json(), { reason: 'network' });
  fetch.mock.mockImplementation(async () => new Response('Bad gateway', { status: 503 }));
  assert.deepEqual(await (await worker.fetch(request, env)).json(), { reason: 'upstream', providerStatus: 503 });
});
