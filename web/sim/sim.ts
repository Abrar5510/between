import type { CallToolResult } from '@modelcontextprotocol/client'
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'

/**
 * The simulated Alexa+ page.
 *
 * It hosts the MCP App view in an iframe through the ext-apps app bridge, so
 * the card on screen is the real view, driven by real tool results. Speech and
 * typing go to /sim/turn, which runs a real MCP client against this
 * household's own /mcp — the same server a real Alexa+ would talk to.
 *
 * The panels on the right are what the camera shows: the calendar, the favour
 * ledger, and the raw signed offers on the wire.
 */

type SimCall = { name: string; isError: boolean; summary: string; content: unknown; structuredContent?: unknown }
type Turn = { reply: string; calls: SimCall[] }

type EventRow = {
  id: string
  title: string
  task: string | null
  start: string
  mins: number
  kind: string
  wouldTrade: boolean
  coveredBy: string | null
  coveringFor: string | null
}
type WireRow = { at: string; direction: string; peer: string; delivered: boolean; body: Record<string, unknown> }
type State = {
  household: string
  name: string
  now: string
  calendar: EventRow[]
  prefs: { key: string; value: string }[]
  peers: { id: string; name: string; url: string }[]
  ledger: { peer: string; name: string; balance: number }[]
  negotiations: { id: string; status: string; task: string | null; why: string | null; createdAt: string }[]
  threads: { id: string; peer: string; role: string; status: string }[]
  proposals: { proposalId: string; kind: string; summary: string }[]
  wire: WireRow[]
}

const $ = (id: string) => document.getElementById(id)!

const iframe = $('app-view') as HTMLIFrameElement
const transcript = $('transcript')
const input = $('text') as HTMLInputElement
const ask = $('ask') as HTMLFormElement
const mic = $('mic')
const voice = $('voice') as HTMLInputElement

let busy = false
const announced = new Set<string>()

// ── the app bridge: host the view, answer its button presses ────────────────

const bridge = new AppBridge(
  null,
  { name: 'Between simulator', version: '0.1.0' },
  { openLinks: {}, serverTools: {}, logging: {} },
  {
    hostContext: {
      theme: 'dark',
      displayMode: 'inline',
      platform: 'web',
      userAgent: 'between-sim',
      locale: 'en-US',
      timeZone: 'America/Los_Angeles',
    },
  },
)

bridge.onsizechange = ({ height }) => {
  if (height) iframe.style.height = `${Math.round(height + 26)}px`
}
bridge.oninitialized = () => {
  void bridge.sendToolInput({ arguments: {} })
}
bridge.onopenlink = async ({ url }) => {
  window.open(url, '_blank', 'noopener')
  return { isError: false }
}
bridge.oncalltool = async params => {
  // A press in the view is the family speaking: run it as a normal turn so the
  // same words, the same tools and the same reply play out.
  const text = params.name === 'respond_to_proposal' ? (params.arguments?.approve ? 'yes' : 'no') : ''
  if (!text) {
    return { content: [{ type: 'text' as const, text: `The simulator only forwards respond_to_proposal.` }], isError: true }
  }
  const turn = await runTurn(text)
  const last = turn?.calls[turn.calls.length - 1]
  return {
    content: [{ type: 'text' as const, text: turn?.reply ?? '' }],
    structuredContent: last?.structuredContent as Record<string, unknown> | undefined,
  }
}
void bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!))

// ── the device: speech in, speech out ──────────────────────────────────────

function addLine(who: 'you' | 'alexa', text: string) {
  const li = document.createElement('li')
  li.className = who
  const label = document.createElement('span')
  label.className = 'who'
  label.textContent = who === 'you' ? 'You' : 'Alexa+'
  const body = document.createElement('span')
  body.textContent = text
  li.append(label, body)
  transcript.append(li)
  transcript.scrollTop = transcript.scrollHeight
}

