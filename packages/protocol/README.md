# between-protocol

The wire protocol for **Between**, a system in which household assistants negotiate favours
with one another on behalf of their families.

Each household keeps its calendar private. When a family needs cover for an activity run, its
assistant sends other households a single structured question: *can you cover this slot, and
what do you require in return?* Every message that crosses between households is an **offer**:
strictly validated, Ed25519-signed, bounded in the number of rounds, and too constrained to
carry a calendar entry or instructions addressed to another agent.

- **Strict schema.** Unknown properties are rejected, so a compromised agent cannot exfiltrate
  data through additional fields.
- **Signed.** Ed25519 signatures cover the raw request bytes. Keys are exchanged out of band,
  and clock skew and expiry are enforced.
- **Bounded.** At most [`MAX_COUNTERS`](#api) counter-offers per thread, one standing offer at a
  time, and a mandatory expiry on every offer.
- **Pure state machine.** `step(thread, offer)` returns the next thread state or throws.
  Transport, storage and policy are the caller's responsibility.

The normative wire description is [SPEC.md](./SPEC.md). A machine-readable
[JSON Schema](./offer.schema.json) is generated from the same Zod schema that the code enforces.

## Installation

```sh
npm install between-protocol
# or directly from the repository:
npm install git+https://github.com/Abrar5510/between-protocol.git
```

Node.js 24 or later is required. The package ships TypeScript sources, which run natively under
Node's type stripping, under `tsx`, or through any bundler.

## Example

```ts
import { draft, generateKeyPair, open, seal, step } from 'between-protocol'

const keys = generateKeyPair()                       // one key pair per household
const thread = 't_42'

// The Ahmad household asks the Park household to cover the soccer run, offering a swap.
const ask = { task: 'soccer run', when: '2026-10-22T16:00:00-07:00', mins: 60 }
const give = { task: 'soccer run', when: '2026-10-27T16:00:00-07:00', mins: 60 }
const { body, headers } = seal(
  draft({ thread, from: 'ahmad', to: 'park', type: 'request', ask, give }),
  keys.privateKey,
)

// The receiver verifies the bytes it received, then applies the offer.
const offer = open(body, headers, id => (id === 'ahmad' ? keys.publicKey : undefined))
const state = step(undefined, offer)                 // { status: 'open', standing: offer, ... }
```

`body` must be transmitted unchanged, because the signature covers exactly those bytes. A
complete two-agent negotiation (rejection, counter-offer and two-sided acceptance) can be run
with:

```sh
npm run example
```

## API

| Export | Description |
| --- | --- |
| `Slot` | `{ task, when, mins }`: the only descriptive text exchanged between households. A label of 1 to 40 letters and digits, an ISO 8601 instant with offset, and a duration of 5 to 1440 minutes. |
| `Offer` | Discriminated union of `request`, `counter`, `accept` and `decline`, sharing a common envelope (`v`, `id`, `thread`, `from`, `to`, `sentAt`, `expires`). |
| `draft(fields, ttlMs?, now?)` | Adds the version, identifier and timestamps to a draft offer and validates it. |
| `MAX_COUNTERS` | 3. Once reached, only `accept` or `decline` is valid. |
| `generateKeyPair()` | Generates an Ed25519 key pair, encoded as DER in base64url. |
| `seal(offer, privateKey)` | Returns `{ body, headers }`: the JSON string and the `between-key-id` and `between-signature` headers. |
| `open(body, headers, resolveKey, now?)` | Verifies the signature, sender, expiry and clock skew, then parses the offer. Throws `ProtocolError`. |
| `Thread`, `step(thread, offer, now?)` | The state machine: `open → half_accepted → agreed`, or `declined` / `expired`. Pure; throws on illegal transitions. |
| `expire(thread, now?)` | Marks a live thread as expired once its standing offer has lapsed. |
| `ProtocolError` | `error.code` is one of the codes listed in [SPEC.md §6](./SPEC.md#6-rejections). |

## Threat model

Households do not trust one another's agents, and traffic between households travels over
plain HTTP. An attacker with full control of one household can decline requests, open many
distinct threads, or consume another household's negotiation rounds; these behaviours are
limited by signatures, per-run caps and expiries. Such an attacker cannot send anything other
than an offer (strict schema), alter an offer in transit (signature), replay a previous offer
(identifiers, expiries and the skew window), or read the other household's calendar (only task
labels, instants and durations are ever transmitted).

## Status

Version `0.1.0`, as used by the Between hackathon build (October 2026). The `v: 1` literal in
the envelope is the protocol version. Any change to the structure of an offer requires a new
value, and older implementations fail closed because unknown fields are rejected.

## Licence

MIT.
