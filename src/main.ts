import { timingSafeEqual } from 'node:crypto'
import { createMcpExpressApp } from '@modelcontextprotocol/express'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import { createMcpServer } from './mcp.ts'

const port = Number(process.env.PORT ?? 4001)
const host = process.env.HOST ?? '127.0.0.1'
const publicUrl = process.env.PUBLIC_URL // e.g. the tunnel or hosted URL Alexa+ calls
const token = process.env.MCP_TOKEN

const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host)
if (!loopback && !token) throw new Error('MCP_TOKEN is required when HOST is not loopback')

const app = createMcpExpressApp({
  host,
  allowedHosts: ['localhost', '127.0.0.1', '[::1]', ...(publicUrl ? [new URL(publicUrl).hostname] : [])],
})

app.get('/healthz', (_req, res) => res.json({ ok: true }))

app.post('/mcp', async (req, res) => {
  const { method, params } = req.body ?? {}
  // One line per call. The `initialize` line records what a client really declares.
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      method,
      ...(method === 'initialize' && {
        protocolVersion: params?.protocolVersion,
        capabilities: params?.capabilities,
        clientInfo: params?.clientInfo,
      }),
      mcpProtocolVersion: req.get('mcp-protocol-version'),
      userAgent: req.get('user-agent'),
      hasAuth: Boolean(req.get('authorization')),
    }),
  )

  if (token) {
    const given = Buffer.from(req.get('authorization') ?? '')
    const wanted = Buffer.from(`Bearer ${token}`)
    // No WWW-Authenticate header: Alexa+ rejects 401s that carry one.
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
  }

  const server = createMcpServer()
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  res.on('close', () => {
    void transport.close()
    void server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

// Stateless: no server-initiated stream and no session to delete.
app.all('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').end())

app.listen(port, host, () => console.error(`between listening on http://${host}:${port}`))
