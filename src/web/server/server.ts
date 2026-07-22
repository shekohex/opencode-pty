import type { Server } from 'bun'
import { routes } from '../shared/routes.ts'
import { isLoopbackOriginRequest, WebAuth } from './auth.ts'
import { CallbackManager } from './callback-manager.ts'
import { handleHealth } from './handlers/health.ts'
import {
  cleanupSession,
  clearSessions,
  createSession,
  getPlainBuffer,
  getRawBuffer,
  getSession,
  getSessions,
  killSession,
  sendInput,
} from './handlers/sessions.ts'
import { buildStaticRoutes, type StaticAssets } from './handlers/static.ts'
import { ErrorResponse } from './handlers/responses.ts'
import { handleWebSocketMessage } from './handlers/websocket.ts'

export interface PTYServerOptions {
  /**
   * Authentication configuration. When omitted, the server reads
   * `PTY_WEB_USERNAME` / `PTY_WEB_PASSWORD` from the environment.
   */
  auth?: WebAuth
}

export class PTYServer implements Disposable {
  public readonly server: Server<undefined>
  private readonly staticAssets: StaticAssets
  private readonly stack = new DisposableStack()
  private readonly auth: WebAuth

  private constructor(staticAssets: StaticAssets, auth: WebAuth) {
    this.staticAssets = staticAssets
    this.auth = auth
    this.server = this.startWebServer()
    this.stack.use(this.server)
    this.stack.use(new CallbackManager(this.server))
  }

  [Symbol.dispose]() {
    this.stack.dispose()
  }

  public static async createServer(options: PTYServerOptions = {}): Promise<PTYServer> {
    const staticAssets = await buildStaticRoutes()
    const auth = options.auth ?? buildWebAuthFromEnv()
    return new PTYServer(staticAssets, auth)
  }

  private startWebServer(): Server<undefined> {
    // Single `fetch` handler — matches opencode-mem's architecture. Using
    // Bun's typed `routes` map routes static assets around the auth gate
    // (their 200 response carries no `WWW-Authenticate`), which Safari's
    // HTTP auth cache treats as a different protection space than the SPA
    // shell, leading to re-prompts on the WebSocket upgrade and on refresh.
    // Funneling every request through one handler guarantees a consistent
    // auth challenge for the (host, port, realm) tuple the browser caches.
    return Bun.serve({
      port: process.env.PTY_WEB_PORT ? parseInt(process.env.PTY_WEB_PORT, 10) : 0,
      hostname: process.env.PTY_WEB_HOSTNAME ?? '::1',
      fetch: (req) => this.handleRequest(req),
      websocket: {
        data: undefined as undefined,
        perMessageDeflate: true,
        open: (ws) => ws.subscribe('sessions:update'),
        message: handleWebSocketMessage,
        close: (ws) => {
          ws.subscriptions.forEach((topic) => {
            ws.unsubscribe(topic)
          })
        },
      },
    })
  }

