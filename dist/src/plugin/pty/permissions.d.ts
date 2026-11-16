import type { PluginClient } from '../types.ts';
import type { PermissionAuthorizer, PermissionRequestContext } from '../../adapters/types.ts';
export type { PermissionAuthorizer, PermissionRequestContext };
/**
 * Sets the active permission authorizer for PTY command and directory checks.
 */
export declare function setPermissionAuthorizer(authorizer: PermissionAuthorizer | null): void;
/**
 * Returns the currently active permission authorizer, if any.
 */
export declare function getPermissionAuthorizer(): PermissionAuthorizer | null;
/**
 * Backward-compatible initialization using V1 PluginClient.
 */
export declare function initPermissions(client: PluginClient, directory: string): void;
/**
 * Extracts what a host needs to attribute a permission check to a tool call.
 *
 * The V1 tool context and the V2 tool context carry overlapping but different
 * fields (`id` only exists on V2), and a tool may be invoked without a context
 * in tests, so every field is read defensively instead of being trusted.
 */
export declare function permissionRequestContext(toolContext: unknown): PermissionRequestContext;
/**
 * Checks command execution permission against the active authorizer.
 * Defaults to allowing if no authorizer is set.
 */
export declare function checkCommandPermission(command: string, args: string[], context?: PermissionRequestContext): Promise<void>;
/**
 * Checks working directory access permission against the active authorizer.
 * Defaults to allowing if no authorizer is set.
 */
export declare function checkWorkdirPermission(workdir: string, context?: PermissionRequestContext): Promise<void>;
//# sourceMappingURL=permissions.d.ts.map