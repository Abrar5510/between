import { readFileSync } from 'node:fs'
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { Engine } from './engine.ts'

const APP_URI = 'ui://between/app.html'
const APP_HTML = new URL('../dist/app/index.html', import.meta.url)

const FeedItem = z.object({
  at: z.string(),
  peer: z.string(),
  text: z.string(),
})

const Proposal = z.object({
  proposal_id: z.string(),
  they_take: z.string(),
  you_take: z.string(),
  why: z.string().nullable(),
})

const View = z.enum(['feed', 'proposal', 'agreed', 'ledger'])

const FindHelpResult = z.object({
  view: z.literal('feed'),
  summary: z.string().describe('One or two plain sentences that can be spoken as they are.'),
  status: z.string(),
  negotiation_id: z.string(),
  task: z.string(),
  when: z.string(),
  families: z.array(z.string()),
})

const StatusResult = z.object({
  view: View,
  summary: z.string().describe('One or two plain sentences that can be spoken as they are.'),
  status: z.string(),
  negotiation_id: z.string().optional(),
  task: z.string().optional(),
  when: z.string().optional(),
  proposal: Proposal.optional(),
  feed: z.array(FeedItem),
})

const RespondResult = z.object({
  view: View,
  summary: z.string().describe('One or two plain sentences that can be spoken as they are.'),
  status: z.string().optional(),
  negotiation_id: z.string().optional(),
})

const LedgerResult = z.object({
  view: z.literal('ledger'),
  summary: z.string().describe('One or two plain sentences that can be spoken as they are.'),
  balances: z.array(
    z.object({
      family: z.string(),
      balance: z.number().int().describe('Positive: they owe this household. Negative: this household owes them.'),
    }),
  ),
  ask_first: z.string().nullable().describe('The family to ask first next time, or null if nobody is owed.'),
})

/** One server per request: the endpoint is stateless. */
export function createMcpServer(engine: Engine): McpServer {
  const server = new McpServer({ name: 'between', version: '0.1.0' })

  registerAppTool(
    server,
    'find_help',
    {
      title: 'Find help',
      description:
        "Ask the trusted families' assistants to cover one thing on one day — a school run, a pickup, a practice. " +
        'Call it when the user cannot be somewhere and needs another family to step in. ' +
        'It starts a background negotiation and answers immediately; use negotiation_status to hear how it went.',
      inputSchema: z.object({
        activity: z.string().describe('What needs covering, in the user\'s own words: "soccer", "the swim run".'),
        date: z.string().describe('The day the activity is on, as YYYY-MM-DD.'),
      }),
      outputSchema: FindHelpResult,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      _meta: { ui: { resourceUri: APP_URI } },
    },
    async ({ activity, date }) => {
      const result = await engine.findHelp({ activity, date })
      if (!result.ok) {
        return { isError: true, content: [{ type: 'text' as const, text: result.summary }] }
      }
      const structuredContent = {
        view: 'feed' as const,
        summary: result.summary,
        status: result.status ?? 'negotiating',
        negotiation_id: result.negotiationId ?? '',
        task: result.task ?? '',
        when: result.when ?? '',
        families: result.families ?? [],
      }
      return { content: [{ type: 'text' as const, text: result.summary }], structuredContent }
    },
  )

  registerAppTool(
    server,
    'negotiation_status',
    {
      title: 'Negotiation status',
      description:
        'Where a negotiation stands: who replied, the offer on the table, and whether the family must say yes or no. ' +
        'Call it when the user asks what happened about a request, or before answering anything about a pending proposal. ' +
        "Without an id it returns the newest thing that needs the family's attention, including proposals started by other families.",
      inputSchema: z.object({
        negotiation_id: z.string().optional().describe('From find_help or an earlier status call. Omit for whatever needs attention.'),
      }),
      outputSchema: StatusResult,
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: { ui: { resourceUri: APP_URI } },
    },
    async ({ negotiation_id }) => {
      const result = engine.negotiationStatus(negotiation_id)
      const view = result.kind === 'proposal' || result.kind === 'awaiting' ? 'proposal' : result.kind === 'agreed' ? 'agreed' : 'feed'
      const structuredContent = {
        view,
        summary: result.summary,
        status: result.status ?? result.kind,
        ...(result.negotiationId ? { negotiation_id: result.negotiationId } : {}),
        ...(result.task ? { task: result.task } : {}),
        ...(result.when ? { when: result.when } : {}),
        ...(result.proposal
          ? {
              proposal: {
                proposal_id: result.proposal.proposalId,
                they_take: result.proposal.theyTake,
                you_take: result.proposal.youTake,
                why: result.proposal.why ?? null,
              },
            }
          : {}),
        feed: result.feed,
      }
      return { content: [{ type: 'text' as const, text: result.summary }], structuredContent }
    },
  )

  registerAppTool(
    server,
    'respond_to_proposal',
    {
      title: 'Respond to a proposal',
      description:
        "The family's yes or no to the proposal on the table. Call it only after the user clearly agrees or refuses. " +
        'Pass the proposal id from negotiation_status. Saying the same thing twice is safe.',
      inputSchema: z.object({
        proposal_id: z.string().optional().describe('The proposal id from negotiation_status. Omit if there is only one open proposal.'),
        approve: z.boolean().describe('True when the family agrees, false when they refuse.'),
      }),
      outputSchema: RespondResult,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      _meta: { ui: { resourceUri: APP_URI } },
    },
    async ({ proposal_id, approve }) => {
      const result = await engine.respond(proposal_id, approve)
      const view = result.kind === 'agreed' ? 'agreed' : result.kind === 'awaiting' || result.kind === 'negotiating' ? 'proposal' : 'feed'
      const structuredContent = {
        view,
        summary: result.summary,
        ...(result.status ? { status: result.status } : {}),
        ...(result.negotiationId ? { negotiation_id: result.negotiationId } : {}),
      }
      return { content: [{ type: 'text' as const, text: result.summary }], structuredContent }
    },
  )

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
      const result = engine.ledger()
      const balances = result.balances.map(b => ({ family: b.name, balance: b.balance }))
      const askFirst = result.askFirst ? result.balances.find(b => b.peer === result.askFirst)?.name ?? result.askFirst : null
      const structuredContent = { view: 'ledger' as const, summary: result.summary, balances, ask_first: askFirst }
      return { content: [{ type: 'text' as const, text: result.summary }], structuredContent }
    },
  )

  registerAppResource(
    server,
    'Between',
    APP_URI,
    { description: 'Negotiation feed, proposal card, agreed view and favour ledger.' },
    async () => ({
      contents: [{ uri: APP_URI, mimeType: RESOURCE_MIME_TYPE, text: readFileSync(APP_HTML, 'utf8') }],
    }),
  )

  return server
}
