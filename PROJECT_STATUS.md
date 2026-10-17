# Between — Project Status & Completion Plan

**Project:** Between — *"Your Alexa negotiates with other families' Alexas, so you don't have to send the group text."*
**Event:** Build, Ship, Shape: Amazon Developer Hackathon — Alexa+ track, Open Source mini challenge
**Status date:** Saturday, Oct 17, 2026, 08:15 PKT (updated after the core build landed)
**Hard deadline:** Friday, Oct 23, 2026, 12:00 PM PT = Saturday, Oct 24, 00:00 local
**Target submission:** Thursday, Oct 22 (Friday kept as pure buffer)
**Companion documents:** `README.md` (public), `BUILD_PLAN.md` (original plan), `docs/between.md` (product spec), `docs/demo-runbook.md` (recording runbook), `FRICTION_LOG.md` (16 entries, bonus evidence), `packages/protocol/SPEC.md` (the wire protocol)

---

## 1. Executive summary

**Where it stands, in one line:** the entire critical path is now built and proven end to end — four households negotiate, approve and settle a real swap over signed HTTP in a loop, both inside one process and across four real server processes — **twenty-six hours ahead of the plan's worst-case assumption and one day ahead of its Sunday-night gate.**

What happened in this session: the plan's core build window (file `db.ts` through Gate G2) was executed in one continuous block. The negotiation engine, peer transport, all four MCP tools, all four app views, and the entire simulated-Alexa+ front end are in the repo, tested, and committed.

**Verified now:**

| Check | Command | Result |
|---|---|---|
| Protocol + engine + MCP + drills | `npm test` | **23/23 pass** (10 protocol, 4 MCP surface, 6 engine, 3 failure drills) |
| End to end, four real servers | `npm run e2e` | **3/3 pass** — the demo scenario over signed HTTP, restart persistence, and the full demo driven by spoken simulator turns |
| Type safety | `npm run typecheck` | Clean |
| Builds | `npm run build` | `dist/app/index.html` 238.24 kB (62.28 kB gzip — the MCP App) and `dist/sim/` (the simulator page) |
| Git history | `git log` | 5 commits; every work block committed |

**Verdict:** the remaining work is now *packaging and performance*, not construction. The riskiest remaining item is not technical — it is the **user-owned actions** (npm login, repo publication approval, hosting decision, AWS/Bedrock attempt, recording and submitting) that only Abrar can perform. They are enumerated in §7 and started in §6.

**Gate status:** G2 (four homes swap over HTTP) **passed Oct 17**, a day early. G3 (four tools in an MCP inspector, e2e green) is effectively passed: the tools are tested through a real MCP client, including the app resource. G4's substance (the two-window typed demo) is demonstrated by `test/sim.test.ts`; what remains of G4 is camera setup, not code.

---

## 2. What is built and verified

