import { manager } from '../../plugin/pty/manager.ts'
import type { HostAdapter, PermissionAuthorizer, SessionNotifier } from '../types.ts'

export interface V2AdapterOptions {
  notifier?: SessionNotifier
  permissions?: PermissionAuthorizer
}

export class V2HostAdapter implements HostAdapter {
  readonly id = 'opencode-v2'
  readonly notifier?: SessionNotifier
  readonly permissions?: PermissionAuthorizer

  constructor(options: V2AdapterOptions = {}) {
    this.notifier = options.notifier
    this.permissions = options.permissions
  }

  onSessionDeleted(sessionId: string): void {
    manager.cleanupBySession(sessionId)
  }
}

export function createV2Adapter(options?: V2AdapterOptions): HostAdapter {
  return new V2HostAdapter(options)
}
