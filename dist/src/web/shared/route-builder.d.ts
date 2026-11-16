export declare const RouteBuilder: {
    websocket(): string;
    health(): string;
    sessions: {
        list: () => string;
        create: () => string;
        clear: () => string;
    };
    session: {
        get: (params: {
            id: string | number;
        }) => string;
        kill: (params: {
            id: string | number;
        }) => string;
        cleanup: (params: {
            id: string | number;
        }) => string;
        input: (params: {
            id: string | number;
        }) => string;
        rawBuffer: (params: {
            id: string | number;
        }) => string;
        plainBuffer: (params: {
            id: string | number;
        }) => string;
    };
};
//# sourceMappingURL=route-builder.d.ts.map