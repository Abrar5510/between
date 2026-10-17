import { MAX_COUNTERS, ProtocolError, draft, expire, step, type Offer, type Slot, type Thread } from 'between-protocol'
import type { Chooser } from './chooser.ts'
import { familyOf, nameOf } from './config.ts'
import type { EventRow, NegotiationRow, Role, Store, ThreadRow } from './db.ts'
import { dayNameOfDate, dayTime, weekdayName } from './dates.ts'

/**
 * The negotiation engine. It only ever builds moves from slots the own
 * calendar shows as free, so a chooser can pick badly but never illegally.
 * Everything incidental (HTTP, MCP, Bedrock) is injected so the tests run
 * four engines in memory.
 */

export interface EngineKnobs {
  /** How long the initiator waits for peers before settling. */
  collectMs: number
  /** Offer lifetime. */
  offerTtlMs: number
  /** How far ahead a responder may offer a swap of one of its own events. */
  tradeWindowDays: number
}

export interface EngineDeps {
  store: Store
  self: string
  send: (offer: Offer, threadId: string) => void | Promise<void>
  choose: Chooser
  now: () => Date
  /** Pause before an agent reply so the feed is watchable. Default: immediately. */
  pace?: (run: () => void | Promise<void>) => void
  knobs?: Partial<EngineKnobs>
  log?: (message: string, extra?: Record<string, unknown>) => void
}

export interface FeedEvent {
  at: string
  peer: string
  text: string
}

export interface FindHelpResult {
  ok: boolean
  kind: 'started' | 'existing' | 'no_match'
  summary: string
  negotiationId?: string
  status?: string
  task?: string
  when?: string
  families?: string[]
}

export interface ProposalView {
  proposalId: string
  theyTake: string
  youTake: string
  why?: string | null
}

export interface StatusResult {
  kind: 'negotiating' | 'proposal' | 'awaiting' | 'agreed' | 'declined' | 'no_help' | 'none'
  summary: string
  negotiationId?: string
  status?: string
  task?: string
  when?: string
  proposal?: ProposalView
  feed: FeedEvent[]
}

export interface RespondResult {
  kind: 'negotiating' | 'awaiting' | 'agreed' | 'declined' | 'none'
  summary: string
  negotiationId?: string
  status?: string
  proposal?: ProposalView
}

export interface LedgerResult {
  balances: { peer: string; name: string; balance: number }[]
  askFirst: string | null
  summary: string
}

export interface PendingProposal {
  proposalId: string
  kind: 'approval' | 'incoming'
  summary: string
}

export type Engine = ReturnType<typeof createEngine>

const DEFAULTS: EngineKnobs = { collectMs: 4_000, offerTtlMs: 24 * 3_600_000, tradeWindowDays: 14 }

