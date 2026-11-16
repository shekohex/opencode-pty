// Type-safe API client for making HTTP requests with compile-time validation
// Uses the structured routes to ensure correct methods and parameters
import { routes } from './routes';
// Build URL by replacing path parameters
function buildUrl(path, params) {
    if (!params)
        return path;
    let result = path;
    for (const [key, value] of Object.entries(params)) {
        result = result.replace(`:${key}`, String(value));
    }
    return result;
}
// Type-safe fetch function
export async function apiFetch(route, options) {
    const baseUrl = options.baseUrl || `${location.protocol}//${location.host}`;
    const url = baseUrl + buildUrl(route.path, options.params);
    const fetchOptions = {
        method: options.method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (options.body && options.method === 'POST') {
        fetchOptions.body = JSON.stringify(options.body);
    }
    return fetch(url, fetchOptions);
}
// Type-safe JSON fetch with response parsing
export async function apiFetchJson(route, options) {
    const response = await apiFetch(route, options);
    if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
}
// Factory function to create API client with fixed baseUrl (for tests)
export function createApiClient(baseUrl) {
    return {
        sessions: {
            list: () => apiFetchJson(routes.sessions, {
                method: 'GET',
                baseUrl,
            }),
            create: (body) => apiFetchJson(routes.sessions, {
                method: 'POST',
                body,
                baseUrl,
            }),
            clear: () => apiFetchJson(routes.sessions, {
                method: 'DELETE',
                baseUrl,
            }),
        },
        session: {
            get: (params) => apiFetchJson(routes.session, {
                method: 'GET',
                params,
                baseUrl,
            }),
            kill: (params) => apiFetchJson(routes.session, {
                method: 'DELETE',
                params,
                baseUrl,
            }),
            input: (params, body) => apiFetchJson(routes.session.input, { method: 'POST', params, body, baseUrl }),
            cleanup: (params) => apiFetchJson(routes.session.cleanup, { method: 'DELETE', params, baseUrl }),
            buffer: {
                raw: (params) => apiFetchJson(routes.session.buffer.raw, { method: 'GET', params, baseUrl }),
                plain: (params) => apiFetchJson(routes.session.buffer.plain, { method: 'GET', params, baseUrl }),
            },
        },
        health: () => apiFetchJson(routes.health, {
            method: 'GET',
            baseUrl,
        }),
    };
}
// Convenience API for browser use (auto-detects baseUrl from location)
export const api = createApiClient('');
//# sourceMappingURL=api-client.js.map