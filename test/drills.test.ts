import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { test } from 'node:test'
import { SIGNATURE_HEADER, generateKeyPair } from 'between-protocol'
import { rulesChooser } from '../src/chooser.ts'
import { HOUSEHOLD_IDS, HOUSEHOLDS } from '../src/config.ts'
import { Store } from '../src/db.ts'
import { createClock } from '../src/dates.ts'
import { createEngine, type Engine } from '../src/engine.ts'
import { createPeerTransport } from '../src/peer.ts'
import { seedStore } from '../src/seed.ts'

/**
 * Failure drills, over real HTTP: a peer that never answers, a replayed offer,
 * a tampered body, and an offer that lapses before either family says yes.
 * Each one must end in a clear, spoken answer and never in a bad calendar write.
 */

const DEMO_NOW = '2026-10-17T09:00:00-07:00'
const THURSDAY = '2026-10-22'

type Home = {
  id: string
  store: Store
  engine: Engine
  transport: ReturnType<typeof createPeerTransport>
  server?: Server
}

async function waitFor<T>(fn: () => T | undefined, what: string, timeoutMs = 4000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const value = fn()
    if (value !== undefined) return value
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

/** Exactly the /peer/offers handling main.ts does, on a real socket. */
async function handle(home: Home, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const result = home.transport.receiveIncoming(Buffer.concat(chunks), req.headers)
  res.setHeader('content-type', 'application/json')
  if (!result.ok) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: result.code }))
    return
  }
  res.end(JSON.stringify(result.duplicate ? { ok: true, duplicate: true } : { ok: true }))
  if (!result.duplicate) void home.engine.onMessage(result.offer)
}

type HomeOptions = { collectMs?: number; offerTtlMs?: number; now?: () => Date }

/** Every household exists; only the `live` ones have a listener. */
async function startHomes(live: string[], basePort: number, opts: HomeOptions = {}): Promise<Record<string, Home>> {
  const clock = createClock(DEMO_NOW)
  const now = opts.now ?? clock.now
  const keys = Object.fromEntries(HOUSEHOLD_IDS.map(id => [id, generateKeyPair()]))
  const portOf = (id: string) => basePort + HOUSEHOLD_IDS.indexOf(id as (typeof HOUSEHOLD_IDS)[number])
  const homes: Record<string, Home> = {}

  for (const id of HOUSEHOLD_IDS) {
    const store = new Store()
    const peers = HOUSEHOLD_IDS.filter(other => other !== id).map(other => ({
      id: other,
      name: HOUSEHOLDS[other].name,
      url: `http://127.0.0.1:${portOf(other)}`,
      public_key: keys[other].publicKey,
    }))
    seedStore(store, id, { clock, peers })
    const transport = createPeerTransport({ store, self: id, privateKey: keys[id].privateKey, timeoutMs: 500, now })
    const engine = createEngine({
      store,
      self: id,
      send: (offer, threadId) => transport.send(offer, threadId),
      choose: rulesChooser(),
      now,
      pace: run => void run(),
      knobs: {
        collectMs: opts.collectMs ?? 80,
        ...(opts.offerTtlMs !== undefined && { offerTtlMs: opts.offerTtlMs }),
      },
    })
    homes[id] = { id, store, engine, transport }
  }

  for (const id of live) {
    const server = createServer((req, res) => void handle(homes[id], req, res))
    await new Promise<void>(resolve => server.listen(portOf(id), '127.0.0.1', resolve))
    homes[id].server = server
  }
  return homes
}

async function stopHomes(homes: Record<string, Home>): Promise<void> {
  for (const home of Object.values(homes)) {
    if (!home.server) continue
    home.server.close()
    home.server.closeAllConnections()
  }
}

test('a peer that never answers costs time, not correctness', async () => {
  const homes = await startHomes([], 4971)
  const found = await homes.ahmad.engine.findHelp({ activity: 'soccer', date: THURSDAY })
  assert.equal(found.ok, true)

  const settled = await waitFor(() => {
    const status = homes.ahmad.engine.negotiationStatus(found.negotiationId)
    return status.kind === 'no_help' ? status : undefined
  }, 'the clear no-help answer')
  assert.match(settled.summary, /Nobody could take the soccer run on Thursday\. I can try again closer to the day\./)

  // Nothing was lost: all three requests sit in the outbox for the next retry.
  assert.equal(homes.ahmad.store.undeliveredMessages().length, 3)
  assert.equal(await homes.ahmad.transport.deliverPending(), 3)
  assert.equal(homes.ahmad.store.undeliveredMessages().length, 3)

  // And the calendar was not touched by a failed negotiation.
  assert.equal(homes.ahmad.store.listEvents().find(e => e.id === 'evt-ahmad-soccer')?.covered_by, null)
  await stopHomes(homes)
})

test('a replayed offer is a no-op; a tampered one is rejected', async () => {
  const homes = await startHomes(['ahmad', 'park'], 4981)
  const found = await homes.ahmad.engine.findHelp({ activity: 'soccer', date: THURSDAY })

  await waitFor(() => {
    const status = homes.ahmad.engine.negotiationStatus(found.negotiationId)
    return status.kind === 'proposal' ? status : undefined
  }, 'the Park counter')

  // The exact bytes that crossed the line, replayed by hand.
  const request = homes.park.store.recentMessages(50).find(m => m.direction === 'in' && JSON.parse(m.body).type === 'request')
  assert.ok(request, 'park should have received the request')
  const keyId = JSON.parse(request.body).from as string
  const post = (body: string) =>
    fetch('http://127.0.0.1:4982/peer/offers', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'between-key-id': keyId, [SIGNATURE_HEADER]: request.sig },
      body,
    })

  const replay = await post(request.body)
  assert.equal(replay.status, 200)
  assert.deepEqual(await replay.json(), { ok: true, duplicate: true })
  assert.equal(homes.park.store.allThreads().length, 1, 'a replay must not open a second thread')

  const tampered = await post(request.body.replace('"soccer run"', '"no homework"'))
  assert.equal(tampered.status, 400)
  assert.deepEqual(await tampered.json(), { error: 'bad_signature' })
  assert.equal(homes.park.store.allThreads().length, 1)

  await stopHomes(homes)
})

test('an offer that nobody answered lapses, and the family hears about it plainly', async () => {
  let current = new Date(DEMO_NOW)
  const homes = await startHomes(['ahmad', 'park'], 4991, { now: () => current, offerTtlMs: 60_000 })
  const found = await homes.ahmad.engine.findHelp({ activity: 'soccer', date: THURSDAY })

  await waitFor(() => {
    const status = homes.ahmad.engine.negotiationStatus(found.negotiationId)
    return status.kind === 'proposal' ? status : undefined
  }, 'the Park counter')

  // Two minutes later, with nobody having approved anything, the offer lapses.
  current = new Date(current.getTime() + 120_000)
  homes.ahmad.engine.sweep()

  const lapsed = homes.ahmad.engine.negotiationStatus(found.negotiationId)
  assert.equal(lapsed.kind, 'no_help')
  assert.match(lapsed.summary, /The deal for the soccer run on Thursday lapsed before both families said yes\. Say the word and I'll ask again\./)
  assert.equal(homes.ahmad.store.allThreads().find(t => t.peer === 'park')?.state.status, 'expired')

  // Nothing was committed anywhere.
  assert.equal(homes.ahmad.store.listEvents().find(e => e.id === 'evt-ahmad-soccer')?.covered_by, null)
  assert.equal(homes.park.store.listEvents().find(e => e.id === 'evt-park-run')?.covered_by, null)
  await stopHomes(homes)
})
