import { afterEach, describe, expect, it, mock } from 'bun:test'
import {
  type HostAdapter,
  type PermissionAuthorizer,
  type SessionNotifier,
  createV1Adapter,
  installHostAdapter,
} from '../src/adapters/index.ts'
import { manager } from '../src/plugin/pty/manager.ts'
import {
  checkCommandPermission,
  checkWorkdirPermission,
  getPermissionAuthorizer,
  setPermissionAuthorizer,
} from '../src/plugin/pty/permissions.ts'
import type { PTYSession } from '../src/plugin/pty/types.ts'
import type { PluginContext } from '../src/plugin/types.ts'

describe('Adapter Layer', () => {
  afterEach(() => {
    setPermissionAuthorizer(null)
    manager.setNotifier(null)
    manager.clearAllSessions()
  })

  describe('PermissionAuthorizer decoupling', () => {
    it('delegates command and workdir checks to custom authorizer without PluginClient', async () => {
      const checkCommand = mock(async (_cmd: string, _args: string[]) => {})
      const checkWorkdir = mock(async (_dir: string) => {})

      const customAuthorizer: PermissionAuthorizer = {
        checkCommand,
        checkWorkdir,
      }

      setPermissionAuthorizer(customAuthorizer)
      expect(getPermissionAuthorizer()).toBe(customAuthorizer)

      await checkCommandPermission('ls', ['-la'])
      expect(checkCommand).toHaveBeenCalledWith('ls', ['-la'])

      await checkWorkdirPermission('/some/dir')
      expect(checkWorkdir).toHaveBeenCalledWith('/some/dir')
    })

    it('propagates authorization errors from custom authorizer', async () => {
      const customAuthorizer: PermissionAuthorizer = {
        checkCommand: async () => {
          throw new Error('Command execution denied by security policy')
        },
        checkWorkdir: async () => {},
      }

      setPermissionAuthorizer(customAuthorizer)

      expect(checkCommandPermission('rm', ['-rf', '/'])).rejects.toThrow(
        'Command execution denied by security policy'
      )
    })

    it('safely allows when no authorizer is set', async () => {
      setPermissionAuthorizer(null)
      expect(getPermissionAuthorizer()).toBeNull()

      await expect(checkCommandPermission('echo', ['hello'])).resolves.toBeUndefined()
      await expect(checkWorkdirPermission('/anywhere')).resolves.toBeUndefined()
    })
  })

  describe('SessionNotifier decoupling', () => {
    it('dispatches exit notifications to custom SessionNotifier without OpencodeClient', async () => {
      let notifiedSession: PTYSession | null = null
      let notifiedExitCode: number | null = null

      const customNotifier: SessionNotifier = {
        sendExitNotification: (session, exitCode) => {
          notifiedSession = session
          notifiedExitCode = exitCode
        },
      }

      manager.setNotifier(customNotifier)

      const info = manager.spawn({
        command: 'echo',
        args: ['decoupled-test'],
        description: 'Test decoupled notifier',
        parentSessionId: 'parent-123',
        notifyOnExit: true,
      })

      // Wait briefly for process to exit and notify
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(notifiedSession).not.toBeNull()
      expect((notifiedSession as PTYSession | null)?.id).toBe(info.id)
      expect(notifiedExitCode as number | null).toBe(0)
    })
  })

  describe('HostAdapter integration', () => {
    it('installHostAdapter wires both notifier and permissions', () => {
      const customNotifier: SessionNotifier = {
        sendExitNotification: () => {},
      }
      const customPermissions: PermissionAuthorizer = {
        checkCommand: async () => {},
        checkWorkdir: async () => {},
      }

      const testAdapter: HostAdapter = {
        id: 'test-adapter',
        notifier: customNotifier,
        permissions: customPermissions,
      }

      installHostAdapter(testAdapter)

      expect(getPermissionAuthorizer()).toBe(customPermissions)
      expect(manager.getNotifier()).toBe(customNotifier)
    })

    it('createV1Adapter creates a V1-compatible HostAdapter', async () => {
      const fakeClient = {
        config: {
          get: async () => ({
            data: {
              permission: {
                bash: 'deny',
              },
            },
          }),
        },
        tui: {
          showToast: async () => {},
        },
        session: {
          get: async () => ({ data: {} }),
          promptAsync: async () => {},
        },
      }

      const v1Context = {
        client: fakeClient,
        directory: '/test/workspace',
      } as unknown as PluginContext

      const adapter = createV1Adapter(v1Context)
      expect(adapter.id).toBe('opencode-v1')
      expect(adapter.notifier).toBeDefined()
      expect(adapter.permissions).toBeDefined()

      installHostAdapter(adapter)

      // Permission check should be active and reject bash commands because bash is 'deny'
      expect(checkCommandPermission('ls', [])).rejects.toThrow(
        'All bash commands are disabled by user configuration'
      )
    })
  })
})
