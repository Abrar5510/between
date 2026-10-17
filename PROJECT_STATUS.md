# Between — Project Status & Completion Plan

**Project:** Between — *"Your Alexa negotiates with other families' Alexas, so you don't have to send the group text."*
**Event:** Build, Ship, Shape: Amazon Developer Hackathon — Alexa+ track, Open Source mini challenge
**Status date:** Saturday, Oct 17, 2026, 07:15 PKT
**Hard deadline:** Friday, Oct 23, 2026, 12:00 PM PT = Saturday, Oct 24, 00:00 local. All of local Friday, Oct 23 remains inside the deadline.
**Target submission:** Thursday, Oct 22 (Friday kept as pure buffer)
**Companion documents:** `BUILD_PLAN.md` (full build plan, written Oct 10), `docs/between.md` (product spec and demo script), `FRICTION_LOG.md` (11 entries, bonus evidence)

---

## 1. Executive summary

Between is a household-to-household negotiation agent: each family runs its own self-hosted MCP server, servers exchange cryptographically signed offers, and two families approve a trade by voice without ever sharing a calendar.

**Where it stands, in one line:** the foundation is real, tested and verified — but it is exactly the foundation the plan called for by *Sunday Oct 11*, and the entire core build window (Oct 12–18) has produced nothing. The repo had **zero git commits** until today; that gap is now closed with baseline commit `f1d7a25`.

**Verified today (Oct 17):**

| Check | Command | Result |
|---|---|---|
| Protocol + MCP tests | `npm test` | **12/12 pass** (10 protocol, 2 MCP) |
| Type safety | `npm run typecheck` | Clean |
| Web view build | `npm run build` | Single-file bundle `dist/app/index.html`, 234.76 kB (61.10 kB gzip) |
| Node runtime | `node --version` | v24.16.0 (matches plan) |
| Git history | `git log` | Was empty for 7 days → baseline commit added today |

**Verdict:** the project is completable and submittable by Oct 22 **if and only if** three things happen: (1) the real-Alexa+ integration is dropped in favour of the plan's pre-approved simulated route, (2) Bedrock is treated as an optional extra behind a Sunday-night gate rather than a dependency, and (3) the core build (database, engine, peer transport, simulator) resumes today and runs continuously for the next four days.

**Scale of the remaining work:** roughly 70% of the plan is unbuilt, and the plan's seven-day core window (Oct 12–18) has collapsed to four days (Oct 17–21, with Oct 21 reserved for the video). The schedule in section 6 is the recovery plan; the pre-approved cut lines in section 9 are what protect the deadline if any day slips.

---

## 2. What is built and verified

| Component | Files | State |
|---|---|---|
| **Negotiation protocol library** (`between-protocol`) | `packages/protocol/src/schema.ts`, `sign.ts`, `thread.ts`, `index.ts`; example `examples/two-agents.ts` | **Done.** Strict schema (unknown keys rejected), Ed25519 seal/open with replay and clock-skew checks, pure thread state machine with a 3-counter cap, 10 passing tests, two agents negotiate to `agreed` in the terminal |
| **Household server (skeleton)** | `src/main.ts`, `src/mcp.ts` | **Partial.** Stateless Streamable HTTP `/mcp` (v2 SDK), bearer auth, `401` with no `WWW-Authenticate` (Amazon requirement), `initialize` request logging for the S1 spike, `/healthz` |
| **MCP tools** | `src/mcp.ts` | **1 of 4.** `ledger` only, with fixed data, correct output schema, speakable summary, `_meta.ui.resourceUri` |
| **MCP App view** | `web/app/app.ts`, `web/app/index.html` | **1 of 4 views.** Ledger view renders through the real ext-apps `App` bridge; textContent-only rendering (no HTML injection) |
| **Test infrastructure** | `test/mcp.test.ts`, `packages/protocol/test/protocol.test.ts` | **Done and green.** Includes the 401-without-header check and the <500 ms latency assertion |
| **Repo scaffolding** | `package.json` (workspaces), `tsconfig.json`, `vite.config.ts` (singlefile), `LICENSE` (MIT), `.gitignore` | **Done.** Version pins match the plan: server `2.3.1`, ext-apps `2.0.3`, zod `4.6.5`, TypeScript 7, Vite 8 |

