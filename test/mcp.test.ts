import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { generateKeyPair } from 'between-protocol'
import { HOUSEHOLD_IDS, HOUSEHOLDS } from '../src/config.ts'

const PORT = 4901
const TOKEN = 'test-token'
const DEMO_NOW = '2026-10-17T09:00:00-07:00'
const url = new URL(`http://127.0.0.1:${PORT}/mcp`)

const tmp = mkdtempSync(join(tmpdir(), 'between-mcp-'))
const peers = HOUSEHOLD_IDS.filter(id => id !== 'ahmad').map(id => ({
  id,
  name: HOUSEHOLDS[id].name,
  url: `http://127.0.0.1:9${HOUSEHOLD_IDS.indexOf(id)}`,
  publicKey: generateKeyPair().publicKey,
}))

const server = spawn('node', ['--import', 'tsx', 'src/main.ts'], {
  env: {
    ...process.env,
    HOUSEHOLD: 'ahmad',
    PORT: String(PORT),
    MCP_TOKEN: TOKEN,
    DB_PATH: join(tmp, 'ahmad.db'),
    KEYS_DIR: join(tmp, 'keys'),
    PEERS: JSON.stringify(peers),
    DEMO_NOW,
  },
  stdio: ['ignore', 'ignore', 'pipe'],
})
before(() => once(server.stderr, 'data')) // first stderr line is "listening"
after(() => {
  server.kill()
  rmSync(tmp, { recursive: true, force: true })
})

async function connect() {
  const client = new Client({ name: 'between-test', version: '0.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }),
  )
  return client
}

test('rejects calls without the token, with no WWW-Authenticate header', async () => {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  assert.equal(res.status, 401)
  assert.equal(res.headers.get('www-authenticate'), null)
})

test('all four tools are offered, with the ledger readable and speakable', async () => {
  const client = await connect()
  const { tools } = await client.listTools()
  assert.deepEqual(
    tools.map(t => t.name).sort(),
    ['find_help', 'ledger', 'negotiation_status', 'respond_to_proposal'],
  )
  for (const tool of tools) assert.ok(tool.description && tool.description.length > 40, `${tool.name} needs a useful description`)
  const ledger = tools.find(t => t.name === 'ledger')
  assert.ok(ledger?.outputSchema)

  const started = performance.now()
  const result = await client.callTool({ name: 'ledger', arguments: {} })
  assert.ok(performance.now() - started < 500, 'tool call must return within 500 ms')
  const data = result.structuredContent as {
    view: string
    summary: string
    ask_first: string
    balances: { family: string; balance: number }[]
  }
  assert.equal(data.view, 'ledger')
  assert.equal(data.ask_first, 'Lee')
  assert.match(data.summary, /The Lees owe you two/)
  assert.equal(data.balances.find(b => b.family === 'Lee')?.balance, 2)
  assert.deepEqual(result.content, [{ type: 'text', text: data.summary }])
  await client.close()
})

test('negotiation_status reads as a plain "nothing waiting" when idle', async () => {
  const client = await connect()
  const result = await client.callTool({ name: 'negotiation_status', arguments: {} })
  const data = result.structuredContent as { view: string; summary: string }
  assert.equal(data.view, 'feed')
  assert.match(data.summary, /Nothing needs you right now/)
  await client.close()
})

test('the app resource serves the bundled view', async () => {
  const client = await connect()
  const { tools } = await client.listTools()
  const ledger = tools.find(t => t.name === 'ledger')!
  const uri = (ledger._meta?.ui as { resourceUri: string }).resourceUri
  const { contents } = await client.readResource({ uri })
  assert.equal(contents[0].mimeType, 'text/html;profile=mcp-app')
  assert.match((contents[0] as { text: string }).text, /<main id="root">/)
  await client.close()
})
