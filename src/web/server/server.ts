import type { Server } from 'bun'
import { routes } from '../shared/routes.ts'
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
import { buildStaticRoutes } from './handlers/static.ts'
import { handleUpgrade } from './handlers/upgrade.ts'
import { handleWebSocketMessage } from './handlers/websocket.ts'

export interface ServerOptions {
  port?: number
  hostname?: string
}

export const MAX_PORT_FALLBACK_ATTEMPTS = 10

/**
 * Resolve the requested web-server port.
 *
 * `undefined` or `0` mean "OS-assigned ephemeral port" and never conflict;
 * any other value (or `PTY_WEB_PORT` env var) is treated as an explicit port.
 */
export function resolveWebPort(options?: ServerOptions): number {
  const explicit =
    options?.port ?? (process.env.PTY_WEB_PORT ? parseInt(process.env.PTY_WEB_PORT, 10) : 0)
  if (explicit === undefined || explicit === 0 || Number.isNaN(explicit)) {
    return 0
  }
  return explicit
}

/**
 * Candidate ports to try for an explicit request: the requested port, the
 * next `MAX_PORT_FALLBACK_ATTEMPTS` ports, and finally `0` (OS-assigned) as
 * a last resort. Port `0` resolves to just `[0]`.
 */
export function portCandidates(port: number): number[] {
  if (port === 0) {
    return [0]
  }
  const candidates = [port]
  for (let i = 1; i <= MAX_PORT_FALLBACK_ATTEMPTS && port + i <= 65535; i++) {
    candidates.push(port + i)
  }
  candidates.push(0)
  return candidates
}

/**
 * Robust EADDRINUSE detection for Bun.serve bind failures.
 * Bun throws an `Error` with an own `code: 'EADDRINUSE'` property and a
 * message like "Failed to start server. Is port 42789 in use?"; fall back to
 * the message for environments that shape the error differently.
 */
export function isEaddrinuse(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const code = (error as NodeJS.ErrnoException).code
  return (
    code === 'EADDRINUSE' ||
    /EADDRINUSE|address already in use|port \d+ in use/i.test(error.message)
  )
}

/**
 * Diagnostic probe, run before binding an explicit port: if an opencode-pty
 * server already listens there (identified by the /health response shape),
 * log it — the bind loop below will bind the next free port.
 *
 * Purely informational, so it must stay robust (never throw) and the bind
 * loop remains the authority (TOCTOU-safe). The foreign server is deliberately
 * NOT reused: the PTY manager is in-process per plugin instance, so adopting
 * a foreign server would show a foreign session list.
 */
async function probeExistingServer(port: number): Promise<void> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${routes.health.path}`, {
      signal: AbortSignal.timeout(500),
    })
    if (!response.ok) {
      return
    }
    const body = (await response.json()) as Record<string, unknown>
    if (body.status === 'healthy' && body.sessions !== undefined && body.websocket !== undefined) {
      console.warn(
        `[opencode-pty] an opencode-pty server already runs on port ${port} (likely another instance); binding the next free port.`
      )
    }
  } catch {
    // Refused connection / timeout / non-JSON body are the expected cases for
    // a free or non-opencode-pty port; keep the probe silent.
  }
}

export class PTYServer implements Disposable {
  public readonly server: Server<undefined>
  private readonly staticRoutes: Record<string, Response>
  private readonly stack = new DisposableStack()
  private readonly options?: ServerOptions

  private constructor(staticRoutes: Record<string, Response>, options?: ServerOptions) {
    this.staticRoutes = staticRoutes
    this.options = options
    this.server = this.startWebServer()
    this.stack.use(this.server)
    this.stack.use(new CallbackManager(this.server))
  }

  [Symbol.dispose]() {
    this.stack.dispose()
  }

  public static async createServer(options?: ServerOptions): Promise<PTYServer> {
    const staticRoutes = await buildStaticRoutes()

    // Diagnostic only: probe for an existing opencode-pty server on an
    // explicit configured port before binding (see probeExistingServer).
    const port = resolveWebPort(options)
    if (port !== 0) {
      await probeExistingServer(port)
    }

    return new PTYServer(staticRoutes, options)
  }

  private startWebServer(): Server<undefined> {
    const port = resolveWebPort(this.options)
    const hostname = this.options?.hostname ?? process.env.PTY_WEB_HOSTNAME ?? '::1'

    // No explicit port: OS-assigned ephemeral port, can never conflict.
    if (port === 0) {
      return this.bindServer(port, hostname)
    }

    let lastError: unknown
    for (const candidate of portCandidates(port)) {
      try {
        const server = this.bindServer(candidate, hostname)
        if (candidate !== port) {
          console.warn(
            `[opencode-pty] configured port ${port} is in use; bound to port ${server.url.port} instead.`
          )
        }
        return server
      } catch (error) {
        lastError = error
        if (!isEaddrinuse(error)) {
          throw error
        }
        console.warn(`[opencode-pty] port ${candidate} is in use; trying the next port...`)
      }
    }
    // Unreachable: portCandidates always ends with 0, which cannot conflict.
    throw lastError
  }

  private bindServer(port: number, hostname: string): Server<undefined> {
    return Bun.serve({
      port,
      hostname,

      routes: {
        ...this.staticRoutes,
        [routes.websocket.path]: (req: Request) => handleUpgrade(this.server, req),
        [routes.health.path]: () => handleHealth(this.server),
        [routes.sessions.path]: {
          GET: getSessions,
          POST: createSession,
          DELETE: clearSessions,
        },
        [routes.session.path]: {
          GET: getSession,
          DELETE: killSession,
        },
        [routes.session.cleanup.path]: {
          DELETE: cleanupSession,
        },
        [routes.session.input.path]: {
          POST: sendInput,
        },
        [routes.session.buffer.raw.path]: {
          GET: getRawBuffer,
        },
        [routes.session.buffer.plain.path]: {
          GET: getPlainBuffer,
        },
      },

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

      fetch: () => new Response(null, { status: 302, headers: { Location: '/index.html' } }),
    })
  }

  public getWsUrl(): string {
    return `${this.server.url.origin.replace(/^http/, 'ws')}${routes.websocket.path}`
  }
}
