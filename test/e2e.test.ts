import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { Offer } from 'between-protocol'
import { HOUSEHOLD_IDS, HOUSEHOLDS } from '../src/config.ts'
import { loadOrCreateKeyPair } from '../src/keys.ts'

/**
 * Gate G2: four real server processes, signed offers over HTTP, the whole
 * demo scenario driven through the MCP client, then restart persistence.
 */

const BASE_PORT = 4911
const TOKEN = 'e2e-token'
const DEMO_NOW = '2026-10-17T09:00:00-07:00'
const THURSDAY = '2026-10-22'

const tmp = mkdtempSync(join(tmpdir(), 'between-e2e-'))
const keysDir = join(tmp, 'keys')
const pairs = Object.fromEntries(HOUSEHOLD_IDS.map(id => [id, loadOrCreateKeyPair(keysDir, id)]))
const children: ChildProcess[] = []

const portOf = (id: string) => BASE_PORT + HOUSEHOLD_IDS.indexOf(id as (typeof HOUSEHOLD_IDS)[number])

function envFor(id: string): Record<string, string> {
  const peers = HOUSEHOLD_IDS.filter(other => other !== id).map(other => ({
    id: other,
    name: HOUSEHOLDS[other].name,
    url: `http://127.0.0.1:${portOf(other)}`,
    publicKey: pairs[other].publicKey,
  }))
  return {
    HOUSEHOLD: id,
    PORT: String(portOf(id)),
    PUBLIC_URL: `http://127.0.0.1:${portOf(id)}`,
    DB_PATH: join(tmp, `${id}.db`),
    KEYS_DIR: keysDir,
    MCP_TOKEN: TOKEN,
    PEERS: JSON.stringify(peers),
    DEMO_NOW,
    CHOOSER: 'rules',
    PACE_MS: '10',
    COLLECT_MS: '300',
    PEER_TIMEOUT_MS: '2000',
  }
}

function start(id: string): ChildProcess {
  const child = spawn('node', ['--import', 'tsx', 'src/main.ts'], {
    env: { ...process.env, ...envFor(id) },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  children.push(child)
  return child
}

async function killAll(): Promise<void> {
  const running = children.splice(0)
  for (const child of running) {
    if (child.exitCode !== null) continue
    const exited = once(child, 'exit')
    child.kill('SIGTERM')
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))])
    if (child.exitCode === null) child.kill('SIGKILL')
  }
}

