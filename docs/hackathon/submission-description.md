# Submission Description

Final project description for the Devpost submission form. Each section below corresponds to a
field on the form.

## Tagline

A household assistant that negotiates with other households' assistants to arrange childcare
cover, without any household sharing its calendar.

## Inspiration

Coordination between households currently depends on group messages: a single request such as
"can anyone do Thursday?" can generate dozens of replies before one parent agrees. Voice
assistants serve a single household and cannot communicate with the next. Between gives each
household an assistant dedicated to this task.

## What it does

A parent makes one request: *"I can't take Maya to soccer on Thursday. Can you sort it out?"*
The assistant negotiates with the households the family trusts and returns a single proposal.
Neither household is committed until both have approved it aloud. A favour ledger keeps the
exchange balanced over time, so that a household which provides cover in one month receives
cover in the next.

## How it works

Every household runs its own MCP server over Streamable HTTP. The assistant interface consists
of four MCP tools (`find_help`, `negotiation_status`, `respond_to_proposal` and `ledger`) and a
`ui://` app resource. The app renders a negotiation feed, a proposal card whose Yes and No
controls call back into the server, a settlement card and the ledger.

Households communicate only through **offers**: Ed25519-signed messages with a strict schema,
containing a task label, a start time, a duration and the requested exchange. Unknown fields are
rejected, so a compromised agent cannot transmit calendar entries. Each thread permits at most
three counter-offers, every offer expires, and nothing is committed until both households
approve. The engine constructs moves only from slots its own calendar shows as free. The
optional Claude-on-Bedrock chooser ranks those legal moves; an incorrect choice can be
suboptimal but never unsafe.

## Demonstration

Two simulated Alexa+ households are shown side by side. The Ahmad household makes a request.
The Lee household declines, and its calendar remains private. The Park household counters with
a swap, the Chen household offers an unconditional favour, and the ledger determines the order
in which households are approached. Each household receives one card: *the Parks take
Thursday; the Ahmads take Tuesday.* Both families approve. Both calendars are updated, both
ledgers remain balanced, and the wire panel displays every message exchanged between the
households: signed offers only, with no titles, names or locations.

## Work completed during the hackathon

All of it. The first commit in the repository is dated 10 October 2026.

## Implementation status

The MCP server, tools, app view, protocol, signatures, engine, tests and four-server
end-to-end suite are fully implemented. The Alexa+ device is simulated in a web page, because
development-stage add-ons are visible only to the developer's own account and a second
household therefore cannot be tested on hardware. The simulator drives the same MCP server a
physical device would. A full breakdown is provided in the project README.

## Open source

Released under the MIT Licence in two public repositories:

- **Main project:** the household server, MCP tools, app and simulator.
  [github.com/Abrar5510/between](https://github.com/Abrar5510/between)
- **Protocol library:** the same package as a standalone repository, with `SPEC.md`, a
  generated JSON Schema, independent CI and a release tag.
  [github.com/Abrar5510/between-protocol](https://github.com/Abrar5510/between-protocol)

## Built with

Node.js 24 (TypeScript, with no build step for the server); the MCP SDK (server, client,
express and node packages); `@modelcontextprotocol/ext-apps` (App and AppBridge); Express;
SQLite via `node:sqlite`; Zod; Vite; Ed25519 via `node:crypto`; and, optionally, Claude on
Amazon Bedrock as the move chooser. The project is verified by 29 automated checks covering the
protocol, engine, MCP interface, failure modes, a four-server end-to-end run, the complete
spoken demonstration, and two browser suites that drive both households.