**Working from day one:** clean clone → `npm i` → `npm test` all green → `npm run build` produces the view bundle. Nothing built so far is throwaway; every remaining deliverable in the plan builds on this foundation.

---

## 3. What has not been built (the gap)

Grouped by the plan's own workstreams. "Not started" means exactly that — no file exists.

| Group | Deliverable (plan ref) | Status |
|---|---|---|
| **A. Core system** | `src/db.ts` — SQLite schema and queries (§7.2) | Not started |
| | `src/seed.ts` — four-household demo data relative to `DEMO_NOW` (§8) | Not started |
| | `src/engine.ts` — negotiation logic, settling, commit transaction (§7.3) | Not started |
| | `src/chooser.ts` — Claude-on-Bedrock pick + rules fallback (§7.4) | Not started |
| | `src/peer.ts` — signed send, outbox retry, verified receive (§7.5) | Not started |
| | `scripts/dev.ts` — start all four households locally | Not started |
| | `test/engine.test.ts` — demo scenario, multi-round, no-help, human-decline | Not started |
| | `test/e2e.test.ts` — four instances through an MCP client, privacy check, latency (§10) | Not started |
| **B. MCP surface** | 3 of 4 tools: `find_help`, `negotiation_status`, `respond_to_proposal` (§7.6) | Not started |
| | 3 of 4 views: feed, proposal card, agreed (§7.7) | Not started |
| **C. Simulated Alexa+** | `src/sim.ts` — MCP client + tool loop behind `POST /sim/turn` (§7.8) | Not started |
| | `web/sim/` — device frame, transcript, speech in/out, side panels, reset (§7.8) | Not started |
| **D. Packaging & repos** | Root `README.md`, `.env.example` | Not started |
| | Protocol `README.md`, `SPEC.md`, generated `offer.schema.json`, version `0.1.0` | Not started |
| | CI workflow; `git subtree split` to `Abrar5510/between-protocol`; npm publish | Not started (needs `npm login`) |
| | Push `Abrar5510/between` (public, MIT) | Not started (zero commits until today) |
| | `Dockerfile`, `docker-compose.yml`, Fly apps | Not started |
| | `addon-package/addon.json` | Dropped under the recommended (simulated) route |
| **E. Demo & paperwork** | Failure drills — peer offline, duplicate message, expired offer, etc. (§Tue Oct 20) | Not started |
| | Product Feedback for every tool/API/SDK (mandatory submission item) | Not started (raw material exists in `FRICTION_LOG.md`) |
| | Friction log final tidy + this week's entries (up to 10% bonus) | Started (11 entries, Oct 10) |
| | Video pack — shot list, timings, captions | Not started |
| | Record video, upload to YouTube (public) | Not started |
| | Devpost text (draft exists in `docs/between.md` §Devpost description) | Drafted, not final |
| | Devpost submission | Not started |

**Blocked items from the plan:** S4 (Bedrock hello) and S1 (real Alexa+ connection) — both blocked since Oct 10 and both resolved by the decisions in section 5.

---

## 4. Environment & accounts (checked today)

| Requirement | Status on this machine |
|---|---|
| Node 24 | ✓ v24.16.0 |
| GitHub CLI, logged in as `Abrar5510` | ✓ (token has `repo`, `workflow` scopes) |
| `ngrok`, `cloudflared` | ✓ both installed |
| `ffmpeg`, `docker` | ✓ both installed |
| AWS CLI and credentials | ✗ `aws` not installed, no `~/.aws` |
| Fly.io CLI | ✗ `flyctl` not installed |
| npm registry login | ✗ not logged in (`npm whoami` fails) |
| Amazon developer account / Alexa AI CLI | ✗ assumed not set up (S1 blocked since Oct 10; the CLI also requires an AWS account and a CodeArtifact login that expires every 12 hours) |

