import { createV2Adapter } from '../adapters/v2/index.ts'
import { installHostAdapter } from '../adapters/index.ts'
import type { ServerOptions } from '../web/server/server.ts'
import { getOrCreateServer, registerV2Commands } from './commands.ts'
import { V2SessionNotifier } from './notifier.ts'
import { registerV2Tools } from './tools.ts'
import { define, type PluginContextV2, type PluginV2 } from './types.ts'

export * from './commands.ts'
export * from './notifier.ts'
export * from './tools.ts'
export * from './types.ts'

/**
 * OpenCode V2 Plugin definition for opencode-pty.
 * Conforms to the V2 Plugin.define({ id, setup }) contract.
 */
export const Plugin: PluginV2 = define({
  id: 'opencode-pty',
  setup: async (ctx: PluginContextV2) => {
    // opencode v2 plugin contexts are server clients: `ctx.session.prompt`
    // wakes a session with a user prompt, preserving the session's current
    // model by construction. Pre-2.0 hosts without the session domain still
    // load the plugin, but exit notifications are disabled with a visible
    // warning instead of silently never arriving.
    const notifier =
      typeof ctx.session?.prompt === 'function' ? new V2SessionNotifier(ctx.session) : undefined
    if (!notifier) {
      console.warn(
        '[opencode-pty] host does not expose ctx.session.prompt — exit notifications disabled'
      )
    }

    const adapter = createV2Adapter({ notifier })
    installHostAdapter(adapter)

    // The project directory lives on `location`. `ctx.worktree` is deliberately
    // NOT used: it is a domain object on the V2 API, not a path, and passing it
    // through reached createHash and threw. Absent paths only mean no record is
    // published — the sidebar then falls back to the instance-scoped URL scrape.
    const location = (ctx as unknown as { location?: { directory?: unknown } }).location
    const directory = typeof location?.directory === 'string' ? location.directory : undefined

    if (ctx.tool && typeof ctx.tool.transform === 'function') {
      await ctx.tool.transform((draft) => {
        registerV2Tools(draft, directory)
      })
    }

    const serverOptions: ServerOptions = {
      port: ctx.options?.port,
      hostname: ctx.options?.hostname,
      ...(directory ? { directory } : {}),
    }

    if (ctx.command && typeof ctx.command.transform === 'function') {
      await ctx.command.transform((draft) => {
        registerV2Commands(draft, serverOptions)
      })
    }

    if (ctx.options?.autostart) {
      await getOrCreateServer(serverOptions)
    }
  },
})

export default Plugin
