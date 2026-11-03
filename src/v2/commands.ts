import open from 'open'
import { PTYServer, type ServerOptions } from '../web/server/server.ts'
import type { CommandDraft } from './types.ts'

export const PTY_OPEN_CLIENT_COMMAND = 'pty-open-background-spy'
export const PTY_SHOW_SERVER_URL_COMMAND = 'pty-show-server-url'

interface ServerRegistry {
  active: PTYServer | null
  pending: Promise<PTYServer> | null
}

const serverRegistryKey = Symbol.for('opencode-pty.v2.server')
const runtime = globalThis as typeof globalThis & Record<symbol, unknown>

function getServerRegistry(): ServerRegistry {
  let registry = runtime[serverRegistryKey] as ServerRegistry | undefined
  if (!registry) {
    registry = { active: null, pending: null }
    runtime[serverRegistryKey] = registry
  }
  return registry
}

export async function getOrCreateServer(options?: ServerOptions): Promise<PTYServer> {
  const registry = getServerRegistry()
  if (registry.active) {
    return registry.active
  }
  if (registry.pending) {
    return registry.pending
  }

  const pending = PTYServer.createServer(options)
  registry.pending = pending
  try {
    registry.active = await pending
    return registry.active
  } finally {
    if (registry.pending === pending) {
      registry.pending = null
    }
  }
}

export function getActiveServer(): PTYServer | null {
  return getServerRegistry().active
}

export function stopActiveServer(): void {
  const registry = getServerRegistry()
  if (registry.active) {
    registry.active[Symbol.dispose]()
    registry.active = null
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

/**
 * Registers the PTY slash commands with opencode v2's `CommandEditor`.
 *
 * opencode v2's `command.transform` draft exposes `add(definition)` only
 * (there is no `update`), so commands must be created with an `execute`
 * handler rather than "updated".
 */
export function registerV2Commands(draft: CommandDraft, options?: ServerOptions): void {
  if (typeof draft.add !== 'function') {
    return
  }
  const add = draft.add.bind(draft)

  add({
    name: PTY_OPEN_CLIENT_COMMAND,
    description: 'Open PTY Sessions Web Interface',
    execute: async () => {
      await handleOpenClientCommand(options)
    },
  })

  add({
    name: PTY_SHOW_SERVER_URL_COMMAND,
    description: 'Show PTY Sessions Web Interface URL',
    execute: async () => {
      await handleShowServerUrlCommand(options)
    },
  })
}
