import type { HealthResponse, PTYSessionInfo } from 'opencode-pty/web/shared/types';
type ExtractParams<T extends string> = T extends `${infer _}:${infer Param}/${infer Rest}` ? {
    [K in Param | keyof ExtractParams<Rest>]: string | number;
} : T extends `${infer _}:${infer Param}` ? {
    [K in Param]: string | number;
} : Record<string, never>;
type AllowedMethods<T> = T extends {
    methods: readonly string[];
} ? T['methods'][number] : never;
type ApiFetchOptions<Route extends {
    path: string;
    methods: readonly string[];
}, Method extends AllowedMethods<Route>> = {
    method: Method;
    params?: ExtractParams<Route['path']>;
    body?: Method extends 'POST' ? unknown : never;
    baseUrl?: string;
};
export declare function apiFetch<Route extends {
    path: string;
    methods: readonly string[];
}, Method extends AllowedMethods<Route>>(route: Route, options: ApiFetchOptions<Route, Method>): Promise<Response>;
export declare function apiFetchJson<Route extends {
    path: string;
    methods: readonly string[];
}, Method extends AllowedMethods<Route>, T = unknown>(route: Route, options: ApiFetchOptions<Route, Method>): Promise<T>;
export declare function createApiClient(baseUrl: string): {
    readonly sessions: {
        readonly list: () => Promise<PTYSessionInfo[]>;
        readonly create: (body: {
            command: string;
            args?: string[];
            description?: string;
            workdir?: string;
            timeoutSeconds?: number;
        }) => Promise<PTYSessionInfo>;
        readonly clear: () => Promise<{
            success: boolean;
        }>;
    };
    readonly session: {
        readonly get: (params: {
            id: string;
        }) => Promise<PTYSessionInfo>;
        readonly kill: (params: {
            id: string;
        }) => Promise<{
            success: boolean;
        }>;
        readonly input: (params: {
            id: string;
        }, body: {
            data: string;
        }) => Promise<{
            success: boolean;
        }>;
        readonly cleanup: (params: {
            id: string;
        }) => Promise<{
            success: boolean;
        }>;
        readonly buffer: {
            readonly raw: (params: {
                id: string;
            }) => Promise<{
                raw: string;
                byteLength: number;
            }>;
            readonly plain: (params: {
                id: string;
            }) => Promise<{
                plain: string;
                byteLength: number;
            }>;
        };
    };
    readonly health: () => Promise<HealthResponse>;
};
export declare const api: {
    readonly sessions: {
        readonly list: () => Promise<PTYSessionInfo[]>;
        readonly create: (body: {
            command: string;
            args?: string[];
            description?: string;
            workdir?: string;
            timeoutSeconds?: number;
        }) => Promise<PTYSessionInfo>;
        readonly clear: () => Promise<{
            success: boolean;
        }>;
    };
    readonly session: {
        readonly get: (params: {
            id: string;
        }) => Promise<PTYSessionInfo>;
        readonly kill: (params: {
            id: string;
        }) => Promise<{
            success: boolean;
        }>;
        readonly input: (params: {
            id: string;
        }, body: {
            data: string;
        }) => Promise<{
            success: boolean;
        }>;
        readonly cleanup: (params: {
            id: string;
        }) => Promise<{
            success: boolean;
        }>;
        readonly buffer: {
            readonly raw: (params: {
                id: string;
            }) => Promise<{
                raw: string;
                byteLength: number;
            }>;
            readonly plain: (params: {
                id: string;
            }) => Promise<{
                plain: string;
                byteLength: number;
            }>;
        };
    };
    readonly health: () => Promise<HealthResponse>;
};
export {};
//# sourceMappingURL=api-client.d.ts.map