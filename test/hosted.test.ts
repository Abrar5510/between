import assert from 'node:assert/strict'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { HOUSEHOLD_IDS, HOUSEHOLDS } from '../src/config.ts'
import { loadOrCreateKeyPair } from '../src/keys.ts'

/**
 * The hosted front door, in a browser: the same pages, served under
 * /<home>/sim/ by scripts/router.ts — exactly what a judge gets from the ngrok
 * link. Proves the relative asset paths, the API base, the iframe and the app
 * bridge all survive the prefix.
 */

if (!existsSync(fileURLToPath(new URL('../dist/sim/index.html', import.meta.url)))) {
  const build = spawnSync('npm', ['run', 'build'], { stdio: 'ignore' })
  if (build.status !== 0) throw new Error('the pages failed to build — run: npm run build')
}

const BASE_PORT = 4941
const ROUTER_PORT = 4950
const TOKEN = 'hosted-token'
const DEMO_NOW = '2026-10-17T09:00:00-07:00'

const tmp = mkdtempSync(join(tmpdir(), 'between-hosted-'))
const keysDir = join(tmp, 'keys')
const pairs = Object.fromEntries(HOUSEHOLD_IDS.map(id => [id, loadOrCreateKeyPair(keysDir, id)]))
const children: ChildProcess[] = []

const portOf = (id: string) => BASE_PORT + HOUSEHOLD_IDS.indexOf(id as (typeof HOUSEHOLD_IDS)[number])
const at = (path: string) => `http://127.0.0.1:${ROUTER_PORT}${path}`

function start(id: string): void {
  const peers = HOUSEHOLD_IDS.filter(other => other !== id).map(other => ({
    id: other,
    name: HOUSEHOLDS[other].name,
    url: `http://127.0.0.1:${portOf(other)}`,
    publicKey: pairs[other].publicKey,
  }))
  children.push(
    spawn('node', ['--import', 'tsx', 'src/main.ts'], {
      env: {
        ...process.env,
        HOUSEHOLD: id,
        PORT: String(portOf(id)),
        PUBLIC_URL: `http://127.0.0.1:${portOf(id)}`,
        DB_PATH: join(tmp, `${id}.db`),
        KEYS_DIR: keysDir,
        MCP_TOKEN: TOKEN,
        PEERS: JSON.stringify(peers),
        DEMO_NOW,
        CHOOSER: 'rules',
        PACE_MS: '0',
        COLLECT_MS: '800',
        PEER_TIMEOUT_MS: '2000',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    }),
  )
}

children.push(
  spawn('node', ['--import', 'tsx', 'scripts/router.ts'], {
    env: {
      ...process.env,
      ROUTER_PORT: String(ROUTER_PORT),
      ROUTER_TARGETS: `ahmad=http://127.0.0.1:${portOf('ahmad')},park=http://127.0.0.1:${portOf('park')}`,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  }),
)

async function reachable(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error(`${url} never came up`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

after(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode !== null) continue
    const exited = once(child, 'exit')
    child.kill('SIGTERM')
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2000))])
    if (child.exitCode === null) child.kill('SIGKILL')
  }
  rmSync(tmp, { recursive: true, force: true })
})

test('the hosted front door: both kitchens on one link, prefixes and all', async () => {
  for (const id of HOUSEHOLD_IDS) start(id)
  for (const id of HOUSEHOLD_IDS) await reachable(`http://127.0.0.1:${portOf(id)}/healthz`)
  await reachable(at('/healthz'))

  // The bare link lands on the first kitchen.
  const redirect = await fetch(at('/'), { redirect: 'manual' })
  assert.equal(redirect.status, 302)
  assert.equal(redirect.headers.get('location'), '/ahmad/sim/')

  // A household that is not behind this door says so.
  const missing = await fetch(at('/chen/sim/'))
  assert.equal(missing.status, 404)

  const browser = await chromium.launch()
  const pageErrors: string[] = []
  try {
    const ahmad = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    const park = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    ahmad.on('pageerror', error => pageErrors.push(`ahmad: ${error.message}`))
    park.on('pageerror', error => pageErrors.push(`park: ${error.message}`))

    await ahmad.goto(at('/ahmad/sim/'))
    await park.goto(at('/park/sim/'))
    await ahmad.waitForFunction(
      name => document.getElementById('device-name')?.textContent?.includes(name as string),
      'Ahmad',
      { timeout: 15_000 },
    )
    await park.waitForFunction(
      name => document.getElementById('device-name')?.textContent?.includes(name as string),
      'Park',
      { timeout: 15_000 },
    )

    // Firefox-style trailing-slash entry: /ahmad/sim finds the page too.
    const noSlash = await fetch(at('/ahmad/sim'), { redirect: 'manual' })
    assert.equal(noSlash.headers.get('location'), '/ahmad/sim/')

    const ahmadApp = ahmad.frameLocator('#app-view')
    const parkApp = park.frameLocator('#app-view')

    await ahmad.fill('#text', "I can't take Maya to soccer on Thursday. Can you sort it out?")
    await ahmad.press('#text', 'Enter')
    await ahmad
      .locator('.transcript li.alexa', { hasText: 'Asking the Lees, the Parks and the Chens' })
      .waitFor({ timeout: 15_000 })
    // The card arriving here proves assets, MCP App and bridge under the prefix.
    await ahmadApp.locator('h1', { hasText: 'Covering the soccer run' }).waitFor({ timeout: 15_000 })

    await ahmad.locator('.transcript li.alexa', { hasText: 'The Parks can cover' }).waitFor({ timeout: 20_000 })
    await ahmadApp.getByRole('button', { name: 'Yes, agree' }).click()
    await ahmadApp.getByText('Waiting for the other family.').waitFor({ timeout: 10_000 })

    await park
      .locator('.transcript li.alexa', { hasText: "accepted: you'll take the soccer run" })
      .waitFor({ timeout: 20_000 })
    await parkApp.getByRole('button', { name: 'Yes, agree' }).click()
    await parkApp.locator('h1', { hasText: 'Settled' }).waitFor({ timeout: 15_000 })

    // The API behind the prefix agrees, and the panel shows the moved calendar.
    const deadline = Date.now() + 15_000
    for (;;) {
      const state = (await (await fetch(at('/ahmad/api/state'))).json()) as { negotiations: { status: string }[] }
      if (state.negotiations.some(n => n.status === 'agreed')) break
      if (Date.now() > deadline) throw new Error('ahmad never recorded the agreement')
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    await ahmad.locator('#calendar li', { hasText: 'park covers' }).waitFor({ timeout: 10_000 })

    assert.deepEqual(pageErrors, [], 'the pages must not throw')
  } finally {
    await browser.close()
  }
})
