import { App } from '@modelcontextprotocol/ext-apps'

type Ledger = { view: 'ledger'; summary: string; balances: { family: string; balance: number }[] }
type View = Ledger // feed, proposal and agreed views join this union as their tools land

const root = document.getElementById('root')!

// textContent only: nothing from a tool result is ever parsed as HTML.
function el(tag: string, text = '', className = ''): HTMLElement {
  const node = document.createElement(tag)
  node.textContent = text
  node.className = className
  return node
}

const owes = (n: number) => (n === 1 ? 'owe you one' : `owe you ${n}`)
const owed = (n: number) => (n === 1 ? 'You owe them one' : `You owe them ${n}`)

function renderLedger(data: Ledger) {
  const list = el('ul')
  for (const { family, balance } of data.balances) {
    const row = el('li')
    const status =
      balance > 0 ? el('span', owes(balance), 'owed') : balance < 0 ? el('span', owed(-balance), 'owe') : el('span', 'Even', 'even')
    row.append(el('strong', `The ${family}s`), status)
    list.append(row)
  }
  root.replaceChildren(el('h1', 'Favour ledger'), el('p', data.summary, 'summary'), list)
}

function render(data: View | undefined) {
  if (data?.view === 'ledger') renderLedger(data)
}

const app = new App({ name: 'Between', version: '0.0.0' })
app.ontoolresult = result => render(result.structuredContent as View | undefined)
await app.connect()
