export function handleUpgrade(server, req) {
    if (!(req.headers.get('upgrade') === 'websocket')) {
        return new Response('WebSocket endpoint - use WebSocket upgrade', { status: 426 });
    }
    const success = server.upgrade(req);
    if (success) {
        return undefined; // Upgrade succeeded, Bun sends 101 automatically
    }
    return new Response('WebSocket upgrade failed', { status: 400 });
}
//# sourceMappingURL=upgrade.js.map