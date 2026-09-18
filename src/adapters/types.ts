import type { PTYSession } from '../plugin/pty/types.ts'

/**
 * Host-agnostic interface for handling session exit notifications.
 * Allows decoupling PTY lifecycle from any specific OpenCode client SDK.
 */
export interface SessionNotifier {
  sendExitNotification(session: PTYSession, exitCode: number): Promise<void> | void
}

/**
 * Host-agnostic authorizer for validating command and workdir execution permissions.
 */
export interface PermissionAuthorizer {
  checkCommand(command: string, args: string[]): Promise<void>
  checkWorkdir(workdir: string): Promise<void>
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
