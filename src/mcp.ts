import { readFileSync } from 'node:fs'
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

const APP_URI = 'ui://between/app.html'
const APP_HTML = new URL('../dist/app/index.html', import.meta.url)

const LedgerResult = z.object({
  view: z.literal('ledger'),
  summary: z.string().describe('One or two plain sentences that can be spoken as they are.'),
  balances: z.array(
    z.object({
      family: z.string(),
      balance: z.number().int().describe('Positive: they owe this household. Negative: this household owes them.'),
    }),
  ),
  ask_first: z.string().nullable().describe('The family to ask first next time, or null if everyone is even.'),
})

// ponytail: fixed data until db.ts lands; the tool shape and the view are the real ones.
function ledger(): z.infer<typeof LedgerResult> {
  return {
    view: 'ledger',
    summary: 'The Lees owe you two. You are even with the Parks and the Chens. Ask the Lees first.',
    balances: [
      { family: 'Lee', balance: 2 },
      { family: 'Park', balance: 0 },
      { family: 'Chen', balance: 0 },
    ],
    ask_first: 'Lee',
  }
}

/** One server per request: the endpoint is stateless. */
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'between', version: '0.0.0' })

  registerAppTool(
    server,
    'ledger',
    {
      title: 'Favour ledger',
      description:
        'Who owes whom between this household and the families it trades school runs and pickups with. ' +
        'Call it when the user asks who to ask for help, who owes them a favour, or whether things are even.',
      inputSchema: z.object({}),
      outputSchema: LedgerResult,
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: APP_URI } },
    },
    async () => {
      const result = ledger()
      return { content: [{ type: 'text', text: result.summary }], structuredContent: result }
    },
  )

  registerAppResource(
    server,
    'Between',
    APP_URI,
    { description: 'Negotiation feed, proposal card and favour ledger.' },
    async () => ({
      contents: [{ uri: APP_URI, mimeType: RESOURCE_MIME_TYPE, text: readFileSync(APP_HTML, 'utf8') }],
    }),
  )

  return server
}
