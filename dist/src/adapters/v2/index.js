import { manager } from "../../plugin/pty/manager.js";
export class V2HostAdapter {
    id = 'opencode-v2';
    notifier;
    permissions;
    constructor(options = {}) {
        this.notifier = options.notifier;
        this.permissions = options.permissions;
    }
    onSessionDeleted(sessionId) {
        manager.cleanupBySession(sessionId);
    }
}
export function createV2Adapter(options) {
    return new V2HostAdapter(options);
}
//# sourceMappingURL=index.js.map