# Friction Log

**Project:** Between
**Event:** Build, Ship, Shape: Amazon Developer Hackathon, Alexa+ track
**Period:** 10 to 17 October 2026

Each entry records, where applicable, the action attempted, the observed result, the expected
result, the workaround adopted and a recommendation.

---

## 10 October 2026: review of the Alexa+ MCP toolkit documentation

### 1. The specification version in the overview does not match the sample handshake

- **Attempted:** to determine which MCP protocol version and client capabilities Alexa+ sends,
  in order to decide whether to rely on elicitation or tasks.
- **Observed:** the toolkit overview states that Alexa+ supports specification 2025-11-25. The
  sample `initialize` request on the client lifecycle page shows
  `protocolVersion: "2025-03-26"` and declares only `roots`.
- **Expected:** a single authoritative handshake example for the current client.
- **Workaround:** log the actual `initialize` request from the simulator and design for the
  minimal case (plain tool calls only).
- **Recommendation:** publish the exact `initialize` payload sent by the production client,
  including its capabilities.

### 2. Support for elicitation, tasks, notifications and sampling is undocumented

- **Attempted:** to determine whether approval prompts (elicitation) or long-running tasks are
  available.
- **Observed:** the lifecycle page states that Alexa "uses the existing elicitation framework
  through the MCP protocol" but specifies no mode or capability. The "Supported Capabilities"
  page lists only authentication and account linking.
- **Expected:** a support matrix for each MCP feature.
- **Workaround:** implement approval as an ordinary tool call; run long operations in the
  background and poll for their status.
- **Recommendation:** add a feature matrix covering tools, resources, prompts, elicitation (form
  and URL modes), tasks, sampling, notifications and MCP Apps view-to-server calls.

### 3. Returning 401 without `WWW-Authenticate` conflicts with the MCP authorisation specification

- **Attempted:** to design the authentication layer.
- **Observed:** the quickstart requires `401 Unauthorized` *without* a `WWW-Authenticate` header
  and lists that header as "not yet supported". The MCP specification requires servers to return
  it with a `resource_metadata` pointer.
- **Expected:** a specification-compliant server to work without modification.
- **Workaround:** special-case the 401 response for Alexa.
- **Recommendation:** ignore the header rather than failing on it.

### 4. The documentation does not state whether an unauthenticated server can be deployed

- **Attempted:** to identify the minimal authentication configuration for a development-stage
  add-on.
- **Observed:** account linking is described as optional and service-level authentication as
  required only "if you have a private MCP server", yet the quickstart checklist assumes that
  OAuth metadata exists. No page states the outcome when no authentication is configured.
- **Expected:** an explicit statement.
- **Workaround:** attempt an unauthenticated deployment first and add OAuth only if deployment
  fails.
- **Recommendation:** state the minimum authentication required at the development stage.

### 5. The authentication page is internally inconsistent

- **Observed:** the token endpoint section requires HTTP Basic client authentication, while the
  checklist permits "HTTP Basic or POST body". The runtime flow uses the scope `mcp:resource`,
  while the scope table lists `mcp:resources`.
- **Recommendation:** correct both inconsistencies and include one complete request and
  response pair.

### 6. The CLI is not available on the public npm registry and setup is demanding

- **Attempted:** `npm view @alexa-ai/cli`.
- **Observed:** the public registry returns 404. The setup page requires an AWS account, an IAM
  user with an assume-role policy, two AWS profiles and a CodeArtifact login whose token expires
  after 12 hours. The quickstart provides no installation command.
- **Expected:** installation with `npm i -g` from the public registry and a browser-based login.
- **Recommendation:** publish the CLI publicly, and remove the AWS dependency for MCP add-ons
  that host nothing on AWS.

### 7. Development-stage add-ons are visible to a single account

- **Attempted:** to plan a demonstration with two households on two Alexa accounts.
- **Observed:** the simulator page states that the development stage is "only accessible to
  your developer account". No tester or beta access is described.
- **Expected:** a means of inviting a second account.
- **Workaround:** run the second household in a simulated Alexa+ web application.
- **Recommendation:** permit a short list of tester accounts at the development stage; otherwise
  multi-user experiences cannot be tested.

### 8. Two different latency requirements are given

- **Observed:** the quickstart states that round-trip latency "must be under 500 ms". The
  functional requirements recommend returning results "within 3 seconds".
- **Workaround:** design for 500 ms, with no tool call waiting on the network or a model.
- **Recommendation:** state one hard limit and one target.

### 9. The local inspector has no installation command

- **Observed:** the documentation names the package `@alexa-ai/addon-local-inspector` and
  directs the reader to a Getting Started guide in the console. The testing page refers to a
  "standard MCP Inspector" without a link.
- **Recommendation:** include the installation command and links on the page.

## 10 October 2026: initial implementation

### 10. The quickstart names the MCP Apps SDK but not the required SDK line

- **Attempted:** to install `@modelcontextprotocol/ext-apps`, as the Alexa+ quickstart suggests
  for visual output.
