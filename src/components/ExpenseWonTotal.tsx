import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Expense } from '../types';
import { formatAmount } from '../services/expenses';
import { exchangeRateClient, RATE_RETRY_MS, isCurrentRateWindow, nextRateUpdateAt, summarizeWonExpenses, type WonRates } from '../services/exchangeRates';

export function ExpenseWonTotal({ items }: { items: Expense[] }) {
  const needsRates = items.some(item => item.currency !== 'KRW');
  const [snapshot, setSnapshot] = useState<WonRates | undefined>(() => exchangeRateClient.peek());
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [request, setRequest] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!needsRates) return;
    let active = true, timer: number | undefined;
    async function refresh() {
      if (!active) return;
      window.clearTimeout(timer);
      const at = Date.now();
      setNow(at);
      if (document.visibilityState === 'hidden') return;
      const cached = exchangeRateClient.peek();
      if (cached) setSnapshot(cached);
      if (!navigator.onLine) { setError('오프라인이에요. 저장된 하루 환율로 계산해요.'); return; }
      setLoading(!cached || !isCurrentRateWindow(cached, at));
      try {
        const latest = await exchangeRateClient.load();
        if (active) { setSnapshot(latest); setError(''); setNow(Date.now()); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : '하루 환율을 불러오지 못했어요.'); }
      finally {
        if (active) {
          setLoading(false);
          const at = Date.now(), latest = exchangeRateClient.peek();
          const delay = latest && isCurrentRateWindow(latest, at) ? Math.max(1, nextRateUpdateAt(at) - at) : RATE_RETRY_MS;
          window.clearTimeout(timer);
          timer = window.setTimeout(() => { void refresh(); }, delay);
        }
      }
    }
    void refresh();
    const resume = () => { void refresh(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => { active = false; window.clearTimeout(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); };
  }, [needsRates, request]);
  return <WonExpenseSummary items={items} snapshot={snapshot} loading={loading} error={needsRates ? error : ''} now={now} onRefresh={() => setRequest(value => value + 1)}/>;
}

export function WonExpenseSummary({ items, snapshot, loading, error, now, onRefresh }: {
  items: Expense[]; snapshot?: WonRates; loading: boolean; error: string; now: number; onRefresh: () => void;
}) {
  const summary = summarizeWonExpenses(items, snapshot), foreign = items.some(item => item.currency !== 'KRW');
  const stale = foreign && !!snapshot && !isCurrentRateWindow(snapshot, now);
  return <section className="expense-won-total" aria-label="원화 환산 누적 지출">
    <div className="expense-won-heading"><h3>원화 환산 누적 지출</h3>{foreign && (!snapshot || stale || !!error) && <button type="button" className="text-button" disabled={loading} onClick={onRefresh}><RefreshCw size={14}/>{loading ? '조회 중' : '다시 확인'}</button>}</div>
    <strong className="expense-won-amount">{summary.totalWon === undefined ? summary.overflow ? '금액 범위 확인 필요' : snapshot ? '일부 환율 확인 필요' : '환율 확인 중' : formatAmount(summary.totalWon, 'KRW')}</strong>
    <p>여행 전체 · 공동·개인·단순 기록용 지출을 모두 포함해요.</p>
    {foreign && <p className="muted">한국 시간 매일 오전 8시에 갱신하는 하루 환율로 계산해요. 실제 환전·카드 청구액 및 수수료와 차이가 있을 수 있어요.</p>}
    {foreign && stale && !error && <p className="expense-rate-warning" role="status">오늘의 환율 갱신을 기다리고 있어요. 준비될 때까지 이전 환율을 표시해요.</p>}
    {foreign && snapshot && <p className={error || stale ? 'expense-rate-warning' : 'muted'}>{error || stale ? '이전 조회 환율 적용 · ' : '환율 갱신 · '}<time dateTime={new Date(snapshot.fetchedAt).toISOString()}>{new Date(snapshot.fetchedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })}</time> (한국 시간)</p>}
    {foreign && error && <p className="expense-rate-warning" role="status">{error}</p>}
    {foreign && !error && loading && <p className="muted" role="status">하루 환율을 확인하고 있어요.</p>}
    {summary.totalWon === undefined && !loading && <p className="expense-rate-warning" role="status">{summary.overflow ? '금액이 표시 범위를 초과해 합계를 표시할 수 없어요.' : '환율을 확인하지 못한 통화가 있어 전체 합계를 표시하지 않았어요. ' + summary.missingCurrencies.join(' · ')}</p>}
    {foreign && <details><summary>적용 환율과 통화별 환산액</summary><ul className="expense-conversion-rows">{summary.rows.map(row => <li key={row.currency}><div><strong>{formatAmount(row.amount, row.currency)}</strong><small>{row.currency === 'KRW' ? '원화 지출' : row.rate === undefined ? '환율 확인 필요' : (row.currency === 'JPY' ? '100엔 = ' + (row.rate * 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '1 ' + row.currency + ' = ' + row.rate.toLocaleString('ko-KR', { maximumFractionDigits: 4 })) + '원'}</small></div><span>{row.won === undefined || !Number.isSafeInteger(row.won) ? '—' : '약 ' + formatAmount(row.won, 'KRW')}</span></li>)}</ul><p className="muted">원화 미만은 합산 후 반올림해요. 하루 환율은 다음 날 한국 시간 오전 8시 갱신까지 유지하며 원래 금액과 통화별 정산은 그대로예요. 갱신 결과 반영에는 시간이 걸릴 수 있어요.</p><a className="expense-rate-credit" href="https://docs.cdp.coinbase.com/coinbase-app/track-apis/exchange-rates" target="_blank" rel="noopener noreferrer">환율 출처 · Coinbase</a></details>}
  </section>;
}
