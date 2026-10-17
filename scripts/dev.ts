/**
 * Start all four households locally, one process each:
 *
 *   npm run dev            fresh databases, keys generated once in data/keys
 *   npm run dev -- --keep  keep existing databases
 *
 * Environment overrides pass through: DEMO_NOW pins "today", PACE_MS slows
 * agent replies for the camera, COLLECT_MS tunes how long the initiator waits.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { HOUSEHOLD_IDS, HOUSEHOLDS } from '../src/config.ts'
import { loadOrCreateKeyPair } from '../src/keys.ts'

const root = process.cwd()
const keysDir = join(root, 'data', 'keys')
const clean = !process.argv.includes('--keep')

const pairs = Object.fromEntries(HOUSEHOLD_IDS.map(id => [id, loadOrCreateKeyPair(keysDir, id)]))
if (clean) for (const id of HOUSEHOLD_IDS) rmSync(join(root, 'data', `${id}.db`), { force: true })

const children: ChildProcess[] = []

for (const id of HOUSEHOLD_IDS) {
  const port = HOUSEHOLDS[id].port
  const peers = HOUSEHOLD_IDS.filter(other => other !== id).map(other => ({
    id: other,
    name: HOUSEHOLDS[other].name,
    url: `http://127.0.0.1:${HOUSEHOLDS[other].port}`,
    publicKey: pairs[other].publicKey,
  }))
  const child = spawn('node', ['--import', 'tsx', 'src/main.ts'], {
    cwd: root,
    env: {
      ...process.env,
      HOUSEHOLD: id,
      PORT: String(port),
      PUBLIC_URL: `http://127.0.0.1:${port}`,
      DB_PATH: join(root, 'data', `${id}.db`),
      KEYS_DIR: keysDir,
      MCP_TOKEN: process.env.MCP_TOKEN ?? 'dev-token',
      PEERS: JSON.stringify(peers),
      PACE_MS: process.env.PACE_MS ?? '600',
      COLLECT_MS: process.env.COLLECT_MS ?? '4000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.on('data', data => process.stdout.write(`[${id}] ${data}`))
  child.stderr?.on('data', data => process.stderr.write(`[${id}] ${data}`))
  children.push(child)
  console.log(`[dev] ${HOUSEHOLDS[id].name}: http://127.0.0.1:${port}  (mcp token: ${process.env.MCP_TOKEN ?? 'dev-token'}, reset: POST /api/reset)`)
}

const stop = () => {
  for (const child of children) child.kill('SIGTERM')
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
