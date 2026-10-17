# Between: end-to-end build plan

> **Status note (Oct 17, 2026):** this plan was written Oct 10 and its schedule is now out of date. The current project state and the recovery schedule through the Oct 23 deadline live in [PROJECT_STATUS.md](PROJECT_STATUS.md). The sections below are kept for reference.

Owner tags: **[C]** = Claude does it, **[Y]** = you do it (accounts, secrets, hardware, recording, submitting).

## Status (updated Oct 10)

| Item | State |
|---|---|
| 0.1 Scaffold | Done |
| S2 Protocol + two-agent negotiation | Done. `packages/protocol` has the schema, signing and state machine with 10 passing tests, ahead of Monday's task. |
| S3 Hello MCP server + MCP App card | Done. `ledger` tool (fixed data) and its view render in MCP Inspector 2.10.1's Apps sandbox; protocol 2025-11-25 negotiated. |
| S4 Bedrock hello | Blocked: no AWS credentials on this machine (tasks 0.2, 0.3). |
| S1 Alexa+ connect | Blocked: needs the Amazon developer account and CLI setup (task 0.4). |

## 1. Context

`/Volumes/Transend/amadev` holds three briefs and no code. `between.md` defines the project: each household runs its own agent, agents negotiate swaps by exchanging signed offers, and both families approve by voice. It targets the Alexa+ track and the Open Source mini challenge of the Build, Ship, Shape hackathon.

- **Deadline:** Fri Oct 23, 2026, 12:00 PM PT. Target submission Thu Oct 22.
- **Today:** Sat Oct 10. Twelve working days.
- **Outcome:** a working three-minute demo, a public MIT repo, a separately published protocol library with tests, a demo video, a friction log and the Devpost entry.

## 2. What I checked today, and what it changes

| Finding (Amazon docs, npm, local machine) | Effect on the build |
|---|---|
| Alexa+ MCP toolkit is **US-only**. A development-stage add-on is "only accessible to your developer account". | Two real Alexas in two homes is not possible in dev stage. One home on Alexa+ at most; the other homes run in our simulated web app. This matches the scope in `between.md`. |
| Quickstart says round-trip latency must be **under 500 ms**. | No tool call may wait on the network or an LLM. `find_help` returns at once and the negotiation runs in the background. |
| Alexa refreshes tool definitions **only on `alexa-ai deploy`**. Needs a stable public URL. | Use an ngrok static domain in development and the hosted URL from Oct 19. Freeze the four tool schemas early. |
| Auth docs assume OAuth 2.1 (metadata at `/.well-known/…`, PKCE S256, 401 **without** `WWW-Authenticate`). Account linking is optional. Whether a no-auth server deploys is not stated. | Spike S1 tries no-auth first, then a minimal OAuth server only if required. |
| The docs' sample `initialize` shows protocol `2025-03-26` and only a `roots` capability. Elicitation and tasks support are not documented. | Do not build on elicitation or tasks. Approval is a normal tool call. S1 logs what the client really declares. |
| MCP Apps are supported: Alexa renders `_meta.ui.resourceUri` in a webview, on small (≤10") and large (≥11") screens. Voice-only is the baseline. | One MCP App view for the proposal card and feed. Every tool result must also read well as plain speech. |
| `@alexa-ai/cli` is not on public npm. It needs an AWS account, an IAM user, the AWS CLI and a CodeArtifact login that expires every 12 hours. `aws` is not installed here. | Setup is a **[Y]** task on day 1 and goes straight into the friction log. |
| `@modelcontextprotocol/ext-apps` is at 2.0.3 and needs the split v2 SDK (`@modelcontextprotocol/server` 2.3.1, `/node`, `/express`). The old `@modelcontextprotocol/sdk` is the 1.x line. | Build on v2. Fall back to `sdk@1.32` + `ext-apps@1.7.5` only if Alexa's client cannot talk to a v2 server. |
| Local machine: Node 24.16 (built-in `node:sqlite`, Ed25519 in `node:crypto`, `node:test`), `gh` logged in as `Abrar5510`, `ngrok`, `cloudflared`, `docker`, `ffmpeg`. npm is not logged in. | Zero native modules and no test framework needed. `npm login` is a **[Y]** task before publishing. |
| npm name `between-protocol` and GitHub repos `Abrar5510/between`, `Abrar5510/between-protocol` are free. | Use those names. |

