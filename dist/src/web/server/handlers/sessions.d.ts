import type { BunRequest } from 'bun';
import { JsonResponse, ErrorResponse } from './responses.ts';
import type { routes } from '../../shared/routes.ts';
export declare function getSessions(): JsonResponse;
export declare function createSession(req: Request): Promise<JsonResponse | ErrorResponse>;
export declare function clearSessions(): JsonResponse;
export declare function getSession(req: BunRequest<typeof routes.session.path>): JsonResponse | ErrorResponse;
export declare function sendInput(req: BunRequest<typeof routes.session.input.path>): Promise<Response>;
export declare function cleanupSession(req: BunRequest<typeof routes.session.cleanup.path>): JsonResponse | ErrorResponse;
export declare function killSession(req: BunRequest<typeof routes.session.path>): JsonResponse | ErrorResponse;
export declare function getRawBuffer(req: BunRequest<typeof routes.session.buffer.raw.path>): JsonResponse | ErrorResponse;
export declare function getPlainBuffer(req: BunRequest<typeof routes.session.buffer.plain.path>): JsonResponse | ErrorResponse;
//# sourceMappingURL=sessions.d.ts.map