import type { PluginClient } from '../types.ts'
import type { PermissionAuthorizer } from '../../adapters/types.ts'
import { V1PermissionAuthorizer } from '../../adapters/v1/permissions.ts'

export type { PermissionAuthorizer }

let _authorizer: PermissionAuthorizer | null = null

/**
 * Sets the active permission authorizer for PTY command and directory checks.
 */
export function setPermissionAuthorizer(authorizer: PermissionAuthorizer | null): void {
  _authorizer = authorizer
}

/**
 * Returns the currently active permission authorizer, if any.
 */
export function getPermissionAuthorizer(): PermissionAuthorizer | null {
  return _authorizer
}

/**
 * Backward-compatible initialization using V1 PluginClient.
 */
export function initPermissions(client: PluginClient, directory: string): void {
  _authorizer = new V1PermissionAuthorizer(client, directory)
}

/**
 * Checks command execution permission against the active authorizer.
 * Defaults to allowing if no authorizer is set.
 */
export async function checkCommandPermission(command: string, args: string[]): Promise<void> {
  if (_authorizer) {
    await _authorizer.checkCommand(command, args)
  }
}

/**
 * Checks working directory access permission against the active authorizer.
 * Defaults to allowing if no authorizer is set.
 */
export async function checkWorkdirPermission(workdir: string): Promise<void> {
  if (_authorizer) {
    await _authorizer.checkWorkdir(workdir)
  }
}
