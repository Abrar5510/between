/**
 * Wall-clock helpers for reading and writing ISO instants that keep a demo
 * offset. Seeds, offers and seeds are computed from a demo clock so that
 * recordings, tests and the hosted demo all agree on "Thursday".
 */

const DAY_MS = 86_400_000
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

const ISO_PREFIX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
const ISO_OFFSET = /([+-]\d{2}:\d{2}|Z)$/

export function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** The wall date and clock of an ISO string, in its own offset. */
export function wall(iso: string): { y: number; mo: number; d: number; h: number; mi: number } {
  const m = ISO_PREFIX.exec(iso)
  if (!m) throw new Error(`not an ISO instant: ${iso}`)
  return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] }
}

export function weekdayOf(iso: string): number {
  const { y, mo, d } = wall(iso)
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
}

export function weekdayName(iso: string): string {
  return WEEKDAYS[weekdayOf(iso)]
}

/** "4 PM", "7 AM", "4:30 PM". */
export function timeName(iso: string): string {
  const { h, mi } = wall(iso)
  const hour12 = h % 12 === 0 ? 12 : h % 12
  const suffix = h < 12 ? 'AM' : 'PM'
  return mi === 0 ? `${hour12} ${suffix}` : `${hour12}:${pad(mi)} ${suffix}`
}

/** "Thursday at 4 PM". */
export function dayTime(iso: string): string {
  return `${weekdayName(iso)} at ${timeName(iso)}`
}

/** "Thursday" from a YYYY-MM-DD date or any ISO instant. */
export function dayNameOfDate(date: string): string {
  const { y, mo, d } = wall(date.length === 10 ? `${date}T12:00:00Z` : date)
  return WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]
}

/** Whole days between the calendar dates of two ISO instants (ignores clock time). */
export function dayCountBetween(fromIso: string, toIso: string): number {
  const from = wall(fromIso)
  const to = wall(toIso)
  return Math.round((Date.UTC(to.y, to.mo - 1, to.d) - Date.UTC(from.y, from.mo - 1, from.d)) / DAY_MS)
}

export type Clock = {
  /** The current instant. */
  now(): Date
  /** Offset suffix carried by generated instants, e.g. "-07:00". */
  offset: string
  /** ISO instant for the given hour on the day `days` after today. */
  isoAt(days: number, hour: number): string
  /** ISO instant for the next `weekday` (0=Sunday) strictly after today. */
  nextWeekday(weekday: number, hour: number): string
}

function formatWithOffset(wallMs: number, offset: string): string {
  const d = new Date(wallMs)
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00${offset}`
  )
}

function offsetSuffixFrom(iso: string): string | undefined {
  const m = ISO_OFFSET.exec(iso)
  return m ? (m[1] === 'Z' ? '+00:00' : m[1]) : undefined
}

/**
 * Build a demo clock. `demoNow` (env DEMO_NOW) pins "today"; otherwise the
 * real clock is used. All generated instants carry one fixed offset so the
 * seed stays reproducible.
 */
export function createClock(demoNow?: string, realNow: () => Date = () => new Date()): Clock {
  const pin = demoNow ? new Date(demoNow) : undefined
  if (demoNow && Number.isNaN(pin!.getTime())) throw new Error(`DEMO_NOW is not a date: ${demoNow}`)
  const nowFn = () => new Date(pin ?? realNow())

  let offset: string
  if (demoNow && offsetSuffixFrom(demoNow)) {
    offset = offsetSuffixFrom(demoNow)!
  } else {
    const off = -nowFn().getTimezoneOffset()
    const sign = off >= 0 ? '+' : '-'
    const abs = Math.abs(off)
    offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  }

  // Midnight of "today" on the wall clock of the demo offset.
  const baseWallMs = () => {
    const shifted = new Date(nowFn().getTime())
    const wallDate = new Date(shifted.getTime() + offsetMinutes(offset) * 60_000)
    return Date.UTC(wallDate.getUTCFullYear(), wallDate.getUTCMonth(), wallDate.getUTCDate())
  }

  const isoAt = (days: number, hour: number) => formatWithOffset(baseWallMs() + days * DAY_MS + hour * 3_600_000, offset)

  return {
    now: nowFn,
    offset,
    isoAt,
    nextWeekday(weekday: number, hour: number) {
      const todays = new Date(baseWallMs()).getUTCDay()
      let delta = (weekday - todays + 7) % 7
      if (delta === 0) delta = 7
      return isoAt(delta, hour)
    },
  }
}

function offsetMinutes(offset: string): number {
  const sign = offset.startsWith('-') ? -1 : 1
  const [h, m] = offset.slice(1).split(':').map(Number)
  return sign * (h * 60 + m)
}
