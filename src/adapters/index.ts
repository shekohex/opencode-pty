import { manager } from '../plugin/pty/manager.ts'
import { setPermissionAuthorizer } from '../plugin/pty/permissions.ts'
import type { HostAdapter } from './types.ts'

export * from './types.ts'
export * from './v1/index.ts'

/**
 * Installs a host adapter by connecting its notifier and permission authorizer
 * to the core PTY manager and permission dispatcher.
 */
export function installHostAdapter(adapter: HostAdapter): void {
  if (adapter.notifier) {
    manager.setNotifier(adapter.notifier)
  }
  if (adapter.permissions) {
    setPermissionAuthorizer(adapter.permissions)
  }
}
