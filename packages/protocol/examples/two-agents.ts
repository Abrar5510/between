// Two household agents negotiate a swap in one process, over the real wire format.
// Run: npm run example -w between-protocol
import { MAX_COUNTERS, draft, generateKeyPair, open, seal, step, type Offer, type Slot, type Thread } from '../src/index.ts'

export type Agent = {
  id: string
  keys: { publicKey: string; privateKey: string }
  /** Start times this household cannot cover. A real agent checks its calendar. */
  busy: Set<string>
  /** Own runs it would like to hand off, most wanted first. */
  tradeable: Slot[]
}

export const agent = (id: string, busy: string[] = [], tradeable: Slot[] = []): Agent => ({
  id,
  keys: generateKeyPair(),
  busy: new Set(busy),
  tradeable,
})

type Move =
  | { type: 'request' | 'counter'; ask: Slot; give: Slot | null }
  | { type: 'accept'; ref: string }
  | { type: 'decline' }

/** `a` asks `b` to cover `ask`. Both families say yes to whatever the agents settle on. */
export function negotiate(a: Agent, b: Agent, ask: Slot, log: (offer: Offer) => void = () => {}): Thread {
  const publicKeys: Record<string, string> = { [a.id]: a.keys.publicKey, [b.id]: b.keys.publicKey }
  const thread = `t_${crypto.randomUUID()}`
  let state: Thread | undefined

  // Seal, verify and apply: what two servers do on either end of an HTTP POST.
  const send = (from: Agent, to: Agent, move: Move): Thread => {
    const { body, headers } = seal(draft({ ...move, thread, from: from.id, to: to.id }), from.keys.privateKey)
    const offer = open(body, headers, id => publicKeys[id])
    state = step(state, offer)
    log(offer)
    return state
  }

  let t = send(a, b, { type: 'request', ask, give: null })
  if (b.busy.has(ask.when)) return send(b, a, { type: 'decline' })

  const moves: (Slot | null)[] = [...b.tradeable, null] // swaps first, then a plain yes
  for (const give of moves) {
    if (t.counters >= MAX_COUNTERS) break
    t = send(b, a, { type: 'counter', ask, give })
    if (give === null || !a.busy.has(give.when)) {
      send(a, b, { type: 'accept', ref: t.standing.id }) // a's family approves
      return send(b, a, { type: 'accept', ref: t.standing.id }) // b's family approves
    }
    if (t.counters >= MAX_COUNTERS) break
    t = send(a, b, { type: 'counter', ask, give: null }) // "not that one, what else?"
  }
  // Out of moves or out of rounds: whoever was last asked walks away.
  const [from, to] = t.standing.from === a.id ? [b, a] : [a, b]
  return send(from, to, { type: 'decline' })
}

if (import.meta.main) {
  const at = (day: number, hourUtc: number) => new Date(Date.UTC(2026, 9, day, hourUtc)).toISOString()
  const run = (task: string, when: string): Slot => ({ task, when, mins: 60 })
  const thursday = at(22, 23), sunday = at(25, 14), tuesday = at(27, 23)

  const ahmad = agent('ahmad', [sunday])
  const lee = agent('lee', [thursday])
  const park = agent('park', [], [run('swim run', sunday), run('soccer run', tuesday)])

  const show = (o: Offer) => {
    const terms = 'give' in o ? (o.give ? `give ${o.give.task} ${o.give.when}` : 'no trade') : ''
    console.log(`  ${o.from.padEnd(5)} → ${o.to.padEnd(5)} ${o.type.padEnd(7)} ${terms}`)
  }
  for (const peer of [lee, park]) {
    console.log(`ahmad asks ${peer.id} to cover the soccer run on ${thursday}`)
    const { status, standing } = negotiate(ahmad, peer, run('soccer run', thursday), show)
    const deal = standing.give ? `${peer.id} takes ${standing.ask.task}, ahmad takes ${standing.give.task} ${standing.give.when}` : 'no trade'
    console.log(`  ⇒ ${status}${status === 'agreed' ? `: ${deal}` : ''}\n`)
  }
}
