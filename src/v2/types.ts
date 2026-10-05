import type { Plugin } from '@opencode/plugin'

export interface OpencodePtyOptions {
  /**
   * Fixed port for the PTY Web UI observer server.
   * If not set, defaults to an available ephemeral port or PTY_WEB_PORT env var.
   */
  port?: number

  /**
   * Hostname to bind the PTY Web UI observer server to.
   * Defaults to '::1' (or PTY_WEB_HOSTNAME env var).
   */
  hostname?: string

  /**
   * Automatically start the PTY Web UI observer server upon plugin initialization.
   * Default is false (started on-demand when slash command is executed).
   */
  autostart?: boolean
}

/**
 * Command definition accepted by opencode v2's CommandEditor.
 *
 * NOTE: opencode v2's `command.transform` draft exposes `add(definition)`
 * (see `CommandEditor` in @opencode-ai/plugin). There is no `update`/`list`/`get`.
 */
export interface CommandDefinition {
  name: string
  description?: string
  execute: (input: unknown) => Promise<void> | void
}

export interface CommandDraft {
  add?(command: CommandDefinition): void
  list?(): readonly unknown[]
  get?(name: string): unknown
  remove?(name: string): void
  [key: string]: unknown
}

/**
 * Tool definition accepted by opencode v2's ToolEditor.
 *
 * Mirrors `Tool.Info` from @opencode-ai/plugin's promise API:
 *   { name, input, description, execute(input, context) }
 */
export interface ToolInfoV2 {
  name: string
  description: string
  input: unknown
  execute: (input: unknown, context: unknown) => Promise<unknown>
}

export interface ToolDraft {
  add?(tool: ToolInfoV2): void
  [key: string]: unknown
}

export interface PluginContextV2 {
  readonly options?: OpencodePtyOptions & Record<string, unknown>
  readonly event?: Plugin.Context['event']
  readonly command?: {
    transform(
      callback: (commands: CommandDraft) => Promise<void> | void
    ): Promise<unknown> | undefined
    reload?(): Promise<void> | void
  }
  readonly tool?: {
    transform(callback: (tools: ToolDraft) => Promise<void> | void): Promise<unknown> | undefined
    reload?(): Promise<void> | void
  }
  /**
   * opencode v2's plugin contexts are server clients: the `session` domain is
   * how a plugin reads sessions and wakes them with user prompts. Typed from
   * `@opencode/plugin` (the V2 SDK) so `ctx.session?.prompt` is checked
   * against the real `SessionPromptInput`. Optional because hosts pre-2.0.x
   * may not expose it; the setup guards at runtime.
   */
  readonly session?: {
    readonly prompt: Plugin.Context['session']['prompt']
  }
}

export interface PluginV2 {
  readonly id: string
  readonly setup: (context: PluginContextV2) => ReturnType<Plugin.Plugin['setup']>
}

export function define(plugin: PluginV2): PluginV2 {
  return plugin
}
