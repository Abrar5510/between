# Between

Your Alexa negotiates with other families' Alexas, so you don't have to send the group text.

- **Track:** Alexa+
- **Mini challenge:** Open Source (the negotiation protocol as a standalone library)
- **Deadline:** Fri Oct 23, 2026, 12:00 PM PT. Target submission: Thu Oct 22.

## Status of the claims in this doc

- **Checked by search (Oct 10):** no shipped consumer product does household-to-household agent negotiation. Only academic simulations exist. A quick search cannot prove absence.
- **Checked by search:** Alexa+ for Builders supports MCP spec 2025-11-25 and MCP Apps.
- **Not verified:** whether the Alexa+ client supports the spec's long-running tasks and approval prompts (elicitation), and whether you can connect a self-hosted server to a real device today. These are the day-1 spikes.

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

| Dates | Work |
|---|---|
| Oct 10–11 | Spikes: connect a hello-world MCP server to Alexa+; run a two-agent negotiation in the terminal. Start the friction log. |
| Oct 12–14 | Offer protocol, signing, negotiation engine, tests. |
| Oct 15–16 | MCP tools, approval flow, ledger. |
| Oct 17–18 | Proposal card and negotiation feed; simulated second and third homes. |
| Oct 19 | Extract the library, README, license. Request AWS credits (closes Oct 21, 12:00 PM PT). |
| Oct 20 | Polish, product feedback answers, friction log. |
| Oct 21 | Demo video. |
| Oct 22 | Submit. |

## Risks

| Risk | Fallback |
|---|---|
| Cannot connect a self-hosted server to a real Alexa+ device | Run all three homes in the simulated Alexa+ web app, which the rules allow. |
| Alexa+ does not support long-running tasks or approval prompts | Poll with `negotiation_status` and ask for approval as a normal turn. |
| Negotiations loop or produce bad trades | Three-round cap, and the agent may only offer slots its own calendar shows as free. |
| The demo looks like a scheduling app | Lead with the two-home approval and the offers-only message log. |

## Idea test (brief, section 7)

1. **Track:** Alexa+.
2. **Memorable moment:** two Alexas in two homes each asking their family to approve the same deal.
3. **Avoids the obvious list:** yes. It is multi-turn and multi-party, and it wraps no existing API.
4. **Buildable by Oct 23:** yes at the scope above, if the day-1 spikes pass.
5. **Mini challenge without bloat:** yes. The protocol library is code the project needs anyway.

## Devpost description (draft)

- **One-line pitch:** Your Alexa negotiates with other families' Alexas to sort out who does what, without anyone sharing a calendar.
- **The problem:** Coordinating between households runs on group texts and guilt. Assistants serve one home and cannot talk to the next.
- **What it does:** Ask for help once. Your agent negotiates a trade with trusted families' agents and brings back one proposal. Both families approve by voice, both calendars update, and a ledger keeps favours even over time.
- **How it works:** One self-hosted MCP server per household (spec 2025-11-25, Streamable HTTP). Servers exchange signed offers over HTTP. Each agent decides using only its own family's calendar, preferences and ledger. An MCP App shows the proposal and the negotiation feed.
- **Why it's creative:** An agentic workflow across households, with state across sessions and an MCP App. The agent brokers between people instead of serving one.
- **What's new during the window:** Everything. Started Oct 10, 2026.
- **Open-source plan:** MIT license. Main repo plus the negotiation protocol as its own library. URLs to add.
