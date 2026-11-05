import type { ExpressionSpecification } from 'maplibre-gl';

function referencesName(value: unknown): boolean {
  if (typeof value === 'string') return /\{name(?::[^{}]+|_[^{}]+)?\}/.test(value);
  if (!Array.isArray(value)) return false;
  if (value[0] === 'get' && typeof value[1] === 'string' && /^name(?::|_|$)/.test(value[1])) return true;
  return value.some(referencesName);
}

/** Prefer translated names without replacing route numbers or other labels. */
export function koreanLabel(original: unknown): ExpressionSpecification | undefined {
  if (!referencesName(original)) return undefined;
  const expression: unknown[] = ['case'];
  for (const field of ['name:ko', 'name_ko', 'name:en', 'name_en']) {
    // An empty translation must not hide an otherwise valid place name.
    expression.push(['!=', ['coalesce', ['get', field], ''], ''], ['get', field]);
  }
  // MapLibre expands {tokens} only in top-level strings, not in expressions.
  const fallback = typeof original === 'string'
    ? ['concat', ...original.split(/(\{[^{}]+\})/g).filter(Boolean).map(part =>
      part.startsWith('{') && part.endsWith('}') ? ['to-string', ['get', part.slice(1, -1)]] : part)]
    : original;
  expression.push(fallback);
  return expression as ExpressionSpecification;
}
