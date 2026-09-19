import { createV2Adapter } from '../adapters/v2/index.ts'
import { installHostAdapter } from '../adapters/index.ts'
import { PTYServer } from '../web/server/server.ts'
import { getOrCreateServer, registerV2Commands } from './commands.ts'
import { define, type PluginContextV2, type PluginV2 } from './types.ts'

export * from './commands.ts'
export * from './tools.ts'
export * from './types.ts'

/**
 * OpenCode V2 Plugin definition for opencode-pty.
 * Conforms to the V2 Plugin.define({ id, setup }) contract.
 */
export const Plugin: PluginV2 = define({
  id: 'opencode-pty',
  setup: async (ctx: PluginContextV2) => {
    const options = ctx.options
    const adapter = createV2Adapter()
    installHostAdapter(adapter)

    if (ctx.command && typeof ctx.command.transform === 'function') {
      await ctx.command.transform((draft) => {
        registerV2Commands(draft, options)
      })
    }

    const autostart =
      options?.autostart !== undefined ? options.autostart : PTYServer.isAutostartEnabled()

    if (autostart) {
      await getOrCreateServer({
        port: options?.port,
        hostname: options?.hostname,
      })
    }
  },
})

export default Plugin
