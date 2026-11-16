import { NotificationManager } from "../../plugin/pty/notification-manager.js";
export class V1NotificationAdapter {
    manager;
    constructor(client) {
        this.manager = new NotificationManager();
        if (client) {
            this.manager.init(client);
        }
    }
    init(client) {
        this.manager.init(client);
    }
    async sendExitNotification(session, exitCode) {
        await this.manager.sendExitNotification(session, exitCode);
    }
}
//# sourceMappingURL=notifications.js.map