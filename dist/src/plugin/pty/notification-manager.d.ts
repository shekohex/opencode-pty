import type { SessionNotifier } from '../../adapters/types.ts';
import type { PTYSession } from './types.ts';
import type { OpencodeClient } from '@opencode-ai/sdk';
export declare class NotificationManager implements SessionNotifier {
    private client;
    init(client: OpencodeClient): void;
    sendExitNotification(session: PTYSession, exitCode: number): Promise<void>;
}
/**
 * Builds the `<pty_exited>` notification text for a finished PTY session.
 *
 * Shared between the V1 notifier (`NotificationManager`, delivered via the
 * SDK client's `promptAsync`) and the V2 notifier (delivered via the plugin
 * context's `ctx.session.prompt`).
 */
export declare function buildExitNotification(session: PTYSession, exitCode: number): string;
//# sourceMappingURL=notification-manager.d.ts.map