import { allStructured } from "../../plugin/pty/wildcard.js";
export class V1PermissionAuthorizer {
    client;
    directory;
    constructor(client, directory) {
        this.client = client;
        this.directory = directory;
    }
    async getPermissionConfig() {
        if (!this.client) {
            return {};
        }
        try {
            const response = await this.client.config.get();
            if (response.error || !response.data) {
                return {};
            }
            return response.data.permission ?? {};
        }
        catch {
            return {};
        }
    }
    async showToast(message, variant = 'info') {
        if (!this.client)
            return;
        try {
            await this.client.tui.showToast({ body: { message, variant } });
        }
        catch {
            // Ignore toast errors
        }
    }
    async denyWithToast(msg, details) {
        await this.showToast(msg, 'error');
        throw new Error(details ? `${msg} ${details}` : msg);
    }
    async handleAskPermission(commandLine) {
        await this.denyWithToast(`PTY: Command "${commandLine}" requires permission (treated as denied)`, `PTY spawn denied: Command "${commandLine}" requires user permission which is not supported by this plugin. Configure explicit "allow" or "deny" in your opencode.json permission.bash settings.`);
        throw new Error('Unreachable');
    }
    async checkCommand(command, args) {
        const config = await this.getPermissionConfig();
        const bashPerms = config.bash;
        if (!bashPerms) {
            return;
        }
        if (typeof bashPerms === 'string') {
            if (bashPerms === 'deny') {
                await this.denyWithToast('PTY spawn denied: All bash commands are disabled by user configuration.');
            }
            if (bashPerms === 'ask') {
                await this.handleAskPermission(command);
            }
            return;
        }
        const action = allStructured({ head: command, tail: args }, bashPerms);
        if (action === 'deny') {
            await this.denyWithToast(`PTY spawn denied: Command "${command} ${args.join(' ')}" is explicitly denied by user configuration.`);
        }
        if (action === 'ask') {
            await this.handleAskPermission(`${command} ${args.join(' ')}`);
        }
    }
    async checkWorkdir(workdir) {
        if (!this.directory) {
            return;
        }
        const normalizedWorkdir = workdir.replace(/\/$/, '');
        const normalizedProject = this.directory.replace(/\/$/, '');
        if (normalizedWorkdir.startsWith(normalizedProject)) {
            return;
        }
        const config = await this.getPermissionConfig();
        const extDirPerm = config.external_directory;
        if (extDirPerm === 'deny') {
            await this.denyWithToast(`PTY spawn denied: Working directory "${workdir}" is outside project directory "${this.directory}". External directory access is denied by user configuration.`);
        }
        if (extDirPerm === 'ask') {
            // TODO: Implement user prompt for external directory access
        }
    }
}
//# sourceMappingURL=permissions.js.map