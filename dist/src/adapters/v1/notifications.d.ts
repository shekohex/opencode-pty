import type { OpencodeClient } from '@opencode-ai/sdk';
import type { PTYSession } from '../../plugin/pty/types.ts';
import type { SessionNotifier } from '../types.ts';
export declare class V1NotificationAdapter implements SessionNotifier {
    private manager;
    constructor(client?: OpencodeClient);
    init(client: OpencodeClient): void;
    sendExitNotification(session: PTYSession, exitCode: number): Promise<void>;
}
//# sourceMappingURL=notifications.d.ts.map