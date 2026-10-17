/**
 * The hosted front door: one public URL, one path per kitchen.
 *
 *   ROUTER_TARGETS="ahmad=http://127.0.0.1:4001,park=http://127.0.0.1:4002" \
 *   ROUTER_PORT=4100 npx tsx scripts/router.ts
 *
 *   /           302 to the first kitchen's page
 *   /ahmad/…    Ahmad's household, prefix stripped before it gets there
 *   /park/…     Park's household
 *   /healthz    the router itself, with the live map
 *
 * The pages under /<home>/sim/ are built with relative asset paths and ask
 * their API relative to their own base (see web/sim/sim.ts), so request bodies
 * pass through untouched; the one fix-up is a Location header that would
 * otherwise point back out of its prefix.
 */
import { createServer, request as httpRequest } from 'node:http'

const port = Number(process.env.ROUTER_PORT ?? 4100)
const defaultTargets = 'ahmad=http://127.0.0.1:4001,park=http://127.0.0.1:4002'
const targets = new Map(
  (process.env.ROUTER_TARGETS ?? defaultTargets)
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => entry.split('=', 2) as [string, string]),
)
const firstPrefix = [...targets.keys()][0]

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, targets: Object.fromEntries(targets) }))
    return
  }

  if (url.pathname === '/') {
    res.writeHead(302, { location: `/${firstPrefix}/sim/` })
    res.end()
    return
  }

  const [prefix, ...rest] = url.pathname.slice(1).split('/')
  const target = prefix ? targets.get(prefix) : undefined
  if (!target) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end(`Nothing at ${url.pathname}. Kitchens: ${[...targets.keys()].map(p => `/${p}/sim/`).join(', ')}\n`)
    return
  }

  const upstream = httpRequest(
    new URL(`/${rest.join('/')}${url.search}`, target),
    { method: req.method, headers: { ...req.headers, host: new URL(target).host } },
    up => {
      const headers = { ...up.headers }
      if (typeof headers.location === 'string' && headers.location.startsWith('/')) {
        headers.location = `/${prefix}${headers.location}`
      }
      res.writeHead(up.statusCode ?? 502, headers)
      up.pipe(res)
    },
  )
  upstream.on('error', error => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
    res.end(`The ${prefix} household is not answering: ${error.message}\n`)
  })
  req.pipe(upstream)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`[router] http://127.0.0.1:${port} — ${[...targets].map(([p, u]) => `/${p} = ${u}`).join(', ')}`)
})
