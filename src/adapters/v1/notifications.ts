import type { OpencodeClient } from '@opencode-ai/sdk'
import { NotificationManager } from '../../plugin/pty/notification-manager.ts'
import type { PTYSession } from '../../plugin/pty/types.ts'
import type { SessionNotifier } from '../types.ts'

export class V1NotificationAdapter implements SessionNotifier {
  private manager: NotificationManager

  constructor(client?: OpencodeClient) {
    this.manager = new NotificationManager()
    if (client) {
      this.manager.init(client)
    }
  }

  init(client: OpencodeClient): void {
    this.manager.init(client)
  }

  async sendExitNotification(session: PTYSession, exitCode: number): Promise<void> {
    await this.manager.sendExitNotification(session, exitCode)
  }
}