| Component | Files | State |
|---|---|---|
| **Negotiation protocol library** | `packages/protocol/` — `schema.ts`, `sign.ts`, `thread.ts`; `README.md`, `SPEC.md`, generated `offer.schema.json` | **Done, release-ready.** Strict schema, Ed25519, bounded rounds, 10 tests; `0.1.0`; npm metadata in place |
| **Household server** | `src/main.ts` (+ `config.ts`, `dates.ts`, `keys.ts`) | **Done.** Streamable HTTP `/mcp` with bearer auth; `/peer/offers` with raw-body signature verification; `/api/state`, `/api/reset`; `/sim/*`; passcode gate; demo clock (`DEMO_NOW`) |
| **Storage** | `src/db.ts` | **Done.** SQLite (one file per household): peers, events, prefs, negotiations, threads, messages, ledger; UNIQUE(thread, delta) makes commits idempotent |
| **Demo seed** | `src/seed.ts` | **Done.** Four households on a fixed clock: Ahmad's Thursday soccer, Park's Tuesday run, Lee busy, Chen's Sunday swim, the Lee ledger story, prefs |
| **Negotiation engine** | `src/engine.ts` | **Done.** Fan-out by who owes you; plain-yes-vs-swap ranking; the next-move protocol when a swap doesn't fit; collect window; two-sided approval; idempotent commit into calendar + ledger; sweep/expiry; every outcome has a speakable sentence |
| **Chooser** | `src/chooser.ts` | **Done.** `rules` (default, deterministic) and `claude` (Bedrock, timeout + rules fallback). Only ranks engine-generated legal moves |
| **Peer transport** | `src/peer.ts` | **Done.** Seal, log, POST, outbox retry, verified receive, replay protection |
| **MCP surface** | `src/mcp.ts` | **Done.** All four tools (`find_help`, `negotiation_status`, `respond_to_proposal`, `ledger`) with output schemas, speakable summaries, error wording, and the `ui://` app resource |
| **MCP App view** | `web/app/` | **Done.** All four views: negotiation feed, proposal card (Yes/No buttons call `respond_to_proposal`), settled, ledger. textContent-only rendering |
| **Simulated Alexa+ (backend)** | `src/sim.ts`, `/sim/turn` | **Done.** A real MCP client against the household's own `/mcp`; rules interpreter for the demo phrases; Claude tool loop when Bedrock is configured |
| **Simulated Alexa+ (page)** | `web/sim/` | **Done.** Device frame hosting the real MCP App through the ext-apps app bridge, transcript, mic + speech, auto-speak on incoming proposal, and the calendar / ledger / wire panels; reset button |
| **Local four-home runner** | `scripts/dev.ts`, `npm run dev` | **Done.** Ports 4001–4004, shared keys, `--keep`, `PACE_MS` camera tuning |
| **Tests** | `test/` | **Done.** `mcp.test.ts` (surface + auth + app resource), `engine.test.ts` (demo scenario, next-move, no-help, re-decline, duplicate ask, bad ask), `drills.test.ts` (peer offline, replay, tamper, lapse), `e2e.test.ts` (4 servers + restart), `sim.test.ts` (the demo by voice turns) |
| **Packaging & docs** | `README.md`, `.env.example`, `docs/demo-runbook.md`, CI workflow | **Done.** README carries the honest real-vs-simulated table; the runbook is the recording script; CI runs typecheck + tests + build |

**The demo spine is proven twice over:** `test/engine.test.ts` shows the whole story in memory; `test/e2e.test.ts` shows it across four processes over HTTP; `test/sim.test.ts` shows a person driving it by talking.

---

## 3. What remains to build (short list)

| Item | Owner | When | Notes |
|---|---|---|---|
| ~~`Dockerfile` + `docker-compose.yml`~~ | done | — | In the repo (one container, four homes). Untested until Docker Desktop is started: `docker compose up --build` |
| ~~Product Feedback text~~ | done | — | `docs/product-feedback.md` — paste-ready, one block per tool/API/SDK (**mandatory** item covered) |
| ~~Devpost description final pass~~ | done | — | `docs/between.md` §Devpost description (final — paste-ready); the two repo URLs are the only TODO fields |
| ~~`git subtree split` for the protocol repo~~ | done | — | Local branch `between-protocol` exists and was verified standalone (10/10 tests + example in a fresh checkout); push awaits your OK |
| npm publish of `between-protocol@0.1.0` | [Y] + [C] | After `npm login` | Publishing needs your credentials; the command is one line |
| Bedrock attempt (`CHOOSER=claude`) | [Y] | optional, gate Sun 9 PM | Code is written and type-checked; needs AWS account + model access |
| Hosting for judges | [Y] + [C] | decision Tue Oct 20 | Default: ngrok from this machine |
| Video recording + upload | [Y] | Wed Oct 21 | Runbook ready: `docs/demo-runbook.md` |

Everything else in the plan's workstream A–E is built, or falls under the cut lines in §9.

---

## 4. Environment & accounts (unchanged)

| Requirement | Status on this machine |
|---|---|
| Node 24 | ✓ v24.16.0 |
| GitHub CLI, logged in as `Abrar5510` | ✓ (not pushed yet — awaiting your OK) |
| `ngrok`, `cloudflared` | ✓ both installed |
| `ffmpeg`, `docker` | ✓ both installed |
| AWS CLI and credentials | ✗ `aws` not installed, no `~/.aws` — **your task if you want the Bedrock path** |
| Fly.io CLI | ✗ `flyctl` not installed |
| npm registry login | ✗ not logged in (`npm whoami` fails) — **your task Monday** |
| Amazon developer account / Alexa AI CLI | ✗ — the real-Alexa+ route is dropped (see decisions) |

