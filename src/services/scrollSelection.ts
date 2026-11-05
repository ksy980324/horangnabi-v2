export type CardBounds = { id: string; top: number; bottom: number };

/** Pick a visible card near the reading line, ignoring cards behind the map. */
export function findReadingStop(cards: CardBounds[], visibleTop: number, viewportHeight: number, atBottom = false): string | undefined {
  const visible = cards.filter(card => card.bottom > visibleTop && card.top < viewportHeight);
  if (!visible.length) return undefined;
  if (atBottom) return visible[visible.length - 1].id;
  const line = visibleTop + Math.min(72, (viewportHeight - visibleTop) * 0.2);
  const containing = visible.find(card => card.top <= line && card.bottom > line);
  if (containing) return containing.id;
  return visible.reduce((nearest, card) => {
    const distance = (c: CardBounds) => Math.min(Math.abs(c.top - line), Math.abs(c.bottom - line));
    return distance(card) < distance(nearest) ? card : nearest;
  }).id;
}
