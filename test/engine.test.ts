import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Offer, SIGNATURE_HEADER, generateKeyPair, open, seal } from 'between-protocol'
import { rulesChooser } from '../src/chooser.ts'
import { HOUSEHOLD_IDS, HOUSEHOLDS } from '../src/config.ts'
import { Store } from '../src/db.ts'
import { createClock } from '../src/dates.ts'
import { createEngine, type Engine } from '../src/engine.ts'
import { seedStore } from '../src/seed.ts'

/**
 * Four engines, four in-memory databases, real signatures, no HTTP. `send`
 * seals the offer, logs it and hands the raw bytes to the peer engine the
 * same way the transport does, so the wire log here matches production.
 */

const DEMO_NOW = '2026-10-17T09:00:00-07:00' // a Saturday; Thursday is 2026-10-22
const THURSDAY = '2026-10-22'
const TUESDAY = '2026-10-27'

type Mesh = {
  stores: Record<string, Store>
  engines: Record<string, Engine>
}

function makeMesh(knobs: { collectMs?: number } = {}): Mesh {
  const clock = createClock(DEMO_NOW)
  const keys = Object.fromEntries(HOUSEHOLD_IDS.map(id => [id, generateKeyPair()]))
  const stores: Record<string, Store> = {}
  const engines: Record<string, Engine> = {}

  for (const id of HOUSEHOLD_IDS) {
    stores[id] = new Store()
    const peers = HOUSEHOLD_IDS.filter(other => other !== id).map(other => ({
      id: other,
      name: HOUSEHOLDS[other].name,
      url: `http://test/${other}`,
      public_key: keys[other].publicKey,
    }))
    seedStore(stores[id], id, { clock, peers })
  }

  for (const id of HOUSEHOLD_IDS) {
    engines[id] = createEngine({
      store: stores[id],
      self: id,
      send: (offer, threadId) => {
        const sealed = seal(offer, keys[id].privateKey)
        stores[id].logMessage({
          id: offer.id,
          thread: threadId,
          direction: 'out',
          peer: offer.to,
          body: sealed.body,
          sig: String(sealed.headers[SIGNATURE_HEADER]),
          at: offer.sentAt,
        })
        // Exactly the checks the real receiver applies.
        const received = open(sealed.body, sealed.headers, keyId => (keyId === id ? keys[id].publicKey : undefined), clock.now())
        const fresh = stores[offer.to].logMessage({
          id: received.id,
          thread: received.thread,
          direction: 'in',
          peer: received.from,
          body: sealed.body,
          sig: String(sealed.headers[SIGNATURE_HEADER]),
          at: received.sentAt,
          delivered: 1,
        })
        if (fresh) void engines[offer.to].onMessage(received)
      },
      choose: rulesChooser(),
      now: clock.now,
      pace: run => void run(),
      knobs: { collectMs: 40, ...knobs },
    })
  }
  return { stores, engines }
}

