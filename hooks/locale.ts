import type { Lang } from './i18n'

export type LocaleHints = {
  // The `language` setting of Claude Code itself, e.g. "dutch" or "nl".
  claudeLanguage?: unknown
  // LC_ALL, LC_MESSAGES and LANG, in that order of precedence.
  systemLocales: (string | undefined)[]
}

const isDutch = (value: string) => /^(nl(?![a-z])|dutch|nederlands)/i.test(value.trim())

export function detectLang(hints: LocaleHints): Lang {
  if (typeof hints.claudeLanguage === 'string' && hints.claudeLanguage.trim() !== '') {
    return isDutch(hints.claudeLanguage) ? 'nl' : 'en'
  }
  const locale = hints.systemLocales.find(l => l !== undefined && l !== '' && l !== 'C' && l !== 'POSIX')
  return locale !== undefined && isDutch(locale) ? 'nl' : 'en'
}

// An explicit setting wins; `auto` (or anything unrecognised) detects.
export function pickLang(option: unknown, hints: LocaleHints): Lang {
  return option === 'en' || option === 'nl' ? option : detectLang(hints)
}
