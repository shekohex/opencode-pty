// Structured route definitions with paths, methods, and type information
// Used by both server and client for type-safe API interactions
export const routes = {
    websocket: {
        path: '/ws',
        methods: ['GET'],
    },
    health: {
        path: '/health',
        methods: ['GET'],
    },
    sessions: {
        path: '/api/sessions',
        methods: ['GET', 'POST', 'DELETE'],
    },
    session: {
        path: '/api/sessions/:id',
        methods: ['GET', 'DELETE'],
        input: {
            path: '/api/sessions/:id/input',
            methods: ['POST'],
        },
        cleanup: {
            path: '/api/sessions/:id/cleanup',
            methods: ['DELETE'],
        },
        buffer: {
            raw: {
                path: '/api/sessions/:id/buffer/raw',
                methods: ['GET'],
            },
            plain: {
                path: '/api/sessions/:id/buffer/plain',
                methods: ['GET'],
            },
        },
    },
};
//# sourceMappingURL=routes.js.map