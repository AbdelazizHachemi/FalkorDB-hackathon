import { createReadStream } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { health, pharmacyAgent, wardAgent } from './agents.ts'
import { RequestError } from './graph.ts'
import { handleMcp } from './mcp.ts'

const page = new URL('../public/index.html', import.meta.url)

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function field(body: unknown, key: string): string {
  if (!body || typeof body !== 'object' || !(key in body)) return ''
  const value = (body as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

function fail(res: ServerResponse, err: unknown): void {
  if (err instanceof RequestError) {
    send(res, err.status, { error: err.message })
    return
  }
  if (err instanceof SyntaxError) {
    send(res, 400, { error: 'Body must be JSON' })
    return
  }
  send(res, 503, { error: 'FalkorDB did not answer' })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  try {
    if (url.pathname === '/mcp') {
      await handleMcp(req, res)
      return
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      createReadStream(page).pipe(res)
      return
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      await health()
      send(res, 200, { ok: true })
      return
    }
    const ward = url.pathname.match(/^\/patients\/([^/]+)\/ward$/)
    if (req.method === 'POST' && ward) {
      const body = await readJson(req)
      send(res, 200, await wardAgent(decodeURIComponent(ward[1] ?? ''), field(body, 'kind')))
      return
    }
    const pharmacy = url.pathname.match(/^\/patients\/([^/]+)\/pharmacy$/)
    if (req.method === 'POST' && pharmacy) {
      const body = await readJson(req)
      send(res, 200, await pharmacyAgent(decodeURIComponent(pharmacy[1] ?? ''), field(body, 'session'), field(body, 'drug')))
      return
    }
    send(res, 404, { error: 'Not found' })
  } catch (err) {
    if (!res.headersSent) fail(res, err)
  }
})

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '127.0.0.1'
server.listen(port, host, () => {
  console.log(`held http://${host}:${port}`)
})
