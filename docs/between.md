# Between

Your Alexa negotiates with other families' Alexas, so you don't have to send the group text.

- **Track:** Alexa+
- **Mini challenge:** Open Source (the negotiation protocol as a standalone library)
- **Deadline:** Fri Oct 23, 2026, 12:00 PM PT. Target submission: Thu Oct 22.

## Status of the claims in this doc

- **Checked by search (Oct 10):** no shipped consumer product does household-to-household agent negotiation. Only academic simulations exist. A quick search cannot prove absence.
- **Checked by search:** Alexa+ for Builders supports MCP spec 2025-11-25 and MCP Apps.
- **Resolved in the build (Oct 17):** a self-hosted server cannot be attached to a real Alexa+ device from here — the developer preview is account-gated and US-only — so every home runs in the simulated Alexa+ page, which the rules allow. The elicitation/tasks question stopped mattering: approval is an ordinary tool call (`respond_to_proposal`) and waiting is polled through `negotiation_status`.

## The problem

Coordinating between families is done by hand: who drives to soccer, who covers pickup when a meeting runs late, who has the kids on Saturday. Each request means a group text, three people checking calendars, and someone feeling they always do more than their share.

Every assistant today serves one household. None of them can talk to the household next door.

## What it does

Each household has its own agent with that family's calendar and preferences. When you ask for help, your agent sends requests to the agents of families you trust. They negotiate a trade and bring back one proposal for a yes or no.

Three things make it more than scheduling:

- **Private by design.** Agents exchange offers only. No household ever sees another's calendar, only "yes", "no" or "yes, if you take Tuesday".
- **Trades, not favours.** An agent can counter with a swap, so the answer is often a deal neither family would have found by text.
- **A favour ledger.** The agent remembers who covered for whom across weeks. "The Parks have driven twice this month; you owe them one" shapes who it asks first and what it offers.

## Demo script (under 3 minutes)

Split screen: the Ahmad home on the left, the Park home on the right.

| Time | What happens |
|---|---|
| 0:00 | One line on the problem over a messy group-text screenshot. |
| 0:20 | Left: "Alexa, I can't take Maya to soccer Thursday. Find someone." |
| 0:30 | A visible negotiation feed: request goes to three families. One declines. The Parks' agent counters. |
| 1:00 | Left: "The Parks can take Thursday if you take their Tuesday run. Agree?" "Yes." |
| 1:15 | Right: the Parks' Alexa asks the same question from their side. "Yes." |
| 1:30 | Both calendars update on screen. The ledger shows the swap as even. |
| 1:45 | Privacy beat: show the full message log between the homes. It holds offers only, no calendar entries. |
| 2:05 | Ledger beat, a week later: "Who should I ask about Saturday?" "The Lees. You covered for them twice." |
| 2:25 | Code flash: the MCP tools and the offer schema. Close on the open-source library. |

The moment to remember is two Alexas in two homes each asking their own family to approve the same deal.

## How it works

```
 Ahmad home                          Park home
 Alexa+  ──MCP──▶  Between server    Between server  ◀──MCP──  Alexa+ (simulated web app)
                   calendar, prefs   calendar, prefs
                   ledger            ledger
                        │                 ▲
                        └── signed offers ┘
                           (HTTP, offers only)
```

- **One codebase, one instance per household.** Each instance holds only its own family's data, which is what makes the privacy claim true and not a UI trick.
- **MCP server** (spec 2025-11-25, Streamable HTTP) exposing four tools:
  - `find_help`: start a negotiation for a task and time
  - `negotiation_status`: where a negotiation stands
  - `respond_to_proposal`: the family's yes or no
  - `ledger`: who owes whom
- **Peer protocol:** instances POST signed JSON offers to each other.

  ```json
  {
    "thread": "t_81f",
    "from": "ahmad",
    "type": "request | counter | accept | decline",
    "ask":  { "task": "soccer run", "when": "2026-10-15T16:00" },
    "give": { "task": "soccer run", "when": "2026-10-13T16:00" },
    "expires": "2026-10-14T20:00"
  }
  ```

- **Negotiation engine:** for each incoming offer, the household's agent reads its own calendar, preferences and ledger, then returns accept, decline or a counter. A hard cap of three rounds per thread keeps it bounded.
- **Human approval:** nothing is committed until both families say yes. Use the spec's approval prompt if Alexa+ supports it, otherwise a plain follow-up question.
- **MCP App:** a proposal card and the negotiation feed, for Echo Show and the simulated web app.

## Scope

**In**
- One scenario: a kids' activity run, with swap counters
- Three households: one on Alexa+ (or simulated), two on the simulated web app
- Seeded calendars in SQLite
- Ledger that persists across sessions

**Out**
- Real Google or Apple calendar sync
- Household discovery and invitations (trusted families are configured by hand)
- Payments
- More than one task type

## Mini challenge: Open Source

Publish the offer schema, signing and round logic as a separate small library with tests, so any MCP server can negotiate with another. The judges' "new integration patterns" example fits this directly. Needs: repo URL, contribution URL, GitHub username, description.

