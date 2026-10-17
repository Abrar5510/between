# Between — Project Status & Completion Plan

**Project:** Between — *"Your Alexa negotiates with other families' Alexas, so you don't have to send the group text."*
**Event:** Build, Ship, Shape: Amazon Developer Hackathon — Alexa+ track, Open Source mini challenge
**Status date:** Saturday, Oct 17, 2026, evening PKT — the build is finished, browser-verified, published and hosted
**Hard deadline:** Friday, Oct 23, 2026, 12:00 PM PT = Saturday, Oct 24, 00:00 local
**Companion documents:** `README.md` (public), `docs/between.md` (product spec + Devpost description), `docs/demo-runbook.md` (recording runbook + hosting), `docs/product-feedback.md` (mandatory Devpost feedback), `FRICTION_LOG.md` (22 entries, bonus evidence), `packages/protocol/SPEC.md` (the wire protocol)

---

## 1. Executive summary

**Where it stands, in one line:** the whole thing is built, tested, published and reachable — four households negotiate and settle a real swap over signed HTTP across four real servers, two real browsers drive both kitchens, and one public ngrok link serves the same demo to judges.

**Verified now (29 checks, all green):**

| Check | Command | Result |
|---|---|---|
| Protocol + engine + MCP + drills | `npm test` | **24/24** (10 protocol, 4 MCP surface, 7 engine, 3 failure drills) |
| End to end, four real servers | `npm run e2e` | **3/3** — the demo over signed HTTP, restart persistence, the demo by voice turns |
| Both kitchens in Chromium | `npm run ui` | **1/1** — the real MCP App through the app bridge, card buttons negotiating, panels, reset |
| The hosted front door in Chromium | `npm run hosted` | **1/1** — the same, served under `/ahmad/…` and `/park/…` behind one link |
| Type safety | `npm run typecheck` | Clean |
| Builds | `npm run build` | `dist/app/index.html` (the MCP App) and `dist/sim/` (the simulator page) |
| The hosted demo, live through ngrok | `npm run host` | Both kitchens loaded and settled the swap through the public URL; reset commands work |

**Published:**

- `github.com/Abrar5510/between` — public, MIT, main pushed, CI runs typecheck → build → test → e2e → both browser suites.
- `github.com/Abrar5510/between-protocol` — public, MIT, `main` + tag `v0.1.0`, its own CI green. On npm once you run `npm publish` (§6).

**Verdict:** nothing is left to build. What remains is user-owned: `npm login` (then one publish command), the video, and the Devpost submission. They are enumerated in §7.

**Gates:** G2 (four homes swap over HTTP) passed Oct 17; G3 and G4 (four tools through a real MCP client, the two-window demo) are passed by the tests and the browser suites. Nothing in the plan's build path is still open.

---

## 2. What is built and verified

| Component | Files | State |
|---|---|---|
| **Negotiation protocol library** | `packages/protocol/` — `schema.ts`, `sign.ts`, `thread.ts`; `README.md`, `SPEC.md`, generated `offer.schema.json` | **Done and published.** Strict schema, Ed25519, bounded rounds, 10 tests; `0.1.0`; CI green on the standalone repo |
| **Household server** | `src/main.ts` (+ `config.ts`, `dates.ts`, `keys.ts`) | **Done.** Streamable HTTP `/mcp` with bearer auth; `/peer/offers` with raw-body signature verification; `/api/state`, `/api/reset`; `/sim/*`; passcode gate; demo clock (`DEMO_NOW`) |
| **Storage** | `src/db.ts` | **Done.** SQLite (one file per household); UNIQUE(thread, delta) makes commits idempotent |
| **Demo seed** | `src/seed.ts` | **Done.** Four households on a fixed clock: Ahmad's Thursday soccer (the need), Park's Tuesday run and Chen's Sunday swim (tradeable), Lee busy, the Lee ledger story, prefs |
| **Negotiation engine** | `src/engine.ts` | **Done.** Fan-out by who owes you; plain-yes-vs-swap ranking; next-move protocol; collect window; two-sided approval; idempotent commit; sweep/expiry; every outcome a speakable sentence; approval results carry the proposal terms so cards keep them; a reply that lands after the collect window revives a "no help yet" into the proposal |
| **Chooser** | `src/chooser.ts` | **Done.** `rules` (default) and `claude` (Bedrock, timeout + rules fallback). Only ranks engine-generated legal moves |
| **Peer transport** | `src/peer.ts` | **Done.** Seal, log, POST, outbox retry, verified receive, replay protection |
| **MCP surface** | `src/mcp.ts` | **Done.** Four tools with output schemas, speakable summaries, the `ui://` app resource; `respond_to_proposal` returns the proposal terms |
| **MCP App view** | `web/app/` | **Done.** Feed, proposal card (Yes/No call `respond_to_proposal`), settled, ledger. textContent-only rendering |
| **Simulated Alexa+** | `src/sim.ts`, `web/sim/`, `/sim/turn` | **Done.** A real MCP client against the household's own `/mcp`; device frame hosting the real MCP App through the ext-apps app bridge; transcript, mic + speech, auto-speak on proposals, calendar / ledger / wire panels, reset; base-anchored paths so one build serves `/sim/` and `/<home>/sim/` |
| **Local runner** | `scripts/dev.ts`, `npm run dev` | **Done.** Ports 4001–4004, shared keys, `--keep`, `PACE_MS` |
| **Hosting** | `scripts/host.ts`, `scripts/router.ts`, `npm run host` | **Done and verified live.** One public ngrok link; both kitchens behind it as paths, because a free ngrok account has one reserved domain |
| **Tests** | `test/` | **Done.** Protocol, engine, MCP surface, failure drills, four-server e2e, the spoken demo, and two real-browser suites (`ui.test.ts`, `hosted.test.ts`) |
| **Packaging & docs** | `README.md`, `.env.example`, `docs/demo-runbook.md`, `docs/product-feedback.md`, `Dockerfile`, CI | **Done.** The README carries the honest real-vs-simulated table and the hosting section; the runbook is the recording script plus the hosted-testing section |

