export class SharedTripConflict extends Error {}

export function nextSharedRevision(exists: boolean, current: unknown, expected: number | undefined) {
  if (exists !== (expected !== undefined) || current !== expected) throw new SharedTripConflict();
  return (expected ?? 0) + 1;
}