export function createEngine(deps: EngineDeps) {
  const { store, self, send, choose, now } = deps
  const knobs: EngineKnobs = { ...DEFAULTS, ...deps.knobs }
  const pace = deps.pace ?? ((run: () => void | Promise<void>) => void run())
  const log = deps.log ?? (() => {})

  // ── small helpers ────────────────────────────────────────────────────────

  const nowIso = () => now().toISOString()
  const ttl = () => knobs.offerTtlMs
  /** Stamp every outgoing offer with the engine clock, so a pinned demo now stays coherent. */
  const makeDraft = (fields: Parameters<typeof draft>[0]) => draft(fields, ttl(), now())

  const overlaps = (startA: string, minsA: number, startB: string, minsB: number): boolean => {
    const a = Date.parse(startA)
    const b = Date.parse(startB)
    return a < b + minsB * 60_000 && b < a + minsA * 60_000
  }

  const slotHits = (slot: Slot, events: EventRow[]): EventRow | undefined =>
    events.find(e => overlaps(slot.when, slot.mins, e.start, e.mins))

  const slotFree = (slot: Slot): boolean => !slotHits(slot, store.listEvents())

  const slotLabel = (slot: Slot): string => `${slot.task} — ${dayTime(slot.when)}`

  /** Peers in ask-first order: who owes us most first, then trust order. */
  const priorityOrder = (): { id: string; balance: number }[] =>
    store
      .listPeers()
      .map(p => ({ id: p.id, balance: store.balanceFor(p.id) }))
      .sort((a, b) => b.balance - a.balance || store.listPeers().indexOf(store.getPeer(a.id)!) - store.listPeers().indexOf(store.getPeer(b.id)!))

  const familyList = (fams: string[]): string => {
    if (fams.length <= 1) return fams[0] ?? ''
    return `${fams.slice(0, -1).join(', ')} and ${fams[fams.length - 1]}`
  }

  const lower = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s)
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

  // ── the wire log, in plain words ─────────────────────────────────────────

  function lineFor(offer: Offer, role: Role): string {
    const mine = offer.from === self
    const other = familyOf(mine ? offer.to : offer.from)
    switch (offer.type) {
      case 'request':
        return mine
          ? `Asked ${other} to cover the ${offer.ask.task} on ${dayTime(offer.ask.when)}.`
          : `${cap(other)} asked: can you cover the ${offer.ask.task} on ${dayTime(offer.ask.when)}?`
      case 'counter':
        if (mine && role === 'responder') {
          return offer.give
            ? `Offered a swap: cover the ${offer.ask.task} on ${dayTime(offer.ask.when)} if ${other} cover your ${offer.give.task} on ${dayTime(offer.give.when)}.`
            : `Said yes to the ${offer.ask.task} on ${dayTime(offer.ask.when)} — no swap asked.`
        }
        if (mine && role === 'initiator') {
          return `Their swap didn't fit your calendar — asked ${other} for another idea.`
        }
        if (!mine && role === 'responder') {
          return `${cap(other)} wants a different option than the swap you offered.`
        }
        return offer.give
          ? `${cap(other)} offered: they take the ${offer.ask.task} on ${dayTime(offer.ask.when)} if you take their ${offer.give.task} on ${dayTime(offer.give.when)}.`
          : `${cap(other)} said yes to the ${offer.ask.task} — no swap asked.`
      case 'accept':
        if (mine) return role === 'responder' ? 'You approved the deal.' : 'You accepted their offer.'
        return role === 'responder' ? `${cap(other)} accepted — your family has the last yes.` : `${cap(other)} confirmed the deal.`
      case 'decline':
        return mine ? `Said no to ${other}.` : `${cap(other)} can't help this time.`
    }
  }

  function feedFor(threads: ThreadRow[]): FeedEvent[] {
    const events: FeedEvent[] = []
    for (const t of threads) {
      for (const m of store.messagesForThread(t.id)) {
        try {
          const offer = JSON.parse(m.body) as Offer
          events.push({ at: m.at, peer: t.peer, text: lineFor(offer, t.role) })
        } catch {
          // A message we cannot parse is a transport bug, not a display problem.
        }
      }
    }
    return events.sort((a, b) => a.at.localeCompare(b.at)).slice(-30)
  }

  // ── views ────────────────────────────────────────────────────────────────

  function buildStatus(n: NegotiationRow): StatusResult {
    const threads = store.threadsForNegotiation(n.id)
    const event = store.listEvents().find(e => e.id === n.event_id)
    const task = event?.task ?? 'the run'
    const when = event?.start ?? ''
    const feed = feedFor(threads)
    const base = { negotiationId: n.id, status: n.status, task, when, feed }

    if (n.status === 'negotiating') {
      const declined = threads.filter(t => t.state.status === 'declined').map(t => familyOf(t.peer))
      const pending = threads.filter(t => t.state.status === 'open').map(t => familyOf(t.peer))
      const parts: string[] = []
      if (declined.length) parts.push(`${cap(familyList(declined))} can't.`)
      if (pending.length) parts.push(`Waiting on ${familyList(pending)}.`)
      return {
        ...base,
        kind: 'negotiating',
        summary: parts.join(' ') || 'Still working on it.',
      }
    }

    const chosen = n.chosen_thread ? store.getThread(n.chosen_thread) : undefined
    if (n.status === 'proposal_ready' && chosen) {
      const s = chosen.state.standing
      const ask = s.ask
      const give = s.type === 'counter' ? s.give : null
      const fam = familyOf(chosen.peer)
      const summary = give
        ? `${cap(fam)} can cover the ${ask.task} on ${dayTime(ask.when)} if you take their ${give.task} on ${dayTime(give.when)}. Agree?`
        : `${cap(fam)} can cover the ${ask.task} on ${dayTime(ask.when)} — no swap asked. Agree?`
      return {
        ...base,
        kind: 'proposal',
        summary,
        proposal: {
          proposalId: n.id,
          theyTake: slotLabel(ask),
          youTake: give ? slotLabel(give) : "nothing — they're helping",
          why: n.why,
        },
      }
    }

    if (n.status === 'awaiting_other_family' && chosen) {
      const fam = familyOf(chosen.peer)
      const s = chosen.state.standing
      const give = s.type === 'counter' ? s.give : null
      return {
        ...base,
        kind: 'awaiting',
        summary: `You told ${fam} yes. Waiting for their family to approve.`,
        proposal: {
          proposalId: n.id,
          theyTake: slotLabel(s.ask),
          youTake: give ? slotLabel(give) : "nothing — they're helping",
          why: n.why,
        },
      }
    }

    if (n.status === 'agreed') {
      const s = chosen?.state.standing
      const give = s && s.type === 'counter' ? s.give : null
      const ask = s?.ask
      const fam = chosen ? familyOf(chosen.peer) : 'the other family'
      const summary = ask
        ? give
          ? `Done — ${fam} are covering the ${ask.task} on ${dayTime(ask.when)}, and you're taking their ${give.task} on ${dayTime(give.when)}.`
          : `Done — ${fam} are covering the ${ask.task} on ${dayTime(ask.when)}. No swap — you owe them one.`
        : 'All set.'
      return {
        ...base,
        kind: 'agreed',
        summary,
        proposal: ask && s
          ? {
              proposalId: n.id,
              theyTake: slotLabel(ask),
              youTake: give ? slotLabel(give) : "nothing — they're helping",
              why: n.why,
            }
          : undefined,
      }
    }

    if (n.status === 'declined') {
      return { ...base, kind: 'declined', summary: `No deal for the ${task} on ${when ? weekdayName(when) : 'that day'}. Say the word and I'll try again.` }
    }

    const lapsed = store.threadsForNegotiation(n.id).some(t => t.state.status === 'expired')
    return {
      ...base,
      kind: 'no_help',
      summary: lapsed
        ? `The deal for the ${task}${when ? ` on ${weekdayName(when)}` : ''} lapsed before both families said yes. Say the word and I'll ask again.`
        : `Nobody could take the ${task}${when ? ` on ${weekdayName(when)}` : ''}. I can try again closer to the day.`,
    }
  }

  function buildThreadStatus(t: ThreadRow): StatusResult {
    const s = t.state.standing
    const ask = s.ask
    const give = s.type === 'counter' ? s.give : null
    const fam = familyOf(t.peer)
    const base = { negotiationId: t.id, status: t.state.status, task: ask.task, when: ask.when, feed: feedFor([t]) }

    switch (t.state.status) {
      case 'open':
        return {
          ...base,
          kind: 'negotiating',
          summary: give
            ? `${cap(fam)} asked you to cover the ${ask.task} on ${dayTime(ask.when)}. You offered a swap: they take your ${give.task} on ${dayTime(give.when)}.`
            : `${cap(fam)} asked you to cover the ${ask.task} on ${dayTime(ask.when)}. You said yes — waiting on them.`,
        }
      case 'half_accepted':
        return {
          ...base,
          kind: 'proposal',
          summary: give
            ? `${cap(fam)} accepted: you'll take the ${ask.task} on ${dayTime(ask.when)}, and they'll take your ${give.task} on ${dayTime(give.when)}. Approve?`
            : `${cap(fam)} accepted: you'll take the ${ask.task} on ${dayTime(ask.when)}. Approve?`,
          proposal: {
            proposalId: t.id,
            theyTake: give ? slotLabel(give) : "nothing — they're just helping",
            youTake: slotLabel(ask),
            why: (t.meta.why as string | undefined) ?? null,
          },
        }
      case 'agreed':
        return {
          ...base,
          kind: 'agreed',
          summary: give
            ? `Done — you're taking the ${ask.task} on ${dayTime(ask.when)}, and ${fam} are taking your ${give.task} on ${dayTime(give.when)}.`
            : `Done — you're covering the ${ask.task} on ${dayTime(ask.when)}. They owe you one.`,
        }
      case 'declined':
        return { ...base, kind: 'declined', summary: `The negotiation with ${fam} is off.` }
      default:
        return { ...base, kind: 'declined', summary: `The offer from ${fam} lapsed before anyone replied.` }
    }
  }

  // ── stepping and committing ──────────────────────────────────────────────

  async function advance(threadId: string, offer: Offer): Promise<Thread> {
    const row = store.getThread(threadId)
    if (!row) throw new Error(`unknown thread ${threadId}`)
    const state = step(row.state, offer, now())
    store.saveThread(threadId, state, undefined, nowIso())
    if (state.status === 'agreed') await commit(row, state)
    return state
  }

  /**
   * One SQLite transaction. The UNIQUE(thread, delta) on the ledger and the
   * events.thread marker make a repeated commit a no-op.
   */
  async function commit(row: ThreadRow, state: Thread): Promise<void> {
    if (store.eventsForThread(row.id).length > 0) return
    const s = state.standing
    const at = nowIso()
    const give = s.type === 'counter' ? s.give : null
    store.transaction(() => {
      if (row.role === 'initiator') {
        if (row.negotiation_id) {
          const n = store.getNegotiation(row.negotiation_id)
          if (n) store.markCovered(n.event_id, row.peer, row.id)
        }
        if (give) {
          store.insertEvent({
            id: `e_${crypto.randomUUID()}`,
            title: `${give.task} (covering for ${nameOf(row.peer)})`,
            task: give.task,
            start: give.when,
            mins: give.mins,
            kind: 'run',
            would_trade: 0,
            covering_for: row.peer,
            thread: row.id,
          })
        }
        if (give) store.addLedger(row.peer, 1, row.id, `We take their ${give.task} on ${weekdayName(give.when)}`, at)
        store.addLedger(row.peer, -1, row.id, `They take your ${s.ask.task} on ${weekdayName(s.ask.when)}`, at)
        if (row.negotiation_id) store.setNegotiation(row.negotiation_id, { status: 'agreed' })
      } else {
        store.insertEvent({
          id: `e_${crypto.randomUUID()}`,
          title: `${s.ask.task} (covering for ${nameOf(row.peer)})`,
          task: s.ask.task,
          start: s.ask.when,
          mins: s.ask.mins,
          kind: 'run',
          would_trade: 0,
          covering_for: row.peer,
          thread: row.id,
        })
        store.addLedger(row.peer, 1, row.id, `We take their ${s.ask.task} on ${weekdayName(s.ask.when)}`, at)
        if (give) {
          const own = store.findOwnEvent(give.task, give.when)
          if (own) store.markCovered(own.id, row.peer, row.id)
          store.addLedger(row.peer, -1, row.id, `They take your ${give.task} on ${weekdayName(give.when)}`, at)
        }
      }
    })
    log('committed', { thread: row.id, role: row.role })
  }

  // ── responder side ───────────────────────────────────────────────────────

  function responderMoves(initiator: string, ask: Slot): { give: Slot | null; eventId?: string; label: string }[] {
    const at = now().getTime()
    const balance = store.balanceFor(initiator)
    const yes = {
      give: null as Slot | null,
      label: `Just help: cover the ${ask.task} on ${dayTime(ask.when)}. No swap asked.`,
    }
    const deadline = at + knobs.tradeWindowDays * 86_400_000
    const swaps = store
      .listEvents()
      .filter(
        e =>
          e.would_trade === 1 &&
          !e.covered_by &&
          !e.covering_for &&
          Date.parse(e.start) > at &&
          Date.parse(e.start) <= deadline &&
          !overlaps(ask.when, ask.mins, e.start, e.mins),
      )
      .map(e => ({
        give: { task: e.task, when: e.start, mins: e.mins } as Slot,
        eventId: e.id,
        label: `Swap: cover the ${ask.task} on ${dayTime(ask.when)}, if ${familyOf(initiator)} cover your ${e.task} on ${dayTime(e.start)}.`,
      }))
    // If we owe them, lead with the plain yes. Otherwise ask for the trade first.
    return balance < 0 ? [yes, ...swaps] : [...swaps, yes]
  }

  async function answerRequest(request: Extract<Offer, { type: 'request' }>): Promise<void> {
    const threadId = request.thread
    const ask = request.ask
    const decline = async () => {
      const dec = makeDraft({ thread: threadId, from: self, to: request.from, type: 'decline' })
      await advance(threadId, dec)
      void Promise.resolve(send(dec, threadId))
    }
    if (slotHits(ask, store.listEvents())) return decline()

    const moves = responderMoves(request.from, ask)
    const choice = await choose({
      household: self,
      prefs: store.listPrefs(),
      options: moves.map(m => m.label),
      note: `${cap(familyOf(request.from))} asked you to cover the ${ask.task} on ${dayTime(ask.when)}.`,
    })
    const move = moves[Math.min(Math.max(choice.index, 0), moves.length - 1)]
    const counter = makeDraft({ thread: threadId, from: self, to: request.from, type: 'counter', ask, give: move.give })
    const state = await advance(threadId, counter)
    store.saveThread(threadId, state, { why: choice.why }, nowIso())
    void pace(() => Promise.resolve(send(counter, threadId)))
  }

  async function afterResponderOffer(offer: Offer, state: Thread): Promise<void> {
    const row = store.getThread(offer.thread)
    if (!row) return
    if (offer.type !== 'counter' || offer.from === self) return
    // The initiator asked for the next-ranked move.
    const sentCounters = store
      .messagesForThread(row.id)
      .filter(m => m.direction === 'out' && (JSON.parse(m.body) as Offer).type === 'counter').length
    const ask = state.standing.ask
    const moves = responderMoves(row.peer, ask)
    const move = moves[sentCounters]
    if (!move) {
      const dec = makeDraft({ thread: row.id, from: self, to: row.peer, type: 'decline' })
      await advance(row.id, dec)
      void Promise.resolve(send(dec, row.id))
      return
    }
    const counter = makeDraft({ thread: row.id, from: self, to: row.peer, type: 'counter', ask, give: move.give })
    const next = await advance(row.id, counter)
    store.saveThread(row.id, next, { ...row.meta, why: move.give ? row.meta.why : 'Plain yes.' }, nowIso())
    void pace(() => Promise.resolve(send(counter, row.id)))
  }

  // ── initiator side ───────────────────────────────────────────────────────

  function allResolved(nid: string): boolean {
    const threads = store.threadsForNegotiation(nid)
    if (!threads.length) return false
    return threads.every(t => {
      const s = t.state
      if (s.status === 'declined' || s.status === 'expired' || s.status === 'agreed') return true
      if (s.status !== 'open') return false
      if (s.standing.from === self) return false
      return s.standing.give === null || slotFree(s.standing.give)
    })
  }

  function maybeSettleEarly(nid: string): void {
    const n = store.getNegotiation(nid)
    if (!n || n.status !== 'negotiating') return
    if (allResolved(nid)) void settle(nid, false)
  }

  async function settle(nid: string, final: boolean): Promise<void> {
    const n = store.getNegotiation(nid)
    if (!n) return
    if (n.status === 'agreed' || n.status === 'declined' || n.status === 'no_help_found') return
    // A ready proposal — or a deal waiting on the other family — whose own
    // thread is still live is already the answer; nothing to re-settle.
    if (n.chosen_thread) {
      const chosen = store.getThread(n.chosen_thread)
      if (chosen && (chosen.state.status === 'open' || chosen.state.status === 'half_accepted')) return
    }
    const threads = store.threadsForNegotiation(nid)
    const candidates: ThreadRow[] = []
    let pending = false
    for (const t of threads) {
      const s = t.state
      if (s.status === 'declined' || s.status === 'expired' || s.status === 'agreed') continue
      if (s.status === 'open' && s.standing.from !== self && (s.standing.give === null || slotFree(s.standing.give))) {
        candidates.push(t)
      } else {
        pending = true
      }
    }
    if (pending && !final) return
    if (!candidates.length) {
      store.setNegotiation(nid, { status: 'no_help_found' })
      log('no help found', { negotiation: nid })
      return
    }
    const order = new Map(store.listPeers().map((p, i) => [p.id, i]))
    const ranked = [...candidates].sort((a, b) => {
      const byBalance = store.balanceFor(b.peer) - store.balanceFor(a.peer)
      if (byBalance !== 0) return byBalance
      return (order.get(a.peer) ?? 99) - (order.get(b.peer) ?? 99)
    })
    const ask = (ranked[0].state.standing as Extract<Offer, { type: 'counter' }>).ask
    const options = ranked.map(t => {
      const s = t.state.standing
      const give = s.type === 'counter' ? s.give : null
      const fam = cap(familyOf(t.peer))
      return give
        ? `${fam} can cover the ${ask.task} on ${dayTime(ask.when)} if you take their ${give.task} on ${dayTime(give.when)}.`
        : `${fam} can cover the ${ask.task} on ${dayTime(ask.when)} — no swap asked.`
    })
    const choice = await choose({
      household: self,
      prefs: store.listPrefs(),
      options,
      note: `Pick which family gets the job of covering the ${ask.task} on ${dayTime(ask.when)}. The first option is ranked highest by past favours.`,
    })
    const index = Math.min(Math.max(choice.index, 0), ranked.length - 1)
    const pick = ranked[index]
    store.setNegotiation(nid, { status: 'proposal_ready', chosen_thread: pick.id, why: choice.why })
    log('proposal ready', { negotiation: nid, peer: pick.peer, why: choice.why })
  }

  async function afterInitiatorOffer(offer: Offer, state: Thread): Promise<void> {
    const row = store.getThread(offer.thread)
    if (!row || offer.from === self) return
    const nid = row.negotiation_id
    if (offer.type === 'counter') {
      const acceptable = offer.give === null || slotFree(offer.give)
      if (acceptable) {
        if (nid) maybeSettleEarly(nid)
        return
      }
      if (state.counters >= MAX_COUNTERS) {
        const dec = makeDraft({ thread: row.id, from: self, to: row.peer, type: 'decline' })
        await advance(row.id, dec)
        void Promise.resolve(send(dec, row.id))
      } else {
        const again = makeDraft({ thread: row.id, from: self, to: row.peer, type: 'counter', ask: state.standing.ask, give: null })
        await advance(row.id, again)
        void Promise.resolve(send(again, row.id))
      }
      if (nid) maybeSettleEarly(nid)
      return
    }
    if (offer.type === 'decline' && nid) {
      const n = store.getNegotiation(nid)
      if (n && (n.status === 'proposal_ready' || n.status === 'awaiting_other_family') && n.chosen_thread === row.id) {
        store.setNegotiation(nid, { status: 'declined' })
      } else {
        maybeSettleEarly(nid)
      }
    }
  }

  // ── entry points ─────────────────────────────────────────────────────────

  async function findHelp(input: { activity: string; date: string }): Promise<FindHelpResult> {
    const activity = (input.activity ?? '').trim().toLowerCase()
    const date = (input.date ?? '').trim()
    if (!activity) return { ok: false, kind: 'no_match', summary: 'Tell me what needs covering — the soccer run, a swim run...' }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, kind: 'no_match', summary: "I didn't catch the day — tell me again, like \"Thursday\"." }
    }
    const day = dayNameOfDate(date)
    const onDay = store.listEvents().filter(e => e.start.startsWith(date))
    const match = onDay.find(e => e.task.toLowerCase().includes(activity) || e.title.toLowerCase().includes(activity))
    if (!match) {
      return {
        ok: false,
        kind: 'no_match',
        summary: onDay.length
          ? `I found no ${input.activity} on ${day}. That day has: ${onDay.map(e => e.task).join(' and ')}. Which one did you mean?`
          : `Nothing is on ${day} in the calendar. Tell me the day again if I misheard.`,
      }
    }
    const existing = store.openNegotiationForEvent(match.id)
    if (existing) {
      const view = buildStatus(existing)
      return {
        ok: true,
        kind: 'existing',
        negotiationId: existing.id,
        status: existing.status,
        task: match.task,
        when: match.start,
        summary: `Already on it — ${lower(view.summary)}`,
      }
    }

    const id = `n_${crypto.randomUUID()}`
    store.insertNegotiation({ id, event_id: match.id, status: 'negotiating', chosen_thread: null, why: null, created_at: nowIso() })
    const peers = priorityOrder()
    for (const p of peers) {
      const threadId = `t_${crypto.randomUUID()}`
      const request = makeDraft(
        { thread: threadId, from: self, to: p.id, type: 'request', ask: { task: match.task, when: match.start, mins: match.mins }, give: null },
      )
      store.insertThread({ id: threadId, negotiation_id: id, peer: p.id, role: 'initiator', state: step(undefined, request, now()), updated_at: nowIso() })
      void Promise.resolve(send(request, threadId))
    }
    const timer = setTimeout(() => void settle(id, true), knobs.collectMs)
    timer.unref?.()

    const fams = peers.map(p => familyOf(p.id))
    return {
      ok: true,
      kind: 'started',
      negotiationId: id,
      status: 'negotiating',
      task: match.task,
      when: match.start,
      families: fams,
      summary: `Asking ${familyList(fams)} about the ${match.task} on ${day}. I'll bring you the best offer.`,
    }
  }

  function negotiationStatus(id?: string): StatusResult {
    if (id) {
      const n = store.getNegotiation(id)
      if (n) return buildStatus(n)
      const t = store.getThread(id)
      if (t) return buildThreadStatus(t)
      return { kind: 'none', summary: "I couldn't find that one. Ask me what's outstanding.", feed: [] }
    }
    const active = store.activeNegotiations()
    const ready = active.find(n => n.status === 'proposal_ready')
    if (ready) return buildStatus(ready)
    const incoming = store.responderThreads().find(t => t.state.status === 'half_accepted')
    if (incoming) return buildThreadStatus(incoming)
    const openNegotiation = active.find(n => n.status === 'negotiating' || n.status === 'awaiting_other_family')
    if (openNegotiation) return buildStatus(openNegotiation)
    const openThread = store.responderThreads().find(t => t.state.status === 'open')
    if (openThread) return buildThreadStatus(openThread)
    // Nothing open: repeat the freshest settled thing instead of going blank,
    // so "is Thursday sorted?" right after the deal still gets the answer.
    const cutoff = now().getTime() - 24 * 3_600_000
    const recent = store.listNegotiations().find(n => Date.parse(n.created_at) >= cutoff)
    if (recent) return buildStatus(recent)
    const recentThread = store.responderThreads().find(t => Date.parse(t.updated_at) >= cutoff)
    if (recentThread) return buildThreadStatus(recentThread)
    return { kind: 'none', summary: 'Nothing needs you right now.', feed: [] }
  }

  async function respond(proposalId: string | undefined, approve: boolean): Promise<RespondResult> {
    let n: NegotiationRow | undefined
    let t: ThreadRow | undefined
    if (proposalId) {
      n = store.getNegotiation(proposalId)
      if (!n) t = store.getThread(proposalId)
      if (!n && !t) return { kind: 'none', summary: "I couldn't find that proposal. Ask me what's outstanding." }
    } else {
      n = store.activeNegotiations().find(x => x.status === 'proposal_ready')
      if (!n) t = store.responderThreads().find(x => x.state.status === 'half_accepted')
      if (!n && !t) return { kind: 'none', summary: 'Nothing is waiting for a yes or no right now.' }
    }

    if (n) {
      if (n.status === 'proposal_ready' && n.chosen_thread) {
        const chosen = store.getThread(n.chosen_thread)
        const acceptable =
          chosen &&
          chosen.state.status === 'open' &&
          chosen.state.standing.from !== self &&
          (chosen.state.standing.type === 'counter' || chosen.state.standing.type === 'request') &&
          (chosen.state.standing.give === null || slotFree(chosen.state.standing.give))
        if (!chosen || !acceptable) {
          return { kind: 'none', summary: `That offer just lapsed. Ask me to try again.`, negotiationId: n.id }
        }
        const fam = familyOf(chosen.peer)
        if (approve) {
          const accept = makeDraft({ thread: chosen.id, from: self, to: chosen.peer, type: 'accept', ref: chosen.state.standing.id })
          await advance(chosen.id, accept)
          void Promise.resolve(send(accept, chosen.id))
          for (const other of store.threadsForNegotiation(n.id)) {
            if (other.id === chosen.id || other.state.status !== 'open') continue
            const dec = makeDraft({ thread: other.id, from: self, to: other.peer, type: 'decline' })
            await advance(other.id, dec)
            void Promise.resolve(send(dec, other.id))
          }
          store.setNegotiation(n.id, { status: 'awaiting_other_family' })
          const standing = chosen.state.standing
          const give = standing.type === 'counter' ? standing.give : null
          return {
            kind: 'awaiting',
            negotiationId: n.id,
            status: 'awaiting_other_family',
            summary: `Told ${fam} yes. Waiting for their family to approve.`,
            proposal: {
              proposalId: n.id,
              theyTake: slotLabel(standing.ask),
              youTake: give ? slotLabel(give) : "nothing — they're helping",
              why: n.why,
            },
          }
        }
        for (const other of store.threadsForNegotiation(n.id)) {
          if (other.state.status !== 'open') continue
          const dec = makeDraft({ thread: other.id, from: self, to: other.peer, type: 'decline' })
          await advance(other.id, dec)
          void Promise.resolve(send(dec, other.id))
        }
        store.setNegotiation(n.id, { status: 'declined' })
        return { kind: 'declined', negotiationId: n.id, status: 'declined', summary: `Okay — I turned ${fam.split(' ')[1] ?? fam} down. Nothing changes in the calendar.` }
      }
      const view = buildStatus(n)
      return {
        kind: view.kind === 'agreed' ? 'agreed' : view.kind === 'none' ? 'none' : 'negotiating',
        summary: view.summary,
        negotiationId: n.id,
        status: n.status,
        proposal: view.proposal,
      }
    }

    const thread = t!
    const s = thread.state.standing
    const fam = familyOf(thread.peer)
    const give = s.type === 'counter' ? s.give : null
    if (thread.state.status === 'half_accepted') {
      if (approve) {
        const accept = makeDraft({ thread: thread.id, from: self, to: thread.peer, type: 'accept', ref: s.id })
        await advance(thread.id, accept)
        void Promise.resolve(send(accept, thread.id))
        const summary = give
          ? `Done. You're taking the ${s.ask.task} on ${dayTime(s.ask.when)}, and ${fam} are taking your ${give.task} on ${dayTime(give.when)}.`
          : `Done. You're covering the ${s.ask.task} on ${dayTime(s.ask.when)}. They owe you one.`
        return {
          kind: 'agreed',
          negotiationId: thread.id,
          status: 'agreed',
          summary,
          proposal: {
            proposalId: thread.id,
            theyTake: give ? slotLabel(give) : "nothing — they're just helping",
            youTake: slotLabel(s.ask),
            why: (thread.meta.why as string | undefined) ?? null,
          },
        }
      }
      const dec = makeDraft({ thread: thread.id, from: self, to: thread.peer, type: 'decline' })
      await advance(thread.id, dec)
      void Promise.resolve(send(dec, thread.id))
      return { kind: 'declined', negotiationId: thread.id, status: 'declined', summary: `Told ${fam} no.` }
    }
    const view = buildThreadStatus(thread)
    return {
      kind: view.kind === 'agreed' ? 'agreed' : 'negotiating',
      summary: view.summary,
      negotiationId: thread.id,
      status: thread.state.status,
      proposal: view.proposal,
    }
  }

  async function onMessage(offer: Offer): Promise<void> {
    const at = now()
    try {
      const row = store.getThread(offer.thread)
      if (!row) {
        if (offer.type !== 'request') {
          log('offer for an unknown thread', { thread: offer.thread, type: offer.type })
          return
        }
        const state = step(undefined, offer, at)
        store.insertThread({ id: offer.thread, negotiation_id: null, peer: offer.from, role: 'responder', state, updated_at: at.toISOString() })
        await answerRequest(offer)
        return
      }
      const state = step(row.state, offer, at)
      store.saveThread(row.id, state, undefined, at.toISOString())
      if (state.status === 'agreed') await commit(row, state)
      if (row.role === 'responder') await afterResponderOffer(offer, state)
      else await afterInitiatorOffer(offer, state)
    } catch (error) {
      if (error instanceof ProtocolError) {
        log('rejected offer', { thread: offer.thread, type: offer.type, code: error.code })
        return
      }
      throw error
    }
  }

  function ledger(): LedgerResult {
    const balances = store.listPeers().map(p => ({ peer: p.id, name: p.name, balance: store.balanceFor(p.id) }))
    const owed = balances.filter(b => b.balance > 0)
    const owe = balances.filter(b => b.balance < 0)
    const even = balances.filter(b => b.balance === 0)
    const parts: string[] = []
    for (const b of owed) parts.push(`${cap(familyOf(b.peer))} ${b.balance === 1 ? 'owe you one' : `owe you ${numWord(b.balance)}`}.`)
    for (const b of owe) parts.push(`You owe ${familyOf(b.peer)} ${numWord(-b.balance)}.`)
    if (even.length && (owed.length || owe.length)) parts.push(`You're even with ${familyList(even.map(b => familyOf(b.peer)))}.`)
    if (!parts.length) parts.push(even.length ? `Everyone's even: ${familyList(even.map(b => familyOf(b.peer)))}.` : 'No families are set up yet.')
    const top = [...owed].sort((a, b) => b.balance - a.balance)[0]
    return {
      balances,
      askFirst: top ? top.peer : null,
      summary: parts.join(' ') + (top ? ` Ask ${familyOf(top.peer)} first.` : ''),
    }
  }

  function pendingProposals(): PendingProposal[] {
    const out: PendingProposal[] = []
    for (const n of store.activeNegotiations()) {
      if (n.status === 'proposal_ready') out.push({ proposalId: n.id, kind: 'approval', summary: buildStatus(n).summary })
    }
    for (const t of store.responderThreads()) {
      if (t.state.status === 'half_accepted') out.push({ proposalId: t.id, kind: 'incoming', summary: buildThreadStatus(t).summary })
    }
    return out
  }

  /** Mark lapsed offers, then let any negotiation that can no longer move settle. */
  function sweep(): void {
    const at = now()
    for (const t of store.allThreads()) {
      const s = t.state
      if (s.status !== 'open' && s.status !== 'half_accepted') continue
      const next = expire(s, at)
      if (next.status === 'expired') {
        store.saveThread(t.id, next, undefined, nowIso())
        if (t.negotiation_id) void settle(t.negotiation_id, false)
      }
    }
  }

  return { findHelp, negotiationStatus, respond, onMessage, ledger, pendingProposals, sweep, settle }
}

function numWord(n: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
  return n >= 0 && n < words.length ? words[n] : String(n)
}
