# Friction log

Build, Ship, Shape hackathon, Alexa+ track. Project: Between. Started Oct 10, 2026.

Each entry: what I tried, what happened, what I expected, the workaround, and a suggestion.

## Oct 10: reading the Alexa+ MCP toolkit docs before writing code

### 1. Spec version in the overview does not match the sample handshake
- **Tried:** find out which MCP protocol version and client capabilities Alexa+ sends, to decide whether to build on elicitation or tasks.
- **Happened:** the toolkit overview says Alexa+ supports spec 2025-11-25. The client lifecycle page's sample `initialize` request shows `protocolVersion: "2025-03-26"` and declares only `roots`.
- **Expected:** one authoritative handshake example for the current client.
- **Workaround:** log the real `initialize` request from the simulator and design for the lowest case (plain tool calls only).
- **Suggestion:** publish the exact `initialize` payload the production client sends, including capabilities.

### 2. Elicitation, tasks, notifications and sampling support is undocumented
- **Tried:** check whether approval prompts (elicitation) or long-running tasks are usable.
- **Happened:** the lifecycle page says Alexa "uses the existing elicitation framework through the MCP protocol" but gives no mode or capability. The "Supported Capabilities" page lists only authentication and account linking.
- **Expected:** a support matrix per MCP feature.
- **Workaround:** approval is an ordinary tool call; long work runs in the background and is polled.
- **Suggestion:** add a feature matrix (tools, resources, prompts, elicitation form/URL, tasks, sampling, notifications, MCP Apps view-to-server calls).

### 3. 401 without `WWW-Authenticate` conflicts with the MCP authorization spec
- **Tried:** plan the auth layer.
- **Happened:** the quickstart requires `401 Unauthorized` *without* a `WWW-Authenticate` header and lists that header as "not yet supported". The MCP spec has servers return it with a `resource_metadata` pointer.
- **Expected:** a spec-compliant server to work unchanged.
- **Workaround:** special-case the 401 response for Alexa.
- **Suggestion:** ignore the header instead of failing on it.

### 4. Not stated whether a server with no authentication can be deployed
- **Tried:** find the smallest auth setup for a development-stage add-on.
- **Happened:** account linking is "optional", service-level auth is "if you have a private MCP server", but the quickstart checklist assumes OAuth metadata exists. No page says what happens with none.
- **Expected:** a one-line answer.
- **Workaround:** try no-auth first in the spike, add OAuth only if deploy fails.
- **Suggestion:** state the minimum auth for development stage explicitly.

### 5. Auth page contradicts itself
- **Happened:** the token endpoint section requires HTTP Basic client auth while the checklist allows "HTTP Basic or POST body"; the runtime flow uses scope `mcp:resource` while the scope table uses `mcp:resources`.
- **Suggestion:** fix both and show one complete request/response pair.

### 6. The CLI is not on public npm and setup is heavy
- **Tried:** `npm view @alexa-ai/cli`.
- **Happened:** 404 on the public registry. The setup page needs an AWS account, an IAM user with an assume-role policy, two AWS profiles and a CodeArtifact login whose token expires after 12 hours. The quickstart itself gives no install command.
- **Expected:** `npm i -g` from the public registry and a browser login.
- **Suggestion:** publish the CLI publicly; keep AWS out of the path for MCP add-ons that host nothing on AWS.

### 7. Development-stage add-ons are visible to one account only
- **Tried:** plan a demo with two households on two Alexa accounts.
- **Happened:** the simulator page says the development stage is "only accessible to your developer account". No tester or beta access is described.
- **Expected:** a way to invite a second account.
- **Workaround:** the second household runs in our own simulated Alexa+ web app.
- **Suggestion:** allow a small list of tester accounts in development stage. Multi-user experiences cannot be tested otherwise.

### 8. Two different latency numbers
- **Happened:** the quickstart says round-trip latency "must be under 500 ms". The functional requirements say return results "within 3 seconds" as a best practice.
- **Workaround:** design for 500 ms: no tool call waits on the network or a model.
- **Suggestion:** state one hard limit and one target.

### 9. Local Inspector has no install command
- **Happened:** the page names the package `@alexa-ai/addon-local-inspector` and says to follow a Getting Started guide in the console. The test page mentions a "standard MCP Inspector" without a link.
- **Suggestion:** put the install command and links on the page.

## Oct 10: first code