---

## 5. Decisions

| Decision | State | Rationale |
|---|---|---|
| **Alexa+ route: all homes simulated** (Gate G1 fallback) | **Recommended — needs your one-line confirmation** | The hackathon rules explicitly allow simulating Alexa+ in a web app. Development-stage add-ons are visible only to the developer's own account, so a two-home real-Alexa+ demo was never possible anyway (documented in the friction log). Locking this removes the single largest schedule risk and adds zero new dependencies. The project still ships a real MCP server on protocol 2025-11-25 with a real MCP App — that is what judges score on the Alexa+ track. |
| **Bedrock: optional, behind a hard gate** | Decided | Baseline ships with the deterministic rules chooser (`CHOOSER=rules`), which the plan pre-approved as the recording fallback. Attempt Bedrock only if the AWS setup below completes by **Sunday Oct 18, 9:00 PM local**; if not, ship rules-only without regret — the demo narrative is unchanged, and the README states it plainly. A failed attempt still feeds the friction log (bonus points). |
| **AWS credits** | Action: request them | Yes — the hackathon AWS credit request form exists and closes **Wed Oct 21, 12:00 PM PT** (midnight local). Note: credits alone do not unlock Bedrock; Claude model access must be enabled on the account in a US region. Only relevant if you pursue the Bedrock gate. |
| **Demo device** | Locked: simulator only | No Echo Show available; the video shows the simulated Alexa+ web app on both sides. |
| **Hosting for judges** | Deferred to Tue Oct 20 | Options ranked: (1) ngrok static domain from this machine — zero new accounts, but the machine must stay awake during judging; (2) Fly.io — needs account + `flyctl` (your task); (3) AWS EC2 — only if credits land. Default if no decision: ngrok, documented in the testing notes. |
| **`hackathon-*.md` ideation notes** | Locked: stay private | Already git-ignored. Say the word if you'd rather publish them. |

---

## 6. Critical path to submission (recalibrated schedule)

Owner tags: **[C]** = the build agent, **[Y]** = you. Gates are pass/fail checkpoints — if a gate misses, the relevant cut lines from section 9 activate the same day.

### Saturday, Oct 17 (today) — core foundation, part 1
- **[C]** Baseline commit **done today** (`f1d7a25`).
- **[C]** `db.ts` (all seven tables from §7.2) + `seed.ts` (four households, `DEMO_NOW`-relative dates per §8).
- **[C]** `engine.ts` core: `findHelp`, responder logic, counters against the cap, settling with `COLLECT_MS`, `respond`, atomic commit with the ledger's UNIQUE constraint.
- **[Y]** Reply confirming the simulated route (one line). Start the AWS account + Bedrock attempt **only** if you want the optional gate; otherwise do nothing here — rules-chooser is fine.

### Sunday, Oct 18 — core foundation, part 2
- **[C]** Engine tests green: demo scenario, multi-round, no-help-found, responder's human declining.
- **[C]** `chooser.ts` (rules first, Bedrock optional behind env), `peer.ts` (sealed send, outbox retry, verified receive, replay protection), `/peer/offers` + `/api/*` routes in `main.ts`, `scripts/dev.ts`.
- **[Y]** (only if attempting Bedrock) AWS CLI install, IAM user, Claude model access enabled, one successful test call — report by **9:00 PM local**.
> **Gate G2 — Sunday night:** four local processes complete the full swap over HTTP (rules chooser OK); both sides reach `agreed`; both ledgers net to zero.