- **Observed:** the current release (2.0.3) requires the split v2 packages
  (`@modelcontextprotocol/server`, `/node` and `/express`) rather than
  `@modelcontextprotocol/sdk` 1.x. A server built on the 1.x SDK requires `ext-apps@1.7.x`. The
  npm package includes no quickstart; usage must be inferred from the type definitions.
- **Workaround:** build on v2 and follow the examples in the `.d.ts` files.
- **Recommendation:** state in the Alexa+ quickstart the SDK versions against which it was
  tested.

### 11. MCP Inspector is an effective pre-flight check for MCP Apps

- **Attempted:** to render the view before integrating with Alexa+.
- **Observed:** `npx @modelcontextprotocol/inspector@2.10.1` provides an Apps tab with a
  sandbox. It listed the tool, invoked it and rendered the card without any changes to the
  project.
- **Recommendation:** link to it from "Test Your MCP Add-ons", which refers to a "standard MCP
  Inspector" without stating where to obtain it or that it renders MCP Apps.

## 17 October 2026: core implementation

### 12. The MCP Express helper cannot verify signed request bodies

- **Attempted:** to mount the MCP server using `createMcpExpressApp` from
  `@modelcontextprotocol/express`.
- **Observed:** the inter-household endpoint verifies an Ed25519 signature over the *raw*
  request bytes, but the helper installs its own body parser and provides no means of retaining
  the raw body.
- **Workaround:** construct a plain `express()` application, mount
  `NodeStreamableHTTPServerTransport` on `/mcp` directly, and use `express.json({ verify })` to
  capture the raw buffer on `/peer/offers`.
- **Recommendation:** allow the helper to accept `express.json` options, or provide a raw-body
  variant for servers that verify signatures.

### 13. Case-insensitive macOS volumes cause `tsc` failures with npm workspaces

- **Attempted:** to import the workspace package (`between-protocol`) from server code on an
  external volume mounted at both `/Volumes/Transend` and `/volumes/transend`.
