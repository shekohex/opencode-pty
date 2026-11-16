// Type-safe URL builder using constants and manual parameter validation
// Provides compile-time type checking for route parameters
// Simple URL builder that validates parameters are present
function buildUrl(template, params) {
    let result = template;
    const requiredParams = template.match(/:(\w+)/g)?.map((p) => p.slice(1)) || [];
    for (const param of requiredParams) {
        if (!(param in params)) {
            throw new Error(`Missing required parameter '${param}' for route '${template}'`);
        }
        result = result.replace(`:${param}`, String(params[param]));
    }
    return result;
}
// Import route templates from shared constants
import { routes } from './routes';
export const RouteBuilder = {
    // WebSocket routes
    websocket() {
        return routes.websocket.path;
    },
    // Health check routes
    health() {
        return routes.health.path;
    },
    // Session collection routes
    sessions: {
        list: () => routes.sessions.path,
        create: () => routes.sessions.path,
        clear: () => routes.sessions.path,
    },
    // Individual session routes with type-safe parameter building
    session: {
        get: (params) => buildUrl(routes.session.path, params),
        kill: (params) => buildUrl(routes.session.path, params),
        cleanup: (params) => buildUrl(routes.session.cleanup.path, params),
        input: (params) => buildUrl(routes.session.input.path, params),
        rawBuffer: (params) => buildUrl(routes.session.buffer.raw.path, params),
        plainBuffer: (params) => buildUrl(routes.session.buffer.plain.path, params),
    },
};
//# sourceMappingURL=route-builder.js.map