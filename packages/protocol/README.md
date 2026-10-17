# between-protocol

The wire protocol for **Between** — family assistants that negotiate favours with
each other so nobody has to send the group text.

Two households each keep their calendar private. When one family needs a school
run covered, their assistant asks the other families a single structured
question: *can you cover this slot, and what do you want in return?* Every byte
that crosses the house line is an **offer**: strictly validated, Ed25519-signed,
bounded in rounds, and small enough that it cannot smuggle a calendar entry or
instructions for another agent.

- **Strict schema** — unknown properties are a hard error, so a compromised
  agent cannot exfiltrate anything through a side channel.
- **Signed** — Ed25519 over the raw request bytes; keys are exchanged out of
  band. Clock skew and expiry are enforced.
- **Bounded** — at most [`MAX_COUNTERS`](#api) counters per thread, one standing
  offer at a time, and every offer carries an expiry.
- **Pure state machine** — `step(thread, offer)` returns the next thread or
  throws. Transport, storage and policy live in the caller.

The full wire description is in [SPEC.md](./SPEC.md); a machine-readable
[JSON Schema](./offer.schema.json) is generated from the same Zod schema the
code enforces.

## Install

```sh
npm install between-protocol
# or, straight from the repository:
npm install git+https://github.com/Abrar5510/between-protocol.git
```

Requires Node 24+ (the package ships TypeScript sources and runs natively under
Node's type stripping, `tsx`, or any bundler).

## The whole protocol in 12 lines

```ts
import { draft, generateKeyPair, open, seal, step } from 'between-protocol'

const keys = generateKeyPair()                       // one key pair per household
const thread = 't_42'

// Ahmad asks the Parks to cover the soccer run, offering a swap in return.
const ask = { task: 'soccer run', when: '2026-10-22T16:00:00-07:00', mins: 60 }
const give = { task: 'soccer run', when: '2026-10-27T16:00:00-07:00', mins: 60 }
const { body, headers } = seal(
  draft({ thread, from: 'ahmad', to: 'park', type: 'request', ask, give }),
  keys.privateKey,
)

// The receiver verifies the bytes it actually got and applies them.
const offer = open(body, headers, id => (id === 'ahmad' ? keys.publicKey : undefined))
const state = step(undefined, offer)                 // { status: 'open', standing: offer, ... }
```

`body` is sent byte for byte — the signature covers exactly those bytes. A
worked two-agent negotiation (decline, counter, two-sided accept) runs with:

```sh
npm run example
```

## API

| Export | What it is |
| --- | --- |
| `Slot` | `{ task, when, mins }` — the only descriptive text that crosses between households: 1–40 plain letters/digits, an ISO instant with offset, 5–1440 minutes. |
| `Offer` | Discriminated union: `request`, `counter`, `accept`, `decline`, on a shared envelope (`v`, `id`, `thread`, `from`, `to`, `sentAt`, `expires`). |
| `draft(fields, ttlMs?, now?)` | Stamps a draft with version, id and timestamps and validates it. |
| `MAX_COUNTERS` | 3. After that only `accept` or `decline` is valid. |
| `generateKeyPair()` | Ed25519 key pair, DER/base64url. |
| `seal(offer, privateKey)` | `{ body, headers }` — JSON string plus `between-key-id` / `between-signature` headers. |
| `open(body, headers, resolveKey, now?)` | Verifies signature, sender, expiry, clock skew, then parses. Throws `ProtocolError`. |
| `Thread`, `step(thread, offer, now?)` | The state machine: `open → half_accepted → agreed`, or `declined` / `expired`. Pure; throws on illegal moves. |
| `expire(thread, now?)` | Marks a live thread expired once its standing offer has lapsed. |
| `ProtocolError` | `error.code` is one of the codes in [SPEC.md §7](./SPEC.md). |

## Threat model in one paragraph

Households do not trust each other's agents, and the wire is `http` between
different homes. What an attacker who fully controls one side can do: decline,
spam distinct threads, or waste another family's rounds — those are curbed by
signatures, per-run caps, and expiries. What they *cannot* do: send anything
that is not an offer (strict schema), change an offer in flight (signature),
replay an old one (ids, expiries, skew window), or read the other side's
calendar (nothing but task labels, instants and durations are ever on the wire).

## Status

`0.1.0` — the version used by the Between hackathon build (October 2026). The
`v: 1` literal in the envelope is the protocol version: any change to the shape
of an offer means a new value, and old implementations fail closed because
unknown fields are rejected.

MIT.