- **Observed:** `tsc` failed with TS1149 ("File name ... differs from already included file
  name ... only in casing"), because the include pattern and the workspace symlink resolve the
  same file under two spellings.
- **Workaround:** set `forceConsistentCasingInFileNames: false`, so that both spellings are
  treated as one file.
- **Recommendation:** the error message should identify the mount or workspace-symlink cause,
  not only the two spellings.

### 14. The Bedrock `effort` parameter is nested more deeply than expected

- **Attempted:** to pass `effort: 'low'` to `messages.create` using `@anthropic-ai/bedrock-sdk`.
- **Observed:** the compiler reported "No overload matches this call" without further detail.
  The parameter belongs at `output_config.effort`, which is visible only in the type
  definitions.
- **Workaround:** consult the type definitions and move the field.
- **Recommendation:** document `output_config.effort` in the Bedrock quickstart alongside
  `model` and `max_tokens`.

### 15. Bedrock access could not be obtained within the hackathon period

- **Attempted:** to run a Claude model on Bedrock for the demonstration's move chooser, a
  component emphasised in the judging criteria.
- **Observed:** a new AWS account must be created, verified with a payment card and granted
  model access per region manually. The hackathon's AWS credits ran out on **7 October**, sixteen
  days before the submission deadline and two weeks before the published request deadline of
  21 October; the resources page states that credit requests are no longer accepted. Without
  credits, Bedrock access depends on a personal paid account and a multi-day manual approval
  process. As a result, the one required cloud dependency could not be enabled within the
  hackathon period.
- **Workaround:** ship the feature behind `CHOOSER=claude`, with a deterministic rules-based
  chooser as the default. The code path is implemented and type-checked; only the credentials
  are missing.
- **Recommendation:** for time-limited hackathons, issue scoped sandbox credentials at
  registration with the required model pre-approved, size the credit pool to the number of
  registrants, and announce on the hackathon page when credits run out rather than only on the
  resources page.

### 16. The `@modelcontextprotocol/ext-apps` host bridge is documented only in type definitions

- **Attempted:** to host the MCP App view within the simulator page, as a physical Alexa+
  device would.
- **Observed:** the host side (`AppBridge`, `PostMessageTransport`, the ordering of
  `sendToolInput` and `sendToolResult`, and `oncalltool`) has no README and no runnable example
  in the package. The constructor's `hostContext` option is discoverable only by reading
  `app-bridge.d.ts` and the minified `app.js`.
- **Workaround:** follow the documentation comments in the `.d.ts` file; the bridge behaves
  exactly as described.
- **Recommendation:** ship the `basic-host` example referenced in the comments as a template
  directory in the published package.

## 17 October 2026: verification, browser testing and hosting

### 17. All server-side tests passed while the page itself failed to load

- **Attempted:** to verify the demonstration before recording it, by adding a real-browser test
  suite that opens both households, waits for the device title and checks for the card.
- **Observed:** the simulator page never initialised. The bundle requested
  `/assets/index-….js` while the page was served under `/sim/`, so the script returned 404.
  Without the host script, the bridge handshake never occurred, the device title never updated
  and the panel remained empty. Meanwhile, 26 HTTP-level checks passed, because the page is a
  client of the server and no test operated above the DOM.
- **Expected:** a page that loads wherever it is served. The toolkit documentation does not
  address hosting a view or host page under a subpath.
- **Workaround:** use a relative asset base (`base: ''`) and derive the API base from
  `document.baseURI`, so that one build serves both `/sim/` locally and `/ahmad/sim/` behind the
  hosted router. The browser suite now fails if this regresses.
- **Recommendation:** state in the MCP Apps guide that asset and API paths should be relative
  or base-anchored, and present automated testing of the real user interface in CI as a
  standard practice.

### 18. Approving a swap caused the card to lose the approved terms

- **Attempted:** to press **Yes, agree** on the negotiation card and inspect the next card
  state.
- **Observed:** the card read "Told the Parks yes. Waiting for their family to approve." with
  no terms. `respond_to_proposal` returned a view, summary and status but no proposal object,
  and its `outputSchema` did not include one, so no validation failed. The household could no
  longer see the agreement it had just accepted. The settlement card had the same defect.
- **Expected:** every result that refers to a proposal includes that proposal.
- **Workaround:** carry the same wire proposal through every result (`respond_to_proposal` now
  matches `negotiation_status`) and assert the terms in the browser suite.
- **Recommendation:** document the design principle that `outputSchema` should be derived from
  what the view must render rather than what the tool computes, and warn during development
  when a view receives a result it cannot fully render.

### 19. Two ngrok tunnels on a free account claim the same reserved domain without error

- **Attempted:** to expose both households as two tunnels on one authenticated ngrok account.
- **Observed:** both agents started, and both logs printed
  `url=https://<the one reserved domain>`. Two processes served the same URL for different
  local ports; whichever responded first handled the request, and no error was raised. On the
  free plan, `--url=random` is interpreted as a custom hostname and rejected
  (`ERR_NGROK_314: Only paid plans may create endpoints with custom hostnames`).
- **Expected:** either a free random domain for the second tunnel or an explicit refusal.
- **Workaround:** use one tunnel with a 90-line path router (`scripts/router.ts`) serving the
  Ahmad household at `/ahmad/…` and the Park household at `/park/…`. This also improved the
  judging experience: one link for both households.
- **Recommendation:** reject a second agent session explicitly when the reserved domain is
  already in use, and document how to obtain a random free domain.

### 20. Tunnel providers fail depending on network and endpoint

- **Attempted:** to retain cloudflared quick tunnels as an account-free fallback to ngrok.
- **Observed:** `cloudflared tunnel --url …` failed with
  `failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": context deadline exceeded`,
  while the machine's existing *named* cloudflared tunnel (which uses different endpoints)
  operated normally on the same network with the same binary.
- **Expected:** quick tunnels to work wherever named tunnels work.
- **Workaround:** use ngrok (already authenticated) as the default, and document a named
  Cloudflare hostname as the upgrade path.
- **Recommendation:** report a clear diagnostic when the quick-tunnel API host is unreachable,
  so that the failure is attributed to the network rather than to cloudflared.

### 21. The runbook described a screen state that did not exist

- **Attempted:** to assert the reset state in the browser suite (one event, no badges) and
  compare it with the pre-flight checklist in the recording runbook.
- **Observed:** the checklist instructed the reader to look for a **tradable** badge on the
  Ahmad household's Thursday soccer slot. The seed data gives the Ahmad household the *need*
  (kind `activity`, not tradeable), so no badge is shown; the Park and Chen slots are the
  tradeable ones. The runbook had been written from the intent of the seed data rather than
  from the rendered output.
- **Expected:** documentation consistent with the rendered interface, since it is followed under
  time pressure.
- **Workaround:** correct the checklist. The browser suite now asserts the reset state, so the
  interface and the documentation share one source of truth.
- **Recommendation:** for demonstration-driven projects, assert the narrated interface state in
  automated tests. A runbook is effectively a test written in prose, and prose does not fail CI.

### 22. A cold CI runner exposed a race condition not reproducible locally

- **Attempted:** to run the four-server end-to-end suite in CI on every push.
- **Observed:** one run failed. The negotiation reported "Nobody could take the soccer run"
  **while its own feed showed two offers** (the Park swap and the Chen favour). On a cold runner,
  the collection window (a few hundred milliseconds) closed before the households' replies
  arrived; the decision was recorded as final, and all subsequent replies were ignored. On a
  warm local machine the replies always arrived within the window, so more than 30 local runs
  did not reproduce the fault.
- **Expected:** an offer received after the window to be treated as a valid offer; a slow reply
  must not be equivalent to a refusal.
- **Workaround:** the "no help yet" outcome is now revisable. Any reply received after that
  decision reopens it, and the first acceptable offer immediately becomes the proposal, which is
  strictly better for the household than the earlier negative result. A regression test forces
  the race with a 5 ms window and 60 ms deliveries.
- **Recommendation:** in any collect-then-decide window within an agent protocol, treat the
  decision as a revisable snapshot rather than a final state, allow late events to revise it,
  and test on the slowest available machine.
