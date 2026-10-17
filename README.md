# Between

**Your Alexa negotiates with other families' Alexas — so you don't have to send
the group text.**

Between gives each household an assistant that owns one job: covering the
things school and clubs drop on your calendar. You say *"I can't take Maya to
soccer on Thursday"*; your assistant works out who can cover it, negotiates a
fair swap with their assistants, and brings you one confirmable offer. Every
byte that crosses between homes is a signed, schema-checked offer — never your
calendar, never Maya's name.

Built for the **Alexa+ MCP toolkit hackathon** (October 2026).

---

## What the demo shows

Two kitchens, two assistants, one Thursday:

1. **Ask.** "I can't take Maya to soccer on Thursday. Can you sort it out?"
   A card shows the negotiation feed: three families asked, in plain language.
2. **Negotiate.** The Lees are busy (their assistant says no — with no
   explanation, because households don't get to see each other's calendars).
   The Parks counter with a swap; the Chens offer a plain favour. The Parks win
   because the Ahmads *owe* the Lees — and the ledger is the family's own.
3. **Approve.** One proposal card in each kitchen. *They take Thursday, you
   take Tuesday.* Each family taps yes, by voice or on the card. Nobody has
   accepted anything until both have.
4. **Settle.** Both calendars move, both ledgers move to net zero, and the wire
   panel shows what actually crossed the line: seven signed offers, no titles,
   no names, no locations.

## How it works

```
        ahmad's house                park's house (+ lee, chen)
 ┌───────────────────────────┐   ┌───────────────────────────┐
 │  MCP server  (4 tools)    │   │  MCP server  (4 tools)    │
 │  ▼                        │   │                        ▲  │
 │  negotiation engine       │   │       negotiation engine  │
 │  ├ calendar (private)     │   │       calendar (private)  │
 │  ├ favour ledger (private)│   │       favour ledger       │
 │  └ threads / offers       │   │       threads / offers    │
 │        │                  │   │              │            │
 │        └── signed offers ─┼──►│  POST /peer/offers        │
 │  SQLite (one file)        │◄──┼── signed offers           │
 └───────────────────────────┘   └───────────────────────────┘
        ▲ MCP over HTTP                  ▲ MCP over HTTP
        │                                │
   Alexa+ (or the simulator page)   Alexa+ (or the simulator)
   renders the MCP App view          renders the MCP App view
```

- **The assistant surface is MCP.** Four tools: `find_help`,
  `negotiation_status`, `respond_to_proposal`, `ledger`, plus a `ui://` app
  resource so the assistant renders cards instead of walls of text.
- **Households talk only in offers.** [`between-protocol`](packages/protocol):
  strict Zod schema, Ed25519 signatures over the raw bytes, expiries, ±5-min
  clock skew, at most 3 counters per thread. Unknown fields are a hard error,
  so an offer cannot smuggle a calendar entry.
- **The engine is deterministic.** It fans out by who owes you, ranks moves
  (plain favours before swaps, cheapest first, ledger-aware), and runs a
  bounded next-move protocol when a swap doesn't fit. The optional
  Claude-on-Bedrock chooser picks among *already legal* moves and can be wrong
  without ever being unsafe; with `CHOOSER=rules` (the default) there is no
  cloud dependency at all.
- **Commitment is two-sided and idempotent.** A deal only lands after both
  families say yes; the commit into calendar + ledger is replay-safe.

## Run it

Requirements: Node 24+, npm. No account, keys or cloud needed.

```sh
npm install
npm run build      # builds the MCP App view and the simulator page
npm test           # protocol + engine + MCP surface + failure drills
npm run e2e        # four real servers, signed offers over HTTP, full scenario

npx playwright install chromium   # once, for the browser suites
npm run ui         # both kitchens in a real browser: cards, buttons, panels
npm run hosted     # the same pages, served the way judges get them (path prefixes)

npm run dev        # starts ahmad (4001), park (4002), lee (4003), chen (4004)
npm run host       # dev + one public ngrok link for judges, both kitchens behind it
```

Then open the simulated Alexa+ for the Ahmads:

**http://127.0.0.1:4001/sim/** — and the Parks:
**http://127.0.0.1:4002/sim/**

Say or type: *"I can't take Maya to soccer on Thursday"* in one window; watch
the other window speak up when the proposal lands. Each page carries the
side panels the demo narrates: the household calendar, the favour ledger, and
the raw wire — every message on the wire is a schema-valid signed offer.

### One link, both kitchens

`npm run host` puts the same demo on one public URL. A free ngrok account has a
single reserved domain and every tunnel grabs it, so the second kitchen would
fight the first over it; instead [`scripts/router.ts`](scripts/router.ts) serves
Ahmad at `/ahmad/…` and Park at `/park/…` behind one tunnel:

- `https://<your-domain>/ahmad/sim/` — Ahmad's kitchen
- `https://<your-domain>/park/sim/` — Park's kitchen

The script prints those links and writes them, with ready-made reset commands,
to `data/hosted-links.txt` — paste that into the Devpost testing instructions.
ngrok free shows first-time browsers a one-click "Visit Site" page; command-line
requests are unaffected. A named Cloudflare tunnel on your own domain would skip
that page entirely.

`DEMO_NOW=2026-10-17T09:00:00-07:00` pins "today" so seeds, tests and recordings
are reproducible. `PACE_MS=1200` slows agent replies so a human can watch.
See [`.env.example`](.env.example) for every knob.

## What is real, and what is simulated

The honest table, because this is a hackathon build:

| Piece | Status |
| --- | --- |
| MCP server, tools, app view | **Real** — an MCP host drives it; the simulator talks to the same server over HTTP |
| Offer protocol, signatures, state machine | **Real** — [`between-protocol`](packages/protocol), published and independently testable |
| Negotiation engine, calendar, ledger | **Real** — SQLite per household, eventually consistent by signed messages |
| Alexa+ device | **Simulated page** — the toolkit is a US-only developer preview; the simulator hosts the real MCP App through the ext-apps app bridge |
| Claude-on-Bedrock chooser | **Optional** — ships disabled (`CHOOSER=rules`); it only ever ranks already-legal moves |

## Repo map

```
src/                    household server: engine, protocol transport, MCP, sim backend
web/app/                the MCP App view (feed, proposal, settled, ledger)
web/sim/                the simulated Alexa+ page (device, transcript, panels)
packages/protocol/      between-protocol: schema, signing, threads — README + SPEC
scripts/dev.ts          runs the four local families
scripts/host.ts         dev + ngrok + the front door, for judges
scripts/router.ts       one public URL, one path per kitchen
test/                   protocol, engine, MCP surface, four-server e2e, simulator
                        (test/ui.test.ts and test/hosted.test.ts drive real browsers)
docs/between.md         product spec and demo script
```

## Safety and privacy stance

- Only offers cross the wire: task label, start, duration. Nothing else, ever.
- A decline exposes **nothing** — not why, not what conflicts.
- Nothing is accepted on a family's behalf: both sides approve by voice.
- The engine can only execute moves it generated; the chooser ranks, it never
  invents. Misheard requests get a spoken next step, not a bad calendar write.

## License

MIT.
