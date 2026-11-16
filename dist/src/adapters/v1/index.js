import { manager } from "../../plugin/pty/manager.js";
import { V1NotificationAdapter } from "./notifications.js";
import { V1PermissionAuthorizer } from "./permissions.js";
export { V1NotificationAdapter } from "./notifications.js";
export { V1PermissionAuthorizer } from "./permissions.js";
export function createV1Adapter(context) {
    const notifier = new V1NotificationAdapter(context.client);
    const permissions = new V1PermissionAuthorizer(context.client, context.directory);
    return {
        id: 'opencode-v1',
        notifier,
        permissions,
        onSessionDeleted: (sessionId) => {
            manager.cleanupBySession(sessionId);
        },
    };
}
//# sourceMappingURL=index.js.map