import type { Plugin } from '@opencode/plugin'
import type { SessionNotifier } from '../adapters/types.ts'
import { buildExitNotification } from '../plugin/pty/notification-manager.ts'
import type { PTYSession } from '../plugin/pty/types.ts'

/**
 * The subset of opencode v2's plugin `session` domain we use to wake a session.
 *
 * The full domain (`Plugin.Context["session"]`) also exposes `get`,
 * `switchModel`, `wait`, `context` and more; keeping the notifier bound to
 * `prompt` only makes it easy to construct in tests and resilient to hosts
 * that only expose part of the surface.
 */
export type V2SessionPrompt = Pick<Plugin.Context['session'], 'prompt'>

const exitMessageIds = new WeakMap<PTYSession, string>()

/**
 * Delivers `<pty_exited>` notifications through opencode v2's plugin context.
 *
 * The notification is admitted as a user prompt with a stable message id,
 * so `admission.reconcile` makes repeated deliveries
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
export class V2SessionNotifier implements SessionNotifier {
  constructor(private readonly session: V2SessionPrompt) {}

  async sendExitNotification(session: PTYSession, exitCode: number): Promise<void> {
    if (!session.parentSessionId) {
      console.warn(`[opencode-pty] cannot notify: session ${session.id} has no parent session`)
      return
    }

    const text = buildExitNotification(session, exitCode)
    try {
      const { ascending } = await import('@opencode/schema/identifier')
      let id = exitMessageIds.get(session)
      if (!id) {
        id = `msg_${ascending()}`
        exitMessageIds.set(session, id)
      }
      await this.session.prompt({
        sessionID: session.parentSessionId,
        id,
        text,
      })
    } catch (error) {
      console.error(
        `[opencode-pty] failed to deliver exit notification for ${session.id}:`,
        error instanceof Error ? error.message : String(error)
      )
    }
  }
}
