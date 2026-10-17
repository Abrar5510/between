# Product feedback — Between

For the Devpost **Product Feedback** section, one block per tool/API/SDK the
build actually used. Written from the raw entries in `FRICTION_LOG.md` after
shipping the whole project end to end. Everything here was hit for real while
building Between between Oct 10 and Oct 17, 2026.

---

## 1. Alexa+ add-ons (MCP toolkit, development stage)

**What we built with it:** a household assistant surface that exposes four MCP
tools (`find_help`, `negotiation_status`, `respond_to_proposal`, `ledger`) plus
a `ui://` app resource, with a web-simulated Alexa+ host driving the same
server over Streamable HTTP.

**What worked well**

- The MCP-first model is the right call. Once we accepted that the assistant is
  "an MCP server plus prompts", the whole product fell out naturally: tools for
  actions, a resource for the card, and no proprietary glue anywhere.
- Tool-result rendered apps give agent output a place to *live* (a proposal you
  can press), not just text to read. The strongest moment in our demo comes
  directly from this.

**What hurt**

- **The development stage is single-account.** The page states add-ons in
  development are "only accessible to your developer account". A concept like
  ours — *two households talking to each other* — cannot be tested on real
  devices, because a second household needs a second account. There is no
  tester allow-list and no document describing one. We ended up simulating
  every home in our own web page, which the rules permit, but the "two Alexa
  devices negotiating in two kitchens" moment is exactly what this product is
  for.
- **Two conflicting latency numbers.** The quickstart says round-trip latency
  "must be under 500 ms"; the functional requirements say results "within 3
  seconds" as a best practice. These imply different architectures (precompute
  vs. on-demand). We designed for 500 ms and made every tool call wait on
  nothing remote — but the ambiguity cost planning time.
- **The local inspector is named but not installable from the docs.** The page
  references `@alexa-ai/addon-local-inspector` with no package that `npm`
  resolves. Either publish it or show the working command.
- **No wake-phrase-free test path described.** Before a device is set up, there
  is no documented way to send "what a person would say" into an add-on and
  see the transcript. A one-command "chat with my server as the assistant
  would" loop would have made days 1–2 much faster. (We built exactly that as
  `POST /sim/turn`, and it is now the thing we demo.)

**Suggestions**

1. A **tester allow-list (3–5 accounts)** for development-stage add-ons, so
   multi-user experiences can be tested on real devices.
2. One authoritative latency budget with the rationale attached.
3. A published, minimal **"talk to my add-on" CLI** (install → URL → prompt)
   documented in the quickstart.
4. Ship the `basic-host` example of the app-bridge as a template directory in
   the published package (see §3).

---

## 2. `@modelcontextprotocol/sdk` (server, client, express, node)

**What we built with it:** one Streamable HTTP MCP server per household
(bearer-token auth), driven in tests by a real client, plus a second in-process
client for the simulator.

**What worked well**

- Registering tools with output schemas made every answer speakable *and*
  renderable from one source of truth. The tool call is the product.
- The client/server split is clean: our end-to-end test starts four real
  servers and drives them with real MCP clients over HTTP, and that test is the
  strongest evidence in the submission.
- `node:sqlite`-era Node (24) runs the whole stack with zero native modules.

**What hurt**

- **No hook for raw request bodies when you need to verify a signature.**
  `createMcpExpressApp` owns the body parser, so a server that must verify
  Ed25519 over the *exact bytes received* (our `/peer/offers` endpoint) cannot
  use the helper. We hand-rolled the Express app and mounted
  `NodeStreamableHTTPServerTransport` ourselves, with
  `express.json({ verify })` to capture the raw buffer. That is real friction
  for any server that does webhook-style verification — a very common partner
  pattern.
- **Error surface for tool schemas is opaque.** A missing `type: "object"` on
  `inputSchema` surfaces as a Bedrock-type error deep in an unrelated library
  when the tool list is handed to another API, not as a schema error at
  registration time.

**Suggestions**

1. Let `createMcpExpressApp` (and friends) accept `express.json` options, or
   export a raw-body variant for signature-verifying servers.
2. Validate tool schemas at registration and fail with a schema-shaped error.

---

## 3. `@modelcontextprotocol/ext-apps` (App, AppBridge, PostMessageTransport)

**What we built with it:** an MCP App that renders the negotiation feed, the
proposal card with working Yes/No buttons, the settled card and the ledger; and
a host page that embeds it in an iframe through `AppBridge` — i.e. we wrote
both sides of the handshake.

**What worked well**