**The demo spine is proven four ways:** in memory (engine tests), across four processes over HTTP (e2e), in a real browser locally (ui), and in a real browser through the public link (hosted).

---

## 3. What remains

| Item | Owner | Notes |
|---|---|---|
| `npm publish` of `between-protocol@0.1.0` | **[Y]** login, **[C]** publish | Needs `npm login` once; then one command. Without it the Open Source entry is repo-only |
| Demo video (< 3 min, English) | **[Y]** | Runbook ready: `docs/demo-runbook.md` — includes the exact lines and the failure table |
| Devpost submission | **[Y]** | Every field is paste-ready: description (`docs/between.md`), Product Feedback (`docs/product-feedback.md`), friction log (`FRICTION_LOG.md`), testing notes (`data/hosted-links.txt` after `npm run host`) |
| Bedrock chooser (`CHOOSER=claude`) | **[Y]** + **[C]** | Optional. Code written and type-checked; needs an AWS account and model access. If it isn't set up by Sunday night, nothing changes — `rules` ships |
| AWS credits form | **[Y]** | Closes **Wed Oct 21, 12:00 PM PT**; friction-log material either way |
| Docker image smoke test | **[Y]** | Written but never run (Docker daemon was off). Start Docker Desktop → `docker compose up --build`. Insurance only |

---

## 4. Environment & accounts

| Requirement | Status |
|---|---|
| Node 24 | ✓ v24.16.0 |
| GitHub CLI, logged in as `Abrar5510` | ✓ both repos created, pushed, CI running |
| `ngrok` | ✓ installed and authenticated (one reserved domain — hence the router) |
| `cloudflared` | ✓ installed; quick tunnels unreachable from this network (`api.trycloudflare.com` times out), named tunnel already running for other work |
| `ffmpeg`, `docker` | ✓ installed (Docker daemon off when the image was written) |
| npm registry login | ✗ not logged in — **your task, before publishing** |
| AWS CLI and credentials | ✗ — **your task only if you want the Bedrock path** |

---

## 5. Decisions (locked unless you say otherwise)

| Decision | State | Rationale |
|---|---|---|
| **Alexa+ route: all homes simulated** | Executed | The rules allow simulating Alexa+ in a web app; development-stage add-ons are visible only to the developer's own account. The project still ships a real MCP server, real tools and a real MCP App — what the track scores |
| **Bedrock: optional, hard gate passed** | Decided | `rules` is the default and the recording fallback; the `claude` path is one env var away |
| **Demo device** | Locked: simulator only | No Echo Show; both sides are simulated pages |
| **Hosting: one ngrok link with both kitchens behind it** | Executed and verified | Free ngrok has a single reserved domain and a second tunnel steals it; `scripts/router.ts` gives each household a path instead. Optional upgrade: a named Cloudflare tunnel hostname on your own domain (no interstitial) |
| **`hackathon-*.md` notes** | Private (git-ignored) | Say the word if you'd rather publish them |

---

## 6. What only you can do (in order)

