import { formatNumber, STRINGS, type Lang } from './i18n'
import { impactsOf, type Impacts, type Range, type Zone } from './impacts'
import { equivalentOutput, type Usage } from './prices'

// The EcoLogits estimate (output tokens only) and, as `priced`, the same with
// input and cache tokens added at their price ratio to output.
export type Entry = Impacts & { output: number; responses: number; priced: Impacts }

// Per day (YYYY-MM-DD, local time) and per model, the summed impacts.
export type Tally = {
  days: Map<string, Map<string, Entry>>
  seen: Set<string>
  unknown: Set<string>
}

export const newTally = (): Tally => ({ days: new Map(), seen: new Set(), unknown: new Set() })

const zero = (): Range => ({ min: 0, max: 0 })

const noImpacts = (): Impacts => ({ energy: zero(), gwp: zero(), water: zero() })

export const emptyEntry = (): Entry => ({ output: 0, responses: 0, ...noImpacts(), priced: noImpacts() })

const addRange = (a: Range, b: Range): Range => ({ min: a.min + b.min, max: a.max + b.max })

const addImpacts = (a: Impacts, b: Impacts): Impacts => ({
  energy: addRange(a.energy, b.energy),
  gwp: addRange(a.gwp, b.gwp),
  water: addRange(a.water, b.water),
})

export const add = (a: Entry, b: Entry): Entry => ({
  output: a.output + b.output,
  responses: a.responses + b.responses,
  ...addImpacts(a, b),
  priced: addImpacts(a.priced, b.priced),
})

// One response as an entry; undefined for a model EcoLogits does not know.
// The price-weighted estimate runs the response as if it had generated its
// input and cache tokens too, counted as output tokens by their price ratio.
export function entryOf(model: string, usage: Usage, zone: Zone): Entry | undefined {
  const output = usage.output_tokens ?? 0
  const impacts = impactsOf(model, output, zone)
  const priced = impactsOf(model, output + equivalentOutput(model, usage), zone)
  if (impacts === undefined || priced === undefined) return undefined
  return { output, responses: 1, ...impacts, priced }
}

export const dayOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

type Line = {
  type?: string
  timestamp?: string
  requestId?: string
  message?: { id?: string; model?: string; usage?: Usage }
}

// Counts the assistant responses in (a piece of) a JSONL transcript.
// Claude Code sometimes writes one response on several lines; those count once.
export function countLines(text: string, tally: Tally, zone: Zone): void {
  for (const raw of text.split('\n')) {
    if (!raw.includes('"usage"') || !raw.includes('"assistant"')) continue

    let line: Line
    try {
      line = JSON.parse(raw)
    } catch {
      continue
    }

    const m = line.message
    if (line.type !== 'assistant' || !m?.usage || !m.model || !line.timestamp) continue
    if (m.model === '<synthetic>') continue

    const key = `${m.id ?? ''}:${line.requestId ?? ''}`
    if (key !== ':') {
      if (tally.seen.has(key)) continue
      tally.seen.add(key)
    }

    const entry = entryOf(m.model, m.usage, zone)
    if (entry === undefined) {
      tally.unknown.add(m.model)
      continue
    }

    const day = dayOf(new Date(line.timestamp))
    const model = m.model.replace(/-\d{8}$/, '')
    const perModel = tally.days.get(day) ?? new Map<string, Entry>()
    perModel.set(model, add(perModel.get(model) ?? emptyEntry(), entry))
    tally.days.set(day, perModel)
  }
}

// A range in the unit that suits its upper bound: "3.1–5.9 Wh", "1.2–2.4 kWh".
function range(r: Range, units: readonly (readonly [string, number])[], lang: Lang): string {
  const [unit, factor] = units.find(([, f]) => r.max * f < 1000) ?? units[units.length - 1] ?? ['', 1]
  const lo = r.min * factor
  const hi = r.max * factor
  const decimals = hi === 0 ? 0 : hi < 1 ? 2 : hi < 10 ? 1 : 0
  return `${formatNumber(lo, decimals, lang)}–${formatNumber(hi, decimals, lang)} ${unit}`
}

// Each list goes from the smallest unit up; the value is in kWh, kg or litres.
export const energy = (r: Range, lang: Lang) => range(r, [['Wh', 1000], ['kWh', 1], ['MWh', 0.001]], lang)
export const co2 = (r: Range, lang: Lang) => range(r, [['g', 1000], ['kg', 1], ['t', 0.001]], lang)
export const water = (r: Range, lang: Lang) => range(r, [['ml', 1000], ['L', 1], ['m³', 0.001]], lang)

