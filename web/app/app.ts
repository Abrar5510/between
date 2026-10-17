import { App } from '@modelcontextprotocol/ext-apps'

type FeedItem = { at: string; peer: string; text: string }
type ProposalData = { proposal_id: string; they_take: string; you_take: string; why: string | null }

type Data =
  | { view: 'feed'; summary: string; status: string; task?: string; when?: string; families?: string[]; feed?: FeedItem[] }
  | { view: 'proposal'; summary: string; status: string; proposal?: ProposalData }
  | { view: 'agreed'; summary: string; status?: string; proposal?: ProposalData }
  | { view: 'ledger'; summary: string; balances: { family: string; balance: number }[] }

const root = document.getElementById('root')!

// textContent only: nothing from a tool result is ever parsed as HTML.
function el(tag: string, text = '', className = ''): HTMLElement {
  const node = document.createElement(tag)
  node.textContent = text
  if (className) node.className = className
  return node
}

const owes = (n: number) => (n === 1 ? 'owe you one' : `owe you ${n}`)
const owed = (n: number) => (n === 1 ? 'You owe them one' : `You owe them ${n}`)
const peerName = (id: string) => (id ? id[0].toUpperCase() + id.slice(1) : id)
const clock = (iso: string) => iso.slice(11, 16)

function termsBlock(proposal: ProposalData) {
  const terms = el('div', '', 'terms')
  for (const [label, value] of [
    ['They take', proposal.they_take],
    ['You take', proposal.you_take],
  ] as const) {
    const term = el('div', '', 'term')
    term.append(el('span', label, 'label'), el('strong', value))
    terms.append(term)
  }
  return terms
}

function feedView(data: Extract<Data, { view: 'feed' }>, box: HTMLElement) {
  box.append(el('h1', data.task ? `Covering the ${data.task}` : 'Negotiation'))
  box.append(el('p', data.summary, 'summary'))

  if (data.families?.length) {
    const chips = el('div', '', 'chips')
    for (const family of data.families) chips.append(el('span', family.replace(/^the /i, 'The '), 'chip'))
    box.append(chips)
  }

  const items = data.feed ?? []
  if (items.length) {
    const list = el('ul', '', 'feed')
    for (const item of items) {
      const row = el('li')
      row.append(el('span', '', 'dot'))
      const body = el('div', '', 'body')
      body.append(el('strong', peerName(item.peer)), el('span', item.text, 'text'))
      row.append(body, el('time', clock(item.at)))
      list.append(row)
    }
    box.append(list)
  }
}

function proposalView(data: Extract<Data, { view: 'proposal' }>, box: HTMLElement) {
  box.append(el('h1', 'A favour swap'))
  box.append(el('p', data.summary, 'summary'))

  const proposal = data.proposal
  if (!proposal) return
  box.append(termsBlock(proposal))
  if (proposal.why) box.append(el('p', `“${proposal.why}”`, 'why'))

  const awaiting = data.status !== 'proposal_ready' && data.status !== 'half_accepted'
  if (awaiting) {
    box.append(el('p', 'Waiting for the other family.', 'waiting'))
    return
  }
  const buttons = el('div', '', 'buttons')
  const yes = el('button', 'Yes, agree', 'primary') as HTMLButtonElement
  const no = el('button', 'No', 'ghost') as HTMLButtonElement
  const answer = async (approve: boolean) => {
    yes.disabled = no.disabled = true
    try {
      const result = await app.callServerTool({
        name: 'respond_to_proposal',
        arguments: { proposal_id: proposal.proposal_id, approve },
      })
      if (result.structuredContent) render(result.structuredContent as Data)
    } catch {
      box.append(el('p', 'That did not go through. Try again.', 'waiting'))
    }
  }
  yes.addEventListener('click', () => void answer(true))
  no.addEventListener('click', () => void answer(false))
  buttons.append(yes, no)
  box.append(buttons)
}

function agreedView(data: Extract<Data, { view: 'agreed' }>, box: HTMLElement) {
  const banner = el('div', '', 'done')
  banner.append(el('span', '✓', 'check'), el('h1', 'Settled'))
  box.append(banner, el('p', data.summary, 'summary lead'))
  if (data.proposal) box.append(termsBlock(data.proposal))
}

function ledgerView(data: Extract<Data, { view: 'ledger' }>, box: HTMLElement) {
  const list = el('ul')
  for (const { family, balance } of data.balances) {
    const row = el('li')
    const status =
      balance > 0 ? el('span', owes(balance), 'owed') : balance < 0 ? el('span', owed(-balance), 'owe') : el('span', 'Even', 'even')
    row.append(el('strong', `The ${family}s`), status)
    list.append(row)
  }
  box.append(el('h1', 'Favour ledger'), el('p', data.summary, 'summary'), list)
}

function render(data: Data | undefined) {
  if (!data?.view) return
  const box = el('div', '', 'view')
  if (data.view === 'feed') feedView(data, box)
  else if (data.view === 'proposal') proposalView(data, box)
  else if (data.view === 'agreed') agreedView(data, box)
  else ledgerView(data, box)
  root.replaceChildren(box)
}

const app = new App({ name: 'Between', version: '0.0.0' })
app.ontoolresult = result => render(result.structuredContent as Data | undefined)
await app.connect()