---

## 5. Decisions (locked unless you say otherwise)

| Decision | State | Rationale |
|---|---|---|
| **Alexa+ route: all homes simulated** | **Executed.** The simulator is built and is what the tests drive | The hackathon rules allow simulating Alexa+ in a web app; development-stage add-ons are visible only to the developer's own account. The project still ships a real MCP server, real tools and a real MCP App — which is what the Alexa+ track scores |
| **Bedrock: optional, behind a hard gate** | Decided; unbuilt only for lack of an AWS account | `CHOOSER=rules` is the default and the recording fallback. If you complete the AWS setup by **Sunday Oct 18, 9:00 PM local**, the `claude` path already runs; if not, ship rules-only — the demo narrative is unchanged |
| **AWS credits** | Your task, deadline **Wed Oct 21, 12:00 PM PT** | The form exists; credits alone don't unlock Claude model access, but the attempt is friction-log material either way |
| **Demo device** | Locked: simulator only | No Echo Show; both sides are simulated pages |
| **Hosting for judges** | Deferred to **Tue Oct 20**; default ngrok | ngrok needs no new account; the machine must stay awake during judging. Fly.io if you install `flyctl` and want a URL that survives sleep |
| **`hackathon-*.md` notes** | Private (git-ignored) | Say the word if you'd rather publish them |

---

## 6. Critical path from here

Owner tags: **[C]** = the build agent, **[Y]** = you.

### Saturday, Oct 17 — **done ahead of schedule**
- [x] Protocol, engine, storage, seed, peer transport, MCP surface, app views, simulator, tests, README, runbook, CI, friction log. Gates G2 and (in substance) G3–G4 passed.

### Sunday, Oct 18 — now a free buffer day
- [x] `Dockerfile` + `docker-compose.yml` (done early, Oct 17).
- [x] `docs/product-feedback.md` — per-tool/API/SDK feedback, ready to paste into the Devpost form (**mandatory**).
- [x] Devpost description final pass (`docs/between.md`).
- [x] Protocol split branch prepared and verified standalone.
- [Y] **Only if you want Bedrock:** AWS account, `brew install awscli`, `aws configure`, enable Claude model access in `us-east-1`, run `CHOOSER=claude npm run dev` once and say "I can't take Maya to soccer on Thursday" — the chooser line should say `claude` instead of `rules`. Report by 9:00 PM local; otherwise we ship rules-only.
- [Y] Confirm in one line: **publish both repos public + npm publish on Monday** (or say what to hold back).

### Monday, Oct 19 — release the library
- [Y] `npm login` (browser flow; needs your npmjs.com account).
- [C] `git subtree split` → `Abrar5510/between-protocol`; create both GitHub repos; push; publish `between-protocol@0.1.0`.
- [C] CI green on the public repo; badges in place.

### Tuesday, Oct 20 — rehearse + hosting
- [Y] Two full rehearsals with `docs/demo-runbook.md` (two windows, the exact lines; ~15 min each).
- [Y] Hosting decision (default: ngrok). [C] sets it up and writes the testing notes (URL + passcode + reset command).

### Wednesday, Oct 21 — video day
- [Y] Record, upload (YouTube unlisted is fine), and if applicable send the AWS credits form (closes 12:00 PM PT).
- [C] On call for demo-breaking fixes only.

### Thursday, Oct 22 — submit
- [Y] Devpost: video link, repo URLs, Open Source fields, Product Feedback, friction log, testing instructions.
- [C] Clean-clone verification before you press submit.

### Friday, Oct 23 — buffer
- Nothing planned. Hard deadline midnight local at the end of Friday.

---

## 7. What you (Abrar) must do

