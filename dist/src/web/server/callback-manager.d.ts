export declare class CallbackManager implements Disposable {
    private server;
    constructor(server: Bun.Server<undefined>);
    private sessionUpdateCallback;
    private rawOutputCallback;
    [Symbol.dispose](): void;
}
//# sourceMappingURL=callback-manager.d.ts.map