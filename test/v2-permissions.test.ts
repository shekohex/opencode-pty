import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { createV2Adapter, installHostAdapter } from '../src/adapters/index.ts'
import {
  V2PermissionAuthorizer,
  type V2PermissionAssertInput,
  createV2PermissionAuthorizer,
} from '../src/adapters/v2/permissions.ts'
import { manager } from '../src/plugin/pty/manager.ts'
import {
  checkCommandPermission,
  getPermissionAuthorizer,
  permissionRequestContext,
  setPermissionAuthorizer,
} from '../src/plugin/pty/permissions.ts'
import { ptySpawn } from '../src/plugin/pty/tools/spawn.ts'
import { ptyWrite } from '../src/plugin/pty/tools/write.ts'
import { Plugin } from '../src/v2/index.ts'

// A tool invocation as opencode V2 hands it to `execute(input, context)`.
const toolContext = {
  sessionID: 'ses_test',
  messageID: 'msg_test',
  agent: 'build',
  id: 'call_test',
  progress: async () => {},
  signal: new AbortController().signal,
}

// What the tools hand the authorizer: the tool context narrowed to the fields a
// permission check needs, with V2's `id` mapped onto `callID`.
const permissionContext = permissionRequestContext(toolContext)

const LOCATION = '/workspace/app'

/** `ctx.permission` double that records every assertion it is asked to make. */
function recordingPermission(reject = false) {
  const calls: V2PermissionAssertInput[] = []
  const permission = {
    assert: async (input: V2PermissionAssertInput) => {
      calls.push(input)
      if (reject) {
        throw new Error(`Permission denied: ${input.action} ${input.resources.join(' ')}`)
      }
    },
  }
  return { calls, permission }
}

describe('OpenCode V2 permission authorizer (#80)', () => {
  afterEach(() => {
    setPermissionAuthorizer(null)
    manager.clearAllSessions()
    mock.restore()
  })

  describe('command checks', () => {
    it('delegates the command line to ctx.permission.assert as the V2 shell action', async () => {
      const { calls, permission } = recordingPermission()
      const authorizer = new V2PermissionAuthorizer({ permission, directory: LOCATION })

      await authorizer.checkCommand('git', ['push', 'origin', 'main'], permissionContext)

      expect(calls).toHaveLength(1)
      expect(calls[0]).toEqual({
        sessionID: 'ses_test',
        agent: 'build',
        action: 'shell',
        resources: ['git push origin main'],
        save: ['git push origin main'],
        source: { type: 'tool', messageID: 'msg_test', id: 'call_test' },
      })
    })

    it('propagates a host rejection instead of swallowing it', async () => {
      const { permission } = recordingPermission(true)
      const authorizer = new V2PermissionAuthorizer({ permission, directory: LOCATION })

      expect(authorizer.checkCommand('rm', ['-rf', '/'], permissionContext)).rejects.toThrow(
        'Permission denied: shell rm -rf /'
      )
    })

    it('denies when the check cannot be attributed to a session', async () => {
      const { calls, permission } = recordingPermission()
      const authorizer = new V2PermissionAuthorizer({ permission, directory: LOCATION })

      // Denying keeps a deny rule from being bypassed; allowing here would be
      // exactly the hole this authorizer closes.
      expect(authorizer.checkCommand('echo', ['hi'])).rejects.toThrow(/without a session/)
      expect(calls).toHaveLength(0)
    })
  })

  describe('workdir checks', () => {
    it('does not consult the host for a workdir inside the location', async () => {
      const { calls, permission } = recordingPermission()
      const authorizer = new V2PermissionAuthorizer({ permission, directory: LOCATION })

      await authorizer.checkWorkdir(`${LOCATION}/packages/web`, permissionContext)
      await authorizer.checkWorkdir(LOCATION, permissionContext)

      expect(calls).toHaveLength(0)
    })

    it('checks external_directory for a sibling directory that merely shares a prefix', async () => {
      const { calls, permission } = recordingPermission()
      const authorizer = new V2PermissionAuthorizer({ permission, directory: LOCATION })

      await authorizer.checkWorkdir('/workspace/app-evil', permissionContext)

      expect(calls).toHaveLength(1)
      expect(calls[0]?.action).toBe('external_directory')
      expect(calls[0]?.resources).toEqual(['/workspace/app-evil', '/workspace/app-evil/*'])
    })

    it('does not treat a traversing path as inside the location', async () => {
      const { calls, permission } = recordingPermission()
      const authorizer = new V2PermissionAuthorizer({ permission, directory: LOCATION })

      await authorizer.checkWorkdir(`${LOCATION}/../../etc`, permissionContext)

      expect(calls).toHaveLength(1)
      expect(calls[0]?.action).toBe('external_directory')
      // Resolved lexically, so a rule is matched against the real boundary.
      expect(calls[0]?.resources).toEqual(['/etc', '/etc/*'])
    })
  })

  describe('adapter wiring', () => {
    it('reaches ctx.permission.assert through createV2Adapter and the core dispatcher', async () => {
      const { calls, permission } = recordingPermission()
      installHostAdapter(
        createV2Adapter({
          permissions: createV2PermissionAuthorizer(permission, LOCATION),
        })
      )

      await checkCommandPermission('git', ['push'], permissionContext)

      expect(calls).toHaveLength(1)
      expect(calls[0]?.action).toBe('shell')
      expect(calls[0]?.resources).toEqual(['git push'])
    })

    it('installs the authorizer from ctx.permission during Plugin.setup', async () => {
      const { calls, permission } = recordingPermission()

      await Plugin.setup({ options: {}, permission })

      expect(getPermissionAuthorizer()).toBeInstanceOf(V2PermissionAuthorizer)
      await checkCommandPermission('git', ['push'], permissionContext)
      expect(calls).toHaveLength(1)
    })

    it('creates no authorizer when the host exposes no permission domain', () => {
      expect(createV2PermissionAuthorizer(undefined, LOCATION)).toBeUndefined()
    })
  })

  describe('tool enforcement', () => {
    it('a denied command does not spawn', async () => {
      const { calls, permission } = recordingPermission(true)
      installHostAdapter(
        createV2Adapter({
          permissions: createV2PermissionAuthorizer(permission, LOCATION),
        })
      )
      const spawnSpy = spyOn(manager, 'spawn')

      await expect(
        ptySpawn.execute(
          { command: 'rm', args: ['-rf', '/'], description: 'denied spawn attempt' },
          toolContext as never
        )
      ).rejects.toThrow('Permission denied: shell rm -rf /')

      expect(calls[0]?.resources).toEqual(['rm -rf /'])
      expect(spawnSpy).not.toHaveBeenCalled()
      expect(manager.list()).toHaveLength(0)
    })

    it('pty_write checks the command it types before writing it', async () => {
      const { calls, permission } = recordingPermission(true)
      installHostAdapter(
        createV2Adapter({
          permissions: createV2PermissionAuthorizer(permission, LOCATION),
        })
      )
      spyOn(manager, 'get').mockReturnValue({ status: 'running' } as never)
      const writeSpy = spyOn(manager, 'write')

      await expect(
        ptyWrite.execute({ id: 'pty_denied', data: 'rm -rf /\n' }, toolContext as never)
      ).rejects.toThrow('Permission denied: shell rm -rf /')

      expect(calls.map((call) => call.resources[0])).toEqual(['rm -rf /'])
      expect(writeSpy).not.toHaveBeenCalled()
    })
  })
})