| When | Task | Why / if skipped |
|---|---|---|
| **Sun Oct 18 (one line)** | Approve publishing both repos public + npm publish | Required by the hackathon rules; everything else is ready |
| **Sun Oct 18, before 9 PM** | *Only if pursuing Bedrock:* AWS account + `awscli` + model access + one test run | Skipping is safe — rules chooser ships; the attempt is friction-log material |
| **Mon Oct 19** | `npm login` | Without it the Open Source mini challenge is repo-only (weaker) |
| **Tue Oct 20** | Two rehearsals + hosting decision | The default (ngrok) needs the machine awake during judging |
| **Wed Oct 21** | Record + upload the video; AWS credits form deadline (12:00 PM PT) | Video is the single highest-weight deliverable left |
| **Thu Oct 22** | Submit on Devpost | Friday exists only as buffer |

---

## 8. Submission checklist (live)

- [ ] Working project hosted, with passcode and reset in the testing notes *(hosting decision Tue; default ngrok)*
- [ ] `github.com/Abrar5510/between` — public, MIT *(ready to push on your OK)*
- [ ] `github.com/Abrar5510/between-protocol` — public, MIT, CI, `between-protocol@0.1.0` on npm *(ready; needs `npm login` + push OK)*
- [ ] Demo video < 3 min, public, English, MCP code visible *(runbook ready; record Wed)*
- [ ] Text description *(draft in `docs/between.md`; final pass Sunday)*
- [ ] Product feedback for every tool/API/SDK *(mandatory; draft Sunday from the friction log)*
- [ ] Friction log and feature requests *(16 entries; up to 10% bonus)*
- [ ] Open Source mini challenge fields: repo URL, contribution URL, GitHub username, description
- [ ] README states the project was built from Oct 10, 2026

---

## 9. Risks and cut lines

**Live risks:**

| Risk | Mitigation |
|---|---|
| User-owned actions slip (npm login, publishing, recording) | They are the only remaining critical path; §6 schedules each one explicitly, with Friday as buffer |
| Bedrock setup doesn't complete | Hard gate Sun 9 PM → rules chooser; no demo change |
| Video day gets eaten | Wednesday is protected; Oct 22 is the fallback recording day and submission slips to Friday |
| Judges can't reach the hosted instance | Default ngrok + the video + a one-command local run in the README |
| A crash mid-demo | Drills pass (peer offline, replay, tamper, lapse); reset button + `/api/reset` restore the seeded morning in seconds |

**Cut lines, in activation order** (each removed item is documented in the README as "simulated" or "not done"):

1. ~~Real Alexa+ integration~~ — dropped by decision, replaced by the simulator.
2. Bedrock → rules chooser *(still the default; unchanged)*.
3. Fly/EC2 hosting → ngrok tunnel.
4. ~~ext-apps `app-bridge` iframe → direct render~~ — **not needed: the real bridge is in and tested.**
5. Voice in/out → typed input *(voice works; typing is the fallback)*.
6. Proactive incoming-proposal turn *(works; falls back to tap)*.
7. ~~CI workflow~~ — **done.**
8. npm publish → repo-only Open Source entry.

**Never cut — the demo's spine:** the two-home approval moment; the offers-only wire log beat; the ledger beat; the protocol library with tests; a video under 3 minutes; Product Feedback (mandatory); the friction log (bonus). All are built or scheduled.

---

## 10. Immediate next actions

1. **[Y]** One line: publish both repos public + npm publish Monday — yes/no.
2. **[Y]** `npm login` when convenient (scheduled Monday).
3. **[Y]** Bedrock: attempt this weekend or skip (default: skip).
4. **[Y]** A rehearsal with `docs/demo-runbook.md` when you have 15 minutes (Tuesday is the scheduled one).
5. **[C]** Everything buildable without your accounts is done; the next agent session starts with publish + hosting setup the moment you answer (1)–(3).

---

## Appendix A — Commands you'll need

```bash
# Sunday, only if attempting Bedrock:
brew install awscli
aws configure                   # IAM user key + us-east-1
# enable Claude model access: console.aws.amazon.com/bedrock → Model access
CHOOSER=claude npm run dev      # then ask: "I can't take Maya to soccer on Thursday"

# Monday:
npm login                       # browser flow; needs your npmjs.com account

# Tuesday, only if Fly.io hosting is chosen:
brew install flyctl
flyctl auth login

# Anytime — the local demo:
npm run build && PACE_MS=1200 npm run dev
# then open http://127.0.0.1:4001/sim/ and http://127.0.0.1:4002/sim/
```
