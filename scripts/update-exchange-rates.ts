import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { dailyRateFile, isCurrentRateWindow, parseDailyWonRates, parseWonRates, rateWindowStart, type DailyWonRates } from '../src/services/dailyExchangeRates.ts';

const PUBLIC_FILE = 'https://ksy980324.github.io/horangnabi-v2/exchange-rates.json';
const PROVIDER_URL = 'https://api.coinbase.com/v2/exchange-rates';

/** Prepare a public daily snapshot. Reuse today's published file on ordinary code deployments. */
export async function prepareDailyRates(fetcher: typeof fetch = fetch, clock: () => number = Date.now) {
  let previous: DailyWonRates | undefined;
  const read = async (url: string) => {
    const response = await fetcher(url, { signal: AbortSignal.timeout(10000), cache: 'no-store', credentials: 'omit', redirect: 'error' });
    if (!response.ok) throw new Error('Rate endpoint unavailable: ' + response.status);
    return response.json() as Promise<unknown>;
  };
  try { previous = parseDailyWonRates(await read(PUBLIC_FILE + '?day=' + rateWindowStart(clock())), clock()); } catch { /* First deployment or temporary file outage. */ }
  if (previous && isCurrentRateWindow(previous, clock())) return { snapshot: previous, status: 'reused' as const };
  try {
    const raw = await read(PROVIDER_URL);
    const fetchedAt = clock();
    const snapshot = { ...parseWonRates(raw, fetchedAt), periodStart: rateWindowStart(fetchedAt) };
    const validated = parseDailyWonRates(dailyRateFile(snapshot), clock());
    return { snapshot: validated, status: 'updated' as const };
  } catch {
    // An unavailable public rate provider must not prevent publishing unrelated app fixes.
    return { snapshot: previous, status: previous ? 'previous' as const : 'unavailable' as const };
  }
}

async function main() {
  const result = await prepareDailyRates();
  await mkdir('public', { recursive: true });
  await writeFile('public/exchange-rates.json', JSON.stringify(result.snapshot ? dailyRateFile(result.snapshot) : { version: 1, unavailable: true }) + '\n', 'utf8');
  console.log('Daily public exchange rates: ' + result.status + (result.snapshot ? ', fetched at ' + new Date(result.snapshot.fetchedAt).toISOString() : ''));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Rate preparation failed'); process.exitCode = 1; });
}
