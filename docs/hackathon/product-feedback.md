# Product Feedback

This document provides the mandatory Product Feedback section of the Devpost submission, with
one section for each tool, API and SDK used in the build. It is derived from the entries in the
[friction log](friction-log.md), and every issue described was encountered while building
Between between 10 and 17 October 2026.

---

## 1. Alexa+ add-ons (MCP toolkit, development stage)

**Usage.** A household assistant interface exposing four MCP tools (`find_help`,
`negotiation_status`, `respond_to_proposal` and `ledger`) and a `ui://` app resource, with a
web-based simulated Alexa+ host driving the same server over Streamable HTTP.

**Strengths**

- The MCP-first model is well chosen. Treating the assistant as an MCP server plus prompts led
  directly to a clean product structure: tools for actions, a resource for the card, and no
  proprietary integration code.
- Apps rendered from tool results give agent output a persistent, interactive form (a proposal
  that can be acted upon) rather than text alone. The most effective moment of the
  demonstration depends on this capability.

**Issues**

- **Development-stage add-ons are limited to one account.** The documentation states that
  add-ons in development are "only accessible to your developer account". A product involving
  two households cannot be tested on physical devices, because the second household requires a
  second account. No tester allow-list is documented. Every household was therefore simulated
  in a web page, which the rules permit, but the defining scenario of the product (two devices
  negotiating in two homes) could not be demonstrated on hardware.
- **Conflicting latency requirements.** The quickstart states that round-trip latency "must be
  under 500 ms", while the functional requirements recommend returning results "within 3
  seconds". These figures imply different architectures (precomputation versus on-demand
  computation). The build targeted 500 ms, with no tool call waiting on a remote service, but
  the ambiguity cost planning time.
- **The local inspector cannot be installed from the documentation.** The documentation refers
  to `@alexa-ai/addon-local-inspector`, but no package of that name resolves on npm.
- **No documented test path that bypasses the device.** Before a device is configured, there is
  no documented way to submit an utterance to an add-on and inspect the transcript. A single
  command for conversing with a server as the assistant would have accelerated the first two
  days considerably. The project implemented this as `POST /sim/turn`, which became the basis
  of the demonstration.

**Recommendations**

1. Provide a tester allow-list of three to five accounts for development-stage add-ons, so that
   multi-user experiences can be tested on physical devices.
2. Publish a single authoritative latency budget with its rationale.
3. Publish and document in the quickstart a minimal CLI for conversing with an add-on (install,
   provide a URL, submit a prompt).
4. Ship the `basic-host` app-bridge example as a template directory in the published package
   (see section 3).

---

## 2. MCP TypeScript SDK (server, client, express and node packages)

**Usage.** One Streamable HTTP MCP server per household with bearer-token authentication,
exercised in tests by a real client, together with a second in-process client for the
simulator.

**Strengths**

- Registering tools with output schemas allowed every response to be both spoken and rendered
  from a single source of truth.
- The client/server separation is clean. The end-to-end test starts four real servers and drives
  them with real MCP clients over HTTP; this test is the strongest evidence in the submission.
- On Node.js 24, with `node:sqlite`, the complete stack runs without native modules.

**Issues**

- **No access to the raw request body for signature verification.** `createMcpExpressApp`
  installs its own body parser, so a server that must verify an Ed25519 signature over the exact
  bytes received (the `/peer/offers` endpoint) cannot use the helper. The project constructed
  the Express application manually, mounted `NodeStreamableHTTPServerTransport` directly, and
  used `express.json({ verify })` to capture the raw buffer. This affects any server performing
  webhook-style verification, which is a common integration pattern.
- **Tool schema errors are reported indirectly.** A missing `type: "object"` in `inputSchema`
  is not rejected at registration; it surfaces later as an error in an unrelated library when
  the tool list is passed to another API.

**Recommendations**

1. Allow `createMcpExpressApp` and related helpers to accept `express.json` options, or provide
   a raw-body variant for servers that verify signatures.
2. Validate tool schemas at registration and report schema-specific errors.

---

## 3. `@modelcontextprotocol/ext-apps` (App, AppBridge, PostMessageTransport)

**Usage.** An MCP App rendering the negotiation feed, a proposal card with functioning Yes and
No controls, a settlement card and the ledger; and a host page embedding the app in an iframe
through `AppBridge`. Both sides of the handshake were therefore implemented.

