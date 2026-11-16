import type { PluginClient } from '../../plugin/types.ts';
import type { PermissionAuthorizer } from '../types.ts';
type PermissionAction = 'allow' | 'ask' | 'deny';
type BashPermissions = PermissionAction | Record<string, PermissionAction>;
export interface PermissionConfig {
    bash?: BashPermissions;
    external_directory?: PermissionAction;
}
export declare class V1PermissionAuthorizer implements PermissionAuthorizer {
    private client;
    private directory;
    constructor(client: PluginClient | null, directory: string | null);
    private getPermissionConfig;
    private showToast;
    private denyWithToast;
    private handleAskPermission;
    checkCommand(command: string, args: string[]): Promise<void>;
    checkWorkdir(workdir: string): Promise<void>;
}
export {};
//# sourceMappingURL=permissions.d.ts.map