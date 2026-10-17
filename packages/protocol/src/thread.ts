import { MAX_COUNTERS, ProtocolError, type Offer, type Slot } from './schema.ts'

export type Thread = {
  id: string
  initiator: string
  responder: string
  status: 'open' | 'half_accepted' | 'agreed' | 'declined' | 'expired'
  /** The request or counter currently on the table. */
  standing: Extract<Offer, { type: 'request' | 'counter' }>
  counters: number
  /** Parties whose family has approved `standing`. Two means agreed. */
  acceptedBy: string[]
}

function fail(code: string): never {
  throw new ProtocolError(code)
}

const closed = (t: Thread) => t.status === 'agreed' || t.status === 'declined' || t.status === 'expired'
const lapsed = (t: Thread, now: Date) => Date.parse(t.standing.expires) <= now.getTime()
const sameSlot = (a: Slot, b: Slot) =>
  a.task === b.task && a.mins === b.mins && Date.parse(a.when) === Date.parse(b.when)

/** Apply one offer to a thread. Pure: returns the next state or throws ProtocolError. */
export function step(thread: Thread | undefined, offer: Offer, now = new Date()): Thread {
  if (offer.from === offer.to) fail('self_offer')
  if (!thread) {
    if (offer.type !== 'request') return fail('no_thread')
    return {
      id: offer.thread,
      initiator: offer.from,
      responder: offer.to,
      status: 'open',
      standing: offer,
      counters: 0,
      acceptedBy: [],
    }
  }
  if (offer.thread !== thread.id) fail('wrong_thread')
  const parties = [thread.initiator, thread.responder]
  if (!parties.includes(offer.from) || !parties.includes(offer.to)) fail('not_a_party')
  if (closed(thread)) fail('thread_closed')
  if (offer.type === 'decline') return { ...thread, status: 'declined' }
  if (lapsed(thread, now)) fail('expired')

  switch (offer.type) {
    case 'request':
      return fail('duplicate_request')
    case 'counter':
      if (thread.status !== 'open') fail('already_accepted')
      if (offer.from === thread.standing.from) fail('own_offer')
      if (thread.counters >= MAX_COUNTERS) fail('round_cap')
      if (!sameSlot(offer.ask, thread.standing.ask)) fail('ask_changed')
      return { ...thread, standing: offer, counters: thread.counters + 1 }
    case 'accept': {
      if (offer.ref !== thread.standing.id) fail('stale_ref')
      if (thread.acceptedBy.includes(offer.from)) fail('duplicate_accept')
      const acceptedBy = [...thread.acceptedBy, offer.from]
      return { ...thread, acceptedBy, status: acceptedBy.length === 2 ? 'agreed' : 'half_accepted' }
    }
  }
}

/** Mark a live thread expired once its standing offer has lapsed. */
export function expire(thread: Thread, now = new Date()): Thread {
  return !closed(thread) && lapsed(thread, now) ? { ...thread, status: 'expired' } : thread
}
