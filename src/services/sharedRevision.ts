export class SharedTripConflict extends Error {}

export function nextSharedRevision(exists: boolean, current: unknown, expected: number | undefined) {
  if (exists !== (expected !== undefined) || current !== expected) throw new SharedTripConflict();
  return (expected ?? 0) + 1;
}

/** Rules may reject a stale revision before the SDK reports an aborted transaction.
 * Only independent packing checks can be replayed against the latest trip. */
export async function retryPackingRevisionRace(commit:(observe:(revision:number)=>void)=>Promise<void>,readRevision:()=>Promise<number|undefined>) {
  for(let attempt=0;;attempt++) {
    let observed:number|undefined;
    try { await commit(revision=>{observed=revision;}); return; }
    catch(error) {
      if(attempt>=2||!error||typeof error!=='object'||!('code' in error)||error.code!=='permission-denied'||observed===undefined) throw error;
      const latest=await readRevision();
      if(latest===undefined||!Number.isSafeInteger(latest)||latest<=observed) throw error;
    }
  }
}
