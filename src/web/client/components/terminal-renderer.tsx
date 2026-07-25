import React from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import '@xterm/xterm/css/xterm.css'

// Global module augmentation to extend Window interface
declare global {
  interface Window {
    xtermTerminal?: Terminal
    xtermSerializeAddon?: SerializeAddon
  }
}

interface RawTerminalProps {
  rawOutput: string
  onSendInput?: (data: string) => void
  onInterrupt?: () => void
  disabled?: boolean
  /**
   * When true the user can still see and select/copy the rendered output,
   * but every keystroke is intercepted by `attachCustomKeyEventHandler`
   * before xterm forwards it to the PTY. This is what the non-loopback
   * read-only mode uses — the backend would reject the write anyway, but
   * silently dropping keys here gives immediate UI feedback.
   */
  readOnly?: boolean
}

export class RawTerminal extends React.Component<RawTerminalProps> {
  private terminalRef = React.createRef<HTMLDivElement>()
  private xtermInstance: Terminal | null = null
  private fitAddon: FitAddon | null = null
  private serializeAddon: SerializeAddon | null = null

  override componentDidMount() {
    this.initializeTerminal()
    if (this.xtermInstance && this.props.rawOutput) {
      this.xtermInstance.write(this.props.rawOutput)
    }
  }

  override componentDidUpdate(prevProps: RawTerminalProps) {
    if (!this.xtermInstance) return

    const currentData = this.props.rawOutput
    const prevData = prevProps.rawOutput

    // Optimized diff-based writing - only write new content
    if (currentData.startsWith(prevData)) {
      const newData = currentData.slice(prevData.length)
      if (newData) {
        this.xtermInstance.write(newData)
      }
    } else {
      // Session switch/truncate/etc - clear and rewrite
      this.xtermInstance.clear()
      this.xtermInstance.write(currentData)
    }

    // Re-apply read-only mode when the prop changes (e.g. user enabled auth
    // and the UI flipped from read-only to writable after a /health probe).
    if (prevProps.readOnly !== this.props.readOnly) {
      this.applyReadOnly(this.props.readOnly === true)
    }
  }

  override componentWillUnmount() {
    if (this.xtermInstance) {
      this.xtermInstance.dispose()
    }
  }

  private initializeTerminal() {
    const term = new Terminal({
      cursorBlink: true,
      theme: { background: '#1e1e1e', foreground: '#d4d4d4' },
      fontFamily: 'monospace',
      fontSize: 14,
      scrollback: 5000,
      convertEol: true,
      allowTransparency: true,
    })

    this.fitAddon = new FitAddon()
    this.serializeAddon = new SerializeAddon()
    term.loadAddon(this.fitAddon)
    term.loadAddon(this.serializeAddon)

    if (this.terminalRef.current) {
      term.open(this.terminalRef.current)
      this.fitAddon.fit()
    }

    this.xtermInstance = term

    // CRITICAL: Expose terminal and serialize addon for E2E testing
    window.xtermTerminal = term
    window.xtermSerializeAddon = this.serializeAddon

    this.applyReadOnly(this.props.readOnly === true)
    this.setupInputHandling(term)
  }

  /**
   * Install (or uninstall) a key-event filter that blocks every "input
   * intent" key while still letting modifier-only combinations and named
   * navigation keys fall through to the browser so the user can keep
   * selecting / copying / pasting.
   *
   * Returning `false` from `attachCustomKeyEventHandler` tells xterm NOT to
   * forward the key as PTY data; the browser then handles it natively
   * (selection, copy, paste, select-all, scroll, etc. all keep working).
   */
  private applyReadOnly(readOnly: boolean) {
    const term = this.xtermInstance
    if (!term) return
    if (!readOnly) {
      term.attachCustomKeyEventHandler(() => true)
      return
    }
    term.attachCustomKeyEventHandler((event) => {
      // Any modifier combo (Ctrl / Cmd / Alt) belongs to the browser — copy,
      // paste, select-all, find, reload. Always let the browser handle them.
      if (event.ctrlKey || event.metaKey || event.altKey) return false
      // Named navigation / editing keys the browser uses for selection —
      // arrow keys, Home / End, PageUp / PageDown, Tab, Esc, F1-F12.
      // Returning false here means xterm leaves them alone, so the browser's
      // built-in text-selection shortcuts work as the user expects.
      if (event.key.length !== 1) return false
      // Single-character key with no modifiers = the user is trying to type
      // something into the PTY. Swallow it.
      return false
    })
  }

  private setupInputHandling(term: Terminal) {
    const { onSendInput, onInterrupt, disabled, readOnly } = this.props

    if (disabled || readOnly) return

    const handleData = (data: string) => {
      if (data === '\u0003') {
        // Ctrl+C
        onInterrupt?.()
      } else {
        // Send input to PTY server (PTY will echo back for interactive sessions)
        onSendInput?.(data)
      }
    }

    term.onData(handleData)
  }

  override render() {
    return (
      <div
        ref={this.terminalRef}
        className={`xterm ${this.props.readOnly ? 'xterm-readonly' : ''}`}
        style={{ width: '100%', height: '100%' }}
      />
    )
  }
}
