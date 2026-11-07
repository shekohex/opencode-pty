import { afterEach, describe, expect, it } from 'bun:test'
import {
  PTY_OPEN_CLIENT_COMMAND,
  PTY_SHOW_SERVER_URL_COMMAND,
  Plugin,
  getOrCreateServer,
  ptyTools,
  stopActiveServer,
} from '../src/v2/index.ts'
import { manager } from '../src/plugin/pty/manager.ts'
import { V2SessionNotifier } from '../src/v2/index.ts'
import type {
  CommandDefinition,
  CommandDraft,
  PluginContextV2,
  ToolDraft,
  ToolInfoV2,
} from '../src/v2/types.ts'

/** Polls until `condition` is truthy or the timeout elapses. */
async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  expect(condition()).toBe(true)
}

describe('OpenCode V2 Live Integration', () => {
  afterEach(() => {
    stopActiveServer()
    // Keep the singleton manager's notifier from leaking across simulated hosts.
    manager.setNotifier(null)
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
    const registeredCommands: Record<string, CommandDefinition> = {}
    const registeredTools: Record<string, ToolInfoV2> = {}

    // Simulated V2 drafts from OpenCode core. Note both editors expose `add()`
    // only — there is no `update()` (that mismatch is why tools/commands were
    // silently missing before).
    const commandDraft: CommandDraft = {
      add: (command) => {
        registeredCommands[command.name] = command
      },
    }
    const toolDraft: ToolDraft = {
      add: (tool) => {
        registeredTools[tool.name] = tool
      },
    }

    let commandTransformCalled = false
    let toolTransformCalled = false
    const simulatedContext: PluginContextV2 = {
      options: {
        port: 48999,
        hostname: '127.0.0.1',
      },
      command: {
        transform: async (callback) => {
          commandTransformCalled = true
          await callback(commandDraft)
        },
        reload: async () => {},
      },
      tool: {
        transform: async (callback) => {
          toolTransformCalled = true
          await callback(toolDraft)
        },
        reload: async () => {},
      },
      session: {
        prompt: async () => ({}) as never,
      },
    }

    // Run setup through V2 plugin contract
    await Plugin.setup(simulatedContext)

    expect(toolTransformCalled).toBe(true)
    expect(Object.keys(registeredTools).sort()).toEqual([
      'pty_kill',
      'pty_list',
      'pty_read',
      'pty_spawn',
      'pty_write',
    ])

    expect(commandTransformCalled).toBe(true)
    expect(registeredCommands[PTY_OPEN_CLIENT_COMMAND]?.description).toBe(
      'Open PTY Sessions Web Interface'
    )
    expect(typeof registeredCommands[PTY_OPEN_CLIENT_COMMAND]?.execute).toBe('function')
    expect(registeredCommands[PTY_SHOW_SERVER_URL_COMMAND]?.description).toBe(
      'Show PTY Sessions Web Interface URL'
    )
    expect(typeof registeredCommands[PTY_SHOW_SERVER_URL_COMMAND]?.execute).toBe('function')

    // Verify server creation with V2 options
    const server = await getOrCreateServer({
      port: simulatedContext.options?.port,
      hostname: simulatedContext.options?.hostname,
    })

    expect(server.server.url.port).toBe('48999')
    expect(server.server.url.hostname).toBe('127.0.0.1')
  })

  it('delivers <pty_exited> via ctx.session.prompt when notifyOnExit is set', async () => {
    const prompts: Array<{ sessionID: string; id: string | null; text: string }> = []
    const simulatedContext: PluginContextV2 = {
      options: {},
      session: {
        prompt: async (input) => {
          prompts.push({
            sessionID: input.sessionID,
            id: input.id ?? null,
            text: input.text,
          })
          return {} as never
        },
      },
    }

    await Plugin.setup(simulatedContext)
    // The setup wires the V2 notifier into the manager.
    expect(manager.getNotifier()).toBeInstanceOf(V2SessionNotifier)

    const spawned = manager.spawn({
      command: 'sh',
      args: ['-c', 'exit 3'],
      description: 'V2 notification test process',
      parentSessionId: 'ses_parent',
      notifyOnExit: true,
    })

    await waitFor(() => prompts.length === 1)

    const prompt = prompts[0]
    expect(prompt).toBeDefined()
    // Delivered to the spawning session with a valid, idempotent id.
    expect(prompt?.sessionID).toBe('ses_parent')
    expect(prompt?.id).toStartWith('msg_')
    expect(prompt?.text).toContain('<pty_exited>')
    expect(prompt?.text).toContain(`ID: ${spawned.id}`)
    expect(prompt?.text).toContain('Exit Code: 3')
    expect(prompt?.text).toContain(
      'Process failed. Use pty_read with the pattern parameter to search for errors in the output.'
    )
  })

  it('warns and disables notifications when the host has no session domain', async () => {
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (message: unknown) => {
      warnings.push(String(message))
    }
    try {
      await Plugin.setup({ options: {} } as PluginContextV2)
    } finally {
      console.warn = originalWarn
    }

    expect(warnings.some((w) => w.includes('ctx.session.prompt'))).toBe(true)
    // No V2 notifier was installed, so a notifying spawn stays silent instead of crashing.
    expect(manager.getNotifier()).not.toBeInstanceOf(V2SessionNotifier)
  })

  it('runs PTY lifecycle operations in the V2 context', async () => {
    // Spawn echo command using exported tools
    const session = ptyTools.pty_spawn
    expect(session).toBeDefined()

    // Test spawning a real background process through the manager
    const { manager: lifecycleManager } = await import('../src/plugin/pty/manager.ts')
    const spawned = lifecycleManager.spawn({
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
    const readResult = lifecycleManager.read(spawned.id, 0)
    expect(readResult).not.toBeNull()
    expect(readResult?.lines.join('')).toContain('opencode-v2-live-test')

    // Terminate
    const killed = lifecycleManager.kill(spawned.id, true)
    expect(killed).toBe(true)
  })
})
