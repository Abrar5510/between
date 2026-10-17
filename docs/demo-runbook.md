# Between — demo runbook

Everything you need in front of you to record the submission video and to
rehearse it. Target length **2:40** (limit is 3:00).

- Two Chrome windows, side by side: **Ahmad left, Park right**.
- One take per beat is fine; the **Reset rehearsal** button puts all four
  families back to the seeded morning.
- The exact phrases matter — the simulator understands this set. Everything
  below has been run end to end (`npm run e2e` covers the same lines).

---

## 0. What to have ready

- Mac with Node 24+, Chrome, a screen recorder (QuickTime, or Screen Studio if
  you want the zoom polish).
- The repo at `/Volumes/Transend/amadev`.
- ~30 minutes: 10 to set up, 15 to do 2–3 takes, 5 to pick.

## 1. Pre-flight (once per recording session)

```sh
cd /Volumes/Transend/amadev
git pull
npm install
npm run build

# 1200 ms between agent replies reads well on camera
PACE_MS=1200 npm run dev
```

You get four households: ahmad 4001, park 4002, lee 4003, chen 4004.
In two separate Chrome windows open:

- **Left:** http://127.0.0.1:4001/sim/  (Ahmad's kitchen)
- **Right:** http://127.0.0.1:4002/sim/ (Park's kitchen)

Window setup:

- Window width ~1100 px or more so the calendar / ledger / wire panels are
  visible next to the device.
- Full-screen both windows on the same monitor, side by side
  (macOS: hold the green button → Tile Window to Left/Right).
- Turn **Voice** on in the window that should speak; for a clean voice-over you
  can untick both (bottom-right of the page). If you keep voice audio on the
  take, untick one window so they don't talk over each other.
- Zoom 100%, hide bookmarks bar, close other tabs.

**Before every take**, click **Reset rehearsal** in both windows and confirm:

- Ahmad's calendar shows one event, *soccer run · Thu 4:00 PM* — the slot that
  needs covering, so no badge on it.
- Park's calendar shows *soccer run · Tue 4:00 PM* with the **tradable** badge
  (that is what Park will put on the table).
- Ahmad's ledger reads *Lee owe you 2 · Park even · Chen even* plus the
  preferences line.
- The wire panel is empty.

Each **Reset rehearsal** button resets that one household. For a completely
clean slate (including Lee and Chen), restart `npm run dev`, or hit all four:

```sh
for p in 4001 4002 4003 4004; do curl -s -X POST http://127.0.0.1:$p/api/reset > /dev/null; done
```

Left window, `npm run dev` terminal is running and quiet.

## 2. The script — exact words, exact order

