// Anthropic first-party API prices in US dollars per million tokens (October 2026),
// as in token-cost. Only their ratios within one model are used here.
export type Price = { input: number; output: number; cacheRead: number }

// Longest prefix first, so `claude-opus-5-5` does not match `claude-opus-5`.
const PRICES: ReadonlyArray<readonly [string, Price]> = [
  ['claude-fable-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-fable-5', { input: 10, output: 50, cacheRead: 1 }],
  ['claude-opus-5-5', { input: 4, output: 20, cacheRead: 0.2 }],
  ['claude-opus-5', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-8', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-7', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-6', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-5', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-sonnet-5-5', { input: 2, output: 10, cacheRead: 0.2 }],
  ['claude-sonnet-5', { input: 2, output: 10, cacheRead: 0.2 }],
  ['claude-sonnet-4', { input: 3, output: 15, cacheRead: 0.3 }],
  ['claude-haiku-5-5', { input: 0.1, output: 0.5, cacheRead: 0.01 }],
  ['claude-haiku-4-5', { input: 1, output: 5, cacheRead: 0.1 }],
]

export function priceFor(model: string): Price | undefined {
  const name = model.replace(/^(us\.|eu\.|global\.)?anthropic\./, '')
  return PRICES.find(([prefix]) => name.startsWith(prefix))?.[1]
}

// The token counts the API reports for one response.
export type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

// Input and cache tokens expressed as output tokens by their price ratio, so the
// price-weighted estimate can count them at an output token's energy.
// Cache writes count at the input price: their premium pays for keeping the
// cache in memory, not for computing it.
export function equivalentOutput(model: string, u: Usage): number {
  const p = priceFor(model)
  if (p === undefined) return 0
  const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  return (input * p.input + (u.cache_read_input_tokens ?? 0) * p.cacheRead) / p.output
}
