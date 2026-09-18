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

export interface CommandInfo {
  title?: string
  description?: string
  template?: string
  [key: string]: unknown
}

export interface CommandDraft {
  list?(): readonly unknown[]
  get?(name: string): unknown
  update?(name: string, update: (command: CommandInfo) => void): void
  remove?(name: string): void
  [key: string]: unknown
}

export interface PluginContextV2 {
  readonly options?: OpencodePtyOptions & Record<string, unknown>
  readonly command?: {
    transform(
      callback: (commands: CommandDraft) => Promise<void> | void
    ): Promise<unknown> | undefined
    reload?(): Promise<void> | void
  }
  readonly tool?: {
    transform(callback: (tools: unknown) => Promise<void> | void): Promise<unknown> | undefined
    reload?(): Promise<void> | void
  }
  readonly [key: string]: unknown
}

export interface PluginV2 {
  readonly id: string
  readonly setup: (context: PluginContextV2) => Promise<void> | void
}

export function define(plugin: PluginV2): PluginV2 {
  return plugin
}
