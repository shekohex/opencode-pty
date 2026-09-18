import type { PluginClient } from '../../plugin/types.ts'
import type { PermissionAuthorizer } from '../types.ts'
import { allStructured } from '../../plugin/pty/wildcard.ts'

type PermissionAction = 'allow' | 'ask' | 'deny'
type BashPermissions = PermissionAction | Record<string, PermissionAction>

export interface PermissionConfig {
  bash?: BashPermissions
  external_directory?: PermissionAction
}

export class V1PermissionAuthorizer implements PermissionAuthorizer {
  constructor(
    private client: PluginClient | null,
    private directory: string | null
  ) {}

  private async getPermissionConfig(): Promise<PermissionConfig> {
    if (!this.client) {
      return {}
    }
    try {
      const response = await this.client.config.get()
      if (response.error || !response.data) {
        return {}
      }
      return (response.data as { permission?: PermissionConfig }).permission ?? {}
    } catch {
      return {}
    }
  }

  private async showToast(
    message: string,
    variant: 'info' | 'success' | 'error' = 'info'
  ): Promise<void> {
    if (!this.client) return
    try {
      await this.client.tui.showToast({ body: { message, variant } })
    } catch {
      // Ignore toast errors
    }
  }

  private async denyWithToast(msg: string, details?: string): Promise<never> {
    await this.showToast(msg, 'error')
    throw new Error(details ? `${msg} ${details}` : msg)
  }

  private async handleAskPermission(commandLine: string): Promise<never> {
    await this.denyWithToast(
      `PTY: Command "${commandLine}" requires permission (treated as denied)`,
      `PTY spawn denied: Command "${commandLine}" requires user permission which is not supported by this plugin. Configure explicit "allow" or "deny" in your opencode.json permission.bash settings.`
    )
    throw new Error('Unreachable')
  }

  async checkCommand(command: string, args: string[]): Promise<void> {
    const config = await this.getPermissionConfig()
    const bashPerms = config.bash

    if (!bashPerms) {
      return
    }

    if (typeof bashPerms === 'string') {
      if (bashPerms === 'deny') {
        await this.denyWithToast(
          'PTY spawn denied: All bash commands are disabled by user configuration.'
        )
      }
      if (bashPerms === 'ask') {
        await this.handleAskPermission(command)
      }
      return
    }

    const action = allStructured({ head: command, tail: args }, bashPerms)

    if (action === 'deny') {
      await this.denyWithToast(
        `PTY spawn denied: Command "${command} ${args.join(' ')}" is explicitly denied by user configuration.`
      )
    }

    if (action === 'ask') {
      await this.handleAskPermission(`${command} ${args.join(' ')}`)
    }
  }

  async checkWorkdir(workdir: string): Promise<void> {
    if (!this.directory) {
      return
    }

    const normalizedWorkdir = workdir.replace(/\/$/, '')
    const normalizedProject = this.directory.replace(/\/$/, '')

    if (normalizedWorkdir.startsWith(normalizedProject)) {
      return
    }

    const config = await this.getPermissionConfig()
    const extDirPerm = config.external_directory

    if (extDirPerm === 'deny') {
      await this.denyWithToast(
        `PTY spawn denied: Working directory "${workdir}" is outside project directory "${this.directory}". External directory access is denied by user configuration.`
      )
    }

    if (extDirPerm === 'ask') {
      // TODO: Implement user prompt for external directory access
    }
  }
}
