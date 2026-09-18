import { afterEach, describe, expect, it } from 'bun:test'
import {
  PTY_OPEN_CLIENT_COMMAND,
  PTY_SHOW_SERVER_URL_COMMAND,
  Plugin,
  getOrCreateServer,
  ptyTools,
  stopActiveServer,
} from '../src/v2/index.ts'
import type { CommandDraft, CommandInfo, PluginContextV2 } from '../src/v2/types.ts'

describe('OpenCode V2 Live Integration', () => {
  afterEach(() => {
    stopActiveServer()
  })

  it('matches the Schema.Struct expected by OpenCode core external plugin loader', async () => {
    // OpenCode core's packages/core/src/config/plugin/external.ts decodes:
    // Schema.Struct({ default: Schema.Union([ ... Schema.Struct({ id: Schema.String, setup: Function }) ]) })
    const v2Module = await import('../dist/src/v2/index.js')

    expect(v2Module.default).toBeDefined()
    expect(typeof v2Module.default).toBe('object')
    expect(v2Module.default.id).toBe('opencode-pty')
    expect(typeof v2Module.default.setup).toBe('function')
  })

  it('executes setup inside a simulated OpenCode V2 PluginPromise host', async () => {
    const registeredCommands: Record<string, CommandInfo> = {}

    // Simulated V2 Command Draft from OpenCode core
    const commandDraft: CommandDraft = {
      update: (name: string, updateFn: (cmd: CommandInfo) => void) => {
        const item: CommandInfo = {}
        registeredCommands[name] = item
        updateFn(item)
      },
    }

    let transformCalled = false
    const simulatedContext: PluginContextV2 = {
      options: {
        port: 48999,
        hostname: '127.0.0.1',
      },
      command: {
        transform: async (callback) => {
          transformCalled = true
          await callback(commandDraft)
        },
        reload: async () => {},
      },
    }

    // Run setup through V2 plugin contract
    await Plugin.setup(simulatedContext)

    expect(transformCalled).toBe(true)
    expect(registeredCommands[PTY_OPEN_CLIENT_COMMAND]?.description).toBe(
      'Open PTY Sessions Web Interface'
    )
    expect(registeredCommands[PTY_SHOW_SERVER_URL_COMMAND]?.description).toBe(
      'Show PTY Sessions Web Interface URL'
    )

    // Verify server creation with V2 options
    const server = await getOrCreateServer({
      port: simulatedContext.options?.port,
      hostname: simulatedContext.options?.hostname,
    })

    expect(server.server.url.port).toBe('48999')
    expect(server.server.url.hostname).toBe('127.0.0.1')
  })

  it('runs PTY lifecycle operations in the V2 context', async () => {
    // Spawn echo command using exported tools
    const session = ptyTools.pty_spawn
    expect(session).toBeDefined()

    // Test spawning a real background process through the manager
    const { manager } = await import('../src/plugin/pty/manager.ts')
    const spawned = manager.spawn({
      command: 'echo',
      args: ['opencode-v2-live-test'],
      description: 'V2 live test process',
      parentSessionId: 'v2-session-1',
      notifyOnExit: false,
    })

    expect(spawned.id).toBeDefined()
    expect(spawned.status).toBe('running')

    // Read output
    await new Promise((resolve) => setTimeout(resolve, 100))
    const readResult = manager.read(spawned.id, 0)
    expect(readResult).not.toBeNull()
    expect(readResult?.lines.join('')).toContain('opencode-v2-live-test')

    // Terminate
    const killed = manager.kill(spawned.id, true)
    expect(killed).toBe(true)
  })
})
