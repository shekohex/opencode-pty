import { Terminal } from 'bun-pty';
import { NotificationManager } from "./notification-manager.js";
import { OutputManager } from "./output-manager.js";
import { SessionLifecycleManager } from "./session-lifecycle.js";
import { withSession } from "./utils.js";
const proto = Terminal.prototype;
const original = proto._startReadLoop;
if (typeof original === 'function') {
    proto._startReadLoop = async function (...args) {
        await Promise.resolve(); // Yield to allow event handlers to be registered
        return original.apply(this, args);
    };
}
export const sessionUpdateCallbacks = [];
export function registerSessionUpdateCallback(callback) {
    sessionUpdateCallbacks.push(callback);
}
export function removeSessionUpdateCallback(callback) {
    const index = sessionUpdateCallbacks.indexOf(callback);
    if (index !== -1) {
        sessionUpdateCallbacks.splice(index, 1);
    }
}
function notifySessionUpdate(session) {
    for (const callback of sessionUpdateCallbacks) {
        try {
            callback(session);
        }
        catch {
            // Ignore callback errors
        }
    }
}
export const rawOutputCallbacks = [];
export function registerRawOutputCallback(callback) {
    rawOutputCallbacks.push(callback);
}
export function removeRawOutputCallback(callback) {
    const index = rawOutputCallbacks.indexOf(callback);
    if (index !== -1) {
        rawOutputCallbacks.splice(index, 1);
    }
}
function notifyRawOutput(session, rawData) {
    for (const callback of rawOutputCallbacks) {
        try {
            callback(session, rawData);
        }
        catch {
            // Ignore callback errors
        }
    }
}
class PTYManager {
    lifecycleManager = new SessionLifecycleManager();
    outputManager = new OutputManager();
    notificationManager = new NotificationManager();
    notifier = null;
    setNotifier(notifier) {
        this.notifier = notifier;
    }
    getNotifier() {
        return this.notifier ?? this.notificationManager;
    }
    init(client) {
        this.notificationManager.init(client);
        this.notifier = this.notificationManager;
    }
    clearAllSessions() {
        this.lifecycleManager.clearAllSessions();
    }
    spawn(opts) {
        const session = this.lifecycleManager.spawn(opts, (session, data) => {
            notifyRawOutput(this.lifecycleManager.toInfo(session), data);
        }, async (session, exitCode) => {
            notifySessionUpdate(this.lifecycleManager.toInfo(session));
            if (session?.notifyOnExit) {
                const activeNotifier = this.notifier ?? this.notificationManager;
                await activeNotifier.sendExitNotification(session, exitCode || 0);
            }
        });
        notifySessionUpdate(session);
        return session;
    }
    write(id, data) {
        return withSession(this.lifecycleManager, id, (session) => this.outputManager.write(session, data), false);
    }
    read(id, offset = 0, limit) {
        return withSession(this.lifecycleManager, id, (session) => this.outputManager.read(session, offset, limit), null);
    }
    search(id, pattern, offset = 0, limit) {
        return withSession(this.lifecycleManager, id, (session) => this.outputManager.search(session, pattern, offset, limit), null);
    }
    list() {
        return this.lifecycleManager.listSessions().map((s) => this.lifecycleManager.toInfo(s));
    }
    get(id) {
        return withSession(this.lifecycleManager, id, (session) => this.lifecycleManager.toInfo(session), null);
    }
    getRawBuffer(id) {
        return withSession(this.lifecycleManager, id, (session) => ({
            raw: session.buffer.readRaw(),
            byteLength: session.buffer.byteLength,
        }), null);
    }
    kill(id, cleanup = false) {
        return this.lifecycleManager.kill(id, cleanup);
    }
    cleanupBySession(parentSessionId) {
        this.lifecycleManager.cleanupBySession(parentSessionId);
    }
}
export const manager = new PTYManager();
export function initManager(opcClient) {
    manager.init(opcClient);
}
export function setManagerNotifier(notifier) {
    manager.setNotifier(notifier);
}
//# sourceMappingURL=manager.js.map