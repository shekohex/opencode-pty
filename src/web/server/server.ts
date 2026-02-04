import type { Server } from 'bun'
import { handleHealth } from './handlers/health.ts'
import {
  getSessions,
  createSession,
  clearSessions,
  getSession,
  sendInput,
  killSession,
  getRawBuffer,
  getPlainBuffer,
  cleanupSession,
} from './handlers/sessions.ts'

import { buildStaticRoutes } from './handlers/static.ts'
import { handleUpgrade } from './handlers/upgrade.ts'
import { handleWebSocketMessage } from './handlers/websocket.ts'
import { CallbackManager } from './callback-manager.ts'

import { routes } from '../shared/routes.ts'

export class PTYServer implements Disposable {
  public readonly server: Server<undefined>
  private readonly staticRoutes: Record<string, Response>
  private readonly stack = new DisposableStack()

  private constructor(staticRoutes: Record<string, Response>) {
    this.staticRoutes = staticRoutes
    this.server = this.startWebServer()
    this.stack.use(this.server)
    this.stack.use(new CallbackManager(this.server))
  }

  [Symbol.dispose]() {
    this.stack.dispose()
  }

  public static async createServer(): Promise<PTYServer> {
    const staticRoutes = await buildStaticRoutes()

    return new PTYServer(staticRoutes)
  }

  private startWebServer(): Server<undefined> {
    return Bun.serve({
      port: 0,

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
