import { timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import express, { type NextFunction, type Request, type Response } from 'express'
import { hostHeaderValidation, localhostHostValidation } from '@modelcontextprotocol/express'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import { chooserFromEnv } from './chooser.ts'
import { familyOf, isHouseholdId, nameOf } from './config.ts'
import { Store } from './db.ts'
import { createClock } from './dates.ts'
import { createEngine } from './engine.ts'
import { loadOrCreateKeyPair } from './keys.ts'
import { createMcpServer } from './mcp.ts'
import { createPeerTransport } from './peer.ts'
import { seedStore } from './seed.ts'
import { createSim } from './sim.ts'

// ── configuration ──────────────────────────────────────────────────────────

const household = process.env.HOUSEHOLD ?? 'ahmad'
if (!isHouseholdId(household)) throw new Error(`HOUSEHOLD must be one of the four demo families, got "${household}"`)

const port = Number(process.env.PORT ?? 4001)
const host = process.env.HOST ?? '127.0.0.1'
const publicUrl = process.env.PUBLIC_URL
const mcpToken = process.env.MCP_TOKEN
const passcode = process.env.DEMO_PASSCODE
const paceMs = Number(process.env.PACE_MS ?? 0)
const collectMs = Number(process.env.COLLECT_MS ?? 4000)
const peerTimeoutMs = Number(process.env.PEER_TIMEOUT_MS ?? 5000)
const keysDir = process.env.KEYS_DIR ?? 'data/keys'
const dbPath = process.env.DB_PATH ?? `data/${household}.db`

const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host)
if (!loopback && !mcpToken) throw new Error('MCP_TOKEN is required when HOST is not loopback')

const clock = createClock(process.env.DEMO_NOW)
const keyPair = loadOrCreateKeyPair(keysDir, household)

type PeerSeed = { id: string; name: string; url: string; publicKey: string }
const peersEnv: PeerSeed[] = process.env.PEERS ? (JSON.parse(process.env.PEERS) as PeerSeed[]) : []

// ── state ──────────────────────────────────────────────────────────────────

const store = Store.open(dbPath)
const peers = peersEnv.map(p => ({ id: p.id, name: p.name, url: p.url, public_key: p.publicKey }))

if (store.isEmpty()) seedStore(store, household, { clock, peers })
else for (const peer of peers) store.upsertPeer(peer) // keep public keys fresh across restarts

const log = (message: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), household, event: message, ...extra }))

const transport = createPeerTransport({ store, self: household, privateKey: keyPair.privateKey, timeoutMs: peerTimeoutMs, now: clock.now, log })
const engine = createEngine({
  store,
  self: household,
  send: (offer, threadId) => transport.send(offer, threadId),
  choose: chooserFromEnv(process.env),
  now: clock.now,
  pace: paceMs > 0 ? run => void setTimeout(() => void run(), paceMs).unref?.() : undefined,
  knobs: { collectMs },
  log,
})

// ── app ────────────────────────────────────────────────────────────────────

const app = express()
const allowedHosts = ['localhost', '127.0.0.1', '[::1]', ...(publicUrl ? [new URL(publicUrl).hostname] : [])]
if (loopback) app.use(localhostHostValidation())
else app.use(hostHeaderValidation(allowedHosts))

app.use(
  express.json({
    limit: '256kb',
    verify: (req, _res, buf) => {
      ;(req as Request & { rawBody?: Buffer }).rawBody = buf
    },
  }),
)

/** HTTP Basic on everything that can spend tokens or change state. */
function requirePasscode(req: Request, res: Response, next: NextFunction): void {
  if (!passcode) return next()
  const expected = Buffer.from(`Basic ${Buffer.from(`between:${passcode}`).toString('base64')}`)
  const given = Buffer.from(req.get('authorization') ?? '')
  if (given.length === expected.length && timingSafeEqual(given, expected)) return next()
  res.status(401).set('WWW-Authenticate', 'Basic realm="between"').json({ error: 'unauthorized' })
}

app.get('/healthz', (_req, res) => res.json({ ok: true, household }))

// ── MCP for the Alexa+ assistant (and the simulator) ───────────────────────

app.post('/mcp', async (req, res) => {
  const { method, params } = req.body ?? {}
  // One line per call. The `initialize` line records what a client really declares.
  log('mcp', {
    method,
    ...(method === 'initialize' && {
      protocolVersion: params?.protocolVersion,
      capabilities: params?.capabilities,
      clientInfo: params?.clientInfo,
    }),
    mcpProtocolVersion: req.get('mcp-protocol-version'),
    userAgent: req.get('user-agent'),
    hasAuth: Boolean(req.get('authorization')),
  })

  if (mcpToken) {
    const given = Buffer.from(req.get('authorization') ?? '')
    const wanted = Buffer.from(`Bearer ${mcpToken}`)
    // No WWW-Authenticate header: Alexa+ rejects 401s that carry one.
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
  }

  const server = createMcpServer(engine)
  const mcpTransport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  res.on('close', () => {
    void mcpTransport.close()
    void server.close()
  })
  await server.connect(mcpTransport)
  await mcpTransport.handleRequest(req, res, req.body)
})