  private async handleRequest(req: Request): Promise<Response | undefined> {
    const url = new URL(req.url)
    const path = url.pathname
    const method = req.method

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204 })
    }

    // Auth gate runs for every request (including static assets and the SPA
    // shell). /health is exempt so the frontend can probe auth state.
    const check = this.auth.check(req, path)
    if (!check.ok && check.response) {
      return check.response
    }
    // Wrap dispatch so the response is augmented with Set-Cookie whenever the
    // auth check minted (or refreshed) a session. Safari won't re-send HTTP
    // Basic Auth on `fetch()` or WebSocket upgrade requests, but it WILL
    // send a session cookie — this is what lets the user keep using the
    // UI after a single browser prompt.
    return await this.withSessionCookie(req, path, method, check.sessionToken)
  }

  private async withSessionCookie(
    req: Request,
    path: string,
    method: string,
    sessionToken: string | undefined
  ): Promise<Response | undefined> {
    const response = await this.dispatch(req, path, method)
    if (response === undefined || !sessionToken) return response
    // Clone before mutating headers — Response bodies are single-use.
    const augmented = new Response(response.body, response)
    augmented.headers.append('Set-Cookie', this.auth.cookieHeader(sessionToken))
    return augmented
  }

  private async dispatch(
    req: Request,
    path: string,
    method: string
  ): Promise<Response | undefined> {
    // Health probe — unauthenticated by design.
    if (path === routes.health.path && method === 'GET') {
      return handleHealth(this.server, this.auth)
    }

    // SPA shell. Served fresh on every request (Bun reads Response bodies
    // exactly once) so cached credentials, concurrent tabs, and hot reloads
    // all see the same content.
    if (path === '/' || path === routes.session.path.replace(':id', 'index.html')) {
      return this.staticAssets.indexHtml.clone()
    }

    // Static assets — auth-gated so Safari's protection space cache stays
    // warm for the whole (host, port, realm) tuple.
    const asset = this.staticAssets.routes[path]
    if (asset) {
      return asset.clone()
    }

    // WebSocket upgrade.
    if (path === routes.websocket.path) {
      if (req.headers.get('upgrade') !== 'websocket') {
        return new Response('WebSocket endpoint - use WebSocket upgrade', { status: 426 })
      }
      const success = this.server.upgrade(req)
      if (success) return undefined
      return new Response('WebSocket upgrade failed', { status: 400 })
    }

    // Destructive operations get an extra origin-based guard when auth is
    // disabled, so an unauthenticated LAN visitor can't take down sessions.
    const checkKillGuard = (): Response | null => {
      if (this.auth.isEnabled() || isLoopbackOriginRequest(req)) return null
      return new ErrorResponse(
        'Killing sessions from a non-loopback origin requires HTTP Basic Auth to be configured. ' +
          'Set the PTY_WEB_PASSWORD environment variable (and reload the web UI) to enable kill.',
        403
      )
    }

    if (path === routes.sessions.path) {
      if (method === 'GET') return getSessions()
      if (method === 'POST') return createSession(req)
      if (method === 'DELETE') {
        return checkKillGuard() ?? clearSessions()
      }
    }

    // Match `/api/sessions/:id` and the four sub-routes that hang off it.
    const sessionIdPattern = /^\/api\/sessions\/([^/]+)$/
    const cleanupPattern = /^\/api\/sessions\/([^/]+)\/cleanup$/
    const inputPattern = /^\/api\/sessions\/([^/]+)\/input$/
    const rawBufferPattern = /^\/api\/sessions\/([^/]+)\/buffer\/raw$/
    const plainBufferPattern = /^\/api\/sessions\/([^/]+)\/buffer\/plain$/

    const sessionMatch = path.match(sessionIdPattern)
    if (sessionMatch) {
      const bunReq = withParams(req, routes.session.path, { id: sessionMatch[1] ?? '' })
      if (method === 'GET') return getSession(bunReq)
      if (method === 'DELETE') {
        return checkKillGuard() ?? killSession(bunReq)
      }
    }

    const cleanupMatch = path.match(cleanupPattern)
    if (cleanupMatch) {
      const bunReq = withParams(req, routes.session.cleanup.path, {
        id: cleanupMatch[1] ?? '',
      })
      if (method === 'DELETE') {
        return checkKillGuard() ?? cleanupSession(bunReq)
      }
    }

    const inputMatch = path.match(inputPattern)
    if (inputMatch) {
      const bunReq = withParams(req, routes.session.input.path, {
        id: inputMatch[1] ?? '',
      })
      if (method === 'POST') return sendInput(bunReq)
    }

    const rawMatch = path.match(rawBufferPattern)
    if (rawMatch) {
      const bunReq = withParams(req, routes.session.buffer.raw.path, {
        id: rawMatch[1] ?? '',
      })
      if (method === 'GET') return getRawBuffer(bunReq)
    }

    const plainMatch = path.match(plainBufferPattern)
    if (plainMatch) {
      const bunReq = withParams(req, routes.session.buffer.plain.path, {
        id: plainMatch[1] ?? '',
      })
      if (method === 'GET') return getPlainBuffer(bunReq)
    }

    return new Response('Not Found', { status: 404 })
  }

  public getWsUrl(): string {
    return `${this.server.url.origin.replace(/^http/, 'ws')}${routes.websocket.path}`
  }
}

function buildWebAuthFromEnv(): WebAuth {
  return new WebAuth({
    username: process.env.PTY_WEB_USERNAME,
    password: process.env.PTY_WEB_PASSWORD,
  })
}

/**
 * Construct a `BunRequest` from a plain `Request` by attaching the path
 * parameters the route handler expects. Bun's typed `routes` feature used
 * to do this automatically; the single-fetch dispatcher does it by hand.
 */
function withParams<P extends string>(
  req: Request,
  _path: P,
  params: Record<string, string>
): Bun.BunRequest<P> {
  return Object.assign(req, { params, cookies: new Map() }) as unknown as Bun.BunRequest<P>
}
