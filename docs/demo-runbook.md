# Demonstration Runbook

This runbook describes how to rehearse and record the submission video and how to host the
demonstration for judges. The target running time is 2 minutes 40 seconds; the limit is
3 minutes.

- Two Chrome windows are placed side by side: the **Ahmad household on the left** and the
  **Park household on the right**.
- Each beat may be recorded as a separate take. The **Reset rehearsal** button restores a
  household to the seeded morning state.
- The simulator recognises a fixed set of phrases, so the wording below must be followed
  exactly. Every step has been verified end to end; `npm run e2e` exercises the same phrases.

---

## 1. Requirements

- A Mac with Node.js 24 or later, Chrome and a screen recorder (QuickTime, or Screen Studio for
  zoom effects).
- The repository checked out at `/Volumes/Transend/amadev`.
- Approximately 30 minutes: 10 for setup, 15 for two or three takes and 5 for selection.

## 2. Preparation

Perform the following once per recording session:

```sh
cd /Volumes/Transend/amadev
git pull
npm install
npm run build

# A 1200 ms delay between agent replies is legible on camera.
PACE_MS=1200 npm run dev
```

This starts four households: Ahmad (4001), Park (4002), Lee (4003) and Chen (4004). Open two
separate Chrome windows:

- **Left:** <http://127.0.0.1:4001/sim/> (Ahmad household)
- **Right:** <http://127.0.0.1:4002/sim/> (Park household)

Configure the windows as follows:

- Use a window width of at least 1100 px so that the calendar, ledger and wire panels are
  visible beside the device.
- Tile both windows side by side on the same display (on macOS, hold the green window button
  and choose *Tile Window to Left of Screen* or *Right of Screen*).
- Enable **Voice** only in the window that should speak, or disable it in both windows if the
  voice-over will be recorded separately. The control is at the bottom right of the page.
- Set browser zoom to 100%, hide the bookmarks bar and close other tabs.

**Before every take**, click **Reset rehearsal** in both windows and confirm the following
state:

- The Ahmad calendar shows one event, *soccer run · Thu 4:00 PM*, without a badge. This is the
  slot that requires cover.
- The Park calendar shows *soccer run · Tue 4:00 PM* with the **tradable** badge. This is the
  slot the Park household will offer.
- The Ahmad ledger reads *Lee owe you 2 · Park even · Chen even*, followed by the preferences
  line.
- The wire panel is empty.

Each **Reset rehearsal** button resets only its own household. To reset all four households,
including Lee and Chen, either restart `npm run dev` or run:

```sh
for p in 4001 4002 4003 4004; do curl -s -X POST http://127.0.0.1:$p/api/reset > /dev/null; done
```

Confirm that the `npm run dev` terminal is running and shows no errors.

## 3. Script

| # | Window | Action or phrase | Expected display |
|---|---|---|---|
| 1 | Both | No interaction (voice-over only). | Two idle households, under the opening line. |
| 2 | **Left** | *"I can't take Maya to soccer on Thursday. Can you sort it out?"* | Feed card titled "Covering the soccer run", the three households as chips, and the request entry at 9:00 AM. |
| 3 | Both | Wait approximately 6 seconds. | The wire panel lists requests **→ lee**, **→ park** and **→ chen**. The Park page announces the incoming request unprompted. |
| 4 | **Left** | *"What's the news about Thursday?"* | Proposal card: *They take: soccer run · Thursday 4 PM* and *You take: soccer run · Tuesday 4 PM*, with **Yes, agree** and **No** controls. |
| 5 | **Left** | *"Yes, that works."* (or click **Yes, agree**) | The card changes to "Waiting for the other family." The wire panel shows **→ park · accept**. |
| 6 | **Right** | After the Park page has spoken: *"Yes, please approve that."* | The Park card changes to **Settled**; the wire panel shows **← ahmad** traffic; the Park calendar gains *soccer run (covering for Ahmad) · Thu 4 PM*. |
| 7 | **Left** | Shortly afterwards: *"Is Thursday sorted?"* | "Done — the Parks are covering the soccer run on Thursday at 4 PM, and you're taking their soccer run on Tuesday at 4 PM." The Ahmad calendar shows a **park covers** badge on Thursday and a new Tuesday entry. |
| 8 | **Left** | Expand a wire entry using its arrow. | Raw JSON containing `task: "soccer run"`, instants and durations, with no titles, names, locations or addresses. |
| 9 | **Left** | *"Who should I ask about Saturday?"* | "The Lees owe you two. You're even with the Parks and the Chens. Ask the Lees first." |
| 10 | Both | Scroll the side panels slowly. | Calendar, ledger and wire panels, followed by a cut to `packages/protocol/README.md` and the tool definitions in `src/mcp.ts`. |

