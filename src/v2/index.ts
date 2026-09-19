import { createV2Adapter } from '../adapters/v2/index.ts'
import { installHostAdapter } from '../adapters/index.ts'
import { getOrCreateServer, registerV2Commands } from './commands.ts'
import { V2SessionNotifier } from './notifier.ts'
import { registerV2Tools } from './tools.ts'
import { define, type OpencodePtyOptions, type PluginContextV2, type PluginV2 } from './types.ts'

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

    if (ctx.tool && typeof ctx.tool.transform === 'function') {
      await ctx.tool.transform((draft) => {
        registerV2Tools(draft)
      })
    }

    if (ctx.command && typeof ctx.command.transform === 'function') {
      await ctx.command.transform((draft) => {
        registerV2Commands(draft, ctx.options as OpencodePtyOptions | undefined)
      })
    }

    if (ctx.options?.autostart) {
      try {
        await getOrCreateServer({
          port: ctx.options.port,
          hostname: ctx.options.hostname,
        })
      } catch (error) {
        // Never let web-server startup failure crash plugin setup: the PTY
        // tools stay fully functional in-process, and getOrCreateServer retries
        // (now with port fallback) on the next on-demand command invocation.
        console.warn('[opencode-pty] web server could not be started:', error)
      }
    }
  },
})

export default Plugin
