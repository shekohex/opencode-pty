import { buildExitNotification } from "../plugin/pty/notification-manager.js";
/**
 * Delivers `<pty_exited>` notifications through opencode v2's plugin context.
 *
 * The notification is admitted as a user prompt with a deterministic message
 * id (`pty_<id>_exited`), so `admission.reconcile` makes repeated deliveries
 * idempotent (e.g. when a kill races the process exit). Default delivery
 * (`steer`) plus `execution.wake` starts a new agent turn, and opencode
 * resolves the run with the session's *current* model — so the user's model
 * selection is preserved without the explicit model lookup the V1 notifier
 * needs (`session/runner/model.ts` has no `agent.model` fallback like the
 * V1 `setAgentModel` chain did).
 *
 * Delivery failures are logged instead of swallowed, so a dead wake-up is
 * never indistinguishable from "the model decided not to respond".
 */
export class V2SessionNotifier {
    session;
    constructor(session) {
        this.session = session;
    }
    async sendExitNotification(session, exitCode) {
        if (!session.parentSessionId) {
            console.warn(`[opencode-pty] cannot notify: session ${session.id} has no parent session`);
            return;
        }
        const text = buildExitNotification(session, exitCode);
        try {
            await this.session.prompt({
                sessionID: session.parentSessionId,
                id: `pty_${session.id}_exited`,
                text,
            });
        }
        catch (error) {
            console.error(`[opencode-pty] failed to deliver exit notification for ${session.id}:`, error instanceof Error ? error.message : String(error));
        }
    }
}
//# sourceMappingURL=notifier.js.map