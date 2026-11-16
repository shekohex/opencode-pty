import { registerRawOutputCallback, registerSessionUpdateCallback, removeRawOutputCallback, removeSessionUpdateCallback, } from '../../plugin/pty/manager';
export class CallbackManager {
    server;
    constructor(server) {
        this.server = server;
        this.server = server;
        registerSessionUpdateCallback(this.sessionUpdateCallback);
        registerRawOutputCallback(this.rawOutputCallback);
    }
    sessionUpdateCallback = (session) => {
        const message = { type: 'session_update', session };
        this.server.publish('sessions:update', JSON.stringify(message));
    };
    rawOutputCallback = (session, rawData) => {
        const message = { type: 'raw_data', session, rawData };
        this.server.publish(`session:${session.id}`, JSON.stringify(message));
    };
    [Symbol.dispose]() {
        removeSessionUpdateCallback(this.sessionUpdateCallback);
        removeRawOutputCallback(this.rawOutputCallback);
    }
}
//# sourceMappingURL=callback-manager.js.map