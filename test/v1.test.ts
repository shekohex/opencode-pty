import { afterEach, describe, expect, it, mock } from 'bun:test'
import { PTYPlugin } from '../src/plugin.ts'
import { PTYServer } from '../src/web/server/server.ts'
import type { PluginContext } from '../src/plugin/types.ts'

function createMockContext(): PluginContext {
  return {
    client: {
      config: {
        get: async () => ({
          data: {
            permission: {
              bash: 'allow',
            },
          },
        }),
      },
      tui: {
        showToast: async () => {},
      },
      session: {
        get: async () => ({ data: {} }),
        prompt: async () => {},
      },
    },
    directory: '/test/workspace',
  } as unknown as PluginContext
}

describe('OpenCode V1 Plugin (PTYPlugin)', () => {
  afterEach(() => {
    PTYServer.stopActiveServer()
    delete process.env.PTY_WEB_AUTOSTART
    delete process.env.PTY_AUTOSTART
  })

  it('does not autostart server by default when env var is not set', async () => {
    expect(PTYServer.getActiveServer()).toBeNull()
    const ctx = createMockContext()
    await PTYPlugin(ctx)
    expect(PTYServer.getActiveServer()).toBeNull()
  })

  it('autostarts server on initialization when PTY_WEB_AUTOSTART is true', async () => {
    expect(PTYServer.getActiveServer()).toBeNull()
    process.env.PTY_WEB_AUTOSTART = 'true'

    const ctx = createMockContext()
    await PTYPlugin(ctx)

    const active = PTYServer.getActiveServer()
    expect(active).not.toBeNull()
  })

  it('autostarts server when PTY_AUTOSTART alias is 1', async () => {
    expect(PTYServer.getActiveServer()).toBeNull()
    process.env.PTY_AUTOSTART = '1'

    const ctx = createMockContext()
    await PTYPlugin(ctx)

    const active = PTYServer.getActiveServer()
    expect(active).not.toBeNull()
  })

  it('reuses autostarted server when pty-show-server-url command is executed', async () => {
    process.env.PTY_WEB_AUTOSTART = 'true'
    const ctx = createMockContext()
    const promptMock = mock(async () => ({ data: undefined, error: undefined }))
    ctx.client.session.prompt = promptMock as unknown as typeof ctx.client.session.prompt

    const pluginResult = await PTYPlugin(ctx)
    const initialServer = PTYServer.getActiveServer()
    expect(initialServer).not.toBeNull()

    const beforeHook = pluginResult['command.execute.before']
    expect(beforeHook).toBeDefined()

    expect(
      beforeHook?.(
        {
          command: 'pty-show-server-url',
          sessionID: 'session-1',
          arguments: '',
        },
        { parts: [] }
      )
    ).rejects.toThrow('Command handled by PTY plugin')

    expect(promptMock).toHaveBeenCalled()
    const currentServer = PTYServer.getActiveServer()
    expect(currentServer).toBe(initialServer)
  })
})