- The host-side bridge is genuinely powerful: `oncalltool`, `sendToolResult`,
  `sendToolInput`, `onsizechange` covered everything the demo needed, and the
  buttons in the view can drive a full negotiation turn by proxy. The "apps,
  not walls of text" idea earns its keep here.
- Auto-resize (`ui/notifications/size-changed`) is the kind of detail that
  makes embedded apps feel native.

**What hurt**

- **The host API is documented only in `.d.ts` doc comments.** There is no
  README and no runnable example in the package for the host side: the
  constructor's options object, `hostContext`, `oncalltool`'s return shape, and
  the exact `PostMessageTransport(iframe.contentWindow, iframe.contentWindow)`
  invocation were all discovered by reading type definitions and the minified
  bundle. The comments that *do* exist are excellent — they are just not
  reachable from the package page.
- The app-side and host-side stories are asymmetric: the app side has clear
  examples; the side that hosts the app (which every tool vendor will build
  next) does not.
- **Nothing connects the view's needs to the tool's `outputSchema`, and a
  mismatch fails silently.** Our `respond_to_proposal` returned view/summary/
  status — and no proposal object. Its schema was valid, the tool worked, the
  tests passed; the card simply rendered without the terms the family had just
  agreed to, and only a real browser driving the real card caught it. For a
  toolkit whose whole pitch is "the tool result is the UI", that is the failure
  mode worth guarding.
- **Path-prefix hosting is invisible in the docs.** An MCP App view and its
  host page must survive being served under a subpath (a tunnel, a gateway, a
  per-tenant route). Ours did not: the built page asked for `/assets/…` while
  being served under `/sim/`, and the page was dead on arrival with every
  server-side test green.

**Suggestions**

1. Publish the `basic-host` code the doc comments reference as an actual
   template directory inside the npm package.
2. One README section "Writing a host in 30 lines", with the exact transport
   arguments and the initialize → tool input → tool result sequence.
3. Add a "designing the result" note: build `outputSchema` from what the view
   must render, not from what the tool computes, and warn in development when a
   view receives a result it cannot fully render.
4. Say in the MCP Apps guide that asset and API paths should be relative (or
   base-anchored) so a view works locally and behind a subpath.

---

## 4. Amazon Bedrock (Claude via `@anthropic-ai/bedrock-sdk`)

**What we built with it:** an optional "chooser" in which Claude on Bedrock
picks among negotiation moves the engine has *already* generated as legal,
falling back to the deterministic rule on timeout. The path is written,
type-checked and shipped behind `CHOOSER=claude`.

**What hurt**

- **A hackathon that scores Bedrock use, with no usable Bedrock inside the
  hackathon window.** A brand-new AWS account has to be created, card-verified
  and the model allow-listed per region by hand, and the hackathon's own AWS
  credits form *closes two days before the submission deadline*. For a 13-day
  build, "get AWS access first, then start" is not a realistic sequencing. We
  shipped a deterministic fallback and lost the time instead.
- **The typed `effort` parameter is one level deeper than expected.** Passing
  `effort: 'low'` at the top level of `messages.create` produces "No overload
  matches this call" with no field-level hint; it lives at
  `output_config.effort`, discoverable only in the type definitions.
- Model IDs change names in documentation across generations; the exact Bedrock
  model ID for a given Claude version takes a console click to confirm.

**Suggestions**

1. Scope-limited **sandbox keys at hackathon registration** with the required
   models pre-allow-listed, or move the credits deadline past the submission
   deadline.
2. Mention `output_config.effort` in the Bedrock quickstart next to `model`.
3. Fail with a field-level message ("`effort` is not a top-level parameter; did
   you mean `output_config.effort`?") rather than a bare overload error.

---

## 5. Hackathon logistics (small, honest)

- The **friction log as a bonus criterion** is a great idea — it is the only
  place where an SDK team hears exactly which 20 minutes each rough edge costs.
  Keeping it going for the full build was easy because every entry was written
  at the moment of pain.
- "Open Source mini challenge" required a **published package URL**, not just
  a repository. We had to extract our protocol layer into a second repo mid-
  build (`between-protocol`) to meet it. If "SIG-ready package" is the intent,
  saying so in the challenge description would have shaped the architecture on
  day 1 — which, to be fair, is probably the point.
- The **12:00 PM PT deadline** for a US-run hackathon is 00:00 PKT the next
  day; a timezone line next to the deadline ("already converted: midnight
  Saturday in UTC+5") removes a whole category of panic.

---

*Companion document: `FRICTION_LOG.md` (16 dated entries with
Tried/Happened/Expected/Workaround/Suggestion per entry).*
