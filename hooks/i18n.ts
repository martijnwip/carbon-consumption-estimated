export type Lang = 'en' | 'nl'

export type Strings = {
  overview: string
  perDay: string
  perMonth: string
  perModel: string
  period: string
  day: string
  month: string
  model: string
  outputTokens: string
  responses: string
  energy: string
  pricedEnergy: string
  co2: string
  water: string
  today: string
  last7Days: string
  thisMonth: string
  total: string
  note: (zone: string) => string
  pricedTotal: (co2: string, water: string) => string
  notCounted: string
  noUsage: string
  usage: string
  unreadable: (n: number) => string
  status: (energy: string, priced: string, co2: string) => string
  commandDescription: string
  million: string
  billion: string
}

export const STRINGS: Record<Lang, Strings> = {
  en: {
    overview: 'Overview (estimated)',
    perDay: 'Per day, last 14 days (estimated)',
    perMonth: 'Per month (estimated)',
    perModel: 'Per model, this month',
    period: 'Period',
    day: 'Day',
    month: 'Month',
    model: 'Model',
    outputTokens: 'Output',
    responses: 'Responses',
    energy: 'Energy',
    pricedEnergy: 'Price-weighted',
    co2: 'CO₂e',
    water: 'Water',
    today: 'Today',
    last7Days: 'Last 7 days',
    thisMonth: 'This month',
    total: 'Total',
    note: zone =>
      `Estimate with the EcoLogits method (ecologits.ai), electricity mix ${zone}. Anthropic publishes no figures. ` +
      'Energy, CO₂e and water count output tokens only, a lower bound. Price-weighted also counts input and cache ' +
      'tokens at their price ratio to output (cache writes at the input price): an indication, likely on the high side for input.',
    pricedTotal: (co2, water) => `Price-weighted, all time: ${co2} CO₂e, ${water} water.`,
    notCounted: 'Not counted (model unknown to EcoLogits)',
    noUsage: 'No usage found in ~/.claude/projects yet.',
    usage: 'Usage: /carbon, /carbon day or /carbon month',
    unreadable: n => `${n} transcript(s) could not be read and are not counted.`,
    status: (energy, priced, co2) => `≈ ${energy} · price-weighted ${priced} · ${co2} CO₂e (est.)`,
    commandDescription: 'Estimated energy, CO₂ and water of your Claude Code usage (carbon [day|month])',
    million: 'M',
    billion: 'B',
  },
  nl: {
    overview: 'Overzicht (geschat)',
    perDay: 'Per dag, laatste 14 dagen (geschat)',
    perMonth: 'Per maand (geschat)',
    perModel: 'Per model, deze maand',
    period: 'Periode',
    day: 'Dag',
    month: 'Maand',
    model: 'Model',
    outputTokens: 'Output',
    responses: 'Antwoorden',
    energy: 'Energie',
    pricedEnergy: 'Prijsgewogen',
    co2: 'CO₂e',
    water: 'Water',
    today: 'Vandaag',
    last7Days: 'Laatste 7 dagen',
    thisMonth: 'Deze maand',
    total: 'Totaal',
    note: zone =>
      `Schatting volgens de EcoLogits-methode (ecologits.ai), stroommix ${zone}. Anthropic publiceert geen cijfers. ` +
      'Energie, CO₂e en water tellen alleen output-tokens: een ondergrens. Prijsgewogen telt ook input- en cachetokens mee ' +
      'naar hun prijsverhouding met output (cache schrijven tegen de inputprijs): een indicatie, voor input eerder aan de hoge kant.',
    pricedTotal: (co2, water) => `Prijsgewogen, totaal: ${co2} CO₂e, ${water} water.`,
    notCounted: 'Niet meegeteld (model onbekend bij EcoLogits)',
    noUsage: 'Nog geen gebruik gevonden in ~/.claude/projects.',
    usage: 'Gebruik: /carbon, /carbon dag of /carbon maand',
    unreadable: n => `${n} transcript(en) konden niet gelezen worden en tellen niet mee.`,
    status: (energy, priced, co2) => `≈ ${energy} · prijsgewogen ${priced} · ${co2} CO₂e (geschat)`,
    commandDescription: 'Geschatte energie, CO₂ en water van je Claude Code-gebruik (carbon [dag|maand])',
    million: ' mln',
    billion: ' mld',
  },
}

// Formats a number with the language's separators: 1,234.5 or 1.234,5.
export function formatNumber(n: number, decimals: number, lang: Lang): string {
  const [whole = '0', fraction] = n.toFixed(decimals).split('.')
  const [group, point] = lang === 'nl' ? ['.', ','] : [',', '.']
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group)
  return fraction === undefined ? grouped : `${grouped}${point}${fraction}`
}