Sources: [MCP toolkit overview](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html), [quickstart](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-quickstart.html), [client lifecycle](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-client-lifecycle.html), [authentication](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-authentication.html), [account linking](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-account-linking.html), [web simulator](https://developer.amazon.com/docs/alexaplus/add-ons/test-with-web-simulator.html), [local inspector](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-local-inspector.html), [functional requirements](https://developer.amazon.com/docs/alexaplus/add-ons/functional-requirements.html), [dev environment setup](https://developer.amazon.com/docs/alexaplus/add-ons/set-up-your-development-environment.html). I could not open the Devpost rules page (403), so the rules below come from your two brief files.

## 3. Decisions

| Topic | Decision |
|---|---|
| Alexa+ access | Unknown. Spike S1 decides, time-boxed to Sun Oct 11 end of day. Fallback: every home runs in our simulated Alexa+ web app. |
| Agent brain | Code generates only legal moves and ranks them by the ledger. Claude picks one using the family's plain-English preferences. If Claude is slow, refuses or returns a bad index, the top-ranked move is used. |
| LLM | Claude on Amazon Bedrock through `@anthropic-ai/bedrock-sdk` (`AnthropicBedrockMantle`), model `anthropic.claude-opus-5-5`, `effort: "low"`. The model id is one env var; switching to Haiku for a faster voice loop is your call. |
| Language and runtime | TypeScript on Node 24, run with `tsx`. npm workspaces. No React, no ORM, no test framework. |
| Storage | `node:sqlite`, one database file per household. |
| Signing | Ed25519 over the raw request body, signature in a header. No JSON canonicalisation. |
| Households | Four processes from one codebase: Ahmad, Park, Lee, Chen. `between.md` says three households in scope but the demo script sends the request to three *other* families. A fourth instance is one more seed row, so I follow the script. |
| Mini challenge | Open Source, with `between-protocol` as its own repo and npm package. Bedrock use is described in Product Feedback. No AgentCore or Strands. |
| Hosting | One Docker image, one container per household. Fly.io, four small apps with a volume each. Same image runs on an EC2 box if you would rather spend AWS credits. |

## 4. Architecture

```
 Ahmad home                                               Park home
 Alexa+ (real, if S1 passes)                              Simulated Alexa+ web page
 or simulated Alexa+ web page                             (voice in/out, device frame)
        │ MCP, Streamable HTTP                                   │ MCP, Streamable HTTP
        ▼                                                        ▼
 ┌─────────────────────────┐   POST /peer/offers          ┌─────────────────────────┐
 │ Between server (ahmad)  │ ───────────────────────────▶ │ Between server (park)   │
 │  /mcp   4 tools + App   │ ◀─────────────────────────── │  /mcp   4 tools + App   │
 │  engine  rules + Claude │   signed offers only         │  engine  rules + Claude │
 │  ahmad.db               │                              │  park.db                │
 └─────────────────────────┘                              └─────────────────────────┘
        ▲  same protocol to Lee and Chen (headless instances, no screen in the demo)
```

Each instance holds only its own calendar, preferences, ledger and private key. The only cross-household channel is `POST /peer/offers`, and its schema rejects any field that is not part of an offer. That makes the privacy claim a property of the code, checked by a test.

### Request flow for the demo scenario

1. "I can't take Maya to soccer Thursday" → Alexa calls `find_help({activity:"soccer", date})`.
2. Ahmad's server finds the matching event in its own calendar, creates a negotiation, queues a signed `request` to each trusted peer, and returns immediately with "asking the Parks, Lees and Chens".
3. Each peer verifies the signature, checks its own calendar, generates its legal moves, lets Claude pick, and replies. Lee is busy and declines. Park counters with a swap for its Tuesday run. Chen counters with a swap for a Sunday 7 AM run.
4. Ahmad's engine drops counters whose `give` slot is not free, then Claude picks between Park and Chen. Ahmad's preferences say "no early weekend mornings", so Park wins. Status becomes `proposal_ready`.
5. `negotiation_status` → "The Parks can take Thursday if you take their Tuesday run. Agree?" → `respond_to_proposal({approve:true})` → Ahmad sends `accept` to Park and `decline` to Chen.
6. Park's home sees a proposal awaiting approval. Park says yes → Park sends its own `accept`.
7. Each side now holds both accepts and commits in one SQLite transaction: calendar changes and two ledger entries that net to zero.

## 5. Repo layout

```
amadev/                        git repo → github.com/Abrar5510/between
├─ package.json                workspaces: ["packages/*"]
├─ tsconfig.json  .gitignore  .env.example  LICENSE (MIT)  README.md
├─ BUILD_PLAN.md               this plan
├─ FRICTION_LOG.md             started day 1
├─ docs/between.md             moved from the root
├─ packages/protocol/          → github.com/Abrar5510/between-protocol, npm between-protocol
│   ├─ src/schema.ts           offer schema (zod, strict) + JSON Schema export
│   ├─ src/sign.ts             keygen, seal, open (verify + validate)
│   ├─ src/thread.ts           pure state machine, round cap
│   ├─ src/index.ts
│   ├─ test/*.test.ts          node:test
│   ├─ examples/two-agents.ts  two agents negotiating in the terminal
│   └─ README.md  SPEC.md  offer.schema.json  LICENSE  package.json
├─ src/                        the household server
│   ├─ main.ts                 express app, routes, auth gates, config from env
│   ├─ db.ts                   schema and queries
│   ├─ seed.ts                 demo data for four households, relative to "now"
│   ├─ engine.ts               negotiation logic
│   ├─ chooser.ts              Claude-on-Bedrock pick with rule fallback
│   ├─ peer.ts                 signed send with outbox retry, verified receive
│   ├─ mcp.ts                  four tools + MCP App resource
│   ├─ sim.ts                  simulated Alexa+ backend: MCP client + Bedrock tool loop
│   └─ oauth.ts                only if S1 shows Alexa requires it
├─ web/app/                    MCP App view → one bundled HTML file (vite + singlefile)
├─ web/sim/                    simulated Alexa+ page
├─ test/                       engine tests, four-instance end-to-end test
├─ scripts/dev.ts              start all four households locally
├─ Dockerfile  docker-compose.yml  fly.*.toml
└─ addon-package/addon.json    Alexa add-on manifest, only if S1 passes
```

`hackathon-notes.md` and `hackathon-idea-brief.md` are your private ideation notes. I will add them to `.gitignore` unless you say they should be public.

## 6. The protocol library (`between-protocol`)

Zero knowledge of calendars, MCP or HTTP frameworks. Runtime dependency: `zod` only.

### 6.1 Offer (wire format, version 1)

```json
{
  "v": 1,
  "id": "o_6f0c…",
  "thread": "t_81f…",
  "from": "park",
  "to": "ahmad",
  "type": "request | counter | accept | decline",
  "ask":  { "task": "soccer run", "when": "2026-10-22T16:00:00-07:00", "mins": 60 },
  "give": { "task": "soccer run", "when": "2026-10-27T16:00:00-07:00", "mins": 60 },
  "ref": "o_…",
  "sentAt": "2026-10-21T18:02:11Z",
  "expires": "2026-10-22T02:00:00Z"
}
```

- `ask` and `give` are always from the **thread initiator's** point of view: `ask` is what the initiator needs covered, `give` is what the initiator takes on in return. `give: null` means no trade.
- `request` and `counter` carry `ask` and `give`. `accept` carries `ref`, the id of the offer being accepted. `decline` carries nothing else.
- The schema is strict: unknown keys are rejected. `task` is at most 40 characters of letters, digits, spaces, `'` and `-`. There is no free-text field, so nothing but an offer can cross between homes, and a peer cannot smuggle instructions to another household's LLM.
- A responder that is happy with the request as it stands replies with a `counter` that repeats the terms. `accept` is reserved for a commitment a human has approved.

### 6.2 Signing

- `generateKeyPair()` → Ed25519, exported as base64url.
- `seal(offer, privateKey)` → `{ body, headers }` where `body` is the exact JSON string sent and headers are `Between-Key-Id` and `Between-Signature` (signature over the raw body bytes).
- `open(body, headers, resolveKey, now)` → verifies the signature against the sender's known public key, parses with the strict schema, checks `from` matches the key id, `expires` is in the future and `sentAt` is within five minutes. Throws a typed `ProtocolError` with a code.

### 6.3 Thread state machine

`step(state, offer) → state`, a pure function.

- States: `open`, `half_accepted`, `agreed`, `declined`, `expired`.
- A thread has exactly two parties and starts with a `request`.
- A party cannot counter its own standing offer.
- At most `MAX_COUNTERS = 3` counters per thread. After that only `accept` or `decline` is valid.
- `accept.ref` must name the current standing offer. The first accept moves to `half_accepted`. The other party's accept of the same `ref` moves to `agreed`. A counter after an accept is rejected.
- Any `decline` ends the thread. Terminal states reject everything.

### 6.4 Tests (`node --import tsx --test`)

Schema rejects extra keys and bad task labels · tampered body fails verification · wrong key id fails · expired and clock-skewed offers fail · fourth counter is rejected · countering your own offer is rejected · accept with a stale `ref` is rejected · two accepts reach `agreed` · nothing is accepted after a terminal state · `examples/two-agents.ts` converges or terminates within the cap for 200 random calendars.

### 6.5 Docs

`README.md` (install, 20-line usage example, how to plug it into any MCP server), `SPEC.md` (message format, headers, state diagram, security notes, so it can be implemented in other languages), generated `offer.schema.json`.

## 7. The household server

### 7.1 Configuration (env)

`HOUSEHOLD`, `PORT`, `PUBLIC_URL`, `DB_PATH`, `PRIVATE_KEY`, `MCP_TOKEN`, `DEMO_PASSCODE`, `AWS_REGION`, `BETWEEN_MODEL` (default `anthropic.claude-opus-5-5`), `CHOOSER` (`claude` or `rules`), `TZ`.

Tuning knobs: `PACE_MS` (pause before each agent reply so the feed is watchable; 0 in tests, about 1200 on camera), `COLLECT_MS` (how long the initiator waits for peers, default 4000), `PEER_TIMEOUT_MS` (5000), `OFFER_TTL_H` (24), `DEMO_NOW` (pins "today" so seeds, tests and recordings are reproducible).

### 7.2 Data model (one SQLite file per household)

| Table | Columns | Notes |
|---|---|---|
| `peers` | `id` PK, `name`, `url`, `public_key` | Trusted families, set by the seed. |
| `events` | `id`, `title` (private), `task` (shareable label), `start`, `mins`, `kind`, `would_trade`, `covered_by`, `covering_for`, `thread` | The calendar. `title` never leaves the instance. |
| `prefs` | `key`, `value` | Plain-English preferences for the chooser. |
| `negotiations` | `id`, `event_id`, `status`, `chosen_thread`, `why`, `created_at` | Local fan-out. `why` is the agent's reasoning, shown only at home. |
| `threads` | `id`, `negotiation_id`, `peer`, `role`, `state` (JSON from the library), `updated_at` | One per peer. |
| `messages` | `id` PK (offer id), `thread`, `direction`, `peer`, `body`, `sig`, `at`, `delivered` | Raw wire log. Primary key gives replay protection. `delivered` drives the outbox retry. This table is the "offers only" log shown in the demo. |
| `ledger` | `id`, `peer`, `delta`, `thread`, `note`, `at`, UNIQUE(`thread`,`delta`) | `+1` we covered for them, `-1` they covered for us. Balance is the sum. |

### 7.3 Engine (`src/engine.ts`)

`createEngine({ db, self, send, choose, now, knobs })`. `send` and `choose` are passed in so tests run in memory without HTTP or Bedrock.

- **`findHelp({activity, date})`**: match one event on that date in the own calendar. No match → error listing that day's events. Create the negotiation, open one thread per peer ordered by ledger balance (who owes us most first), send `request`s without awaiting them.
- **`onMessage(offer)`** as responder to a `request`:
  1. Not free at `ask.when` → `decline`.
  2. Legal moves: plain yes (`give: null`), plus one swap per own event in the next 14 days with `would_trade = 1`.
  3. Rank: if we owe them, plain yes first; otherwise swaps first.
  4. `choose(moves, prefs, balance)` → index, default 0. Send `counter`.
- **`onMessage(offer)`** as initiator: a counter whose `give` slot is free in our calendar becomes a candidate. One that is not free gets a `counter` restating `give: null`, which asks the peer for its next-ranked move, until the cap ends the thread.
- **Settling**: when every thread has a candidate or is terminal, or `COLLECT_MS` passes, `choose` picks among candidates. Status becomes `proposal_ready` or `no_help_found`.
- **`respond(proposalId, approve)`**: initiator yes → `accept` to the chosen peer, `decline` to the rest, status `awaiting_other_family`. Responder yes → its own `accept`. Either side no → `decline`.
- **Commit**: when a thread reaches `agreed`, one transaction marks the covered event, inserts the event taken on, and writes the ledger rows. The UNIQUE constraint makes a repeated commit a no-op.
- **Guarantee**: moves are built only from slots the own calendar shows free. Claude returns an index into that list, so it cannot invent a slot.

### 7.4 Chooser (`src/chooser.ts`)

One Bedrock call per decision: system prompt with the household name and preferences, the numbered moves in plain words, the ledger balance. Structured output `{ index, why }`. Four-second timeout. On timeout, refusal, error or out-of-range index, return 0. `why` is stored locally and never sent. Exact SDK calls come from the Claude API skill's TypeScript docs when I write this file.

### 7.5 Peer transport (`src/peer.ts`)

- **Receive** `POST /peer/offers`: raw body up to 4 KB → `open()` → sender must be in `peers`, `to` must be this household → insert into `messages` (duplicate id returns 200 and does nothing) → `engine.onMessage`.
- **Send**: `seal()` → insert into `messages` with `delivered = 0` → `fetch` with `AbortSignal.timeout` → mark delivered. A five-second timer resends undelivered rows, so a dropped final `accept` cannot leave two homes disagreeing.

### 7.6 MCP server (`src/mcp.ts`)

Streamable HTTP at `/mcp`, stateless (Alexa's samples send no session id), JSON responses. Scaffolded from the official ext-apps server template so imports match the installed v2 packages. Every tool declares `inputSchema`, `outputSchema` and annotations, returns `structuredContent` with a speakable `summary`, a plain-text `content` block, and `_meta.ui.resourceUri = "ui://between/app.html"`.

| Tool | Input | Returns | Hints |
|---|---|---|---|
| `find_help` | `activity` (string), `date` (YYYY-MM-DD) | `negotiation_id`, `status: "negotiating"`, task, time, families asked | state-changing |
| `negotiation_status` | `negotiation_id?` (default: anything open, including proposals from other families awaiting approval) | status, feed events, proposal (`they_take`, `you_take`, `proposal_id`, `why`) | read-only |
| `respond_to_proposal` | `proposal_id`, `approve` (boolean) | new status: waiting for the other family, agreed, or declined | idempotent |
| `ledger` | none | balance per family in words, `ask_first` suggestion | read-only |

Errors follow the functional requirements: `isError: true`, no ids or JSON in the message, always a next step ("I found two things on Thursday: soccer and piano. Which one?").

### 7.7 MCP App view (`web/app/`)

One vanilla-TypeScript view, bundled to a single HTML file, that switches on `structuredContent.view`:

- **Feed**: one row per message with the family, direction and outcome, appearing as the negotiation runs.
- **Proposal card**: "They take" and "You take" side by side, with Approve and Decline buttons.
- **Agreed**: both slots confirmed and the ledger line ("You and the Parks are even").
- **Ledger**: a bar per family.

If the host allows calls from the view to the server, the view polls `negotiation_status` every 1.5 s while a negotiation is live and the buttons call `respond_to_proposal`. If not, it renders the snapshot from the tool result and approval is by voice. Layout follows Amazon's MCP design guide pages (layout and rendering, visual foundations, components) for the small and large screen classes.

### 7.8 Simulated Alexa+ (`src/sim.ts` + `web/sim/`)

- **Backend** `POST /sim/turn`: a real MCP client connects to this household's own `/mcp`, lists the tools, and runs a Claude-on-Bedrock tool loop. It returns the spoken reply and the tool results. The simulated home therefore uses exactly the server a real Alexa+ would.
- **Page**: a device frame that renders the MCP App through the ext-apps `app-bridge` host (pattern from the `basic-host` example), a transcript, a microphone button using the browser's speech recognition and speech synthesis (Chrome), and a text box as fallback.
- **Side panels** fed by one `GET /api/state` polled each second: calendar, ledger, and the raw wire log. These are what the camera shows for the calendar, privacy and ledger beats.
- **Incoming proposals**: when `/api/state` shows a proposal awaiting this family, the page starts a turn itself so the home speaks first. The README says plainly that this is the simulator's behaviour; on real Alexa+ the family asks or sees the card.
- **Reset**: `POST /api/reset` re-runs the seed, for rehearsals and for judges.
- Time-box for the `app-bridge` host: half a day on Oct 17. If it overruns, the page imports the view's render function directly and skips the iframe.

### 7.9 Access control

| Surface | Protection |
|---|---|
| `/mcp` | Bearer `MCP_TOKEN`, or OAuth tokens if S1 requires them. Unauthenticated → 401 with no `WWW-Authenticate` header, as Alexa requires. |
| `/peer/offers` | Ed25519 signature, trusted-peer list, strict schema, expiry, replay check, size limit. |
| `/`, `/api/*`, `/sim/*` | HTTP Basic with `DEMO_PASSCODE`, because `/sim/turn` spends Bedrock tokens. |
| Secrets | `.env.<household>` files are git-ignored. Hosted values are Fly secrets. Bedrock uses an IAM user limited to model invocation. |

## 8. Seed data (drives the demo script)

All dates are computed from `DEMO_NOW`: "Thursday" is the next Thursday, "Tuesday" the Tuesday after it.

| Household | Calendar | Preferences | Ledger history |
|---|---|---|---|
| Ahmad | Maya's soccer Thu 4 PM. Free Tue 4 PM. Free Sun 7 AM. | "No early weekend mornings." | Covered for the Lees twice (+2). Even with Park and Chen. |
| Park | Free Thu 4 PM. Soccer run Tue 4 PM, `would_trade`. | "Tuesdays are hard for us." | Even with Ahmad. |
| Lee | Busy Thu 4 PM. | none | Owes Ahmad two (−2). |
| Chen | Free Thu 4 PM. Swim run Sun 7 AM, `would_trade`. | none | Even. |

Result: Lee declines, Park and Chen counter, Claude picks Park because of the Sunday preference, the swap nets to zero, and "who should I ask about Saturday?" answers "the Lees, you covered for them twice".

## 9. Schedule

### Sat Oct 10 – Sun Oct 11: setup and spikes

| # | Task | Owner | Done when |
|---|---|---|---|
| 0.1 | `git init`, workspace scaffold, `.gitignore`, MIT licence, save this plan as `BUILD_PLAN.md`, start `FRICTION_LOG.md` with the eight doc issues already found | C | `npm test` runs an empty suite |
| 0.2 | Request the hackathon AWS credits (moved up from Oct 19 because Bedrock is needed now) | Y | Form sent |
| 0.3 | AWS account, `brew install awscli`, IAM user, enable Claude model access on Bedrock in one US region | Y | `aws sts get-caller-identity` works |
| 0.4 | Amazon developer account, Alexa app profile, US marketplace and locale; then the IAM role policy, AWS profiles and CodeArtifact login from Amazon's setup page; `npm i -g @alexa-ai/cli`; `alexa-ai configure` | Y (I supply the exact commands) | `alexa-ai --version` works, or we learn the account is not eligible |
| **S2** | Protocol skeleton and `examples/two-agents.ts`: two agents with hard-coded calendars reach a swap in the terminal | C | Script prints the message sequence and the agreed terms |
| **S4** | Bedrock hello: one tool-use round trip through `AnthropicBedrockMantle` | C | Reply received; note the latency |
| **S3** | Hello MCP server with one tool and one MCP App card, on v2 packages, shown in the ext-apps `basic-host` and the MCP Inspector | C | Card renders locally |
| **S1** | Expose S3 on an ngrok static domain. `alexa-ai new mcp`, placeholder icons and policy pages, `alexa-ai deploy`, test in the Alexa+ web simulator. The server logs every inbound request: protocol version, declared capabilities, headers, auth behaviour | C + Y | Simulator calls the tool, or the time-box ends |

**Gate G1, Sunday night.** Outcomes and what they switch on:

| S1 result | Consequence |
|---|---|
| Simulator calls our tool | Ahmad home is real Alexa+ (simulator; a device too if you have one). Keep `addon-package/`. |
| Deploy demands OAuth | Build `src/oauth.ts` on Oct 15: metadata documents, token endpoint (client credentials, auth code with PKCE), half a day. |
| Webview allows view → server tool calls | Live feed and tap-to-approve on the device. Otherwise snapshot plus voice. |
| Client declares elicitation or tasks | Recorded in the friction log. Not used: approval is already an explicit tool call and tools must return within 500 ms. |
| Not eligible, or not working by Sunday night | All homes run in our simulator. Drop `addon-package/` and `oauth.ts`. The attempt still feeds the friction log. |

### Mon Oct 12 – Wed Oct 14: protocol and engine

| Day | Task (all C) | Done when |
|---|---|---|
| Mon | `schema.ts`, `sign.ts`, `thread.ts` complete with the tests in 6.4 | `npm test -w packages/protocol` green |
| Tue | `db.ts`, `seed.ts`, `engine.ts` with the rule chooser; in-memory engine tests for the demo scenario, the multi-round case, no-help-found, and a responder's human declining | Engine tests green |
| Wed | `peer.ts` and `main.ts`: four real processes exchange signed offers over HTTP; outbox retry; `chooser.ts` on Bedrock with fallback; `scripts/dev.ts` | `npm run dev` starts four homes; a curl-driven run ends in `agreed` on both sides |

### Thu Oct 15 – Fri Oct 16: MCP tools, approval, ledger

| Day | Task (all C) | Done when |
|---|---|---|
| Thu | `mcp.ts` with the four tools, schemas, annotations, error wording, bearer auth. `oauth.ts` if G1 requires it. Redeploy the add-on if S1 passed | All four tools work in the MCP Inspector |
| Fri | `test/e2e.test.ts`: starts four instances, drives the whole scenario through an MCP client, asserts calendars, ledgers, the privacy check and per-call latency. Ledger persistence across restart | `npm run e2e` green |

**Tool schemas freeze Friday night.** After that only wording changes.

### Sat Oct 17 – Sun Oct 18: what people see

| Day | Task (all C) | Done when |
|---|---|---|
| Sat | `web/app` view (feed, proposal, agreed, ledger) for both screen classes. `src/sim.ts` tool loop. `web/sim` page with device frame and `app-bridge` host | The full scenario runs by typing in two browser windows |
| Sun | Voice in and out, side panels, proactive incoming proposal, reset, `PACE_MS` tuning, visual polish against Amazon's design guide. Run Amazon's Local Inspector if S1 passed | The demo script runs start to finish by voice in under three minutes |

### Mon Oct 19: library, docs, hosting

| Task | Owner | Done when |
|---|---|---|
| Split `packages/protocol` into `Abrar5510/between-protocol` with history (`git subtree split`), add `README.md`, `SPEC.md`, `offer.schema.json`, CI workflow running the tests | C, with your OK before anything is pushed | Repo public, tests green in CI |
| `npm login`, then publish `between-protocol@0.1.0`; main repo switches to the published version | Y logs in, C publishes on your OK | `npm view between-protocol` shows 0.1.0 |
| Main `README.md`: what it is, architecture diagram, quick start (`npm i && npm run dev`), how the privacy claim is enforced, what is simulated, what was built in the window | C | A clean clone runs the demo locally |
| `Dockerfile`, `docker-compose.yml`, four Fly apps with volumes and secrets; point the add-on at the hosted Ahmad URL and redeploy | C scripts, Y creates the Fly account and installs `flyctl` | The scenario runs against the hosted URLs |
| Push `Abrar5510/between` public | C on your OK | Repo public with MIT licence |

### Tue Oct 20: hardening and paperwork

- **[C]** Failure drills: a peer offline, Bedrock unreachable, a duplicate message, an expired offer, a second `find_help` for the same event. Each must end in a clear spoken message.
- **[C]** Draft Product Feedback for each tool used: Alexa+ MCP toolkit, Alexa AI CLI, web simulator, Local Inspector, MCP TypeScript SDK, ext-apps, Bedrock. Draft feature requests (proactive notifications, multi-account dev testing, documented capabilities).
- **[C]** Tidy `FRICTION_LOG.md` into dated entries: what I tried, what happened, what I expected, the workaround, the suggestion.
- **[C]** Final Devpost text from the draft in `between.md`, updated to what was built.
- **[C]** Video pack: shot list with timings, on-screen layout, reset steps, the code lines to flash, captions file.
- **[Y]** Read everything above; rehearse the script twice.
- **Code freeze at end of day.** Only fixes for demo-breaking bugs after this.

### Wed Oct 21: demo video (AWS credit form closes 12:00 PM PT)

- **[Y]** Record: two browser windows side by side (or the Alexa simulator or device on the left), voice-over, the nine beats from `between.md`.
- **[C]** Cut with `ffmpeg`, add captions and title cards, check the length is under 3:00.
- **[Y]** Upload to YouTube as public.

### Thu Oct 22: submit

- **[Y]** Submit on Devpost with the text, video link, both repo URLs, GitHub username, Open Source description, Product Feedback, friction log and testing instructions (hosted URLs, demo passcode, reset button).
- **[C]** Final check from a clean clone and a private browser window before you press submit.

### Fri Oct 23: buffer until 12:00 PM PT

## 10. Verification

| Check | Command or method | Pass condition |
|---|---|---|
| Protocol | `npm test -w packages/protocol` | All cases in 6.4 pass |
| Engine | `npm test` | Demo scenario, multi-round, no-help, human-decline cases pass |
| End to end | `npm run e2e` (four processes, temporary databases, `CHOOSER=rules`) | Both sides `agreed`; Ahmad's Thursday shows Park, Ahmad's calendar has the Tuesday run; both ledgers net zero |
| Privacy | Inside the e2e test | Every row in every `messages` table parses with the strict schema, and no body contains any private event `title` or preference text from any database |
| Latency | Inside the e2e test | Every MCP tool call returns in under 500 ms |
| Persistence | Restart all four processes, call `ledger` | Balances unchanged |
| MCP conformance | `npx @modelcontextprotocol/inspector` against `/mcp` | Four tools listed and callable; 401 without a token |
| MCP App | ext-apps `basic-host`, then our sim page, at small and large sizes | All four views render and update |
| Claude chooser | Run the scenario with `CHOOSER=claude`, then with Bedrock blocked | Park is chosen; with Bedrock blocked the run still completes |
| Alexa+ (if S1 passed) | Web simulator in isolation mode; Amazon's Local Inspector report | Scenario completes by text; report has no failures |
| Hosted | The scenario against the Fly URLs from a private window | Same result as local; reset works |
| Clean clone | Fresh `git clone`, `npm i`, `npm run dev` | Demo runs with only the README |

## 11. Submission checklist

- [ ] Working project, hosted, with passcode and reset in the testing notes
- [ ] `github.com/Abrar5510/between`, public, MIT
- [ ] `github.com/Abrar5510/between-protocol`, public, MIT, tests in CI, on npm
- [ ] Demo video under three minutes, public on YouTube, English, MCP code visible
- [ ] Text description
- [ ] Product Feedback for every tool, API and SDK
- [ ] Friction log and feature requests
- [ ] Open Source mini challenge fields: repo URL, contribution URL, GitHub username `Abrar5510`, description
- [ ] README states that everything was built from Oct 10, 2026

## 12. Risks

| Risk | Response |
|---|---|
| No usable Alexa+ access | Gate G1 switches to all-simulated homes on Sunday night. No later work depends on real Alexa+. |
| Alexa onboarding eats the week | Hard time-box. S2, S3 and S4 do not wait for it. |
| OAuth turns out to be required | Half a day reserved on Oct 15. |
| v2 SDK does not interoperate with Alexa's client | Fall back to `sdk@1.32` + `ext-apps@1.7.5`; the tool code barely changes. |
| Bedrock is slow or refuses | Four-second timeout and rule fallback. `CHOOSER=rules` for recording if needed. |
| Voice recognition misfires on camera | Text box fallback; the page shows the heard text before sending. |
| The demo reads as a scheduling app | The video leads with two homes approving one deal and dwells on the offers-only log. |
| Quick-tunnel URLs change and break the add-on | ngrok static domain in development, Fly hostname from Oct 19. |
| A lost message leaves homes out of sync | Outbox retry and idempotent offer ids. |

## 13. Left out on purpose

- Real calendar sync, invitations and discovery, payments, more than one task type (as in `between.md`).
- Elicitation and MCP tasks: undocumented on Alexa+ and not needed by an async design.
- Server-sent events: one-second polling of `/api/state` is enough for four homes.
- React, an ORM, a test framework, JSON canonicalisation, a separate split-screen page (two browser windows do the job).
- AgentCore or Strands: only worth it for the AWS Builder challenge, which this entry does not target.
- Automatic fallback to the next family when the chosen family's human says no. Add it if Oct 20 has slack.

## 14. What I need from you

1. **Today:** request the AWS credits; AWS account with Bedrock model access; `brew install awscli`.
2. **Today or tomorrow:** Amazon developer account set to the US marketplace, then the CLI setup. Tell me early if the account is not eligible.
3. **Tell me:** whether you have an Echo Show, and whether the two `hackathon-*.md` files may go in the public repo.
4. **By Oct 19:** `npm login`, a Fly.io account with `flyctl`, and your OK to make the two repos public.
5. **Oct 20–22:** rehearse, record, upload, submit.

After approval I start with task 0.1, then S2, S4 and S3 in that order, since none of them waits on an account.
