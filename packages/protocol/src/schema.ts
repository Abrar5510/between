import { z } from 'zod'

/** Counters allowed per thread. After that only accept or decline is valid. */
export const MAX_COUNTERS = 3

export class ProtocolError extends Error {
  code: string
  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.code = code
  }
}

const Id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
const Instant = z.iso.datetime({ offset: true })

export const Slot = z.strictObject({
  // The only descriptive text that crosses between households. Kept short and
  // plain so it cannot carry a calendar entry or instructions for another agent.
  task: z.string().regex(/^[\p{L}\p{N} '-]{1,40}$/u),
  when: Instant,
  mins: z.number().int().min(5).max(24 * 60),
})
export type Slot = z.infer<typeof Slot>

const envelope = { v: z.literal(1), id: Id, thread: Id, from: Id, to: Id, sentAt: Instant, expires: Instant }
// Always from the thread initiator's side: `ask` is what the initiator needs
// covered, `give` is what the initiator takes on in return (null = no trade).
const terms = { ask: Slot, give: Slot.nullable() }

// Strict objects: an unknown key is an error, so nothing but an offer can be sent.
export const Offer = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('request'), ...terms }),
  z.strictObject({ ...envelope, type: z.literal('counter'), ...terms }),
  z.strictObject({ ...envelope, type: z.literal('accept'), ref: Id }),
  z.strictObject({ ...envelope, type: z.literal('decline') }),
])
export type Offer = z.infer<typeof Offer>

type Unstamped<T> = T extends unknown ? Omit<T, 'v' | 'id' | 'sentAt' | 'expires'> : never
export type Draft = Unstamped<Offer>

/** Stamp a draft with version, id and timestamps. */
export function draft(fields: Draft, ttlMs = 24 * 3600_000, now = new Date()): Offer {
  return Offer.parse({
    ...fields,
    v: 1,
    id: `o_${crypto.randomUUID()}`,
    sentAt: now.toISOString(),
    expires: new Date(now.getTime() + ttlMs).toISOString(),
  })
}
