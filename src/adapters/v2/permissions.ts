import type { PermissionAuthorizer, PermissionRequestContext } from '../types.ts'

/**
 * The subset of opencode V2's `ctx.permission` the authorizer needs.
 *
 * Typed structurally rather than imported so the adapter stays decoupled from
 * the `@opencode/plugin` package version pinned by the host, and so tests can
 * supply a recording double without a whole V2 server context.
 */
export interface V2PermissionDomain {
  assert(input: V2PermissionAssertInput): Promise<void>
}

export interface V2PermissionAssertInput {
  sessionID: string
  agent?: string
  /** Permission action: V2 names the shell action `shell` (V1 called it `bash`). */
  action: string
  resources: string[]
  /** Patterns saved when the user answers "always allow". */
  save?: string[]
  source?: { type: 'tool'; messageID: string; id: string }
}

export interface V2PermissionAuthorizerOptions {
  permission: V2PermissionDomain
  /** The location directory; a workdir outside it is an external directory. */
  directory?: string
}

/**
 * V2 permission authorizer built on `ctx.permission.assert`.
 *
 * opencode V2 has no `config.get()` on the plugin context, so the configured
 * `permissions` rules cannot be read and re-implemented here: `assert` is the
 * only documented surface that evaluates them (including saved approvals and
 * agent rules) and prompts when a rule resolves to `ask`. Delegating keeps the
 * plugin's answer identical to the host's own shell tool.
 *
 * Safe default: when `assert` is present but the check cannot be attributed to
 * a session, the check **denies**. Allowing instead would reintroduce #80 —
 * a `deny` rule silently bypassed — while denying only affects calls made
 * outside a tool invocation, which the plugin does not make.
 */
export class V2PermissionAuthorizer implements PermissionAuthorizer {
  private readonly permission: V2PermissionDomain
  private readonly directory?: string

  constructor(options: V2PermissionAuthorizerOptions) {
    this.permission = options.permission
    this.directory = options.directory
  }

  async checkCommand(
    command: string,
    args: string[],
    context?: PermissionRequestContext
  ): Promise<void> {
    const commandLine = [command, ...args].join(' ').trim()
    if (!commandLine) {
      return
    }

    // `save` proposes the exact command so "always allow" cannot widen a rule
    // to a prefix the user never approved. The host decides whether to store it.
    await this.assert(context, 'shell', [commandLine], [commandLine])
  }

  async checkWorkdir(workdir: string, context?: PermissionRequestContext): Promise<void> {
    if (!this.directory || isInside(workdir, this.directory)) {
      return
    }

    const normalized = normalizeSegments(workdir)
    await this.assert(context, 'external_directory', [normalized, `${normalized}/*`])
  }

  private async assert(
    context: PermissionRequestContext | undefined,
    action: string,
    resources: string[],
    save?: string[]
  ): Promise<void> {
    const sessionID = context?.sessionID
    if (!sessionID) {
      throw new Error(
        `PTY: ${action} permission for "${resources.join(', ')}" cannot be evaluated without a session, so it is denied.`
      )
    }

    const source =
      context.messageID && context.callID
        ? { type: 'tool' as const, messageID: context.messageID, id: context.callID }
        : undefined

    await this.permission.assert({
      sessionID,
      ...(context.agent ? { agent: context.agent } : {}),
      action,
      resources,
      ...(save ? { save } : {}),
      ...(source ? { source } : {}),
    })
  }
}

/**
 * True when `path` is the same as, or below, `root`.
 *
 * Both sides are resolved lexically first, so `/workspace/app/../etc` is not
 * mistaken for a path inside `/workspace/app`, and the comparison is
 * segment-wise so `/workspace/app-evil` is not inside `/workspace/app` either.
 */
function isInside(path: string, root: string): boolean {
  const normalizedRoot = normalizeSegments(root)
  const normalizedPath = normalizeSegments(path)
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)
}

/**
 * Collapses `.` and `..` segments without touching the filesystem.
 *
 * `..` never climbs above the first segment: a path that escapes its own root
 * then simply fails the prefix comparison above.
 */
function normalizeSegments(path: string): string {
  const absolute = path.startsWith('/')
  const segments: string[] = []
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') {
      continue
    }
    if (segment === '..') {
      if (segments.length > 0) {
        segments.pop()
      }
      continue
    }
    segments.push(segment)
  }
  const joined = segments.join('/')
  return absolute ? `/${joined}` : joined || '.'
}

export function createV2PermissionAuthorizer(
  permission: V2PermissionDomain | undefined,
  directory?: string
): V2PermissionAuthorizer | undefined {
  if (!permission || typeof permission.assert !== 'function') {
    return undefined
  }
  return new V2PermissionAuthorizer({ permission, directory })
}
