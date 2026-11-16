export declare const routes: {
    readonly websocket: {
        readonly path: "/ws";
        readonly methods: readonly ["GET"];
    };
    readonly health: {
        readonly path: "/health";
        readonly methods: readonly ["GET"];
    };
    readonly sessions: {
        readonly path: "/api/sessions";
        readonly methods: readonly ["GET", "POST", "DELETE"];
    };
    readonly session: {
        readonly path: "/api/sessions/:id";
        readonly methods: readonly ["GET", "DELETE"];
        readonly input: {
            readonly path: "/api/sessions/:id/input";
            readonly methods: readonly ["POST"];
        };
        readonly cleanup: {
            readonly path: "/api/sessions/:id/cleanup";
            readonly methods: readonly ["DELETE"];
        };
        readonly buffer: {
            readonly raw: {
                readonly path: "/api/sessions/:id/buffer/raw";
                readonly methods: readonly ["GET"];
            };
            readonly plain: {
                readonly path: "/api/sessions/:id/buffer/plain";
                readonly methods: readonly ["GET"];
            };
        };
    };
};
//# sourceMappingURL=routes.d.ts.map