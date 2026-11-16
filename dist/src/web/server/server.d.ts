import type { Server } from 'bun';
export interface ServerOptions {
    port?: number;
    hostname?: string;
    /** The project this server belongs to — published so the TUI can find it. */
    directory?: string;
    worktree?: string;
}
export declare class PTYServer implements Disposable {
    readonly server: Server<undefined>;
    private readonly staticRoutes;
    private readonly stack;
    private readonly options?;
    /** The published origin record, removed when the server is disposed. */
    private readonly originFile;
    private constructor();
    [Symbol.dispose](): void;
    static createServer(options?: ServerOptions): Promise<PTYServer>;
    private startWebServer;
    getWsUrl(): string;
}
//# sourceMappingURL=server.d.ts.map