import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

const PORT = 4901
const TOKEN = 'test-token'
const url = new URL(`http://127.0.0.1:${PORT}/mcp`)

const server = spawn('node', ['--import', 'tsx', 'src/main.ts'], {
  env: { ...process.env, PORT: String(PORT), MCP_TOKEN: TOKEN },
  stdio: ['ignore', 'ignore', 'pipe'],
})
before(() => once(server.stderr, 'data')) // first stderr line is "listening"
after(() => server.kill())

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

test('ledger tool returns speakable text, structured data and a view', async () => {
  const client = await connect()
  const { tools } = await client.listTools()
  const ledger = tools.find(t => t.name === 'ledger')
  assert.ok(ledger?.outputSchema)
  const uri = (ledger._meta?.ui as { resourceUri: string }).resourceUri

  const started = performance.now()
  const result = await client.callTool({ name: 'ledger', arguments: {} })
  assert.ok(performance.now() - started < 500, 'tool call must return within 500 ms')
  const data = result.structuredContent as { view: string; summary: string; ask_first: string }
  assert.equal(data.view, 'ledger')
  assert.equal(data.ask_first, 'Lee')
  assert.deepEqual(result.content, [{ type: 'text', text: data.summary }])

  const { contents } = await client.readResource({ uri })
  assert.equal(contents[0].mimeType, 'text/html;profile=mcp-app')
  assert.match((contents[0] as { text: string }).text, /<main id="root">/)
  await client.close()
})