### Monday, Oct 19 — MCP surface + library release prep
- **[C]** All four tools on real data (`find_help`, `negotiation_status`, `respond_to_proposal`, `ledger`) with schemas, annotations, speakable summaries and Amazon-style error wording. Tool schemas **frozen** at end of day.
- **[C]** `test/e2e.test.ts`: four instances driven through a real MCP client; asserts calendars, ledger persistence across restart, the privacy check (no private data ever leaves an instance) and <500 ms tool latency.
- **[C]** Protocol release prep: `README.md`, `SPEC.md`, generated `offer.schema.json`, version `0.1.0`, CI workflow, `git subtree split` (local only — nothing is pushed without your OK).
- **[Y]** `npm login` (needed to publish `between-protocol`).
> **Gate G3 — Monday night:** four tools callable in MCP Inspector; e2e green.

### Tuesday, Oct 20 — what people see + hardening
- **[C]** `web/app` views: feed, proposal card, agreed, ledger — on real data. `src/sim.ts` tool loop; `web/sim` page: device frame, transcript, speech in/out, side panels (calendar, ledger, offers-only wire log), incoming-proposal handling, reset. The ext-apps `app-bridge` host is time-boxed to half a day, with the plan's pre-approved fallback (render the view directly, skip the iframe).
- **[C]** Failure drills: peer offline, Bedrock unreachable, duplicate message, expired offer, duplicate `find_help`. Each ends in a clear spoken message.
- **[C]** Root `README.md` (architecture, quick start, privacy claim, **what is simulated**, what was built in the window), `.env.example`, `Dockerfile`, `docker-compose.yml`.
- **[Y]** Rehearse the demo script twice (video pack will be provided); pick the hosting option.
> **Gate G4 — Tuesday night:** the full scenario runs by typing in two browser windows; drills pass; README is publishable.

### Wednesday, Oct 21 — voice, polish, video
- **[C]** Voice in/out hardening, proactive incoming proposal, `PACE_MS` camera tuning, visual polish against Amazon's MCP design guidance. Final video pack: shot list, timings, captions.
- **[Y]** Record the demo (two browser windows side by side), upload to YouTube **public**. Send the AWS credits form if not already sent (closes at midnight your time).
- **Code freeze at end of day** — only demo-breaking fixes afterward.

