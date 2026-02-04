// Global type declarations for E2E testing
import { Terminal } from 'xterm'
import { SerializeAddon } from 'xterm-addon-serialize'

declare global {
  interface Window {
    xtermTerminal?: Terminal
    xtermSerializeAddon?: SerializeAddon
  }
}