**Strengths**

- The host-side bridge is capable: `oncalltool`, `sendToolResult`, `sendToolInput` and
  `onsizechange` covered every requirement of the demonstration, and the controls in the view
  can drive a complete negotiation turn through the host.
- Automatic resizing (`ui/notifications/size-changed`) makes embedded apps feel native.

**Issues**

- **The host API is documented only in type-definition comments.** The package contains no
  README and no runnable example for the host side. The constructor options, `hostContext`, the
  return shape of `oncalltool`, and the exact invocation
  `PostMessageTransport(iframe.contentWindow, iframe.contentWindow)` were all determined by
  reading the type definitions and the minified bundle. The existing comments are of high
  quality but are not discoverable from the package page.
- **App-side and host-side documentation are asymmetric.** The app side has clear examples; the
  host side, which every tool vendor will need to build, does not.
- **Mismatches between a view's requirements and a tool's `outputSchema` fail silently.**
  `respond_to_proposal` initially returned a view, summary and status but no proposal object.
  The schema was valid, the tool functioned and the tests passed, yet the card rendered without
  the terms the household had just accepted. Only a real browser driving the real card detected
  the fault. For a toolkit whose premise is that the tool result is the user interface, this
  failure mode merits explicit safeguards.
- **Hosting under a path prefix is not addressed.** An MCP App view and its host page must work
  when served under a subpath (a tunnel, a gateway or a per-tenant route). In this project the
  built page requested `/assets/…` while served under `/sim/`, and failed to load while every
  server-side test passed.

**Recommendations**

1. Publish the `basic-host` code referenced in the documentation comments as a template
   directory in the npm package.
2. Add a README section on writing a minimal host, with the exact transport arguments and the
   sequence initialize, tool input, tool result.
3. Add guidance on result design: derive `outputSchema` from what the view must render rather
   than from what the tool computes, and warn during development when a view receives a result
   it cannot fully render.
4. State in the MCP Apps guide that asset and API paths should be relative or base-anchored, so
   that a view works both locally and under a subpath.

---

## 4. Amazon Bedrock (Claude via `@anthropic-ai/bedrock-sdk`)

**Usage.** An optional chooser in which Claude on Bedrock selects among negotiation moves that
the engine has already determined to be legal, falling back to the deterministic rule on
timeout. The code path is implemented, type-checked and shipped behind `CHOOSER=claude`.

**Issues**

- **Bedrock access could not be obtained within the hackathon period.** A new AWS account must
  be created, verified with a payment card and granted model access per region manually, and
  the hackathon's AWS credits ran out on 7 October, two weeks before the published request
  deadline of 21 October. For a 13-day build, obtaining AWS access before starting development
  is not a realistic sequence.
  The project shipped a deterministic fallback instead.
- **The `effort` parameter is nested more deeply than expected.** Passing `effort: 'low'` at the
  top level of `messages.create` produces "No overload matches this call" with no field-level
  guidance. The parameter belongs at `output_config.effort`, which is discoverable only in the
  type definitions.
- **Model identifiers are difficult to confirm.** The exact Bedrock model identifier for a given
  Claude version requires consulting the console.

**Recommendations**

1. Issue scope-limited sandbox credentials at hackathon registration with the required models
   pre-approved, and size the credit pool so that credits last until the published deadline.
2. Document `output_config.effort` in the Bedrock quickstart alongside `model`.
3. Report a field-level error (for example, "`effort` is not a top-level parameter; did you mean
   `output_config.effort`?") instead of a generic overload error.

---

## 5. Hackathon logistics

- **The friction log as a bonus criterion is valuable.** It is the only channel through which
  SDK teams learn the precise cost of each difficulty. Maintaining it throughout the build was
  straightforward because each entry was recorded when the issue occurred.
- **The Open Source mini challenge expects a published package.** A repository alone was
  insufficient, so the protocol layer was extracted into a second repository
  (`between-protocol`) during the build. Stating this expectation in the challenge description
  would allow participants to plan the architecture accordingly from the outset.
- **The deadline is stated in a single time zone.** 12:00 PT corresponds to 00:00 PKT on the
  following day. Listing common conversions next to the deadline would prevent confusion for
  participants outside the United States.

---

*Companion document: the [friction log](friction-log.md), containing 22 dated entries, each
recording the attempt, the outcome, the expectation, the workaround and a recommendation.*
