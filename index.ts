import { Plugin } from './src/v2/index.ts'
import { PTYPlugin } from './src/plugin.ts'

export { PTYPlugin } from './src/plugin.ts'
export { PTYPlugin as server } from './src/plugin.ts'
export { Plugin } from './src/v2/index.ts'

// Dual-mode default export: opencode V1 (>= 1.18.29) resolves the object entrypoint and
// calls `server()`; V2 validates `{ id, setup }` and calls `setup()`. The bare npm ref
// therefore loads on both runtimes — necessary because the V2 loader parses the
// documented `opencode-pty/v2` subpath ref as an npm install spec and cannot install it
// (#67), and the previous `.` entrypoint carried no default export at all.
export default {
  id: Plugin.id,
  server: PTYPlugin,
  setup: Plugin.setup,
}
