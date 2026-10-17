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
 * The browser side, end to end: two simulator pages in a real Chromium, the
 * real MCP App hosted through the app bridge, the buttons in the card driving
 * the negotiation, and the panels the demo narrates. On a fresh checkout the
 * pages are built first.
 */

if (!existsSync(fileURLToPath(new URL('../dist/sim/index.html', import.meta.url)))) {
  const build = spawnSync('npm', ['run', 'build'], { stdio: 'ignore' })
  if (build.status !== 0) throw new Error('the pages failed to build — run: npm run build')
}

const BASE_PORT = 4931
const TOKEN = 'ui-token'
const DEMO_NOW = '2026-10-17T09:00:00-07:00'

const tmp = mkdtempSync(join(tmpdir(), 'between-ui-'))
const keysDir = join(tmp, 'keys')
const pairs = Object.fromEntries(HOUSEHOLD_IDS.map(id => [id, loadOrCreateKeyPair(keysDir, id)]))
const children: ChildProcess[] = []

const portOf = (id: string) => BASE_PORT + HOUSEHOLD_IDS.indexOf(id as (typeof HOUSEHOLD_IDS)[number])

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

async function waitForHealth(id: string, timeoutMs = 20_000): Promise<void> {
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

async function waitForAgreed(id: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const state = (await (await fetch(`http://127.0.0.1:${portOf(id)}/api/state`)).json()) as {
      negotiations: { status: string }[]
    }
    if (state.negotiations.some(n => n.status === 'agreed')) return
    if (Date.now() > deadline) throw new Error(`${id} never recorded the agreement`)
    await new Promise(resolve => setTimeout(resolve, 200))
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

test('two kitchens in a browser: the cards render, the buttons negotiate, the panels tell the story', async () => {
  for (const id of HOUSEHOLD_IDS) start(id)
  for (const id of HOUSEHOLD_IDS) await waitForHealth(id)

  const browser = await chromium.launch()
  const pageErrors: string[] = []

  try {
    const ahmad = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    const park = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    ahmad.on('pageerror', error => pageErrors.push(`ahmad: ${error.message}`))
    park.on('pageerror', error => pageErrors.push(`park: ${error.message}`))

    await ahmad.goto(`http://127.0.0.1:${portOf('ahmad')}/sim/`)
    await park.goto(`http://127.0.0.1:${portOf('park')}/sim/`)

    // The page knows whose kitchen it is.
    await ahmad.waitForFunction(
      name => document.getElementById('device-name')?.textContent?.includes(name as string),
      'Ahmad',
      { timeout: 15_000 },
    )

    const ahmadApp = ahmad.frameLocator('#app-view')
    const parkApp = park.frameLocator('#app-view')

    // Both views have finished the app-bridge handshake, so the first card is not raced.
    await ahmad.locator('#app-view[data-ready]').waitFor({ timeout: 15_000 })
    await park.locator('#app-view[data-ready]').waitFor({ timeout: 15_000 })

    // "I can't take Maya to soccer on Thursday. Can you sort it out?"
    await ahmad.fill('#text', "I can't take Maya to soccer on Thursday. Can you sort it out?")
    await ahmad.press('#text', 'Enter')
    await ahmad
      .locator('.transcript li.alexa', { hasText: 'Asking the Lees, the Parks and the Chens' })
      .waitFor({ timeout: 15_000 })

    // Which proves the app bridge: the tool result rendered as the real card.
    await ahmadApp.locator('h1', { hasText: 'Covering the soccer run' }).waitFor({ timeout: 15_000 })

    // The home speaks first when the proposal lands, and the card offers the deal.
    await ahmad.locator('.transcript li.alexa', { hasText: 'The Parks can cover' }).waitFor({ timeout: 20_000 })
    await ahmadApp.locator('h1', { hasText: 'A favour swap' }).waitFor({ timeout: 15_000 })
    await ahmadApp.getByText('They take', { exact: true }).waitFor({ timeout: 10_000 })
    await ahmadApp.getByText('You take', { exact: true }).waitFor({ timeout: 10_000 })

    // A press in the card is the family speaking.
    await ahmadApp.getByRole('button', { name: 'Yes, agree' }).click()
    await ahmad.locator('.transcript li.alexa', { hasText: 'Told the Parks yes' }).waitFor({ timeout: 15_000 })
    await ahmadApp.getByText('Waiting for the other family.').waitFor({ timeout: 10_000 })

    // The other kitchen was asked the same question in its own words.
    await park
      .locator('.transcript li.alexa', { hasText: "accepted: you'll take the soccer run" })
      .waitFor({ timeout: 20_000 })
    await parkApp.getByRole('button', { name: 'Yes, agree' }).click()
    await park.locator('.transcript li.alexa', { hasText: 'Done' }).waitFor({ timeout: 15_000 })
    await parkApp.locator('h1', { hasText: 'Settled' }).waitFor({ timeout: 15_000 })

    // Wait for the signed accept to travel home, then ask the settle question.
    await waitForAgreed('ahmad')
    await ahmad.fill('#text', 'Is Thursday sorted?')
    await ahmad.press('#text', 'Enter')
    await ahmad.locator('.transcript li.alexa', { hasText: 'Done' }).waitFor({ timeout: 15_000 })
    await ahmadApp.locator('h1', { hasText: 'Settled' }).waitFor({ timeout: 15_000 })

    // The panels the camera narrates: the calendar moved, the ledger is level,
    // and the wire holds real traffic.
    await ahmad.locator('#calendar li', { hasText: 'park covers' }).waitFor({ timeout: 10_000 })
    await ahmad.locator('#calendar li', { hasText: 'you cover for park' }).waitFor({ timeout: 10_000 })
    await ahmad.locator('#ledger li', { hasText: 'even' }).first().waitFor({ timeout: 10_000 })
    assert.ok((await ahmad.locator('#wire details').count()) >= 3, 'the wire should show real traffic')
    assert.match((await ahmad.locator('#prefs').textContent()) ?? '', /Standing preferences/)

    // And the reset button puts the seeded morning back: transcript empty, one
    // event, no covers.
    await ahmad.click('#reset')
    await ahmad.waitForFunction(() => document.querySelectorAll('.transcript li').length === 0, undefined, { timeout: 10_000 })
    await ahmad.locator('#calendar li', { hasText: 'soccer run' }).waitFor({ timeout: 10_000 })
    assert.equal(await ahmad.locator('#calendar li').count(), 1, 'reset should restore the seeded calendar')
    assert.equal(await ahmad.locator('#calendar li', { hasText: 'covers' }).count(), 0, 'no covers after reset')

    assert.deepEqual(pageErrors, [], 'the pages must not throw')
  } finally {
    await browser.close()
  }
})
