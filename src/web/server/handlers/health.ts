import { manager } from '../../../plugin/pty/manager.ts'
import type { WebAuth } from '../auth.ts'
import type { WebSocketConnectionState } from './websocket.ts'
import { JsonResponse } from './responses.ts'
import type { HealthResponse } from '../../shared/types.ts'

export function handleHealth(
  server: Bun.Server<WebSocketConnectionState>,
  auth: WebAuth | null = null
) {
  const sessions = manager.list()
  const activeSessions = sessions.filter((s) => s.status === 'running').length
  const totalSessions = sessions.length

  // Calculate response time (rough approximation)
  const startTime = Date.now()

  const healthResponse: HealthResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    sessions: {
      total: totalSessions,
      active: activeSessions,
    },
    websocket: {
      connections: server.pendingWebSockets,
    },
    memory: process.memoryUsage
      ? {
          rss: process.memoryUsage().rss,
          heapUsed: process.memoryUsage().heapUsed,
          heapTotal: process.memoryUsage().heapTotal,
        }
      : undefined,
    authEnabled: auth?.isEnabled() ?? false,
    authUsername: auth?.getConfig().username ?? '',
  }

  // Add response time
  const responseTime = Date.now() - startTime
  healthResponse.responseTime = responseTime

  return new JsonResponse(healthResponse)
}