export function shortTokens(n: number, lang: Lang): string {
  const t = STRINGS[lang]
  if (n >= 1_000_000_000) return `${formatNumber(n / 1_000_000_000, 1, lang)}${t.billion}`
  if (n >= 1_000_000) return `${formatNumber(n / 1_000_000, 1, lang)}${t.million}`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

const sumOf = (tally: Tally, matches: (day: string) => boolean): Entry => {
  let sum = emptyEntry()
  for (const [day, perModel] of tally.days) {
    if (!matches(day)) continue
    for (const entry of perModel.values()) sum = add(sum, entry)
  }
  return sum
}

const perModelOf = (tally: Tally, matches: (day: string) => boolean) => {
  const models = new Map<string, Entry>()
  for (const [day, perModel] of tally.days) {
    if (!matches(day)) continue
    for (const [model, entry] of perModel) models.set(model, add(models.get(model) ?? emptyEntry(), entry))
  }
  return [...models].sort((a, b) => b[1].energy.max - a[1].energy.max)
}

// A boxed table with a header row; `footer` sits below its own separator.
const table = (header: string[], rows: string[][], footer?: string[]): string => {
  const all = [header, ...rows, ...(footer ? [footer] : [])]
  const widths = header.map((_, i) => Math.max(...all.map(r => (r[i] ?? '').length)))
  const rule = (l: string, m: string, r: string) => l + widths.map(w => '─'.repeat(w + 2)).join(m) + r
  const row = (r: string[]) =>
    '│' + r.map((cell, i) => ` ${i === 0 ? cell.padEnd(widths[i] ?? 0) : cell.padStart(widths[i] ?? 0)} `).join('│') + '│'

  return [
    rule('┌', '┬', '┐'),
    row(header),
    rule('├', '┼', '┤'),
    ...rows.map(row),
    ...(footer ? [rule('├', '┼', '┤'), row(footer)] : []),
    rule('└', '┴', '┘'),
  ].join('\n')
}

export type View = 'overview' | 'days' | 'months'

export type Settings = { lang: Lang; zone: Zone }

export function report(tally: Tally, view: View, now: Date, s: Settings): string {
  const t = STRINGS[s.lang]
  if (tally.days.size === 0) return t.noUsage

  const today = dayOf(now)
  const weekAgo = dayOf(new Date(now.getTime() - 6 * 86_400_000))
  const month = today.slice(0, 7)
  const header = (first: string) => [first, t.outputTokens, t.responses, t.energy, t.pricedEnergy, t.co2, t.water]
  const row = (label: string, e: Entry) => [
    label,
    shortTokens(e.output, s.lang),
    formatNumber(e.responses, 0, s.lang),
    energy(e.energy, s.lang),
    energy(e.priced.energy, s.lang),
    co2(e.gwp, s.lang),
    water(e.water, s.lang),
  ]
  const total = (matches: (day: string) => boolean) => row(t.total, sumOf(tally, matches))

  let body: string
  if (view === 'days') {
    const days = [...tally.days.keys()].sort().slice(-14)
    body = `${t.perDay}\n${table(
      header(t.day),
      days.map(d => row(d, sumOf(tally, x => x === d))),
      total(d => days.includes(d)),
    )}`
  } else if (view === 'months') {
    const months = [...new Set([...tally.days.keys()].map(d => d.slice(0, 7)))].sort()
    body = `${t.perMonth}\n${table(
      header(t.month),
      months.map(m => row(m, sumOf(tally, d => d.startsWith(m)))),
      total(() => true),
    )}`
  } else {
    const periods = `${t.overview}\n${table(
      header(t.period),
      [
        row(t.today, sumOf(tally, d => d === today)),
        row(t.last7Days, sumOf(tally, d => d >= weekAgo)),
        row(t.thisMonth, sumOf(tally, d => d.startsWith(month))),
      ],
      total(() => true),
    )}`
    const models = perModelOf(tally, d => d.startsWith(month))
    const perModel =
      models.length === 0 ? '' : `\n\n${t.perModel}\n${table(header(t.model), models.map(([m, e]) => row(m, e)))}`
    body = periods + perModel
  }

  const unknown = tally.unknown.size === 0 ? '' : `\n${t.notCounted}: ${[...tally.unknown].join(', ')}`
  const all = sumOf(tally, () => true).priced
  const priced = t.pricedTotal(co2(all.gwp, s.lang), water(all.water, s.lang))

  return `${body}\n\n${t.note(s.zone)}\n${priced}${unknown}`
}
