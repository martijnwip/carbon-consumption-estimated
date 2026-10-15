import { expect, mock, test } from 'claude-code/testing'

import { impactsOf } from '../hooks/impacts'
import { equivalentOutput } from '../hooks/prices'
import { co2, countLines, energy, entryOf, newTally, report, water } from '../hooks/report'

const COMMAND = { command: 'carbon', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

const line = (id: string, model: string, output: number, timestamp = '2026-10-14T10:00:00.000Z') =>
  JSON.stringify({
    type: 'assistant',
    timestamp,
    requestId: `req_${id}`,
    message: { id, model, usage: { input_tokens: 50_000, output_tokens: output } },
  })

const NOW = new Date('2026-10-14T12:00:00Z')

// Within a billionth of the reference value.
const close = (actual: number | undefined, expected: number) =>
  expect(Math.abs((actual ?? NaN) - expected) / expected < 1e-9).toBe(true)

test('matches the EcoLogits reference (llm_impacts, ecologits d0b76e3)', async () => {
  // python: llm_impacts("anthropic", model, output, latency, zone)
  const cases = [
    ['claude-opus-5-5', 1000, Infinity, 'USA', [0.003085698801768991, 0.005927633036420847], [0.0012507656738747085, 0.0023432051936748822], [0.010032736340167416, 0.02376041785739516]],
    ['claude-haiku-5-5', 250, Infinity, 'USA', [1.5044606974806617e-5, 3.9583601012409955e-5], [6.344781079987546e-6, 1.6339204546914153e-5], [4.891552442939259e-5, 0.00015866753130237057]],
    ['claude-sonnet-5-5', 5000, 4, 'NLD', [0.005019503848249963, 0.008313658561917786], [0.0012831620624289273, 0.0021184279316265407], [0.017830613133310465, 0.0358261801091654]],
    ['claude-fable-5-1', 1, Infinity, 'USA', [0.00018571146879445228, 0.0002052811638052272], [0.00011211257030393387, 0.00011963516106607575], [0.0006038159656709928, 0.0008228522582784064]],
  ] as const

  for (const [model, output, latency, zone, e, g, w] of cases) {
    const r = impactsOf(model, output, zone, latency)
    close(r?.energy.min, e[0])
    close(r?.energy.max, e[1])
    close(r?.gwp.min, g[0])
    close(r?.gwp.max, g[1])
    close(r?.water.min, w[0])
    close(r?.water.max, w[1])
  }
})

test('knows dated, prefixed and unknown model names', async () => {
  expect(impactsOf('claude-sonnet-4-5-20250929', 100, 'USA')).toBeDefined()
  expect(impactsOf('us.anthropic.claude-opus-5-5', 100, 'USA')).toEqual(impactsOf('claude-opus-5-5', 100, 'USA'))
  expect(impactsOf('claude-3-opus', 100, 'USA')).toBeUndefined()
})

test('counts a response written on several lines once, and lists unknown models', async () => {
  const tally = newTally()
  countLines(
    [
      line('a', 'claude-opus-5-5', 1000),
      line('a', 'claude-opus-5-5', 1000),
      JSON.stringify({ type: 'user', message: { content: 'hi' } }),
      line('b', 'something-new', 10),
    ].join('\n'),
    tally,
    'USA',
  )

  const entry = tally.days.get('2026-10-14')?.get('claude-opus-5-5')
  expect(entry?.responses).toBe(1)
  expect(entry?.output).toBe(1000)
  expect([...tally.unknown]).toEqual(['something-new'])
})

test('price-weighting counts input and cache tokens at their price ratio to output', async () => {
  // Opus 5.5: input $4, cache read $0.20, output $20 per million tokens.
  // 10k input + 5k cache write at the input price = 3k output; 100k cache read = 1k output.
  const usage = { input_tokens: 10_000, cache_creation_input_tokens: 5_000, cache_read_input_tokens: 100_000, output_tokens: 1000 }
  expect(equivalentOutput('claude-opus-5-5', usage)).toBe(4000)

  const entry = entryOf('claude-opus-5-5', usage, 'USA')
  expect(entry?.energy).toEqual(impactsOf('claude-opus-5-5', 1000, 'USA')?.energy)
  expect(entry?.priced.energy).toEqual(impactsOf('claude-opus-5-5', 5000, 'USA')?.energy)

  // Output only: both estimates agree.
  const plain = entryOf('claude-opus-5-5', { output_tokens: 1000 }, 'USA')
  expect(plain?.priced).toEqual({ energy: plain?.energy, gwp: plain?.gwp, water: plain?.water })
})

test('formats ranges in a fitting unit per language', async () => {
  expect(energy({ min: 0.0031, max: 0.0059 }, 'en')).toBe('3.1–5.9 Wh')
  expect(energy({ min: 1.5, max: 2.75 }, 'nl')).toBe('1,5–2,8 kWh')
  expect(co2({ min: 0.0125, max: 0.0234 }, 'en')).toBe('13–23 g')
  expect(water({ min: 0.4, max: 0.95 }, 'nl')).toBe('400–950 ml')
  expect(water({ min: 1.2, max: 3 }, 'en')).toBe('1.2–3.0 L')
})

test('renders the overview with the method note', async () => {
  const tally = newTally()
  countLines(line('a', 'claude-opus-5-5', 1000), tally, 'USA')

  const en = report(tally, 'overview', NOW, { lang: 'en', zone: 'USA' })
  expect(en).toContain('Overview (estimated)')
  expect(en).toContain('3.1–5.9 Wh')
  expect(en).toContain('electricity mix USA')
  expect(en).toContain('Price-weighted')
  // 50k input = 10k output-equivalent tokens on top of the 1k output.
  expect(en).toContain(energy(impactsOf('claude-opus-5-5', 11_000, 'USA')!.energy, 'en'))
  expect(en).toContain('Price-weighted, all time:')

  const nl = report(tally, 'days', NOW, { lang: 'nl', zone: 'WOR' })
  expect(nl).toContain('Per dag')
  expect(nl).toContain('3,1–5,9 Wh')
  expect(nl).toContain('stroommix WOR')
})

test('/carbon reads the transcripts and shows the overview', async ($, on) => {
  mock.env(on, { HOME: '/home' })
  mock.clock(on, { now: NOW.getTime() })
  on('fs.list', ($, e) => ({
    value:
      e.path === '/home/.claude/projects'
        ? [{ name: 'proj', kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false }]
        : [{ name: 'session.jsonl', kind: 'file' as const, size: 100, mtimeMs: 0, isLink: false }],
  }))
  on('fs.read', () => ({ value: line('a', 'claude-opus-5-5', 1000) }))

  const { text } = await $.command.run({ ...COMMAND, args: '' })

  expect(text).toContain('This month')
  expect(text).toContain('3.1–5.9 Wh')
  expect(text).toContain('10–24 ml')
})

test('/carbon in Dutch with another electricity mix', { options: { language: 'nl', zone: 'FRA' } }, async ($, on) => {
  mock.env(on, { HOME: '/home' })
  mock.clock(on, { now: NOW.getTime() })
  on('fs.list', ($, e) => ({
    value: e.path === '/home/.claude/projects' ? [{ name: 's.jsonl', kind: 'file' as const, size: 100, mtimeMs: 0, isLink: false }] : [],
  }))
  on('fs.read', () => ({ value: line('a', 'claude-opus-5-5', 1000) }))

  const { text } = await $.command.run({ ...COMMAND, args: 'maand' })

  expect(text).toContain('Per maand')
  expect(text).toContain('stroommix FRA')
})

test('/carbon with an unknown argument explains the usage', async ($, on) => {
  mock.env(on, { HOME: '/home', LANG: 'en_US.UTF-8' })
  const { text } = await $.command.run({ ...COMMAND, args: 'year' })
  expect(text).toContain('Usage: /carbon')
})

test('the status line adds up every model request of the session', async ($, on) => {
  const status: (string | undefined)[] = []
  on('ui.status', ($, e) => {
    status.push(e.text)
    return { value: undefined }
  })
  mock.env(on, { HOME: '/home', LANG: 'en_US.UTF-8' })
  on('turn.step', async function* ($, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: { model: e.model, input_tokens: 10_000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    }
  })

  for (const index of [0, 1]) {
    const stream = $.turn.step({ turnId: 't1', index, model: 'claude-opus-5-5', messageCount: 1 })
    for await (const _ of stream) {
      // drain
    }
    await stream.result
  }

  // Two responses of 500 tokens: each pays its own time to first token.
  // 10k input on Opus 5.5 weighs as 2k output tokens.
  const one = impactsOf('claude-opus-5-5', 500, 'USA')!
  const priced = impactsOf('claude-opus-5-5', 2500, 'USA')!
  const twice = (r: { min: number; max: number }) => ({ min: 2 * r.min, max: 2 * r.max })
  expect(status.at(-1)).toBe(
    `≈ ${energy(twice(one.energy), 'en')} · price-weighted ${energy(twice(priced.energy), 'en')} · ${co2(twice(one.gwp), 'en')} CO₂e (est.)`,
  )
  expect(status.length).toBe(2)
})
