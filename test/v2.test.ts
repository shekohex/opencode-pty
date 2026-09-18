import { afterEach, describe, expect, it, mock } from 'bun:test'
import {
  PTY_OPEN_CLIENT_COMMAND,
  PTY_SHOW_SERVER_URL_COMMAND,
  Plugin,
  getActiveServer,
  getOrCreateServer,
  handleShowServerUrlCommand,
  ptyTools,
  stopActiveServer,
} from '../src/v2/index.ts'
import type { CommandDraft, CommandInfo, PluginContextV2 } from '../src/v2/types.ts'

describe('OpenCode V2 Plugin API', () => {
  afterEach(() => {
    stopActiveServer()
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

  describe('Command Registration via ctx.command.transform', () => {
    it('registers slash commands in the command draft', async () => {
      const registeredCommands: Record<string, CommandInfo> = {}

      const draft: CommandDraft = {
        update: (name: string, updateFn: (cmd: CommandInfo) => void) => {
          const entry: CommandInfo = {}
          registeredCommands[name] = entry
          updateFn(entry)
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
      expect(registeredCommands[PTY_SHOW_SERVER_URL_COMMAND]?.description).toBe(
        'Show PTY Sessions Web Interface URL'
      )
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
