import type { OpencodeClient } from '@opencode-ai/sdk'
import type { PluginContext } from '../../plugin/types.ts'
import { manager } from '../../plugin/pty/manager.ts'
import type { HostAdapter } from '../types.ts'
import { V1NotificationAdapter } from './notifications.ts'
import { V1PermissionAuthorizer } from './permissions.ts'

export { V1NotificationAdapter } from './notifications.ts'
export { V1PermissionAuthorizer } from './permissions.ts'

export function createV1Adapter(context: PluginContext): HostAdapter {
  const notifier = new V1NotificationAdapter(context.client as unknown as OpencodeClient)
  const permissions = new V1PermissionAuthorizer(context.client, context.directory)

  return {
    id: 'opencode-v1',
    notifier,
    permissions,
    onSessionDeleted: (sessionId: string) => {
      manager.cleanupBySession(sessionId)
    },
  }
}
