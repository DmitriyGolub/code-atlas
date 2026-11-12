import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'

const VIEWER = join(import.meta.dirname, '..', 'viewer', 'index.html')
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8' }

export function serve({ root, specDirectory, editor = 'vscode', port = 0, open = true }) {
  const server = createServer((request, response) => {
    const name = new URL(request.url, 'http://localhost').pathname.replace(/^\/+/, '') || 'index.html'
    const send = (status, body, type) => {
      response.writeHead(status, { 'content-type': type ?? 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      response.end(body)
    }
    if (name === 'config.json') return send(200, JSON.stringify({ root, editor }), TYPES['.json'])
    if (name === 'index.html') return send(200, readFileSync(existsSync(join(specDirectory, 'index.html')) ? join(specDirectory, 'index.html') : VIEWER), TYPES['.html'])
    if (!/^(modules\/)?[\w.-]+\.json$/.test(name) || !existsSync(join(specDirectory, name))) return send(404, 'not found')
    return send(200, readFileSync(join(specDirectory, name)), TYPES['.json'])
  })
  server.listen(Number(port), '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}/`
    console.log(`code atlas: ${url}  (Ctrl+C to stop)`)
    if (!open) return
    try { execFileSync(process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open', [url]) } catch {}
  })
  return server
}
