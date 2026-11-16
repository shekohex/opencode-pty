import { Plugin } from "./src/v2/index.js";
import { PTYPlugin } from "./src/plugin.js";
export { PTYPlugin } from "./src/plugin.js";
export { PTYPlugin as server } from "./src/plugin.js";
export { Plugin } from "./src/v2/index.js";
// Dual-mode default export: opencode V1 (>= 1.18.29) resolves the object entrypoint and
// calls `server()`; V2 validates `{ id, setup }` and calls `setup()`. The bare npm ref
// therefore loads on both runtimes — necessary because the V2 loader parses the
// documented `opencode-pty/v2` subpath ref as an npm install spec and cannot install it
// (#67), and the previous `.` entrypoint carried no default export at all.
export default {
    id: Plugin.id,
    server: PTYPlugin,
    setup: Plugin.setup,
};
//# sourceMappingURL=index.js.map