### 10. The quickstart names the MCP Apps SDK but not which SDK line it needs
- **Tried:** install `@modelcontextprotocol/ext-apps`, as the Alexa+ quickstart suggests for visuals.
- **Happened:** the current release (2.0.3) requires the split v2 packages (`@modelcontextprotocol/server`, `/node`, `/express`), not `@modelcontextprotocol/sdk` 1.x. A server already built on the 1.x SDK needs `ext-apps@1.7.x` instead. The npm package also ships no quickstart; usage has to be read from the type definitions.
- **Workaround:** build on v2 and read the `.d.ts` examples.
- **Suggestion:** the Alexa+ quickstart should state the SDK versions it was tested with.

### 11. MCP Inspector is a good pre-flight for MCP Apps (worked first time)
- **Tried:** render our view before touching Alexa+.
- **Happened:** `npx @modelcontextprotocol/inspector@2.10.1` has an Apps tab with a sandbox. It listed the tool, called it and rendered the card with no changes on our side.
- **Suggestion:** link it from "Test Your MCP Add-ons", which mentions a "standard MCP Inspector" without saying where to get it or that it renders MCP Apps.

## Oct 17: the core build

### 12. The MCP Express helper cannot verify signed request bodies
- **Tried:** mount the MCP server with the framework helper `createMcpExpressApp` from `@modelcontextprotocol/express`.
- **Happened:** the household-to-household endpoint verifies an Ed25519 signature over the *raw* request bytes, and the helper owns the body parser — there is no hook to keep the raw body.
- **Workaround:** build a plain `express()` app, mount `NodeStreamableHTTPServerTransport` on `/mcp` by hand, and use `express.json({ verify })` to capture the raw buffer on `/peer/offers`.
- **Suggestion:** let the helper take `express.json` options, or export a raw-body variant for signature-verifying servers.

### 13. macOS case-insensitive volumes break `tsc` on npm workspaces
- **Tried:** import the workspace package (`between-protocol`) from the server code on an external volume mounted at both `/Volumes/Transend` and `/volumes/transend`.
- **Happened:** `tsc` failed with TS1149 — "File name ... differs from already included file name ... only in casing" — because the include pattern and the workspace symlink resolve the *same* file under two spellings.
- **Workaround:** `forceConsistentCasingInFileNames: false`, which treats the two spellings as one file.
- **Suggestion:** the error message should name the mount/workspace-symlink cause, not just the two spellings.

### 14. Bedrock's typed `effort` parameter is one level deeper than expected
- **Tried:** pass `effort: 'low'` on `messages.create` with `@anthropic-ai/bedrock-sdk`.
- **Happened:** the compiler returned "No overload matches this call" with no hint; `effort` lives in `output_config.effort`, which is only visible in the type definitions.
- **Workaround:** read the type definitions and move the field.
- **Suggestion:** mention `output_config.effort` in the Bedrock quickstart next to `model` and `max_tokens`.

### 15. A hackathon that rewards Bedrock, with no Bedrock inside 48 hours
- **Tried:** get an Anthropic-on-Bedrock model running for the demo's agent chooser, a centrepiece of the event's judging criteria.
- **Happened:** a new AWS account must be created, card-verified and region-model-enabled by hand; the hackathon's own AWS-credits form closes **two days before** the submission deadline. Support spins up a multi-day manual approval path. The result: the one required cloud dependency cannot be switched on inside the hackathon window.
- **Workaround:** ship the feature behind `CHOOSER=claude` with a deterministic rules chooser as the default, and treat Bedrock as a demo-day upgrade. The code path is written and type-checked; the credential is not.
- **Suggestion:** for a timed hackathon, hand out scoped sandbox keys at registration with the exact model allow-listed, or put the credit form deadline after the submission deadline.

### 16. `@modelcontextprotocol/ext-apps` host bridge is learnable only from `.d.ts` examples
- **Tried:** host the MCP App view inside our own simulator page, as a real Alexa+ would.
- **Happened:** the host side (`AppBridge`, `PostMessageTransport`, `sendToolInput` → `sendToolResult` ordering, `oncalltool`) has no README and no runnable example in the package; the constructor's `hostContext` option is only discoverable by reading `app-bridge.d.ts` and the minified `app.js`.
- **Workaround:** copy the doc comments out of the `.d.ts` into our page — it works exactly as advertised, once you find it.
- **Suggestion:** ship the `basic-host` example the comments reference as a template directory in the published package.
