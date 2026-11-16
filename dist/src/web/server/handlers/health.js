import { manager } from "../../../plugin/pty/manager.js";
import { JsonResponse } from "./responses.js";
export function handleHealth(server) {
    const sessions = manager.list();
    const activeSessions = sessions.filter((s) => s.status === 'running').length;
    const totalSessions = sessions.length;
    // Calculate response time (rough approximation)
    const startTime = Date.now();
    const healthResponse = {
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
    };
    // Add response time
    const responseTime = Date.now() - startTime;
    healthResponse.responseTime = responseTime;
    return new JsonResponse(healthResponse);
}
//# sourceMappingURL=health.js.map