async function waitFor<T>(fn: () => T | undefined, what: string, timeoutMs = 3000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const value = fn()
    if (value !== undefined) return value
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`)
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

test('the demo scenario: Lee declines, Park wins the trade, both calendars and ledgers agree', async () => {
  const { stores, engines } = makeMesh()

  const found = await engines.ahmad.findHelp({ activity: 'soccer', date: THURSDAY })
  assert.equal(found.ok, true)
  assert.match(found.summary, /Asking the Lees, the Parks and the Chens about the soccer run on Thursday/)

  const status = await waitFor(() => {
    const s = engines.ahmad.negotiationStatus(found.negotiationId)
    return s.kind === 'proposal' ? s : undefined
  }, 'Ahmad proposal')
  assert.match(status.summary, /The Parks can cover the soccer run on Thursday at 4 PM if you take their soccer run on Tuesday at 4 PM/)
  assert.equal(status.proposal?.proposalId, found.negotiationId)

  const approved = await engines.ahmad.respond(found.negotiationId, true)
  assert.equal(approved.kind, 'awaiting')
  assert.match(approved.summary, /Told the Parks yes/)

  const parkView = await waitFor(() => {
    const s = engines.park.negotiationStatus()
    return s.kind === 'proposal' ? s : undefined
  }, 'Park incoming proposal')
  assert.match(parkView.summary, /The Ahmads accepted/)

  const parkYes = await engines.park.respond(parkView.proposal?.proposalId, true)
  assert.equal(parkYes.kind, 'agreed')

  const agreed = await waitFor(() => {
    const s = engines.ahmad.negotiationStatus(found.negotiationId)
    return s.kind === 'agreed' ? s : undefined
  }, 'Ahmad agreed')
  assert.match(agreed.summary, /Done — the Parks are covering the soccer run on Thursday at 4 PM, and you're taking their soccer run on Tuesday at 4 PM/)

  // Ahmad: Thursday covered by Park, Tuesday run taken on.
  const ahmadEvents = stores.ahmad.listEvents()
  assert.equal(ahmadEvents.find(e => e.id === 'evt-ahmad-soccer')?.covered_by, 'park')
  const ahmadTaken = ahmadEvents.find(e => e.covering_for === 'park')
  assert.equal(ahmadTaken?.task, 'soccer run')
  assert.ok(ahmadTaken?.start.startsWith(TUESDAY))

  // Park: Tuesday run handed over, Thursday taken on.
  const parkEvents = stores.park.listEvents()
  assert.equal(parkEvents.find(e => e.id === 'evt-park-run')?.covered_by, 'ahmad')
  const parkTaken = parkEvents.find(e => e.covering_for === 'ahmad')
  assert.equal(parkTaken?.task, 'soccer run')
  assert.ok(parkTaken?.start.startsWith(THURSDAY))

  // The swap nets to zero on both sides.
  assert.equal(stores.ahmad.balanceFor('park'), 0)
  assert.equal(stores.park.balanceFor('ahmad'), 0)

  // The runner-up was declined (Chen), and Lee declined on her own.
  assert.equal(stores.ahmad.allThreads().find(t => t.peer === 'lee')?.state.status, 'declined')
  assert.equal(stores.ahmad.allThreads().find(t => t.peer === 'chen')?.state.status, 'declined')

  // The ledger beat from the demo script.
  const ledger = engines.ahmad.ledger()
  assert.match(ledger.summary, /The Lees owe you two/)
  assert.equal(ledger.askFirst, 'lee')

  // Privacy: every byte on the wire parses as an Offer and no private text leaks.
  for (const id of HOUSEHOLD_IDS) {
    for (const message of stores[id].recentMessages(500)) {
      Offer.parse(JSON.parse(message.body))
      assert.ok(!message.body.includes('Maya'), 'private title must never leave the household')
      assert.ok(!message.body.includes('Lincoln'), 'private title must never leave the household')
    }
  }
})

test('when the swap does not fit, the initiator asks for the next move and takes the plain yes', async () => {
  const { stores, engines } = makeMesh()
  // Ahmad cannot do Tuesday 4 PM this week.
  stores.ahmad.insertEvent({
    id: 'evt-ahmad-busy',
    title: 'Late meeting',
    task: 'meeting',
    start: `${TUESDAY}T16:00:00-07:00`,
    mins: 60,
    kind: 'busy',
    would_trade: 0,
  })

  const found = await engines.ahmad.findHelp({ activity: 'soccer', date: THURSDAY })
  const status = await waitFor(() => {
    const s = engines.ahmad.negotiationStatus(found.negotiationId)
    return s.kind === 'proposal' ? s : undefined
  }, 'proposal after re-ask')

  // Park's swap was not taken; Park's follow-up plain yes won.
  assert.match(status.summary, /The Parks can cover the soccer run on Thursday at 4 PM — no swap asked/)
  const parkThread = stores.ahmad.allThreads().find(t => t.peer === 'park')!
  const ahmadCounters = stores.ahmad.messagesForThread(parkThread.id).filter(m => m.direction === 'out' && (JSON.parse(m.body) as Offer).type === 'counter')
  assert.equal(ahmadCounters.length, 1, 'exactly one restatement went out')

  await engines.ahmad.respond(found.negotiationId, true)
  const parkView = await waitFor(() => {
    const s = engines.park.negotiationStatus()
    return s.kind === 'proposal' ? s : undefined
  }, 'park incoming')
  await engines.park.respond(parkView.proposal?.proposalId, true)

  // No trade: they covered for us and we owe them one.
  assert.equal(stores.ahmad.balanceFor('park'), -1)
  assert.equal(stores.park.balanceFor('ahmad'), 1)
})

test('nobody available: the negotiation ends with a clear no-help answer', async () => {
  const { stores, engines } = makeMesh()
  for (const id of ['park', 'chen'] as const) {
    stores[id].insertEvent({
      id: `evt-${id}-busy`,
      title: 'Away that day',
      task: 'trip',
      start: `${THURSDAY}T15:30:00-07:00`,
      mins: 120,
      kind: 'busy',
      would_trade: 0,
    })
  }
  const found = await engines.ahmad.findHelp({ activity: 'soccer', date: THURSDAY })
  const status = await waitFor(() => {
    const s = engines.ahmad.negotiationStatus(found.negotiationId)
    return s.kind === 'no_help' ? s : undefined
  }, 'no help')
  assert.match(status.summary, /Nobody could take the soccer run on Thursday/)
})

test('the other family can still say no after we approve', async () => {
  const { stores, engines } = makeMesh()
  const found = await engines.ahmad.findHelp({ activity: 'soccer', date: THURSDAY })
  await waitFor(() => {
    const s = engines.ahmad.negotiationStatus(found.negotiationId)
    return s.kind === 'proposal' ? s : undefined
  }, 'proposal')
  await engines.ahmad.respond(found.negotiationId, true)
  const parkView = await waitFor(() => {
    const s = engines.park.negotiationStatus()
    return s.kind === 'proposal' ? s : undefined
  }, 'park incoming')
  const parkNo = await engines.park.respond(parkView.proposal?.proposalId, false)
  assert.equal(parkNo.kind, 'declined')

  const view = await waitFor(() => {
    const s = engines.ahmad.negotiationStatus(found.negotiationId)
    return s.kind === 'declined' ? s : undefined
  }, 'ahmad sees decline')
  assert.match(view.summary, /No deal/)
  // Nothing moved anywhere.
  assert.equal(stores.ahmad.listEvents().find(e => e.id === 'evt-ahmad-soccer')?.covered_by, null)
  assert.equal(stores.ahmad.balanceFor('park'), 0)
  assert.equal(stores.park.balanceFor('ahmad'), 0)
})

test('find_help on an event already being negotiated points at the live one', async () => {
  const { engines } = makeMesh()
  const first = await engines.ahmad.findHelp({ activity: 'soccer', date: THURSDAY })
  await waitFor(() => {
    const s = engines.ahmad.negotiationStatus(first.negotiationId)
    return s.kind !== 'negotiating' ? s : undefined
  }, 'first negotiation moves')
  const second = await engines.ahmad.findHelp({ activity: 'soccer', date: THURSDAY })
  assert.equal(second.kind, 'existing')
  assert.equal(second.negotiationId, first.negotiationId)
  assert.match(second.summary, /^Already on it/)
})

test('find_help mistakes get a spoken next step, not tool errors', async () => {
  const { engines } = makeMesh()
  const wrongDay = await engines.ahmad.findHelp({ activity: 'soccer', date: '2026-10-23' })
  assert.equal(wrongDay.ok, false)
  assert.match(wrongDay.summary, /Nothing is on Friday in the calendar/)

  const wrongThing = await engines.ahmad.findHelp({ activity: 'piano', date: THURSDAY })
  assert.equal(wrongThing.ok, false)
  assert.match(wrongThing.summary, /I found no piano on Thursday. That day has: soccer run. Which one did you mean\?/)
})
