import { V1PermissionAuthorizer } from "../../adapters/v1/permissions.js";
let _authorizer = null;
/**
 * Sets the active permission authorizer for PTY command and directory checks.
 */
export function setPermissionAuthorizer(authorizer) {
    _authorizer = authorizer;
}
/**
 * Returns the currently active permission authorizer, if any.
 */
export function getPermissionAuthorizer() {
    return _authorizer;
}
/**
 * Backward-compatible initialization using V1 PluginClient.
 */
export function initPermissions(client, directory) {
    _authorizer = new V1PermissionAuthorizer(client, directory);
}
/**
 * Extracts what a host needs to attribute a permission check to a tool call.
 *
 * The V1 tool context and the V2 tool context carry overlapping but different
 * fields (`id` only exists on V2), and a tool may be invoked without a context
 * in tests, so every field is read defensively instead of being trusted.
 */
export function permissionRequestContext(toolContext) {
    const source = (toolContext ?? {});
    const context = {};
    for (const key of ['sessionID', 'agent', 'messageID']) {
        const value = source[key];
        if (typeof value === 'string')
            context[key] = value;
    }
    if (typeof source.id === 'string')
        context.callID = source.id;
    return context;
}
/**
 * Checks command execution permission against the active authorizer.
 * Defaults to allowing if no authorizer is set.
 */
export async function checkCommandPermission(command, args, context) {
    if (!_authorizer) {
        return;
    }
    // Pass the context only when there is one: a context-less check keeps the
    // two-argument call shape existing authorizers and tests already observe.
    if (context) {
        await _authorizer.checkCommand(command, args, context);
        return;
    }
    await _authorizer.checkCommand(command, args);
}
/**
 * Checks working directory access permission against the active authorizer.
 * Defaults to allowing if no authorizer is set.
 */
export async function checkWorkdirPermission(workdir, context) {
    if (!_authorizer) {
        return;
    }
    if (context) {
        await _authorizer.checkWorkdir(workdir, context);
        return;
    }
    await _authorizer.checkWorkdir(workdir);
}
//# sourceMappingURL=permissions.js.map