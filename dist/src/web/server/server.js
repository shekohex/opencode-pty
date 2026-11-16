import { routes } from "../shared/routes.js";
import { removeOrigin, writeOrigin } from "../../shared/runtime.js";
import { CallbackManager } from "./callback-manager.js";
import { handleHealth } from "./handlers/health.js";
import { cleanupSession, clearSessions, createSession, getPlainBuffer, getRawBuffer, getSession, getSessions, killSession, sendInput, } from "./handlers/sessions.js";
import { buildStaticRoutes } from "./handlers/static.js";
import { handleUpgrade } from "./handlers/upgrade.js";
import { handleWebSocketMessage } from "./handlers/websocket.js";
export class PTYServer {
    server;
    staticRoutes;
    stack = new DisposableStack();
    options;
    /** The published origin record, removed when the server is disposed. */
    originFile;
    constructor(staticRoutes, options) {
        this.staticRoutes = staticRoutes;
        this.options = options;
        this.server = this.startWebServer();
        // Publish the bound address, not the requested one: a wildcard bind or a
        // normalised hostname would otherwise be recorded as something that cannot
        // be connected to. Bun's types mark both as optional, so they are narrowed
        // rather than asserted — a missing one just means nothing is published.
        const { hostname, port } = this.server;
        this.originFile =
            typeof hostname === 'string' && typeof port === 'number'
                ? writeOrigin({
                    directory: options?.directory,
                    worktree: options?.worktree,
                    hostname,
                    port,
                })
                : null;
        this.stack.use(this.server);
        this.stack.use(new CallbackManager(this.server));
        this.stack.use({ [Symbol.dispose]: () => removeOrigin(this.originFile) });
    }
    [Symbol.dispose]() {
        this.stack.dispose();
    }
    static async createServer(options) {
        const staticRoutes = await buildStaticRoutes();
        return new PTYServer(staticRoutes, options);
    }
    startWebServer() {
        const port = this.options?.port ?? (process.env.PTY_WEB_PORT ? parseInt(process.env.PTY_WEB_PORT, 10) : 0);
        const hostname = this.options?.hostname ?? process.env.PTY_WEB_HOSTNAME ?? '::1';
        return Bun.serve({
            port,
            hostname,
            routes: {
                ...this.staticRoutes,
                [routes.websocket.path]: (req) => handleUpgrade(this.server, req),
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
                data: undefined,
                perMessageDeflate: true,
                // Bun's `subscribe` returns a boolean; the websocket `open` handler is
                // typed `void | Promise<void>`, so the call is wrapped to keep the
                // build green instead of relying on emit-on-error.
                open: (ws) => {
                    ws.subscribe('sessions:update');
                },
                message: handleWebSocketMessage,
                close: (ws) => {
                    ws.subscriptions.forEach((topic) => {
                        ws.unsubscribe(topic);
                    });
                },
            },
            fetch: () => new Response(null, { status: 302, headers: { Location: '/index.html' } }),
        });
    }
    getWsUrl() {
        return `${this.server.url.origin.replace(/^http/, 'ws')}${routes.websocket.path}`;
    }
}
//# sourceMappingURL=server.js.map