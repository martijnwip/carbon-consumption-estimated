import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { SessionImpacts } from '../types'
import { STRINGS } from './i18n'
import { isZone } from './impacts'
import { pickLang, type LocaleHints } from './locale'
import { co2, countLines, energy, entryOf, newTally, report, type Settings, type Tally, type View } from './report'

// $.fs.read reads up to 4 MiB; larger transcripts are read filtered through grep.
const MAX_READ = 4 * 1024 * 1024

const VIEWS: Record<string, View> = {
  '': 'overview',
  day: 'days',
  days: 'days',
  dag: 'days',
  dagen: 'days',
  month: 'months',
  months: 'months',
  maand: 'months',
  maanden: 'months',
}

// This session's estimate so far, summed from every model request it made.
const session = atom({ plugin: 'carbon-consumption-estimated', key: 'session' } as const, null)

async function projectsDir($: EngineInterface): Promise<string | undefined> {
  const custom = await $.env.get('CLAUDE_CONFIG_DIR')
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  const base = custom ?? (home === undefined ? undefined : `${home}/.claude`)
  return base === undefined ? undefined : `${base}/projects`
}

async function transcripts($: EngineInterface, dir: string): Promise<{ path: string; size: number }[]> {
  const found: { path: string; size: number }[] = []
  const entries = await $.fs.list(dir).catch(() => [])
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`
    if (entry.kind === 'dir') found.push(...(await transcripts($, path)))
    else if (entry.kind === 'file' && entry.name.endsWith('.jsonl')) found.push({ path, size: entry.size })
  }
  return found
}

// Reads a large file in pieces and counts only the lines that carry usage.
async function countLarge($: EngineInterface, path: string, tally: Tally, s: Settings): Promise<boolean> {
  try {
    let rest = ''
    for await (const { stream, text } of $.process.spawn({ argv: ['grep', '-F', '"usage"', path] })) {
      if (stream !== 'stdout') continue
      const chunk = rest + text
      const cut = chunk.lastIndexOf('\n')
      countLines(chunk.slice(0, cut + 1), tally, s.zone)
      rest = chunk.slice(cut + 1)
    }
    countLines(rest, tally, s.zone)
    return true
  } catch {
    return false
  }
}

async function countAll($: EngineInterface, s: Settings): Promise<{ tally: Tally; skipped: number }> {
  const tally = newTally()
  let skipped = 0
  const dir = await projectsDir($)
  if (dir === undefined) return { tally, skipped }

  for (const { path, size } of await transcripts($, dir)) {
    if (size <= MAX_READ) {
      const text = await $.fs.read(path).catch(() => undefined)
      if (text === undefined) skipped += 1
      else countLines(text, tally, s.zone)
    } else if (!(await countLarge($, path, tally, s))) {
      skipped += 1
    }
  }
  return { tally, skipped }
}

async function showStatus($: EngineInterface, s: Settings): Promise<void> {
  const sum = await read($, session)
  if (sum === null) return
  $.ui.status(STRINGS[s.lang].status(energy(sum.energy, s.lang), energy(sum.pricedEnergy, s.lang), co2(sum.gwp, s.lang)))
}

// Language: an explicit option wins, `auto` follows Claude Code's own `language`
// setting and the system locale. The zone is one EcoLogits knows, else USA.
async function resolveSettings($: EngineInterface, options: PluginOptions): Promise<Settings> {
  const hints: LocaleHints = {
    claudeLanguage: (await $.settings.read().catch(() => ({}) as Record<string, unknown>)).language,
    systemLocales: [await $.env.get('LC_ALL'), await $.env.get('LC_MESSAGES'), await $.env.get('LANG')],
  }
  return {
    lang: pickLang(options.language, hints),
    zone: isZone(options.zone) ? options.zone : 'USA',
  }
}

export const register: Register = (on, options) => {
  const withStatus = options.statusLine !== false

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const s = await resolveSettings($, options)
    await $.command.register({ name: 'carbon', description: STRINGS[s.lang].commandDescription })
    if (withStatus) await showStatus($, s)
    return result
  })

  // Every model request, subagents' included, adds its estimate to the session's.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const usage = result.usage
    if (usage === null) return result

    const s = await resolveSettings($, options)
    const entry = entryOf(usage.model, usage, s.zone)
    if (entry === undefined) return result

    const plus = (a: { min: number; max: number } | undefined, b: { min: number; max: number }) => ({
      min: (a?.min ?? 0) + b.min,
      max: (a?.max ?? 0) + b.max,
    })
    await update($, session, (sum: SessionImpacts | null) => ({
      energy: plus(sum?.energy, entry.energy),
      pricedEnergy: plus(sum?.pricedEnergy, entry.priced.energy),
      gwp: plus(sum?.gwp, entry.gwp),
    }))
    if (withStatus) await showStatus($, s)
    return result
  })

  on('command.run', { command: 'carbon' }, async ($, e) => {
    const s = await resolveSettings($, options)
    const t = STRINGS[s.lang]
    const view = VIEWS[(e.args ?? '').trim().toLowerCase()]
    if (view === undefined) return { text: t.usage }

    const { tally, skipped } = await countAll($, s)
    const now = new Date(await $.clock.now())
    const warning = skipped === 0 ? '' : `\n${t.unreadable(skipped)}`

    return { text: `\n${report(tally, view, now, s)}${warning}` }
  })
}
