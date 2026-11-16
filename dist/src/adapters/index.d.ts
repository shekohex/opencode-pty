import type { HostAdapter } from './types.ts';
export * from './types.ts';
export * from './v1/index.ts';
export * from './v2/index.ts';
/**
 * Installs a host adapter by connecting its notifier and permission authorizer
 * to the core PTY manager and permission dispatcher.
 */
export declare function installHostAdapter(adapter: HostAdapter): void;
//# sourceMappingURL=index.d.ts.map