import type { PluginContext, PluginResult } from './plugin/types.ts'
import { initManager, manager } from './plugin/pty/manager.ts'
import { initPermissions } from './plugin/pty/permissions.ts'
import { ptySpawn } from './plugin/pty/tools/spawn.ts'
import { ptyWrite } from './plugin/pty/tools/write.ts'
import { ptyRead } from './plugin/pty/tools/read.ts'
import { ptyList } from './plugin/pty/tools/list.ts'
import { ptyKill } from './plugin/pty/tools/kill.ts'
import { PTYServer } from './web/server/server.ts'
import { WebAuth } from './web/server/auth.ts'
import open from 'open'

const ptyOpenClientCommand = 'pty-open-background-spy'
const ptyShowServerUrlCommand = 'pty-show-server-url'

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1') {
    return true
  }
  if (normalized.startsWith('::ffff:')) {
    const tail = normalized.slice('::ffff:'.length)
    return tail === '127.0.0.1'
  }
  return false
}

export const PTYPlugin = async ({ client, directory }: PluginContext): Promise<PluginResult> => {
  initPermissions(client, directory)
  initManager(client)
  let ptyServer: PTYServer | undefined
  const webAuth = new WebAuth({
    username: process.env.PTY_WEB_USERNAME,
    password: process.env.PTY_WEB_PASSWORD,
  })

  return {
    'command.execute.before': async (input) => {
      if (input.command !== ptyOpenClientCommand && input.command !== ptyShowServerUrlCommand) {
        return
      }
      if (ptyServer === undefined) {
        ptyServer = await PTYServer.createServer({ auth: webAuth })
      }
      if (input.command === ptyOpenClientCommand) {
        open(ptyServer.server.url.origin)
      } else if (input.command === ptyShowServerUrlCommand) {
        const origin = ptyServer.server.url.origin
        const isLoopback = isLoopbackHostname(ptyServer.server.url.hostname)
        const authNote = webAuth.isEnabled()
          ? '(HTTP Basic Auth required)'
          : isLoopback
            ? '(no auth — loopback only)'
            : '(no auth — set PTY_WEB_PASSWORD to secure)'
        const message = `PTY Sessions Web Interface URL: ${origin} ${authNote}`
        await client.session.prompt({
          path: { id: input.sessionID },
          body: {
            noReply: true,
            parts: [
              {
                type: 'text',
                text: message,
              },
            ],
          },
        })
      }
      throw new Error('Command handled by PTY plugin')
    },
    tool: {
      pty_spawn: ptySpawn,
      pty_write: ptyWrite,
      pty_read: ptyRead,
      pty_list: ptyList,
      pty_kill: ptyKill,
    },
    config: async (input) => {
      if (!input.command) {
        input.command = {}
      }
      input.command[ptyOpenClientCommand] = {
        template: `This command will start the PTY Sessions Web Interface in your default browser.`,
        description: 'Open PTY Sessions Web Interface',
      }
      input.command[ptyShowServerUrlCommand] = {
        template: `This command will show the PTY Sessions Web Interface URL.`,
        description: 'Show PTY Sessions Web Interface URL',
      }
    },
    event: async ({ event }) => {
      if (event.type === 'session.deleted') {
        manager.cleanupBySession(event.properties.info.id)
      }
    },
  }
}