AWS Builder is the alternative if the agents run on AgentCore or Strands. A single Bedrock call would land in the judges' "obvious" column, so it only counts if the orchestration is real.

## Plan

| Dates | Work | Outcome |
|---|---|---|
| Oct 10–11 | Spikes: hello-world MCP server toward Alexa+; a two-agent negotiation in the terminal; friction log started | The Alexa+ developer preview turned out to be account-gated and US-only, so the simulator became the device story — friction log, entries 1–9 |
| Oct 12–16 | Offer protocol, signing, negotiation engine, tests | Built and tested in one block on Oct 17 |
| Oct 17 | MCP tools, approval flow, ledger, the app views, the simulated homes, browser verification, the hosted link, public repos | Done the same day: 28 checks green, both repos public, one link live |
| Oct 18–22 | Product feedback, friction log, video, submission | Feedback text and the friction log are written; the video and the Devpost form are the remaining human steps |

## Risks

| Risk | Fallback |
|---|---|
| Cannot connect a self-hosted server to a real Alexa+ device | Every household runs in the simulated Alexa+ page, which the rules allow (this is what shipped). |
| Alexa+ does not support long-running tasks or approval prompts | Poll with `negotiation_status` and ask for approval as a normal turn. |
| Negotiations loop or produce bad trades | Three-round cap, and the agent may only offer slots its own calendar shows as free. |
| The demo looks like a scheduling app | Lead with the two-home approval and the offers-only message log. |

## Idea test (brief, section 7)

1. **Track:** Alexa+.
2. **Memorable moment:** two Alexas in two homes each asking their family to approve the same deal.
3. **Avoids the obvious list:** yes. It is multi-turn and multi-party, and it wraps no existing API.
4. **Built by Oct 17:** yes at the scope above; the day-1 spikes resolved into the simulator decision.
5. **Mini challenge without bloat:** yes. The protocol library is code the project needs anyway.

## Devpost description (final — paste-ready)

**One-line pitch:** Your Alexa negotiates with other families' Alexas to sort
out who does what, without anyone sharing a calendar.

**Inspiration.** Coordinating between households runs on group texts and guilt:
"can anyone do Thursday?" — forty messages, one parent folds. Assistants serve
one home and cannot talk to the next. We gave each home an assistant that owns
exactly this job.

**What it does.** Ask once — *"I can't take Maya to soccer on Thursday. Can you
sort it out?"* Your assistant negotiates with the families you trust, brings
back exactly one offer, and neither family is committed until both say yes out
loud. A favour ledger keeps the books even across weeks, so the family who
covers this month gets covered next month.

**How it works.** Every household runs its own MCP server over Streamable HTTP.
The assistant surface is four MCP tools — `find_help`, `negotiation_status`,
`respond_to_proposal`, `ledger` — plus a `ui://` app resource that renders a
negotiation feed, the proposal card (with working Yes/No buttons that call back
into the server), the settled card and the ledger.

Households talk only in **offers**: a strict-schema, Ed25519-signed message
containing a task label, a start time, a duration, and what's wanted in return.
Unknown fields are a hard error, so a compromised agent cannot smuggle a
calendar entry. At most three counters per thread, every offer expires, and
nothing is committed until both families approve. The engine only ever builds
moves from slots its own calendar shows as free; the optional Claude-on-Bedrock
chooser ranks those legal moves and can be wrong without ever being unsafe.

**The demo.** Two simulated Alexa+ homes side by side. Ahmad asks; the Lees
decline (and their calendar stays theirs); the Parks counter with a swap; the
Chens offer a plain favour; the ledger decides who's asked first. One card in
each kitchen: *they take Thursday, you take Tuesday.* Both families say yes.
Both calendars move, both ledgers stay even, and the wire panel shows every byte
that crossed between the houses — signed offers only, no titles, no names, no
locations.

**What's new during the window.** Everything. The repository's first commit is
dated Oct 10, 2026.

**How much is real.** The MCP server, the tools, the app view, the protocol,
the signatures, the engine, the tests and the four-server end-to-end suite are
all real; the Alexa+ device itself is simulated in a web page (development-stage
add-ons are visible only to the developer's own account, so a second household
cannot be tested on hardware). The simulator drives the same MCP server a real
device would; the honest table is in the README.

**Open source.** MIT. Two public repositories:

- **Main project** — the household server, the MCP tools, the app, the
  simulator: [github.com/Abrar5510/between](https://github.com/Abrar5510/between)
- **The protocol, on its own** — `between-protocol` on npm, with `SPEC.md`,
  a generated JSON Schema and tests: [github.com/Abrar5510/between-protocol](https://github.com/Abrar5510/between-protocol)

**Built with.** Node 24 (TypeScript, no build step for the server), MCP SDK
(server/client/express/node), `@modelcontextprotocol/ext-apps` (App +
AppBridge), Express, SQLite via `node:sqlite`, Zod, Vite, Ed25519 via
`node:crypto`; Claude on Amazon Bedrock as an optional chooser; 28 checks across
protocol, engine, MCP surface, failure drills, four-server end-to-end, the full
spoken demo, and two real-browser suites driving both kitchens.

