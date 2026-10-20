import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, watch, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const EXT = '.dwell.json'
const NAME = /^[a-z0-9][a-z0-9._-]*$/

/**
 * Serves the diagrams folder to the app so a file edited by the MCP server (or by hand) appears live,
 * and what you change in the app is written back. Dev and preview only, nothing here ships in the build.
 */
export function diagramFiles(): Plugin {
  const dir = resolve(process.env.DWELL_DIR ?? join(process.cwd(), 'diagrams'))
  const clients = new Set<ServerResponse>()
  let watching = false

  const startWatch = () => {
    if (watching) return
    watching = true
    mkdirSync(dir, { recursive: true })
    let timer: NodeJS.Timeout | undefined
    watch(dir, (_event, file) => {
      if (!file || !file.endsWith(EXT)) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const name = file.slice(0, -EXT.length)
        for (const c of clients) c.write(`data: ${JSON.stringify({ name })}\n\n`)
      }, 80)
    })
  }

  const body = (req: IncomingMessage) =>
    new Promise<string>((ok, bad) => {
      let s = ''
      req.on('data', (d) => {
        s += d
        if (s.length > 8_000_000) bad(new Error('Too large'))
      })
      req.on('end', () => ok(s))
      req.on('error', bad)
    })

  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://x')
    const path = url.pathname.replace(/^\/+|\/+$/g, '')
    if (req.method === 'GET' && path === 'events') {
      startWatch()
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      res.write(': connected\n\n')
      clients.add(res)
      req.on('close', () => clients.delete(res))
      return
    }
    if (req.method === 'GET' && path === '') {
      const rows = existsSync(dir)
        ? readdirSync(dir)
            .filter((f) => f.endsWith(EXT))
            .map((f) => ({ name: f.slice(0, -EXT.length), updated: statSync(join(dir, f)).mtimeMs }))
            .sort((a, b) => b.updated - a.updated)
        : []
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(rows))
      return
    }
    if (!NAME.test(path)) return next()
    const file = join(dir, path + EXT)
    if (req.method === 'GET') {
      if (!existsSync(file)) {
        res.statusCode = 404
        return res.end('Not found')
      }
      res.setHeader('Content-Type', 'application/json')
      return res.end(readFileSync(file))
    }
    if (req.method === 'PUT') {
      try {
        const text = await body(req)
        JSON.parse(text)
        mkdirSync(dir, { recursive: true })
        const tmp = file + '.tmp'
        writeFileSync(tmp, text)
        renameSync(tmp, file)
        res.statusCode = 204
        return res.end()
      } catch {
        res.statusCode = 400
        return res.end('Bad diagram')
      }
    }
    next()
  }

  return {
    name: 'dwell-diagrams',
    configureServer(s) {
      s.middlewares.use('/api/diagrams', (req, res, next) => void handle(req, res, next))
    },
    configurePreviewServer(s) {
      s.middlewares.use('/api/diagrams', (req, res, next) => void handle(req, res, next))
    },
  }
}