1. **`npm login`** (needs your npmjs.com account), then say the word — the publish itself is one command: `npm publish` inside `packages/protocol` (the package is verified: 9 files, 31 kB, tests green in its CI).
2. **Turn audio/voice off? No — just run the demo once on camera:** two rehearsals with `docs/demo-runbook.md`, then record and upload (YouTube unlisted is fine). ~45 minutes total.
3. **Start the hosted link before submitting:** `npm run host` keeps both kitchens reachable through `https://beechy-colorable-melody.ngrok-free.dev` (Ahmad at `/ahmad/sim/`, Park at `/park/sim/`). Leave the terminal open and the Mac awake during judging; paste `data/hosted-links.txt` into the Devpost testing instructions. First browser visit needs one click on ngrok's "Visit Site".
4. **Submit on Devpost** with: the video link; the two repo URLs; the description from `docs/between.md`; the Product Feedback from `docs/product-feedback.md` (mandatory); the friction log (bonus, `FRICTION_LOG.md`); the testing notes from step 3; and the Open Source mini challenge fields — repo URL `https://github.com/Abrar5510/between`, contribution URL `https://github.com/Abrar5510/between-protocol/commits/main` (the protocol package's own history, released separately), GitHub username `Abrar5510`.
5. **Optional, any time before the form closes (Wed Oct 21, 12:00 PM PT):** the AWS credits form.
6. **Optional:** Bedrock (`brew install awscli`, `aws configure`, enable Claude model access in `us-east-1`, run `CHOOSER=claude npm run dev` once — the chooser line should read `claude`). Report back if you do; otherwise rules-only ships.
7. **Optional:** `docker compose up --build` with Docker Desktop running.

---

## 7. Submission checklist (live)

- [x] Working project hosted — one ngrok link, both kitchens, verified end to end from a browser
- [x] `github.com/Abrar5510/between` — public, MIT, pushed, CI green
- [x] `github.com/Abrar5510/between-protocol` — public, MIT, tag `v0.1.0`, CI green
- [ ] `between-protocol@0.1.0` on npm — one command after `npm login`
- [ ] Demo video < 3 min, public, English, MCP code visible — runbook ready
- [x] Text description — `docs/between.md`, repo links filled in
- [x] Product feedback for every tool/API/SDK — `docs/product-feedback.md` (mandatory)
- [x] Friction log and feature requests — `FRICTION_LOG.md`, 22 entries (bonus)
- [ ] Open Source mini challenge fields: repo URL, contribution URL, GitHub username, description
- [x] README states the project was built from Oct 10, 2026

---

## 8. Risks and cut lines

**Live risks:**

| Risk | Mitigation |
|---|---|
| The video doesn't get recorded | It is the last heavy user task; the runbook removes all decisions, and the demo is test-covered so takes should be clean |
| Judges can't reach the hosted link | The machine must stay awake with `npm run host` running; the video and the one-command local run in the README are the fallbacks. Every step was verified live |
| ngrok interstitial confuses a judge | One click, documented in the testing notes; command-line calls are unaffected. A Cloudflare hostname on your domain removes it entirely |
| `npm login` slips | Repos are public either way; npm is a bonus, not the submission |
| A crash mid-demo | Drills pass (peer offline, replay, tamper, lapse); the reset button and `/api/reset` restore the seeded morning in seconds |

**Cut lines, in activation order** (each is documented honestly in the README if it activates):

1. ~~Real Alexa+ integration~~ — dropped by decision, replaced by the simulator.
2. Bedrock → rules chooser *(still the default)*.
3. ~~Hosting~~ — **done: one ngrok link with both kitchens behind it, verified live.**
4. ~~ext-apps `app-bridge` iframe → direct render~~ — **not needed: the real bridge is in and browser-tested.**
5. Voice in/out → typed input *(voice works; typing is the fallback)*.
6. Proactive incoming-proposal turn *(works; falls back to tap)*.
7. ~~CI workflow~~ — **done, both repos green.**
8. npm publish → repo-only Open Source entry.

**Never cut — the demo's spine:** the two-home approval moment; the offers-only wire log beat; the ledger beat; the protocol library with tests; a video under 3 minutes; Product Feedback (mandatory); the friction log (bonus). All are built.

---

## 9. Appendix — commands

```bash
# the local demo (rehearsal, recording):
npm run build && PACE_MS=1200 npm run dev
#   http://127.0.0.1:4001/sim/ (Ahmad)   http://127.0.0.1:4002/sim/ (Park)

# the hosted link for judges (keep this terminal open):
npm run host
#   prints and writes data/hosted-links.txt: both kitchens + reset commands

# publish the protocol, after npm login:
cd packages/protocol && npm publish

# full verification, in a fresh clone or here:
npm install && npm test && npm run e2e && npm run ui && npm run hosted
```