| # | Where | Do / say | What the camera sees |
|---|---|---|---|
| 1 | Both | *(no UI action — voice-over)* | Two idle kitchens; the pitch line over this. |
| 2 | **Left** | *"I can't take Maya to soccer on Thursday. Can you sort it out?"* | Feed card: "Covering the soccer run", the three families as chips, and the request line at 9:00 AM. |
| 3 | Both | *(wait ~6 s)* | Wire panel fills with **→ lee**, **→ park**, **→ chen** requests. On the right, Park's page announces the incoming request by itself. |
| 4 | **Left** | *"What's the news about Thursday?"* | Proposal card: *They take — soccer run · Thursday 4 PM* / *You take — soccer run · Tuesday 4 PM* with **Yes, agree** and **No**. |
| 5 | **Left** | *"Yes, that works."* *(or click **Yes, agree**)* | Card flips to "Waiting for the other family." The wire shows **→ park · accept**. |
| 6 | **Right** | *(Park's page already spoke)* *"Yes, please approve that."* | Park's card goes to **Settled**; the wire shows **← ahmad** traffic; Park's calendar gains *soccer run (covering for Ahmad) · Thu 4 PM*. |
| 7 | **Left** | *(a moment later)* *"Is Thursday sorted?"* | "Done — the Parks are covering the soccer run on Thursday at 4 PM, and you're taking their soccer run on Tuesday at 4 PM." Ahmad's calendar: **park covers** badge on Thursday, new Tuesday entry. |
| 8 | **Left** | Click a wire row's arrow to expand it | Raw JSON: `task: "soccer run"`, instants, durations. **No titles. No "Maya". No locations. No addresses.** |
| 9 | **Left** | *"Who should I ask about Saturday?"* | "The Lees owe you two. You're even with the Parks and the Chens. Ask the Lees first." — the ledger beat. |
| 10 | Both | Scroll the side panels slowly | Calendar, ledger, wire — then cut to the code: `packages/protocol/README.md`, the tools list in `src/mcp.ts`. |

Notes for the presenter:

- Don't say "Alexa" into the text box — the wake word isn't part of the
  simulator's phrases. *(If you use the mic button, speak the line as written.)*
- A spoken **"No"** or **"No, decline"** is the rejecting beat if you want it;
  reset and retake afterwards.
- The names being negotiated ("soccer run", "swim run") are the only text that
  crosses between homes — that is the privacy beat, so let the JSON sit on
  screen for a second.

## 3. Voice-over (record separately, drop it on top)

A script that fits the beats above, ~2:40 at a calm pace:

> **[0:00]** Every school term, the same group text: *can anyone do Thursday?*
> Forty messages later, one parent folds. Between hands that whole job to the
> family assistant you already talk to.
>
> **[0:20]** "I can't take Maya to soccer on Thursday. Can you sort it out?"
> Ahmad's assistant doesn't post in a group. It opens a negotiation with the
> three families Ahmad trusts.
>
> **[0:50]** The Lees are busy — their assistant declines, and nothing about
> their day leaves their house. The Parks counter: they'll take Thursday if
> Ahmad takes their Tuesday run. The Chens offer a plain favour; Between ranks
> the offers by who owes whom, so the Ahmads' own ledger does the choosing.
>
> **[1:25]** One card, one question: *they take Thursday, you take Tuesday.*
> Ahmad says yes. And so does the Park family — their own assistant asked
> them the same question, in their own kitchen. Nothing is ever accepted on a
> family's behalf.
>
> **[1:55]** Both calendars move. Both ledgers keep the books — this swap lands
> even. And this is the entire conversation between the two houses: signed
> offers with a task label, a time and a duration. No titles, no names, no
> addresses. That's the protocol, and it's open source.
>
> **[2:20]** Between: four MCP tools, one signed protocol, and two assistants
> that finally do the boring part of being a parent.

### Paste-ready upload text

**Title:** Between — your Alexa negotiates with other families' Alexas

**Description:**

```
Two households, two assistants, one Thursday. Ahmad asks once — "I can't take
Maya to soccer on Thursday. Can you sort it out?" — and his assistant
negotiates with the families he trusts over a signed, offers-only protocol.
The Lees decline and nothing about their day leaves their house; the Parks
counter with a swap; the Ahmads' own favour ledger decides who is asked first.
Nothing is committed until both families say yes out loud.

Built for the Build, Ship, Shape hackathon (Alexa+ track). Real MCP server with
four tools and a real MCP App view; the Alexa+ device is simulated in a web page
because the developer preview is account-gated. The negotiation protocol is a
standalone, tested package.

Code: https://github.com/Abrar5510/between
Protocol: https://github.com/Abrar5510/between-protocol
```

## 4. When something goes wrong

| Symptom | Fix |
|---|---|
| Card is blank / stale | The view is fed by tool results — run a turn: type *"What's the news?"* |
| "I could not reach the house server" | A household crashed: check the terminal, `npm run dev` again (use `--keep` to keep state), refresh the page. |
| Wrong household titles | You swapped the ports: 4001 is Ahmad, 4002 is Park. |
| A take is half done | **Reset rehearsal** in both windows; the tills are back to the seeded morning. No restart needed. |
| Both speakers talk at once | Untick **Voice** in one window (the reply is still on screen and in the transcript). |
| Proposal card shows "Waiting for the other family." on both | One side hasn't approved; say *"What's the news?"* to re-read the state. |
| You want the old state back mid-session | `curl -X POST http://127.0.0.1:4001/api/reset` (same for 4002–4004). |

## 5. Host it for judges — one link, both kitchens

```sh
npm run host          # dev servers + router + ngrok, in one terminal
```

The script prints (and writes to `data/hosted-links.txt`) the testing notes:

- `https://<your-ngrok-domain>/ahmad/sim/` — Ahmad's kitchen
- `https://<your-ngrok-domain>/park/sim/` — Park's kitchen

Both pages sit behind the one ngrok link: `scripts/router.ts` gives each
household a path, because a free ngrok account has a single reserved domain and
a second tunnel would steal it from the first. Verified end to end on
2026-10-17: both kitchens loaded through ngrok and settled the swap, and the
`curl` reset lines in the notes work as written.

Things to know while it is up:

- Keep the terminal open and the Mac awake (Judges test whenever; the demo
  lives on this machine).
- The first browser visit shows ngrok's **"You are about to visit …"** page —
  one click on **Visit Site**, remembered per browser afterwards.
- `curl` and other command-line requests are not affected by that page.
- The state judges see is whatever the last session left; the reset commands in
  the notes put both households back to the seeded morning.
- Reset it yourself before sharing the link, so the first judge gets the clean
  morning.
- Better URL, no interstitial: your machine already runs a named Cloudflare
  tunnel; add a public hostname for `http://127.0.0.1:4100` in the Cloudflare
  dashboard and that domain can replace the ngrok link in the notes.

## 6. After the take — submission checklist

- [ ] Export the video, upload (YouTube "Unlisted" is fine), title
      **Between — your Alexa negotiates with other families' Alexas**.
- [ ] Paste the video link into the Devpost submission.
- [ ] Add the two screenshots (`docs/img/ahmad-kitchen.png`,
      `docs/img/park-kitchen.png`) to the Devpost image gallery — both were
      captured through the hosted link, at the settled moment.
- [ ] Repo links: `github.com/Abrar5510/between` and
      `github.com/Abrar5510/between-protocol`.
- [ ] **Product Feedback** — mandatory part of this hackathon: fill it in
      honestly from the build notes in `PROJECT_STATUS.md` §Friction.
- [ ] Confirm the Devpost form fields match `docs/between.md` (description
      draft) one last time.