// Stateless: no server-initiated stream and no session to delete.
app.all('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').end())

// ── household-to-household offers ──────────────────────────────────────────

app.post('/peer/offers', (req, res) => {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody
  if (!raw || raw.length === 0) {
    res.status(400).json({ error: 'no_body' })
    return
  }
  if (raw.length > 4096) {
    res.status(413).json({ error: 'too_large' })
    return
  }
  const result = transport.receiveIncoming(raw, req.headers)
  if (!result.ok) {
    log('peer offer rejected', { code: result.code })
    res.status(400).json({ error: result.code })
    return
  }
  if (result.duplicate) {
    res.json({ ok: true, duplicate: true })
    return
  }
  res.json({ ok: true })
  void engine.onMessage(result.offer).catch(error => log('engine error', { error: String(error) }))
})

// ── state for the simulated Alexa+ page and the demo side panels ───────────

app.get('/api/state', requirePasscode, (_req, res) => {
  const events = store.listEvents().map(e => ({
    id: e.id,
    title: e.title,
    task: e.task,
    start: e.start,
    mins: e.mins,
    kind: e.kind,
    wouldTrade: e.would_trade === 1,
    coveredBy: e.covered_by,
    coveringFor: e.covering_for,
  }))
  const wire = store
    .recentMessages(120)
    .reverse()
    .map(m => ({ at: m.at, direction: m.direction, peer: m.peer, delivered: m.delivered === 1, body: JSON.parse(m.body) as unknown }))
  res.json({
    household,
    name: nameOf(household),
    now: clock.now().toISOString(),
    calendar: events,
    prefs: store.listPrefs(),
    peers: store.listPeers().map(p => ({ id: p.id, name: p.name, url: p.url })),
    ledger: store.listPeers().map(p => ({ peer: p.id, name: p.name, balance: store.balanceFor(p.id) })),
    negotiations: store.listNegotiations().map(n => ({
      id: n.id,
      status: n.status,
      task: events.find(e => e.id === n.event_id)?.task ?? null,
      why: n.why,
      createdAt: n.created_at,
    })),
    threads: store.allThreads().map(t => ({ id: t.id, peer: t.peer, role: t.role, status: t.state.status })),
    proposals: engine.pendingProposals(),
    wire,
  })
})

app.post('/api/reset', requirePasscode, (_req, res) => {
  seedStore(store, household, { clock, peers })
  res.json({ ok: true })
})

// ── simulated Alexa+ ───────────────────────────────────────────────────────

const sim = createSim({
  household,
  port,
  mcpToken,
  clock,
  chooser: process.env.CHOOSER === 'claude' ? 'claude' : 'rules',
  region: process.env.AWS_REGION,
  model: process.env.BETWEEN_MODEL,
  prefs: () => store.listPrefs(),
  log,
})

app.get('/sim/config', requirePasscode, (_req, res) => {
  res.json({ household, name: nameOf(household), family: familyOf(household), appUrl: '/sim/app.html' })
})

app.post('/sim/turn', requirePasscode, async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 2_000) : ''
  if (!text.trim()) {
    res.status(400).json({ error: 'text_required' })
    return
  }
  try {
    const turn = await sim.runTurn(text)
    log('sim turn', { said: text, reply: turn.reply, tools: turn.calls.map(c => c.name) })
    res.json(turn)
  } catch (error) {
    log('sim turn failed', { error: String(error) })
    res.status(502).json({ error: 'sim_unreachable', detail: String(error) })
  }
})

const simDist = fileURLToPath(new URL('../dist/sim', import.meta.url))
const simIndex = fileURLToPath(new URL('../dist/sim/index.html', import.meta.url))
const appView = fileURLToPath(new URL('../dist/app/index.html', import.meta.url))

app.get('/sim/app.html', requirePasscode, (_req, res) => {
  if (!existsSync(appView)) {
    res.status(503).type('text/plain').send('The MCP App view is not built yet. Run: npm run build')
    return
  }
  res.sendFile(appView)
})

app.use(
  '/sim',
  requirePasscode,
  (_req, res, next) => {
    if (!existsSync(simIndex)) {
      res.status(503).type('text/plain').send('The simulator page is not built yet. Run: npm run build')
      return
    }
    next()
  },
  express.static(simDist),
)

// ── timers ─────────────────────────────────────────────────────────────────

setInterval(() => void transport.deliverPending(), 5_000).unref()
setInterval(() => engine.sweep(), 30_000).unref()

app.listen(port, host, () => console.error(`between ${household} listening on http://${host}:${port}`))