async function waitForHealth(id: string, timeoutMs = 20000): Promise<void> {
  const start = Date.now()
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${portOf(id)}/healthz`)
      if (res.ok) return
    } catch {
      // not up yet
    }
    if (Date.now() - start > timeoutMs) throw new Error(`${id} did not come up`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

async function startAll(): Promise<void> {
  for (const id of HOUSEHOLD_IDS) start(id)
  for (const id of HOUSEHOLD_IDS) await waitForHealth(id)
}

async function connect(id: string): Promise<Client> {
  const client = new Client({ name: `e2e-${id}`, version: '0.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${portOf(id)}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    }),
  )
  return client
}

type StatusData = {
  view: string
  summary: string
  status: string
  proposal_id?: string
  proposal?: { proposal_id: string; they_take: string; you_take: string }
}

async function pollStatus(client: Client, wantView: string, negotiationId?: string, timeoutMs = 8000): Promise<StatusData> {
  const start = Date.now()
  for (;;) {
    const result = await client.callTool({ name: 'negotiation_status', arguments: negotiationId ? { negotiation_id: negotiationId } : {} })
    const data = result.structuredContent as StatusData
    if (data.view === wantView) return data
    if (Date.now() - start > timeoutMs) throw new Error(`waiting for ${wantView}, still: ${JSON.stringify(data)}`)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

after(async () => {
  await killAll()
  rmSync(tmp, { recursive: true, force: true })
})

test('the demo scenario runs end to end across four signed HTTP instances', async () => {
  await startAll()

  const ahmad = await connect('ahmad')
  const started = performance.now()
  const found = await ahmad.callTool({ name: 'find_help', arguments: { activity: 'soccer', date: THURSDAY } })
  assert.ok(performance.now() - started < 500, 'find_help must return within 500 ms')
  const foundData = found.structuredContent as { view: string; summary: string; status: string; negotiation_id: string }
  assert.equal(foundData.view, 'feed')
  assert.equal(foundData.status, 'negotiating')
  assert.match(foundData.summary, /Asking the Lees, the Parks and the Chens/)

  const proposal = await pollStatus(ahmad, 'proposal', foundData.negotiation_id)
  assert.match(proposal.summary, /The Parks can cover the soccer run on Thursday/)
  const statusStarted = performance.now()
  await ahmad.callTool({ name: 'negotiation_status', arguments: {} })
  assert.ok(performance.now() - statusStarted < 500, 'negotiation_status must return within 500 ms')

  const approved = await ahmad.callTool({ name: 'respond_to_proposal', arguments: { proposal_id: proposal.proposal_id, approve: true } })
  assert.match((approved.structuredContent as StatusData).summary, /Told the Parks yes/)

  // The Parks' own assistant asks their family from their side.
  const park = await connect('park')
  const parkProposal = await pollStatus(park, 'proposal')
  assert.match(parkProposal.summary, /The Ahmads accepted/)
  const parkYes = await park.callTool({ name: 'respond_to_proposal', arguments: { proposal_id: parkProposal.proposal_id, approve: true } })
  assert.equal((parkYes.structuredContent as StatusData).view, 'agreed')

  const agreed = await pollStatus(ahmad, 'agreed', foundData.negotiation_id)
  assert.match(agreed.summary, /Done — the Parks are covering/)

  // Calendars and ledgers on both sides.
  const ahmadState = (await (await fetch(`http://127.0.0.1:${portOf('ahmad')}/api/state`)).json()) as any
  assert.equal(ahmadState.calendar.find((e: any) => e.id === 'evt-ahmad-soccer').coveredBy, 'park')
  const ahmadTaken = ahmadState.calendar.find((e: any) => e.coveringFor === 'park')
  assert.ok(ahmadTaken.start.startsWith('2026-10-27'), 'the Tuesday after the Thursday')

  const parkState = (await (await fetch(`http://127.0.0.1:${portOf('park')}/api/state`)).json()) as any
  assert.equal(parkState.calendar.find((e: any) => e.id === 'evt-park-run').coveredBy, 'ahmad')
  const parkTaken = parkState.calendar.find((e: any) => e.coveringFor === 'ahmad')
  assert.ok(parkTaken.start.startsWith(THURSDAY))

  const ahmadLedger = (await ahmad.callTool({ name: 'ledger', arguments: {} })).structuredContent as any
  assert.equal(ahmadLedger.balances.find((b: any) => b.family === 'Park').balance, 0)
  assert.equal(ahmadLedger.ask_first, 'Lee')
  const parkLedger = (await park.callTool({ name: 'ledger', arguments: {} })).structuredContent as any
  assert.equal(parkLedger.balances.find((b: any) => b.family === 'Ahmad').balance, 0)

  // Privacy: every byte on the wire is a schema-valid offer, no private title anywhere.
  for (const state of [ahmadState, parkState]) {
    for (const message of state.wire) {
      Offer.parse(message.body)
      assert.ok(!JSON.stringify(message.body).includes('Maya'))
      assert.ok(!JSON.stringify(message.body).includes('Lincoln'))
    }
  }

  await ahmad.close()
  await park.close()
})

test('ledgers survive a restart', async () => {
  await killAll()
  await startAll()
  const ahmad = await connect('ahmad')
  const ledger = (await ahmad.callTool({ name: 'ledger', arguments: {} })).structuredContent as any
  assert.equal(ledger.balances.find((b: any) => b.family === 'Lee').balance, 2)
  assert.equal(ledger.balances.find((b: any) => b.family === 'Park').balance, 0)
  await ahmad.close()
})
