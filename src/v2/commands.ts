import open from 'open'
import { PTYServer, type ServerOptions } from '../web/server/server.ts'
import type { CommandDraft, OpencodePtyOptions } from './types.ts'

export const PTY_OPEN_CLIENT_COMMAND = 'pty-open-background-spy'
export const PTY_SHOW_SERVER_URL_COMMAND = 'pty-show-server-url'

let activeServer: PTYServer | null = null

export async function getOrCreateServer(options?: ServerOptions): Promise<PTYServer> {
  if (!activeServer) {
    activeServer = await PTYServer.createServer(options)
  }
  return activeServer
}

export function getActiveServer(): PTYServer | null {
  return activeServer
}

export function stopActiveServer(): void {
  if (activeServer) {
    activeServer[Symbol.dispose]()
    activeServer = null
  }
}

export async function handleOpenClientCommand(options?: ServerOptions): Promise<string> {
  const server = await getOrCreateServer(options)
  const url = server.server.url.origin
  open(url)
  return `PTY Sessions Web Interface opened at: ${url}`
}

export async function handleShowServerUrlCommand(options?: ServerOptions): Promise<string> {
  const server = await getOrCreateServer(options)
  return `PTY Sessions Web Interface URL: ${server.server.url.origin}`
}

export function registerV2Commands(draft: CommandDraft, _options?: OpencodePtyOptions): void {
  if (typeof draft.update === 'function') {
    draft.update(PTY_OPEN_CLIENT_COMMAND, (cmd) => {
      if (cmd) {
        cmd.description = 'Open PTY Sessions Web Interface'
        cmd.template =
          'This command will start the PTY Sessions Web Interface in your default browser.'
      }
    })

    draft.update(PTY_SHOW_SERVER_URL_COMMAND, (cmd) => {
      if (cmd) {
        cmd.description = 'Show PTY Sessions Web Interface URL'
        cmd.template = 'This command will show the PTY Sessions Web Interface URL.'
      }
    })
  }
}
