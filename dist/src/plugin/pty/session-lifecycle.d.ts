import type { PTYSession, PTYSessionInfo, SpawnOptions } from './types.ts';
export declare class SessionLifecycleManager {
    private sessions;
    private sessionTimeouts;
    private normalizeTimeoutSeconds;
    private clearSessionTimeout;
    private scheduleSessionTimeout;
    private createSessionObject;
    private spawnProcess;
    private setupEventHandlers;
    spawn(opts: SpawnOptions, onData: (session: PTYSession, data: string) => void, onExit: (session: PTYSession, exitCode: number | null) => void): PTYSessionInfo;
    kill(id: string, cleanup?: boolean): boolean;
    private clearAllSessionsInternal;
    clearAllSessions(): void;
    cleanupBySession(parentSessionId: string): void;
    getSession(id: string): PTYSession | null;
    listSessions(): PTYSession[];
    toInfo(session: PTYSession): PTYSessionInfo;
}
//# sourceMappingURL=session-lifecycle.d.ts.map