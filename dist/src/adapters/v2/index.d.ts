import type { HostAdapter, PermissionAuthorizer, SessionNotifier } from '../types.ts';
export interface V2AdapterOptions {
    notifier?: SessionNotifier;
    permissions?: PermissionAuthorizer;
}
export declare class V2HostAdapter implements HostAdapter {
    readonly id = "opencode-v2";
    readonly notifier?: SessionNotifier;
    readonly permissions?: PermissionAuthorizer;
    constructor(options?: V2AdapterOptions);
    onSessionDeleted(sessionId: string): void;
}
export declare function createV2Adapter(options?: V2AdapterOptions): HostAdapter;
//# sourceMappingURL=index.d.ts.map