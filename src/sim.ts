import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { nameOf } from './config.ts'
import type { Clock } from './dates.ts'

/**
 * The simulated Alexa+ backend. One turn = one spoken sentence in, one spoken
 * reply out. It talks to this household's own /mcp over HTTP with a real MCP
 * client, so the simulator drives exactly the server a real Alexa+ would.
 *
 * With CHOOSER=claude (Bedrock credentials present) it runs a Claude tool
 * loop. Otherwise a small rules interpreter understands the demo's sentences.
 */

export interface SimCall {
  name: string
  isError: boolean
  summary: string
  content: unknown
  structuredContent?: unknown
}

export interface SimTurnResult {
  reply: string
  calls: SimCall[]
}

export interface SimOptions {
  household: string
  port: number
  mcpToken?: string
  clock: Clock
  chooser: string
  region?: string
  model?: string
  prefs: () => { key: string; value: string }[]
  log?: (message: string, extra?: Record<string, unknown>) => void
}

const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

export function createSim(opts: SimOptions) {
  const log = opts.log ?? (() => {})
  let clientPromise: Promise<Client> | undefined
  /** Recent dialogue, for the Claude tool loop. The rules path is stateless. */
  const history: { role: 'user' | 'assistant'; content: string }[] = []

  async function client(): Promise<Client> {
    if (!clientPromise) {
      clientPromise = (async () => {
        const c = new Client({ name: 'between-sim', version: '0.1.0' })
        const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${opts.port}/mcp`), {
          requestInit: opts.mcpToken ? { headers: { Authorization: `Bearer ${opts.mcpToken}` } } : undefined,
        })
        await c.connect(transport)
        return c
      })()
      clientPromise.catch(() => {
        clientPromise = undefined
      })
    }
    return clientPromise
  }

  async function callTool(name: string, args: Record<string, unknown>): Promise<SimCall> {
    const c = await client()
    let result
    try {
      result = await c.callTool({ name, arguments: args })
    } catch (error) {
      clientPromise = undefined // reconnect on the next turn
      throw error
    }
    const blocks = (result.content ?? []) as { type: string; text?: string }[]
    return {
      name,
      isError: Boolean(result.isError),
      summary: blocks.find(b => b.type === 'text')?.text ?? '',
      content: result.content,
      structuredContent: result.structuredContent,
    }
  }

  // ── rules path ───────────────────────────────────────────────────────────

  async function rulesTurn(text: string): Promise<{ calls: SimCall[]; reply?: string }> {
    const t = text.toLowerCase().trim()
    if (t === '__auto__') return { calls: [await callTool('negotiation_status', {})] }
    if (t.length < 40 && /\b(yes|yeah|yep|sure|okay|ok|correct|that works|go ahead|do it|approve|please do|sounds good)\b/.test(t)) {
      return { calls: [await callTool('respond_to_proposal', { approve: true })] }
    }
    if (/^(no|nope|decline|reject|don'?t|do not|cancel)\b/.test(t)) {
      return { calls: [await callTool('respond_to_proposal', { approve: false })] }
    }
    if (/ledger|owe|who should i ask|who owes|favour|favor|ask first|even with/.test(t)) {
      return { calls: [await callTool('ledger', {})] }
    }
    // "What's the news?" / "Is Thursday sorted?" — they are asking how it is going.
    if (/news|sorted|hear|heard|replied|reply|happening|going on|update|status|what did|how did it go|anything (new|yet)|any (news|progress)/.test(t)) {
      return { calls: [await callTool('negotiation_status', {})] }
    }
    const dayWord = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(t)?.[1]
    const wantsHelp = /can'?t|cannot|won'?t|not (going to|able)|need|help|cover|sort|ask|pick|arrange|stuck/.test(t)
    if (dayWord && wantsHelp) {
      const taken = /\b(?:take|cover|handle|drive|pick up|do)\b([\s\S]*?)\s+on\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)/.exec(t)
      let activity = 'help'
      if (taken) {
        let phrase = taken[1]
        const to = phrase.lastIndexOf(' to ')
        if (to !== -1) phrase = phrase.slice(to + 4)
        phrase = phrase.replace(/^(?:the|a)\s+/, '').replace(/[^a-z\s]/g, '').trim()
        if (phrase) activity = phrase
      }
      const date = opts.clock.nextWeekday(DAY_INDEX[dayWord], 0).slice(0, 10)
      return { calls: [await callTool('find_help', { activity, date })] }
    }
    // Anything else is treated as "what is going on" — the honest default.
    return { calls: [await callTool('negotiation_status', {})] }
  }

  // ── Claude tool loop (Bedrock) ───────────────────────────────────────────

  async function claudeTurn(text: string): Promise<{ calls: SimCall[]; reply?: string }> {
    const c = await client()
    const { tools } = await c.listTools()
    const bedrockClient = new AnthropicBedrockMantle({ awsRegion: opts.region ?? 'us-east-1' })
    const prefs = opts.prefs().map(p => `- ${p.value}`).join('\n') || '- (none)'
    const system = [
      `You are the ${nameOf(opts.household)} family's voice assistant, speaking aloud in their home.`,
      `Today is ${opts.clock.now().toISOString().slice(0, 10)}.`,
      "Keep every reply to one or two short sentences — it is read aloud, not shown.",
      'Use the tools for anything about the shared family calendar or negotiations between families.',
      'Never invent availability or agreements: the tools are the only source of truth.',
      'If the family asks to confirm a proposal, call negotiation_status first if you need its id, then respond_to_proposal.',
      "The family's standing preferences:",
      prefs,
    ].join('\n')

    const messages: unknown[] = history
      .slice(-16)
      .map(h => ({ role: h.role, content: [{ type: 'text', text: h.content }] }))

    const calls: SimCall[] = []
    for (let i = 0; i < 6; i++) {
      const response = await bedrockClient.messages.create(
        {
          model: opts.model ?? 'anthropic.claude-opus-5-5',
          max_tokens: 400,
          output_config: { effort: 'low' },
          system,
          tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description ?? '',
            input_schema: { type: 'object' as const, ...(tool.inputSchema as Record<string, unknown>) },
          })),
          messages: messages as never,
        },
        { timeout: 30_000, maxRetries: 1 },
      )
      messages.push({ role: 'assistant', content: response.content })
      if (response.stop_reason !== 'tool_use') {
        const reply = response.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join(' ')
          .trim()
        return { calls, reply: reply || undefined }
      }
      const results: unknown[] = []
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue
        const call = await callTool(block.name, (block.input ?? {}) as Record<string, unknown>)
        calls.push(call)
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: [{ type: 'text', text: call.summary || '(ok)' }],
          is_error: call.isError,
        })
      }
      messages.push({ role: 'user', content: results })
    }
    return { calls }
  }

  // ── the turn ─────────────────────────────────────────────────────────────

  async function runTurn(text: string): Promise<SimTurnResult> {
    history.push({ role: 'user', content: text })
    let outcome: { calls: SimCall[]; reply?: string }
    if (opts.chooser === 'claude') {
      try {
        outcome = await claudeTurn(text)
      } catch (error) {
        log('sim claude loop failed, using rules', { error: String(error) })
        outcome = await rulesTurn(text)
      }
    } else {
      outcome = await rulesTurn(text)
    }
    const last = outcome.calls[outcome.calls.length - 1]
    const reply = outcome.reply ?? last?.summary ?? "Sorry, I didn't catch that one."
    history.push({ role: 'assistant', content: reply })
    if (history.length > 40) history.splice(0, history.length - 40)
    return { reply, calls: outcome.calls }
  }

  return { runTurn }
}

export type Sim = ReturnType<typeof createSim>
