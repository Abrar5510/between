import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { Offer, MAX_COUNTERS } from 'between-protocol'

/**
 * Regenerates packages/protocol/offer.schema.json from the Zod schema, so the
 * published JSON Schema can never drift from the code that enforces it.
 *
 * Run: npm run schema:protocol
 */

const json = z.toJSONSchema(Offer, { target: 'draft-2020-12', io: 'input' }) as Record<string, unknown>
json.$schema = 'https://json-schema.org/draft/2020-12/schema'
json.title = 'Between offer'
json.description =
  'One message between two household agents. Strict: unknown properties are rejected. ' +
  "'ask' is always what the thread initiator needs covered; 'give' is what the initiator takes on in return " +
  `(null means no trade). A thread allows at most ${MAX_COUNTERS} counters before only accept or decline is valid.`

const out = fileURLToPath(new URL('../packages/protocol/offer.schema.json', import.meta.url))
writeFileSync(out, JSON.stringify(json, null, 2) + '\n')
console.log(`wrote ${out}`)
