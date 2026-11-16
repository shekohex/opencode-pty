export { PTYPlugin } from './src/plugin.ts';
export { PTYPlugin as server } from './src/plugin.ts';
export { Plugin } from './src/v2/index.ts';
declare const _default: {
    id: string;
    server: (context: import("./src/plugin/types.ts").PluginContext) => Promise<import("./src/plugin/types.ts").PluginResult>;
    setup: (context: import("./src/v2/types.ts").PluginContextV2) => Promise<void> | void;
};
export default _default;
//# sourceMappingURL=index.d.ts.map