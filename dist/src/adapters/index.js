import { manager } from "../plugin/pty/manager.js";
import { setPermissionAuthorizer } from "../plugin/pty/permissions.js";
export * from "./types.js";
export * from "./v1/index.js";
export * from "./v2/index.js";
/**
 * Installs a host adapter by connecting its notifier and permission authorizer
 * to the core PTY manager and permission dispatcher.
 */
export function installHostAdapter(adapter) {
    if (adapter.notifier) {
        manager.setNotifier(adapter.notifier);
    }
    if (adapter.permissions) {
        setPermissionAuthorizer(adapter.permissions);
    }
}
//# sourceMappingURL=index.js.map