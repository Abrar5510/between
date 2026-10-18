# Between: Product Specification

**Summary:** A household assistant that negotiates with other households' assistants, removing
the need for group messages to arrange childcare cover.

| | |
|---|---|
| **Track** | Alexa+ |
| **Mini challenge** | Open Source (the negotiation protocol as a standalone library) |
| **Submission deadline** | Friday 23 October 2026, 12:00 PT |

## 1. Problem statement

Coordination between families is currently performed manually: arranging who drives to a
sporting activity, who collects children when a meeting overruns, or who looks after children
at the weekend. Each request typically requires a group message, several people consulting
their calendars, and a persistent perception among participants that the workload is unevenly
shared.

Existing voice assistants serve a single household and have no means of communicating with the
assistants of other households.

## 2. Product description

Each household has its own agent with access to that household's calendar and preferences.
When a family requests help, its agent contacts the agents of trusted households. The agents
negotiate an exchange and return a single proposal for the family to accept or decline.

Three properties distinguish the product from a conventional scheduling tool:

- **Privacy by design.** Agents exchange offers only. No household can view another's
  calendar; it receives only "yes", "no" or a conditional counter-offer such as "yes, if you
  take Tuesday".
- **Exchanges rather than favours.** An agent may counter with a swap, which frequently yields
  an arrangement the families would not have identified through messaging.
- **Favour ledger.** The agent records which household has covered for which over time. A
  statement such as "the Parks have driven twice this month" determines whom the agent asks
  first and what it offers.

## 3. System design

```
 Ahmad household                     Park household
 Alexa+  ──MCP──▶  Between server    Between server  ◀──MCP──  Alexa+ (simulated web app)
                   calendar, prefs   calendar, prefs
                   ledger            ledger
                        │                 ▲
                        └── signed offers ┘
                           (HTTP, offers only)
```

- **One codebase, one instance per household.** Each instance holds only its own household's
  data. The privacy guarantee is therefore a property of the deployment, not of the user
  interface.
- **MCP server** (specification 2025-11-25, Streamable HTTP) exposing four tools:

  | Tool | Purpose |
  |---|---|
  | `find_help` | Starts a negotiation for a task and time. |
  | `negotiation_status` | Reports the current state of a negotiation. |
  | `respond_to_proposal` | Records the household's acceptance or rejection. |
  | `ledger` | Reports the balance of favours between households. |

- **Peer protocol.** Instances send signed JSON offers to one another over HTTP. The normative
  definition is [`packages/protocol/SPEC.md`](../packages/protocol/SPEC.md).
- **Negotiation engine.** For each incoming offer, the household's agent consults its own
  calendar, preferences and ledger and returns an acceptance, a rejection or a counter-offer.
  A limit of three counter-offers per thread guarantees termination.
- **Human approval.** Nothing is committed until both households approve. Approval is an
  ordinary tool call (`respond_to_proposal`); progress is obtained by polling
  `negotiation_status`.
- **MCP App.** A proposal card and negotiation feed, rendered on Echo Show devices and in the
  simulated web application.

## 4. Scope

**In scope**

- A single scenario: covering a children's activity run, including swap counter-offers.
- Four households, each running in the simulated Alexa+ web application.
- Seeded calendars stored in SQLite.
- A favour ledger that persists across sessions.

**Out of scope**

- Synchronisation with Google or Apple calendars.
- Household discovery and invitations (trusted households are configured manually).
- Payments.
- Task types other than activity runs.

## 5. Demonstration script

The demonstration runs for under three minutes on a split screen, with the Ahmad household on
the left and the Park household on the right. The detailed procedure is in the
[demonstration runbook](demo-runbook.md).

| Time | Event |
|---|---|
| 0:00 | Statement of the problem over an example group-message thread. |
| 0:20 | Ahmad household: "I can't take Maya to soccer on Thursday. Can you sort it out?" |
| 0:30 | The negotiation feed shows the request sent to three households. One declines; the Park household counters. |
| 1:00 | Ahmad household: "The Parks can take Thursday if you take their Tuesday run. Agree?" The family approves. |
| 1:15 | Park household: the Park assistant presents the same proposal from its own perspective. The family approves. |
| 1:30 | Both calendars update. The ledger shows the exchange as balanced. |
| 1:45 | Privacy: the complete message log between the households is shown. It contains offers only. |
| 2:05 | Ledger: "Who should I ask about Saturday?" "The Lees. You covered for them twice." |
| 2:25 | Code: the MCP tools and the offer schema, closing on the open-source library. |

The central moment of the demonstration is two assistants, in two households, each asking its
own family to approve the same agreement.

## 6. Validation of assumptions

- **Prior art (searched 10 October 2026).** No shipped consumer product performs
  household-to-household agent negotiation; only academic simulations were found. A search of
  this kind cannot establish absence conclusively.
- **Platform support (searched).** Alexa+ for Builders supports MCP specification 2025-11-25
  and MCP Apps.
- **Device integration (resolved 17 October 2026).** A self-hosted server cannot be attached to
  a physical Alexa+ device from outside the United States, and development-stage add-ons are
  visible only to the developer's own account. All households therefore run in the simulated
  Alexa+ page, which the hackathon rules permit. The question of elicitation and task support
  became moot once approval was implemented as an ordinary tool call.

## 7. Open Source mini challenge

The offer schema, signing and round logic are published as a separate library with its own
tests, so that any MCP server can negotiate with another. This corresponds directly to the
judging example of "new integration patterns". The submission requires a repository URL, a
contribution URL, a GitHub username and a description.

AWS Builder was considered as an alternative entry, but would require the agents to run on
AgentCore or Strands; a single Bedrock call would not demonstrate genuine orchestration.

## 8. Risks

| Risk | Mitigation |
|---|---|
| A self-hosted server cannot be connected to a physical Alexa+ device. | Every household runs in the simulated Alexa+ page, which the rules permit. This is the approach that was adopted. |
| Alexa+ does not support long-running tasks or approval prompts. | Progress is polled through `negotiation_status`, and approval is requested as an ordinary conversational turn. |
| Negotiations fail to terminate or produce poor exchanges. | A three-round limit, and agents may offer only slots shown as free in their own calendar. |
| The demonstration is perceived as a scheduling application. | The demonstration leads with the two-household approval and the offers-only message log. |

## 9. Schedule (as delivered)

| Dates | Planned work | Outcome |
|---|---|---|
| 10–11 Oct | Exploratory work: an initial MCP server for Alexa+, a two-agent negotiation in the terminal, and the friction log. | The Alexa+ developer preview was found to be account-restricted and US-only, so the simulator became the device strategy (friction log entries 1–9). |
| 12–16 Oct | Offer protocol, signing, negotiation engine and tests. | Built and tested on 17 October. |
| 17 Oct | MCP tools, approval flow, ledger, app views, simulated households, browser verification, hosted deployment and public repositories. | Completed: 29 checks passing, both repositories public, hosted deployment live. |
| 18–22 Oct | Product feedback, friction log, video and submission. | Feedback and friction log written; the video and the Devpost form remain. |

## 10. Concept evaluation

1. **Track:** Alexa+.
2. **Memorable moment:** two assistants in two households each asking their family to approve
   the same agreement.
3. **Avoids common hackathon patterns:** the interaction is multi-turn and multi-party, and it
   does not merely wrap an existing API.
4. **Feasible by 17 October:** yes, at the scope defined above.
5. **Mini challenge without additional scope:** the protocol library is code the project
   requires in any case.
