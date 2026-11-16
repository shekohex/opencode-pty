import type { SessionNotifier } from '../../adapters/types.ts';
import type { OpencodeClient } from '@opencode-ai/sdk';
import type { PTYSessionInfo, ReadResult, SearchResult, SpawnOptions } from './types.ts';
type SessionUpdateCallback = (session: PTYSessionInfo) => void;
export declare const sessionUpdateCallbacks: SessionUpdateCallback[];
export declare function registerSessionUpdateCallback(callback: SessionUpdateCallback): void;
export declare function removeSessionUpdateCallback(callback: SessionUpdateCallback): void;
type RawOutputCallback = (session: PTYSessionInfo, rawData: string) => void;
export declare const rawOutputCallbacks: RawOutputCallback[];
export declare function registerRawOutputCallback(callback: RawOutputCallback): void;
export declare function removeRawOutputCallback(callback: RawOutputCallback): void;
declare class PTYManager {
    private lifecycleManager;
    private outputManager;
    private notificationManager;
    private notifier;
    setNotifier(notifier: SessionNotifier | null): void;
    getNotifier(): SessionNotifier | null;
    init(client: OpencodeClient): void;
    clearAllSessions(): void;
    spawn(opts: SpawnOptions): PTYSessionInfo;
    write(id: string, data: string): boolean;
    read(id: string, offset?: number, limit?: number): ReadResult | null;
    search(id: string, pattern: RegExp, offset?: number, limit?: number): SearchResult | null;
    list(): PTYSessionInfo[];
    get(id: string): PTYSessionInfo | null;
    getRawBuffer(id: string): {
        raw: string;
        byteLength: number;
    } | null;
    kill(id: string, cleanup?: boolean): boolean;
    cleanupBySession(parentSessionId: string): void;
}
export declare const manager: PTYManager;
export declare function initManager(opcClient: OpencodeClient): void;
export declare function setManagerNotifier(notifier: SessionNotifier | null): void;
export {};
//# sourceMappingURL=manager.d.ts.map