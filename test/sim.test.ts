import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { HOUSEHOLD_IDS, HOUSEHOLDS } from '../src/config.ts'
import { loadOrCreateKeyPair } from '../src/keys.ts'

/**
 * The simulated Alexa+ path: spoken turns in, tool calls and a spoken reply
 * out, against four real household servers. This is the demo, driven exactly
 * the way the recorded rehearsal drives it.
 */

const BASE_PORT = 4921
const TOKEN = 'sim-token'
const DEMO_NOW = '2026-10-17T09:00:00-07:00'

const tmp = mkdtempSync(join(tmpdir(), 'between-sim-'))
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
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${portOf(id)}/healthz`)
      if (res.ok) return
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error(`${id} never came up`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

type SimCall = { name: string; isError: boolean; summary: string; structuredContent?: unknown }
type Turn = { reply: string; calls: SimCall[] }

async function turn(id: string, text: string): Promise<Turn> {
  const res = await fetch(`http://127.0.0.1:${portOf(id)}/sim/turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  const body = await res.text()
  assert.equal(res.status, 200, `sim turn failed on ${id}: ${body}`)
  return JSON.parse(body) as Turn
}

async function stateOf(id: string): Promise<{
  calendar: { task: string | null; coveredBy: string | null; coveringFor: string | null }[]
  ledger: { peer: string; balance: number }[]
  negotiations: { id: string; status: string }[]
}> {
  const res = await fetch(`http://127.0.0.1:${portOf(id)}/api/state`)
  assert.equal(res.status, 200)
  return res.json() as never
}

after(async () => {
  await killAll()
  rmSync(tmp, { recursive: true, force: true })
})

test('the simulated Alexa+ answers, proposes, and takes yes for an answer', async () => {
  for (const id of HOUSEHOLD_IDS) start(id)
  for (const id of HOUSEHOLD_IDS) await waitForHealth(id)

  // The page asks the server who it is.
  const config = (await (await fetch(`http://127.0.0.1:${portOf('ahmad')}/sim/config`)).json()) as { household: string; name: string; appUrl: string }
  assert.equal(config.household, 'ahmad')
  assert.equal(config.name, 'Ahmad')
  assert.equal(config.appUrl, '/sim/app.html')

  // "I can't take Maya to soccer on Thursday."
  const asked = await turn('ahmad', "I can't take Maya to soccer on Thursday. Can you sort it out?")
  assert.equal(asked.calls[0]?.name, 'find_help')
  assert.equal(asked.calls[0].isError, false)
  assert.match(asked.reply, /Asking the Lees, the Parks and the Chens/)
  const feed = asked.calls[0].structuredContent as { view: string; negotiation_id: string }
  assert.equal(feed.view, 'feed')

  // "What's the news?" — the reply changes once the offers are in.
  let heard: Turn | undefined
  for (let i = 0; i < 60; i++) {
    const now = await turn('ahmad', "What's the news about Thursday?")
    assert.equal(now.calls[0]?.name, 'negotiation_status')
    if (/Parks can cover/.test(now.reply)) {
      heard = now
      break
    }
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  assert.ok(heard, 'the assistant never heard the winning offer')
  const proposal = heard.calls[0].structuredContent as { view: string; status: string; proposal?: { proposal_id: string } }
  assert.equal(proposal.view, 'proposal')
  assert.equal(proposal.status, 'proposal_ready')
  assert.ok(proposal.proposal?.proposal_id, 'the card needs a proposal to approve')

  // "Yes, that works." — one side of the deal.
  const yes = await turn('ahmad', 'Yes, that works')
  assert.equal(yes.calls.at(-1)?.name, 'respond_to_proposal')
  assert.match(yes.reply, /Told the Parks yes/)

  // The other home hears about it first — the proposal lands on their side.
  const parkHeard = await turn('park', '__auto__')
  assert.equal(parkHeard.calls[0]?.name, 'negotiation_status')
  assert.match(parkHeard.reply, /accepted: you'll take the soccer run/)
  const parkProposal = parkHeard.calls[0].structuredContent as { view: string; status: string; proposal?: { proposal_id: string } }
  assert.equal(parkProposal.view, 'proposal')
  assert.equal(parkProposal.status, 'half_accepted')
  assert.ok(parkProposal.proposal?.proposal_id)

  // And approves.
  const parkYes = await turn('park', 'Yes, please approve that')
  assert.equal(parkYes.calls.at(-1)?.name, 'respond_to_proposal')
  assert.match(parkYes.reply, /Done/)

  // The initiator side records the agreement on its negotiation.
  let ahmadAgreed = false
  for (let i = 0; i < 60 && !ahmadAgreed; i++) {
    const state = await stateOf('ahmad')
    ahmadAgreed = state.negotiations.some(n => n.status === 'agreed')
    if (!ahmadAgreed) await new Promise(resolve => setTimeout(resolve, 150))
  }
  assert.ok(ahmadAgreed, 'ahmad never recorded the agreement')

  // Both calendars moved, and the swap keeps the ledger level on both sides.
  const ahmad = await stateOf('ahmad')
  assert.equal(ahmad.calendar.find(e => e.task === 'soccer run')?.coveredBy, 'park')
  assert.equal(ahmad.ledger.find(l => l.peer === 'park')?.balance, 0)

  const park = await stateOf('park')
  assert.equal(park.calendar.find(e => e.task === 'soccer run')?.coveringFor, 'ahmad')
  assert.equal(park.ledger.find(l => l.peer === 'ahmad')?.balance, 0)

  // "Who should I ask next time?" still reads the ledger, not the calendar.
  const ledger = await turn('ahmad', 'Who should I ask about Saturday?')
  assert.equal(ledger.calls[0]?.name, 'ledger')
  assert.match(ledger.reply, /The Lees owe you two/)
})
