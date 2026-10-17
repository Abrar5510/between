/**
 * Host the demo for judges: four households and one public link.
 *
 *   npm run host                          ngrok, on the account's reserved domain
 *   NGROK_DOMAIN=x.ngrok-free.app npm run host
 *                                         explicitly claim a domain
 *   DEMO_PASSCODE=secret npm run host     add HTTP Basic to /sim/* and /api/*
 *   PACE_MS=0 npm run host                snappier replies for repeat testers
 *
 * A free ngrok account has one reserved domain and every tunnel grabs it, so a
 * second tunnel would fight the first. Instead both kitchens share the one
 * link: scripts/router.ts serves Ahmad at /ahmad/… and Park at /park/….
 *
 * The links land in data/hosted-links.txt, ready to paste into the Devpost
 * testing instructions. Keep this terminal open while judges test — the demo
 * lives on this machine, and ngrok free shows first-time visitors a one-click
 * "Visit Site" page.
 *
 * Cloudflare quick tunnels would also work but api.trycloudflare.com is not
 * reachable from this network; ngrok is already authenticated here.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { HOUSEHOLDS } from '../src/config.ts'

const pace = process.env.PACE_MS ?? '600'
const demoNow = process.env.DEMO_NOW ?? '2026-10-17T09:00:00-07:00'
const routerPort = process.env.ROUTER_PORT ?? '4100'
const children: ChildProcess[] = []

function stop(): void {
  for (const child of children.splice(0)) child.kill('SIGTERM')
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

// ── the four households ────────────────────────────────────────────────────

children.push(
  spawn('node', ['--import', 'tsx', 'scripts/dev.ts'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, PACE_MS: pace, DEMO_NOW: demoNow },
  }),
)

// ── the front door ─────────────────────────────────────────────────────────

children.push(
  spawn('node', ['--import', 'tsx', 'scripts/router.ts'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, ROUTER_PORT: routerPort },
  }),
)

// ── the one public link ────────────────────────────────────────────────────

const ngrok = spawn(
  'ngrok',
  ['http', routerPort, ...(process.env.NGROK_DOMAIN ? [`--url=${process.env.NGROK_DOMAIN}`] : []), '--log=stdout'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)
children.push(ngrok)

const pattern = /url=(https:\/\/[a-z0-9.-]+\.ngrok[a-z.-]*)/
let announced = false
const onLog = (chunk: Buffer) => {
  const text = chunk.toString()
  if (!announced) {
    const found = pattern.exec(text)?.[1]
    if (found) {
      announced = true
      announce(found)
    }
  }
  if (/err=/.test(text)) console.error(`[host] ngrok: ${text.trim()}`)
}
ngrok.stdout.on('data', onLog)
ngrok.stderr.on('data', onLog)
ngrok.on('exit', code => {
  if (code !== 0 && code !== null) console.error(`[host] ngrok exited (${code}) — is another ngrok tunnel already running?`)
})

function announce(publicUrl: string): void {
  const local = `http://127.0.0.1:${routerPort}`
  const kitchens = [
    { path: '/ahmad/sim/', label: "Ahmad's kitchen" },
    { path: '/park/sim/', label: "Park's kitchen" },
  ]
  const lines = [
    '# Between — testing notes',
    '',
    'Two households, one link. Open both in separate tabs:',
    '',
    ...kitchens.map(k => `- ${k.label}: ${publicUrl}${k.path}`),
    '',
    `(${publicUrl}/ opens Ahmad's kitchen; ${publicUrl}/park/sim/ is the other side.)`,
    '',
    'First visit in a browser shows ngrok\'s "You are about to visit …" page — press',
    '"Visit Site" once and it is remembered for that browser. Command-line calls are',
    'not affected.',
    '',
    'Type (or speak) into one kitchen: "I can\'t take Maya to soccer on Thursday.',
    'Can you sort it out?" — then, once the card appears, press Yes, agree. The other',
    'kitchen speaks up on its own: ask it what is being asked ("What\'s the news about',
    'Thursday?") and press Yes, agree there too. Both families approve before',
    'anything is committed.',
    '',
    'Reset a household to the seeded morning:',
    ...kitchens.map(k => `- curl -X POST ${publicUrl}/${k.path.split('/')[1]}/api/reset`),
    '',
    process.env.DEMO_PASSCODE
      ? `Passcode: any username, password ${process.env.DEMO_PASSCODE}`
      : 'No passcode — open the link.',
    '',
    'On the same machine (rehearsal):',
    ...kitchens.map(k => `- ${k.label}: ${local}${k.path}`),
  ]
  const text = lines.join('\n')
  mkdirSync('data', { recursive: true })
  writeFileSync('data/hosted-links.txt', `${text}\n`)
  console.log(`\n${text}\n\n[host] written to data/hosted-links.txt — keep this terminal open.\n`)
}
