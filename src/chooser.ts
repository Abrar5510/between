import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk'

/**
 * The chooser picks one of the moves the engine generated. The engine only
 * ever generates legal moves, so the chooser can be wrong but never unsafe.
 *
 * - `rules` is the deterministic fallback: always the top-ranked move.
 * - `claude` asks Claude on Bedrock to weigh the family's plain-English
 *   preferences, with a hard timeout and the rules answer as fallback.
 */

export interface ChooserInput {
  household: string
  prefs: { key: string; value: string }[]
  options: string[]
  note: string
}

export type ChoiceSource = 'rules' | 'claude'

export interface Choice {
  index: number
  why: string
  source: ChoiceSource
}

export type Chooser = (input: ChooserInput) => Promise<Choice>

export function rulesChooser(): Chooser {
  return async () => ({ index: 0, why: 'Top-ranked move.', source: 'rules' })
}

function buildPrompt(input: ChooserInput): string {
  const prefs = input.prefs.length ? input.prefs.map(p => `- ${p.value}`).join('\n') : '- (none)'
  const options = input.options.map((o, i) => `${i}. ${o}`).join('\n')
  return [
    `You are the household agent for the ${input.household} family. ${input.note}`,
    '',
    'This family\'s standing preferences:',
    prefs,
    '',
    'The legal moves, best-ranked first:',
    options,
    '',
    'Reply with JSON only, no prose: {"index": <number>, "why": "<under 15 words>"}',
    'Pick the move that fits the family\'s preferences best. If no preference applies, pick index 0.',
  ].join('\n')
}

/** Claude on Amazon Bedrock with a four-second budget; falls back to rules on any failure. */
export function bedrockChooser(opts: { region: string; model: string }): Chooser {
  let client: AnthropicBedrockMantle | undefined
  const fallback = rulesChooser()
  return async input => {
    try {
      client ??= new AnthropicBedrockMantle({ awsRegion: opts.region })
      const response = await client.messages.create(
        {
          model: opts.model,
          max_tokens: 200,
          output_config: { effort: 'low' },
          system: 'You choose between already-legal options for a family calendar assistant. Never invent options.',
          messages: [{ role: 'user', content: buildPrompt(input) }],
        },
        { timeout: 4_000, maxRetries: 0 },
      )
      const text = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('')
      const match = /\{[\s\S]*\}/.exec(text)
      if (!match) return fallback(input)
      const parsed = JSON.parse(match[0]) as { index?: unknown; why?: unknown }
      const index = typeof parsed.index === 'number' ? Math.trunc(parsed.index) : NaN
      if (!Number.isInteger(index) || index < 0 || index >= input.options.length) return fallback(input)
      const why = typeof parsed.why === 'string' && parsed.why.trim() ? parsed.why.trim().slice(0, 120) : 'Chosen by Claude.'
      return { index, why, source: 'claude' }
    } catch (error) {
      console.error(JSON.stringify({ at: new Date().toISOString(), chooser: 'bedrock-fallback', error: String(error) }))
      return fallback(input)
    }
  }
}

export function chooserFromEnv(env: NodeJS.ProcessEnv): Chooser {
  if (env.CHOOSER === 'claude') {
    return bedrockChooser({
      region: env.AWS_REGION ?? 'us-east-1',
      model: env.BETWEEN_MODEL ?? 'anthropic.claude-opus-5-5',
    })
  }
  return rulesChooser()
}
