import moment from 'moment'
import { manager } from '../../../plugin/pty/manager.ts'
import { JsonResponse } from './responses.ts'
import type { HealthResponse } from '../../shared/types.ts'

export function handleHealth(server: Bun.Server<undefined>) {
  const sessions = manager.list()
  const activeSessions = sessions.filter((s) => s.status === 'running').length
  const totalSessions = sessions.length

  // Calculate response time (rough approximation)
  const startTime = Date.now()

  const healthResponse: HealthResponse = {
    status: 'healthy',
    timestamp: moment().toISOString(true),
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
  }

  // Add response time
  const responseTime = Date.now() - startTime
  healthResponse.responseTime = responseTime

  return new JsonResponse(healthResponse)
}