Presenter notes:

- Do not include the wake word "Alexa" in typed input; it is not among the simulator's
  recognised phrases. When using the microphone, speak the phrase exactly as written.
- *"No"* or *"No, decline"* demonstrates rejection, if required. Reset before the next take.
- The task labels under negotiation ("soccer run", "swim run") are the only text that crosses
  between households. Leave the JSON on screen for at least one second during the privacy beat.

## 4. Voice-over script

The following narration fits the beats above at a measured pace (approximately 2 minutes 40
seconds). It is written for speech and is therefore deliberately conversational.

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

### Video upload text

**Title:** Between — your Alexa negotiates with other families' Alexas

**Description:**

```
Two households, two assistants, one Thursday. A parent asks once ("I can't take
Maya to soccer on Thursday. Can you sort it out?") and the household assistant
negotiates with trusted families over a signed, offers-only protocol. The Lee
household declines and none of its schedule is disclosed; the Park household
counters with a swap; the Ahmad household's favour ledger determines who is asked
first. Nothing is committed until both families approve aloud.

Built for the Build, Ship, Shape hackathon (Alexa+ track). A real MCP server with
four tools and a real MCP App view; the Alexa+ device is simulated in a web page
because the developer preview is restricted to the developer's own account. The
negotiation protocol is a standalone, tested package.

Code: https://github.com/Abrar5510/between
Protocol: https://github.com/Abrar5510/between-protocol
```

## 5. Troubleshooting

| Symptom | Resolution |
|---|---|
| The card is blank or out of date. | The view is populated by tool results. Submit a turn such as *"What's the news?"* |
| "I could not reach the house server." | A household process has stopped. Check the terminal, run `npm run dev` again (with `--keep` to retain state) and reload the page. |
| The household names are wrong. | The ports have been swapped: 4001 is Ahmad and 4002 is Park. |
| A take was interrupted. | Click **Reset rehearsal** in both windows to restore the seeded morning. No restart is required. |
| Both windows speak at once. | Disable **Voice** in one window; the reply remains visible on screen and in the transcript. |
| Both proposal cards show "Waiting for the other family." | One household has not yet approved. Submit *"What's the news?"* to refresh the state. |
| The seeded state is required mid-session. | Run `curl -X POST http://127.0.0.1:4001/api/reset`, and likewise for ports 4002 to 4004. |

## 6. Hosting for judges

```sh
npm run host          # dev servers, router and ngrok in a single terminal
```

The script prints the testing instructions and writes them to `data/hosted-links.txt`:

- `https://<ngrok-domain>/ahmad/sim/`: Ahmad household
- `https://<ngrok-domain>/park/sim/`: Park household

Both pages are served through a single ngrok tunnel. `scripts/router.ts` assigns each household
a path, because a free ngrok account has one reserved domain and a second tunnel would take it
over from the first. This configuration was verified end to end on 17 October 2026: both
households loaded through ngrok and settled the swap, and the `curl` reset commands in the
instructions worked as written.

Operating notes:

- Keep the terminal open and the machine awake throughout judging; the demonstration runs on
  this machine and judges may test at any time.
- On first visit, ngrok displays an interstitial page ("You are about to visit …"). One click
  on **Visit Site** dismisses it for that browser.
- Command-line requests such as `curl` are not affected by the interstitial.
- Judges see the state left by the previous session. The reset commands in the instructions
  restore both households to the seeded morning.
- Reset both households before sharing the link so that the first judge sees the initial state.
- To obtain a custom URL without the interstitial, add a public hostname for
  `http://127.0.0.1:4100` to the existing named Cloudflare tunnel and use that hostname in the
  instructions instead of the ngrok link.

## 7. Post-recording checklist

- [ ] Export the video and upload it (YouTube "Unlisted" is acceptable) with the title
      **Between — your Alexa negotiates with other families' Alexas**.
- [ ] Add the video link to the Devpost submission.
- [ ] Add the two screenshots (`docs/img/ahmad-kitchen.png` and `docs/img/park-kitchen.png`) to
      the Devpost image gallery. Both were captured through the hosted deployment at the moment
      of settlement.
- [ ] Add the repository links `github.com/Abrar5510/between` and
      `github.com/Abrar5510/between-protocol`.
- [ ] Complete the mandatory **Product Feedback** section from
      [`hackathon/product-feedback.md`](hackathon/product-feedback.md).
- [ ] Confirm that the Devpost form fields match
      [`hackathon/submission-description.md`](hackathon/submission-description.md).
