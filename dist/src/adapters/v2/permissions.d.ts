import type { PermissionAuthorizer, PermissionRequestContext } from '../types.ts';
/**
 * The subset of opencode V2's `ctx.permission` the authorizer needs.
 *
 * Typed structurally rather than imported so the adapter stays decoupled from
 * the `@opencode/plugin` package version pinned by the host, and so tests can
 * supply a recording double without a whole V2 server context.
 */
export interface V2PermissionDomain {
    assert(input: V2PermissionAssertInput): Promise<void>;
}
export interface V2PermissionAssertInput {
    sessionID: string;
    agent?: string;
    /** Permission action: V2 names the shell action `shell` (V1 called it `bash`). */
    action: string;
    resources: string[];
    /** Patterns saved when the user answers "always allow". */
    save?: string[];
    source?: {
        type: 'tool';
        messageID: string;
        id: string;
    };
}
export interface V2PermissionAuthorizerOptions {
    permission: V2PermissionDomain;
    /** The location directory; a workdir outside it is an external directory. */
    directory?: string;
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
export declare class V2PermissionAuthorizer implements PermissionAuthorizer {
    private readonly permission;
    private readonly directory?;
    constructor(options: V2PermissionAuthorizerOptions);
    checkCommand(command: string, args: string[], context?: PermissionRequestContext): Promise<void>;
    checkWorkdir(workdir: string, context?: PermissionRequestContext): Promise<void>;
    private assert;
}
export declare function createV2PermissionAuthorizer(permission: V2PermissionDomain | undefined, directory?: string): V2PermissionAuthorizer | undefined;
//# sourceMappingURL=permissions.d.ts.map