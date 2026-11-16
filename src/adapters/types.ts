import type { PTYSession } from '../plugin/pty/types.ts'

/**
 * Host-agnostic interface for handling session exit notifications.
 * Allows decoupling PTY lifecycle from any specific OpenCode client SDK.
 */
export interface SessionNotifier {
  sendExitNotification(session: PTYSession, exitCode: number): Promise<void> | void
}

/**
 * The tool invocation a permission check belongs to.
 *
 * Hosts that evaluate permissions per session need this to attribute the check
 * to a session, an agent and a tool call. It is optional because a check can be
 * made outside a tool call; hosts that require it decide what an absent value
 * means (the V2 adapter denies, see `V2PermissionAuthorizer`).
 */
export interface PermissionRequestContext {
  sessionID?: string
  agent?: string
  messageID?: string
  callID?: string
}

/**
 * Host-agnostic authorizer for validating command and workdir execution permissions.
 */
export interface PermissionAuthorizer {
  checkCommand(command: string, args: string[], context?: PermissionRequestContext): Promise<void>
  checkWorkdir(workdir: string, context?: PermissionRequestContext): Promise<void>
}

/**
 * Common host adapter contract bridging a host environment (e.g. OpenCode V1, V2, Standalone)
 * with the core PTY manager and execution environment.
 */
export interface HostAdapter {
  readonly id: string
  readonly notifier?: SessionNotifier
  readonly permissions?: PermissionAuthorizer
  onSessionDeleted?(sessionId: string): void
}