### Thursday, Oct 22 — package & submit (target day)
- **[C]** Product Feedback for every tool/API/SDK used; friction log final (add this week's entries); Devpost text finalized; clean-clone + private-window verification; publish `between-protocol@0.1.0`; push both repos public (on your OK).
- **[Y]** Submit on Devpost: video link, both repo URLs, GitHub username `Abrar5510`, Open Source description, Product Feedback, friction log, testing instructions (URL/passcode/reset).

### Friday, Oct 23 — buffer
- Demo-breaking fixes only. Hard deadline is midnight at the end of Friday local; nothing should be left over for this day.

---

## 7. What you (Abrar) must do

| When | Task | Why / if skipped |
|---|---|---|
| **Today** | Reply confirming the simulated-Alexa+ route (recommended) | The schedule in §6 assumes it. If you want to attempt real Alexa+ instead, it must be time-boxed to Monday night with no effect on the critical path. |
| **Today → Sun 9 PM** | *Only if pursuing Bedrock:* hackathon AWS credit form; AWS account; enable Claude model access (US region); `brew install awscli`; `aws configure`; one successful test call | Skipping is safe — the demo ships with the rules chooser. Attempting and failing still earns friction-log material. |
| **Mon Oct 19** | `npm login` | Without it, the Open Source mini challenge is repo-only (weaker). |
| **Mon–Tue** | Approve pushing `Abrar5510/between` and `Abrar5510/between-protocol` public | Required by the rules. Nothing is pushed before you say yes. |
| **Tue Oct 20** | Hosting decision; rehearse the demo script twice | Default if undecided: ngrok from your machine (machine must stay awake during judging). |
| **Wed Oct 21** | Record + upload the video (public YouTube); AWS credits form deadline | Budget a full day, as the plan says. A slipped video eats the Oct 22 submit day. |
| **Thu Oct 22** | Submit on Devpost; final check from a clean clone and a private browser window | Target day; Friday is buffer only. |

---

## 8. Submission checklist (live)

Copied from the plan, annotated with today's truth:

- [ ] Working project, hosted, with passcode and reset in the testing notes *(hosting decision Tue Oct 20; default ngrok)*
- [ ] `github.com/Abrar5510/between` — public, MIT *(MIT file exists; repo not yet pushed)*
- [ ] `github.com/Abrar5510/between-protocol` — public, MIT, tests in CI, published to npm *(library code + tests exist; packaging, CI, split and publish pending)*
- [ ] Demo video under 3 minutes, public on YouTube, in English, MCP code visible *(not recorded)*
- [ ] Text description *(draft exists in `docs/between.md`; needs final pass)*
- [ ] Product feedback for every tool, API or SDK used *(mandatory; raw material in the friction log)*
- [ ] Friction log and feature requests *(started — 11 entries; final tidy pending, up to 10% bonus)*
- [ ] Open Source mini challenge fields: repo URL, contribution URL, GitHub username `Abrar5510`, description
- [ ] README states that everything was built from Oct 10, 2026

---

## 9. Risks and pre-approved cut lines

**Live risks:**

| Risk | Mitigation |
|---|---|
| A 7-day plan compressed into 4 build days | Cut lines below, ranked; gates G2–G4 catch slips the same day |
| Bedrock setup doesn't complete | Hard gate Sun 9 PM → rules chooser; README states it; friction log keeps the attempt |
| Video day (Wed) gets eaten by build slip | Wednesday is protected; Oct 22 is the fallback recording day and submission slips to Friday |
| Judges can't reach a hosted instance | Default ngrok + recorded video; README documents the local one-command run |
| Uncommitted work (recurrence) | Commit at the end of every work session from now on; baseline already in place |

**Cut lines, in activation order** (each removed item is documented in the README as "simulated" or "not done"):

1. Real Alexa+ integration — already dropped by default (simulated route).
2. Bedrock → rules chooser (plan-pre-approved fallback).
3. Fly/EC2 hosting → ngrok tunnel from this machine.
4. ext-apps `app-bridge` iframe → render the view directly in the sim page (plan-pre-approved).
5. Voice in/out → typed input box with the two demo utterances as one-tap prompts (plan-pre-approved).
6. Proactive incoming-proposal turn → second home replies via a tap.
7. CI workflow → local test-run evidence in the README.
8. npm publish → repo-only Open Source entry.

**Never cut — the demo's spine:** the two-home approval moment; the offers-only wire log beat; the ledger beat; the protocol library with tests; a video under 3 minutes; Product Feedback (mandatory); the friction log (bonus).

---

## 10. Immediate next actions (next 48 hours)

1. **[C]** Start `db.ts` + `seed.ts` + `engine.ts` now (this document's author can proceed immediately on your go).
2. **[Y]** Confirm the simulated-Alexa+ route; state whether you're attempting the Bedrock/AWS gate.
3. **[C]** By Sunday night: Gate G2 — four homes swap over HTTP locally.
4. **[Y]** If attempting Bedrock: have it working or abandon it by Sunday 9:00 PM.

---

## Appendix A — Commands you'll need

```bash
# Monday: publish access for between-protocol
npm login                      # browser flow; needs an npmjs.com account

# Only if pursuing the Bedrock gate (this weekend):
brew install awscli            # then:
aws configure                  # IAM user access key + region (a US region, e.g. us-east-1)
# Claude model access is enabled in the Bedrock console: console.aws.amazon.com/bedrock → Model access

# Only if Fly.io hosting is chosen (Tuesday):
brew install flyctl
flyctl auth login
```
