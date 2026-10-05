import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import {
  PTY_OPEN_CLIENT_COMMAND,
  PTY_SHOW_SERVER_URL_COMMAND,
  Plugin,
  getActiveServer,
  getOrCreateServer,
  handleShowServerUrlCommand,
  ptyTools,
  registerV2Tools,
  stopActiveServer,
} from '../src/v2/index.ts'
import type {
  CommandDefinition,
  CommandDraft,
  PluginContextV2,
  ToolDraft,
  ToolInfoV2,
} from '../src/v2/types.ts'

describe('OpenCode V2 Plugin API', () => {
  afterEach(() => {
    stopActiveServer()
    mock.restore()
  })

  describe('Plugin Contract Conformance', () => {
    it('satisfies the V2 plugin structure (id and setup)', () => {
      expect(Plugin.id).toBe('opencode-pty')
      expect(typeof Plugin.setup).toBe('function')
    })

    it('exports standard PTY tools', () => {
      expect(ptyTools.pty_spawn).toBeDefined()
      expect(ptyTools.pty_write).toBeDefined()
      expect(ptyTools.pty_read).toBeDefined()
      expect(ptyTools.pty_list).toBeDefined()
      expect(ptyTools.pty_kill).toBeDefined()
    })
  })

  describe('Tool Registration via ctx.tool.transform', () => {
    it('registers every PTY tool with name, input schema and execute', async () => {
      const registeredTools: Record<string, ToolInfoV2> = {}

      const draft: ToolDraft = {
        add: (tool) => {
          registeredTools[tool.name] = tool
        },
      }

      const mockTransform = mock(async (callback: (draft: ToolDraft) => void) => {
        callback(draft)
      })

      const ctx: PluginContextV2 = {
        options: {},
        tool: {
          transform: mockTransform,
        },
      }

      await Plugin.setup(ctx)

      expect(mockTransform).toHaveBeenCalled()
      expect(Object.keys(registeredTools).sort()).toEqual([
        'pty_kill',
        'pty_list',
        'pty_read',
        'pty_spawn',
        'pty_write',
      ])

      for (const tool of Object.values(registeredTools)) {
        expect(typeof tool.description).toBe('string')
        expect(tool.description.length).toBeGreaterThan(0)
        expect(tool.input).toBeDefined()
        expect(typeof tool.execute).toBe('function')
      }
    })

    it('injects the project directory into a tool context without directory', async () => {
      const registeredTools: Record<string, ToolInfoV2> = {}
      const draft: ToolDraft = {
        add: (tool) => {
          registeredTools[tool.name] = tool
        },
      }
      const execute = spyOn(ptyTools.pty_spawn, 'execute').mockResolvedValue('spawned')
      const input = { command: 'pwd', args: [], description: 'Check project directory' }
      const context = { sessionID: 'session-1', progress: async () => {} }

      registerV2Tools(draft, '/tmp/project')
      const result = await registeredTools.pty_spawn?.execute(input, context)

      expect(execute).toHaveBeenCalledWith(input, { directory: '/tmp/project', ...context })
      expect(result).toEqual({ content: 'spawned' })
    })

    it('does not fail when the tool transform is unavailable', async () => {
      const ctx: PluginContextV2 = { options: {} }
      await Plugin.setup(ctx)
      expect(getActiveServer()).toBeNull()
    })
  })

  describe('Command Registration via ctx.command.transform', () => {
    it('registers slash commands with an execute handler', async () => {
      const registeredCommands: Record<string, CommandDefinition> = {}

      const draft: CommandDraft = {
        add: (command) => {
          registeredCommands[command.name] = command
        },
      }

      const mockTransform = mock(async (callback: (draft: CommandDraft) => void) => {
        callback(draft)
      })

      const ctx: PluginContextV2 = {
        options: {},
        command: {
          transform: mockTransform,
        },
      }

      await Plugin.setup(ctx)

      expect(mockTransform).toHaveBeenCalled()
      expect(registeredCommands[PTY_OPEN_CLIENT_COMMAND]?.description).toBe(
        'Open PTY Sessions Web Interface'
      )
      expect(typeof registeredCommands[PTY_OPEN_CLIENT_COMMAND]?.execute).toBe('function')
      expect(registeredCommands[PTY_SHOW_SERVER_URL_COMMAND]?.description).toBe(
        'Show PTY Sessions Web Interface URL'
      )
      expect(typeof registeredCommands[PTY_SHOW_SERVER_URL_COMMAND]?.execute).toBe('function')
    })
  })

  describe('Options Support (Custom Port & Hostname)', () => {
    it('creates server with custom port and hostname when specified', async () => {
      const server = await getOrCreateServer({ port: 0, hostname: '127.0.0.1' })
      expect(server).toBeDefined()
      expect(server.server.url.protocol).toBe('http:')
      expect(server.server.url.hostname).toBe('127.0.0.1')
    })

    it('autostarts server when autostart option is true in ctx.options', async () => {
      expect(getActiveServer()).toBeNull()

      const ctx: PluginContextV2 = {
        options: {
          autostart: true,
          hostname: '127.0.0.1',
        },
      }

      await Plugin.setup(ctx)

      const active = getActiveServer()
      expect(active).not.toBeNull()
      expect(active?.server.url.hostname).toBe('127.0.0.1')
    })

    it('shows server URL via handleShowServerUrlCommand', async () => {
      const message = await handleShowServerUrlCommand({ hostname: '127.0.0.1' })
      expect(message).toContain('PTY Sessions Web Interface URL: http://127.0.0.1:')
    })
  })
})