function speak(text: string) {
  if (!voice.checked || !('speechSynthesis' in window)) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1.02
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

async function runTurn(text: string): Promise<Turn | undefined> {
  if (busy) return undefined
  busy = true
  try {
    if (text !== '__auto__') addLine('you', text)
    const res = await fetch('/sim/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      addLine('alexa', 'I could not reach the house server just now.')
      return undefined
    }
    const turn = (await res.json()) as Turn
    addLine('alexa', turn.reply)
    speak(turn.reply)
    for (const call of turn.calls) {
      void bridge.sendToolResult({
        content: call.content as CallToolResult['content'],
        structuredContent: call.structuredContent as Record<string, unknown> | undefined,
        isError: call.isError,
      })
    }
    return turn
  } finally {
    busy = false
  }
}

ask.addEventListener('submit', event => {
  event.preventDefault()
  const text = input.value.trim()
  if (!text) return
  input.value = ''
  void runTurn(text)
})

const SpeechRecognitionCtor = (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition

if (SpeechRecognitionCtor) {
  const recognition = new (SpeechRecognitionCtor as new () => {
    lang: string
    interimResults: boolean
    onresult: (event: { results: { 0: { 0: { transcript: string } } } }) => void
    onend: () => void
    start: () => void
    stop: () => void
  })()
  recognition.lang = 'en-US'
  recognition.interimResults = false
  recognition.onresult = event => {
    const said = event.results[0][0].transcript
    if (said) void runTurn(said)
  }
  recognition.onend = () => mic.classList.remove('listening')
  mic.addEventListener('click', () => {
    if (mic.classList.contains('listening')) {
      recognition.stop()
      return
    }
    mic.classList.add('listening')
    recognition.start()
  })
} else {
  mic.addEventListener('click', () => addLine('alexa', 'Voice input needs Chrome. Type to me instead.'))
}

// ── side panels: calendar, ledger, wire ────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function whenLabel(iso: string): string {
  const day = new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay()
  const [h, m] = iso.slice(11, 16).split(':').map(Number)
  const hour12 = ((h + 11) % 12) + 1
  return `${DAY_NAMES[day]} ${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

function cell(text: string, className = ''): HTMLElement {
  const node = document.createElement('span')
  node.textContent = text
  if (className) node.className = className
  return node
}

function renderCalendar(state: State) {
  const list = $('calendar')
  const rows = [...state.calendar].sort((a, b) => a.start.localeCompare(b.start))
  list.replaceChildren(
    ...rows.map(event => {
      const li = document.createElement('li')
      li.className = 'event'
      const badge = event.coveredBy
        ? cell(`${event.coveredBy} covers`, 'badge good')
        : event.coveringFor
          ? cell(`you cover for ${event.coveringFor}`, 'badge good')
          : event.kind === 'busy'
            ? cell('busy', 'badge')
            : event.wouldTrade
              ? cell('tradable', 'badge warn')
              : null
      li.append(cell(whenLabel(event.start), 'when'), cell(event.task ?? event.title, 'what'))
      if (badge) li.append(badge)
      return li
    }),
  )
  $('calendar-count').textContent = `${rows.length}`
}

function renderLedger(state: State) {
  const list = $('ledger')
  const top = [...state.ledger].sort((a, b) => b.balance - a.balance)[0]
  list.replaceChildren(
    ...state.ledger.map(row => {
      const li = document.createElement('li')
      li.className = 'ledger-row'
      li.append(cell(row.name, 'who'))
      const text = row.balance > 0 ? `${row.name} owe you ${row.balance}` : row.balance < 0 ? `you owe ${-row.balance}` : 'even'
      li.append(cell(text, row.balance > 0 ? 'badge good' : row.balance < 0 ? 'badge warn' : 'badge'))
      if (top && top.balance > 0 && row.peer === top.peer) li.append(cell('ask first', 'ask-first'))
      return li
    }),
  )
  $('ledger-count').textContent = state.ledger.length ? '' : 'nobody yet'
  $('prefs').textContent = state.prefs.length ? `Standing preferences: ${state.prefs.map(p => p.value).join('; ')}` : ''
}

function renderWire(state: State) {
  const list = $('wire')
  list.replaceChildren(
    ...state.wire.map(message => {
      const item = document.createElement('details')
      item.className = 'wire-item'
      const summary = document.createElement('summary')
      const outgoing = message.direction === 'out'
      summary.append(
        cell(outgoing ? '→' : '←', outgoing ? 'dir' : 'dir in'),
        cell(message.peer, 'who'),
        cell(String(message.body.type ?? 'offer'), 'kind'),
        cell(message.at.slice(11, 16), 'when'),
      )
      const pre = document.createElement('pre')
      pre.textContent = JSON.stringify(message.body, null, 2)
      item.append(summary, pre)
      return item
    }),
  )
  $('wire-count').textContent = `${state.wire.length} messages`
}

async function poll() {
  try {
    const res = await fetch('/api/state')
    if (!res.ok) return
    const state = (await res.json()) as State
    renderCalendar(state)
    renderLedger(state)
    renderWire(state)
    document.title = `Between · ${state.name}`
    ;($('device-name') as HTMLElement).textContent = `Alexa+ · ${state.name}'s kitchen`
    for (const proposal of state.proposals) {
      if (announced.has(proposal.proposalId)) continue
      announced.add(proposal.proposalId)
      // The home speaks first when a proposal lands on this family.
      void runTurn('__auto__')
    }
  } catch {
    // the server is restarting; the next tick will pick it up
  }
}

setInterval(() => void poll(), 1_000)
void poll()

$('reset').addEventListener('click', async () => {
  await fetch('/api/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  announced.clear()
  transcript.replaceChildren()
  await poll()
})

// Expose a tiny hook so a rehearsal run can be driven from the console.
Object.assign(window, { betweenSim: { runTurn, poll } })
