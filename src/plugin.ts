import type { PluginContext, PluginResult } from './plugin/types.ts'
import { createV1Adapter, installHostAdapter } from './adapters/index.ts'
import { ptySpawn } from './plugin/pty/tools/spawn.ts'
import { ptyWrite } from './plugin/pty/tools/write.ts'
import { ptyRead } from './plugin/pty/tools/read.ts'
import { ptyList } from './plugin/pty/tools/list.ts'
import { ptyKill } from './plugin/pty/tools/kill.ts'
import { PTYServer } from './web/server/server.ts'
import open from 'open'

const ptyOpenClientCommand = 'pty-open-background-spy'
const ptyShowServerUrlCommand = 'pty-show-server-url'

export const PTYPlugin = async (context: PluginContext): Promise<PluginResult> => {
  const { client } = context
  const adapter = createV1Adapter(context)
  installHostAdapter(adapter)
  let ptyServer: PTYServer | undefined

  return {
    'command.execute.before': async (input) => {
      if (input.command !== ptyOpenClientCommand && input.command !== ptyShowServerUrlCommand) {
        return
      }
      if (ptyServer === undefined) {
        ptyServer = await PTYServer.createServer()
      }
      if (input.command === ptyOpenClientCommand) {
        open(ptyServer.server.url.origin)
      } else if (input.command === ptyShowServerUrlCommand) {
        const message = `PTY Sessions Web Interface URL: ${ptyServer.server.url.origin}`
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
        adapter.onSessionDeleted?.(event.properties.info.id)
      }
    },
  }
}
