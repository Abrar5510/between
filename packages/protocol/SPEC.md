# Between wire protocol — v1

This is the normative description of what crosses between two household
servers. It is short on purpose: the whole point is that a family's assistant
cannot say anything except *"cover this slot, I'll give you this in return"*,
*"yes"*, *"no"*, or *"here's a different deal"*.

The implementation lives in `src/` (Zod schema, signing, thread state machine);
`offer.schema.json` is generated from the same schema by
`scripts/emit-protocol-schema.ts`.

## 1. Transport

One offer is one HTTP request:

```
POST /peer/offers
content-type: application/json
between-key-id: <sender household id>
between-signature: <base64url Ed25519 signature>

<the JSON body, byte for byte>
```

- The **signature covers the raw request body**. Receivers must verify against
  the bytes they received, before parsing.
- `between-key-id` must equal the offer's `from` field; otherwise the receiver
  rejects with `sender_mismatch`.
- Public keys are exchanged out of band (in Between, they are pasted into each
  household's peer list) and are never trusted from the wire.
- Responses: `200 {"ok":true}` on acceptance, `200 {"ok":true,"duplicate":true}`
  for an offer already seen, `400 {"error":"<code>"}` otherwise, `413` for
  bodies over 4 KiB. A receiver must not disclose *why* it doesn't know a
  sender beyond `unknown_sender`.

## 2. Envelope

Every offer carries:

| field | type | notes |
| --- | --- | --- |
| `v` | `1` | protocol version, a literal |
| `id` | id | offer id, `o_<uuid>` by convention |
| `thread` | id | the negotiation this belongs to, `t_<uuid>` by convention |
| `from` | id | sender household |
| `to` | id | recipient household |
| `sentAt` | instant | ISO 8601 with UTC offset |
| `expires` | instant | after this, the offer is void |

`id` is the primary replay key; `expires` plus a ±5 minute `sentAt` window is
the second line of defence.

Ids match `^[A-Za-z0-9_-]{1,64}$`. Instants are ISO 8601 timestamps **with an
offset** (`2026-10-22T16:00:00-07:00`); a bare `Z` is also an offset.

## 3. Slots

`Slot = { task, when, mins }`

| field | type | constraint |
| --- | --- | --- |
| `task` | string | 1–40 characters from `letters, digits, space, ' , -` |
| `when` | instant | the start of the slot |
| `mins` | integer | 5 … 1440 |

A slot is the **only** descriptive text in the protocol. The character set and
length cap exist so that a slot cannot carry a story, an address, a name from a
private calendar, or an instruction aimed at another family's model.

## 4. Offer types

Terms are always expressed **from the thread initiator's side**:

- `ask` — the slot the initiator needs covered.
- `give` — the slot the initiator takes on in return, or `null` for a plain
  favour with no swap.

| type | fields | meaning |
| --- | --- | --- |
| `request` | `ask`, `give` | opens a thread; only valid as the first offer |
| `counter` | `ask`, `give` | responder (or initiator) answers with different `give`; `ask` must be unchanged |
| `accept` | `ref` | approves the standing offer whose id is `ref` |
| `decline` | — | ends the thread |

Because terms are relative to the initiator, a `counter` never re-states whose
run it is talking about — each side reads `ask` and `give` through its own role.
This is what makes the two sides' plain-language summaries differ without any
extra fields.

## 5. Thread state machine

State: `{ id, initiator, responder, status, standing, counters, acceptedBy }`.

| from | event | to |
| --- | --- | --- |
| — | `request` | `open` |
| `open` | `counter` (other side, ≤ `MAX_COUNTERS`) | `open`, `counters+1` |
| `open` / `half_accepted` | `accept` (first party) | `half_accepted` |
| `half_accepted` | `accept` (second party, same `ref`) | `agreed` |
| any live | `decline` | `declined` |
| any live | `step` after `standing.expires` | `expired` |

- **Two-sided approval is mandatory.** `agreed` requires an `accept` from both
  parties, both referencing the current standing offer. A commitment only
  happens after both families' humans have said yes.
- **`MAX_COUNTERS = 3`.** After that, only `accept` or `decline` is valid.
- `accept` is valid in `open` too — a plain yes to a swap proposal.

## 6. Rejections

`step` throws `ProtocolError` with one of:

`self_offer`, `no_thread`, `wrong_thread`, `not_a_party`, `thread_closed`,
`expired`, `duplicate_request`, `already_accepted`, `own_offer`, `round_cap`,
`ask_changed`, `stale_ref`, `duplicate_accept`.

`open` throws: `unsigned`, `unknown_sender`, `bad_signature`, `bad_offer`,
`sender_mismatch`, `expired`, `clock_skew`.

Receivers answer `400 {"error": code}`. Rejections are final for that offer;
a well-behaved sender treats `round_cap`, `expired` and `thread_closed` as the
end of the negotiation.

## 7. Cryptography

- Ed25519, `@noble`-free: Node's `node:crypto` `sign`/`verify` with `null`
  algorithm (Ed25519 needs no hash choice).
- Keys: SPKI (public) and PKCS#8 (private), DER, base64url.
- The signature is over the exact serialized body — senders must not re-serialize.
- Clock skew allowance: ±5 minutes between `sentAt` and the receiver's clock.
- Replay: `id` must be unique per sender; receivers keep seen ids. Expiry caps
  the replay window even without persistent storage.

## 8. Privacy properties

On the wire, the only information about a household is:

- its id, the slots it is offering/asking for (task label, start, duration), and
  the timing of its messages.

It never includes calendar event titles, participants, locations, notes,
preferences, addresses, or free-form text. The wire log in Between's demo is the
receipt: every message shown there is a schema-valid offer.

## 9. Versioning

`v` is a required literal (`1`). All objects are *strict*: unknown properties
are rejected. A future version therefore cannot be silently half-understood —
an old server rejects it, and the families simply have no negotiation instead
of a wrong one.

## 10. Tests

`packages/protocol/test/protocol.test.ts` covers the schema's strictness, id and
instant validation, signature tampering, sender mismatch, expiry and skew, the
counter cap, ask-change rejection, stale `ref`, duplicate accept, and the
two-sided agreement path.
